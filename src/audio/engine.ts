import * as Tone from 'tone';
import { EffectName, createEffectNode, applyDotLive, applyDotRelease } from './effects';

interface ChainEffect {
  id: number;
  name: EffectName;
  node: Tone.ToneAudioNode;
  muted: boolean;
}

let mainSynth: Tone.Synth | null = null;
let unisonSynths: Tone.Synth[] = [];
let unisonVoices = 2;
let unisonDetune = 20; // 20 UI = 10 cents actual
let masterGain: Tone.Gain | null = null;
let masterFilter: Tone.Filter | null = null;
let dryGain: Tone.Gain | null = null;
let wetGain: Tone.Gain | null = null;
let chainEffects: ChainEffect[] = [];
let triggerLoop: Tone.Loop | Tone.Sequence | null = null;
let currentMode = 'FREE';
let currentNote = 'D2';
let arpNotes: string[] = [];
let currentOscType = 'triangle';
let currentShape = 0.6;
let noiseNode: Tone.Noise | null = null;
let noiseGain: Tone.Gain | null = null;
let isNoiseMode = false;

function shapeToEnv(shape: number) {
  if (shape < 0.15) {
    const t = shape / 0.15;
    return { attack: 0.001, decay: 0.03 + t * 0.06, sustain: 0, release: 0.05 + t * 0.1 };
  } else if (shape < 0.4) {
    const t = (shape - 0.15) / 0.25;
    return { attack: 0.003 + t * 0.02, decay: 0.12 + t * 0.3, sustain: 0, release: 0.15 + t * 0.4 };
  } else if (shape < 0.7) {
    const t = (shape - 0.4) / 0.30;
    return { attack: 0.05 + t * 1.5, decay: 0.3, sustain: 0.2 + t * 0.5, release: 0.8 + t * 2.5 };
  } else if (shape < 0.85) {
    const t = (shape - 0.7) / 0.15;
    return { attack: 1.5 + t * 2.0, decay: 0.1, sustain: 0.8 + t * 0.15, release: 3.0 + t * 4.0 };
  } else {
    const t = (shape - 0.85) / 0.15;
    return { attack: 3.5 + t * 3.0, decay: 0.1, sustain: 1.0, release: 7.0 + t * 5.0 };
  }
}

function noteDuration(shape: number): string {
  return shape < 0.15 ? '32n' : shape < 0.4 ? '16n' : '8n';
}

export async function startAudio(): Promise<void> {
  await Tone.start();
}

function duckAndRewire(fn: () => void): void {
  if (!masterGain) { fn(); return; }
  const now = Tone.context.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.06);
  setTimeout(() => {
    fn();
    setTimeout(() => {
      if (!masterGain) return;
      const n = Tone.context.currentTime;
      masterGain.gain.cancelScheduledValues(n);
      masterGain.gain.setValueAtTime(0.0001, n);
      masterGain.gain.linearRampToValueAtTime(1, n + 0.12);
    }, 150);
  }, 70);
}

function rewireChain(): void {
  rewireChainUnison();
}

export function initEngine(note: string, shape: number): void {
  teardown();
  currentNote = note;
  const limiter = new Tone.Limiter(-1).toDestination();
  // Aggressive compression — auto-levels drone vs arp
  const compressor = new Tone.Compressor({
    threshold: -24,
    ratio: 8,
    attack: 0.003,
    release: 0.5,
    knee: 6,
  }).connect(limiter);
  masterGain = new Tone.Gain(1.2).connect(compressor);

  // Master filter — ball X axis controls cutoff
  masterFilter = new Tone.Filter({ frequency: 18000, type: 'lowpass', rolloff: -24 }).connect(masterGain);
  currentShape = shape;
  createUnisonVoices(shape);
  rewireChain();
}

export function teardown(): void {
  stopSequence();
  stopNoiseNode();
  isNoiseMode = false;
  if (masterGain) {
    masterGain.gain.rampTo(0, 0.08);
    const g = masterGain, synths = [...unisonSynths], fx = [...chainEffects];
    setTimeout(() => {
      synths.forEach(s => { try { s.dispose(); } catch {} });
      fx.forEach(e => { try { (e.node as any).dispose(); } catch {} });
      try { g?.dispose(); } catch {}
    }, 200);
    masterGain = null;
    mainSynth = null;
    unisonSynths = [];
    chainEffects = [];
  }
}

const VALID_OSC = ['sine','triangle','sawtooth','square','fmsine','fmtriangle','amsine'];
export function changeOscillator(type: string): void {
  // Noise types ('pink','white','brown') are handled by the noise node, not the synth
  if (!VALID_OSC.includes(type)) return;
  currentOscType = type;
  unisonSynths.forEach(s => { try { s.set({ oscillator: { type: type as any } }); } catch {} });
}

function stopSequence(): void {
  try { triggerLoop?.stop(0); triggerLoop?.dispose(); } catch {}
  triggerLoop = null;
  // Don't stop the global Transport here — bank engines may be using it
}

export function stopTransportIfIdle(): void {
  // Call this only when you know no banks are running
  try { Tone.getTransport().stop(); Tone.getTransport().cancel(); } catch {}
}

export function startFree(note: string, shape: number, bpm: number): void {
  stopSequence();
  currentMode = 'FREE';
  currentNote = note;
  if (!mainSynth) return;
  // Restore volume for drone/free mode
  mainSynth.volume.value = 20;
  Tone.getTransport().bpm.value = bpm;
  mainSynth.set({ envelope: shapeToEnv(shape) });
  const dur = noteDuration(shape);
  if (shape > 0.85) {
    triggerUnisonAttack(note);
  } else {
    triggerLoop = new Tone.Loop(time => {
      triggerUnisonAttackRelease(currentNote, dur, time);
    }, '4n');
    (triggerLoop as Tone.Loop).start(0);
    Tone.getTransport().start('+0.05');
  }
}

export function startBeat(note: string, shape: number, rate: string, bpm: number): void {
  stopSequence();
  currentMode = 'BEAT';
  currentNote = note;
  if (!mainSynth) return;
  Tone.getTransport().bpm.value = bpm;
  mainSynth.set({ envelope: shapeToEnv(shape) });
  const dur = noteDuration(shape);
  triggerLoop = new Tone.Loop(time => {
    mainSynth?.triggerAttackRelease(currentNote, dur, time);
  }, rate as Tone.Unit.Time);
  (triggerLoop as Tone.Loop).start(0);
  Tone.getTransport().start('+0.05');
}

const SCALE_INTERVALS: Record<string, number[]> = {
  'Ionian (Major)':    [0,2,4,5,7,9,11],
  'Dorian':            [0,2,3,5,7,9,10],
  'Phrygian':          [0,1,3,5,7,8,10],
  'Phrygian Dominant': [0,1,4,5,7,8,10],
  'Lydian':            [0,2,4,6,7,9,11],
  'Lydian Dominant':   [0,2,4,6,7,9,10],
  'Mixolydian':        [0,2,4,5,7,9,10],
  'Aeolian (Minor)':   [0,2,3,5,7,8,10],
  'Locrian':           [0,1,3,5,6,8,10],
  'Melodic Minor':     [0,2,3,5,7,9,11],
  'Harmonic Minor':    [0,2,3,5,7,8,11],
  'Hungarian Minor':   [0,2,3,6,7,8,11],
  'Persian':           [0,1,4,5,6,8,11],
  'Whole Tone':        [0,2,4,6,8,10],
  'Diminished':        [0,2,3,5,6,8,9,11],
  'Pentatonic Minor':  [0,3,5,7,10],
  'Pentatonic Major':  [0,2,4,7,9],
  'Blues':             [0,3,5,6,7,10],
};

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function buildNotes(rootNote: string, octave: number, scale: string, steps: number, pattern: string): string[] {
  const rootIdx   = NOTE_NAMES.indexOf(rootNote);
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS['Dorian'];
  const rootMidi  = (octave + 2) * 12 + rootIdx;
  const pool: string[] = [];
  for (let o = 0; o < 2; o++) {
    intervals.forEach(i => {
      const m = rootMidi + i + o * 12;
      pool.push(`${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`);
    });
  }
  const notes = pool.slice(0, steps);
  switch (pattern) {
    case 'Down':    return [...notes].reverse();
    case 'Up/Down': return [...notes, ...[...notes].reverse().slice(1, -1)];
    case 'Random':  return [...notes].sort(() => Math.random() - 0.5);
    default:        return notes;
  }
}

export function startArp(config: {
  rootNote: string; octave: number; scale: string; steps: number;
  pattern: string; stepRate: string; bpm: number; shape: number;
}): void {
  stopSequence();
  currentMode = 'ARP';
  if (!mainSynth) return;
  // Pull arp volume down — many triggers per bar = much louder perceived than drone
  mainSynth.volume.value = -40;
  Tone.getTransport().bpm.value = config.bpm;
  mainSynth.set({ envelope: shapeToEnv(config.shape) });
  arpNotes = buildNotes(config.rootNote, config.octave, config.scale, config.steps, config.pattern);
  const dur = noteDuration(config.shape);
  let idx = 0;
  triggerLoop = new Tone.Sequence(time => {
    mainSynth?.triggerAttackRelease(arpNotes[idx % arpNotes.length], dur, time);
    idx++;
  }, arpNotes, config.stepRate as Tone.Unit.Time);
  (triggerLoop as Tone.Sequence).start(0);
  Tone.getTransport().start('+0.05');
}

export function updateArpNotes(config: {
  rootNote: string; octave: number; scale: string; steps: number;
  pattern: string; stepRate: string; bpm: number; shape: number;
}): void {
  if (unisonSynths.length === 0) return;
  arpNotes = buildNotes(config.rootNote, config.octave, config.scale, config.steps, config.pattern);
  Tone.getTransport().bpm.value = config.bpm;
  const updEnv = shapeToEnv(config.shape);
  unisonSynths.forEach(s => s.set({ envelope: updEnv }));
  const updDur = noteDuration(config.shape);
  try { triggerLoop?.stop(0); triggerLoop?.dispose(); } catch {}
  let updIdx = 0;
  triggerLoop = new Tone.Sequence(time => {
    triggerUnisonAttackRelease(arpNotes[updIdx % arpNotes.length], updDur, time);
    updIdx++;
  }, arpNotes, config.stepRate as Tone.Unit.Time);
  (triggerLoop as Tone.Sequence).start(0);
  if (Tone.getTransport().state !== 'started') Tone.getTransport().start('+0.05');
}

export function updateShape(shape: number, note: string, mode: string): void {
  if (!mainSynth) return;
  currentShape = shape;
  mainSynth.set({ envelope: shapeToEnv(shape) });
  if (mode === 'FREE') {
    if (shape > 0.4) {
      // Moving into swell/drone — stop loop, hold note
      if (triggerLoop) {
        stopSequence();
        triggerUnisonAttack(note);
      }
    } else {
      // Moving into pluck/ping — start loop if not already running
      if (!triggerLoop) {
        triggerUnisonRelease();
        const dur = noteDuration(shape);
        setTimeout(() => {
          if (!mainSynth) return;
          triggerLoop = new Tone.Loop(time => {
            triggerUnisonAttackRelease(currentNote, dur, time);
          }, '4n');
          (triggerLoop as Tone.Loop).start(0);
          Tone.getTransport().start('+0.05');
        }, 200);
      }
    }
  }
}

export function changeLiveNote(note: string, mode: string): void {
  currentNote = note;
  if (unisonSynths.length === 0) return;
  if (mode === 'FREE') {
    triggerUnisonRelease();
    setTimeout(() => triggerUnisonAttack(note), 500);
  }
}

export async function addEffect(id: number, name: EffectName): Promise<void> {
  const node = createEffectNode(name);
  chainEffects.push({ id, name, node, muted: false });
  duckAndRewire(() => rewireChain());
}

export function removeEffect(id: number): void {
  const idx = chainEffects.findIndex(e => e.id === id);
  if (idx === -1) return;
  const effect = chainEffects[idx];
  chainEffects.splice(idx, 1);
  duckAndRewire(() => {
    rewireChain();
    setTimeout(() => { try { (effect.node as any).dispose(); } catch {} }, 200);
  });
}

export function muteEffect(id: number, muted: boolean): void {
  const effect = chainEffects.find(e => e.id === id);
  if (!effect) return;
  effect.muted = muted;
  duckAndRewire(() => rewireChain());
}

export function updateEffectDotLive(id: number, x: number, y: number): void {
  const effect = chainEffects.find(e => e.id === id);
  if (!effect || effect.muted) return;
  applyDotLive(effect.name, effect.node, x, y);
}

export function updateEffectDotRelease(id: number, x: number, y: number): void {
  const effect = chainEffects.find(e => e.id === id);
  if (!effect || effect.muted) return;
  applyDotRelease(effect.name, effect.node, x, y);
}

export function syncChain(modules: {
  id: number; name: string; muted: boolean;
  dotX: number; dotY: number; level: number;
}[]): void {
  const moduleIds = new Set(modules.map(m => m.id));
  chainEffects.filter(e => !moduleIds.has(e.id)).forEach(e => removeEffect(e.id));
  const chainIds = new Set(chainEffects.map(e => e.id));
  modules.forEach(m => { if (!chainIds.has(m.id)) addEffect(m.id, m.name as EffectName); });
  modules.forEach(m => {
    const effect = chainEffects.find(e => e.id === m.id);
    if (effect && effect.muted !== m.muted) muteEffect(m.id, m.muted);
  });
}

export function disposeDrone(): void { teardown(); }

export function setTransportBpm(bpm: number): void {
  Tone.getTransport().bpm.value = bpm;
}

// ── Ball master control ───────────────────────────────────────────────────────
export function setBallPosition(x: number, y: number): void {
  // X = filter cutoff (logarithmic 20Hz–18kHz)
  if (masterFilter) {
    const freq = Math.pow(10, x * (Math.log10(18000) - Math.log10(20)) + Math.log10(20));
    masterFilter.frequency.rampTo(Math.min(18000, Math.max(20, freq)), 0.05);
  }
  // Y = wet/dry blend (0=dry, 1=fully wet)
  if (dryGain) dryGain.gain.rampTo(1 - y, 0.05);
  if (wetGain) wetGain.gain.rampTo(y, 0.05);
}

// ── Per-effect parameter control ──────────────────────────────────────────────
export function applyEffectParam(id: number, name: string, paramIdx: number, value: number): void {
  const effect = chainEffects.find(e => e.id === id);
  if (!effect || effect.muted) return;
  const node = effect.node as any;
  const pct  = value / 100;

  try {
    // Custom smooth classes — use setParams(x, y)
    // We store last known x/y per effect and update the changed axis
    if (!applyEffectParam._state) applyEffectParam._state = {};
    const key = `${id}`;
    if (!applyEffectParam._state[key]) applyEffectParam._state[key] = [0.5, 0.5];
    const [cx, cy] = applyEffectParam._state[key];

    switch (name) {
      case 'Reverb': {
        // paramIdx 0=decay(x), 1=pre-delay(x2), 2=wet(y)
        // Map: x=room size via feedback, y=wet
        if (paramIdx === 0) {
          const nx = (value - 0.5) / (20 - 0.5); // decay 0.5-20s → 0-1
          applyEffectParam._state[key] = [nx, cy];
          node.setParams?.(nx, cy);
        }
        if (paramIdx === 1) {
          // pre-delay — set directly on delays
          if (node._delays) node._delays.forEach((d: any) => { d.delayTime.rampTo(value/1000, 0.1); });
        }
        if (paramIdx === 2) {
          applyEffectParam._state[key] = [cx, pct];
          node.setParams?.(cx, pct);
        }
        break;
      }
      case 'Tape': {
        // x=wow/flutter, y=wet
        if (paramIdx === 0) { applyEffectParam._state[key] = [pct, cy]; node.setParams?.(pct, cy); }
        if (paramIdx === 1) { applyEffectParam._state[key] = [pct, cy]; node.setParams?.(pct, cy); } // HF maps to x too
        if (paramIdx === 2) { applyEffectParam._state[key] = [cx, pct]; node.setParams?.(cx, pct); }
        break;
      }
      case 'Fuzz': {
        // x=drive, y=wet
        if (paramIdx === 0) { applyEffectParam._state[key] = [pct, cy]; node.setParams?.(pct, cy); }
        if (paramIdx === 1) { applyEffectParam._state[key] = [cx, pct]; node.setParams?.(cx, pct); }
        break;
      }
      case 'Crush': {
        if (paramIdx === 0) { applyEffectParam._state[key] = [pct, cy]; node.setParams?.(pct, cy); }
        if (paramIdx === 1) { applyEffectParam._state[key] = [cx, pct]; node.setParams?.(cx, pct); }
        break;
      }
      case 'Delay': {
        if (paramIdx === 0) node.delayTime?.rampTo(pct * 1.5, 0.2);
        if (paramIdx === 1) node.feedback?.rampTo(pct * 0.95, 0.1);
        if (paramIdx === 2) node.wet?.rampTo(pct, 0.1);
        break;
      }
      case 'Chorus':
      case 'Grain': {
        if (paramIdx === 0) node.frequency?.rampTo(pct * 8, 0.1);
        if (paramIdx === 1) { node.depth = pct; }
        if (paramIdx === 2) node.wet?.rampTo(pct, 0.1);
        break;
      }
      case 'Filter': {
        if (paramIdx === 0) {
          const freq = Math.pow(10, pct * (Math.log10(18000) - Math.log10(80)) + Math.log10(80));
          node.frequency?.rampTo(freq, 0.1);
        }
        if (paramIdx === 1) node.Q?.rampTo(pct * 18, 0.1);
        break;
      }
      case 'Pitch': {
        if (paramIdx === 0) node.pitch = Math.round(value);
        if (paramIdx === 1) node.wet?.rampTo(pct, 0.1);
        break;
      }
      case 'Modulate': {
        if (paramIdx === 0) node.frequency?.rampTo(pct * 5, 0.2);
        if (paramIdx === 1) node.depth?.rampTo(pct, 0.1);
        break;
      }
      case 'Shimmer': {
        if (paramIdx === 0) node.order = Math.round(2 + pct * 78);
        if (paramIdx === 1) node.wet?.rampTo(pct, 0.1);
        break;
      }
      case 'Warp': {
        if (paramIdx === 0) node.frequency?.rampTo((pct - 0.5) * 600, 0.2);
        if (paramIdx === 1) node.wet?.rampTo(pct, 0.1);
        break;
      }
      case 'Wobble': {
        if (paramIdx === 0) node.frequency?.rampTo(pct * 8, 0.1);
        if (paramIdx === 1) node.depth?.rampTo(pct * 0.5, 0.1);
        break;
      }
      case 'Pulse': {
        if (paramIdx === 0) node.frequency?.rampTo(pct * 10, 0.1);
        if (paramIdx === 1) node.depth?.rampTo(pct, 0.1);
        break;
      }
      case 'Space': {
        if (paramIdx === 0) node.delayTime?.rampTo(pct * 1.2, 0.2);
        if (paramIdx === 1) node.feedback?.rampTo(pct * 0.9, 0.1);
        if (paramIdx === 2) node.wet?.rampTo(pct, 0.1);
        break;
      }
    }
  } catch { /* ignore */ }
}
applyEffectParam._state = {} as Record<string, [number, number]>;

// ── Unison voice management ───────────────────────────────────────────────────
// Always create MAX_VOICES. Unused voices are silenced with gainNode, not disposed.
const MAX_VOICES = 4;
let voiceGains: Tone.Gain[] = [];  // one gain per voice — controls active/silent

function disposeUnisonVoices(): void {
  unisonSynths.forEach(s => { try { s.dispose(); } catch {} });
  voiceGains.forEach(g => { try { g.dispose(); } catch {} });
  unisonSynths = [];
  voiceGains = [];
  mainSynth = null;
}

function createUnisonVoices(shape: number): void {
  disposeUnisonVoices();
  const env = shapeToEnv(shape);

  for (let i = 0; i < MAX_VOICES; i++) {
    const gainNode = new Tone.Gain(i === 0 ? 1 : 0); // only voice 0 active by default
    voiceGains.push(gainNode);

    const synth = new Tone.Synth({
      oscillator: { type: currentOscType as any },
      envelope: env,
      volume: 0,
    });
    synth.set({ detune: (Math.random() - 0.5) * 2 });
    synth.connect(gainNode);
    unisonSynths.push(synth);
  }

  mainSynth = unisonSynths[0];
  // voiceGains will be connected in rewireChainUnison
}

// Apply detune spread across active voices
function applyUnisonDetune(): void {
  const voices = unisonVoices;
  // Map UI 0-100 to 0-50 cents spread for musical range
  const spread = unisonDetune * 0.5;
  for (let i = 0; i < MAX_VOICES; i++) {
    const detuneCents = voices <= 1 ? 0
      : ((i / (voices - 1)) - 0.5) * spread;
    unisonSynths[i]?.set({ detune: detuneCents + (Math.random() - 0.5) * 1.5 });
  }
}

// Apply volume compensation for stacking voices
function applyUnisonVolume(): void {
  const voices = unisonVoices;
  const vol = voices === 1 ? 0 : -3 * Math.log2(voices);
  unisonSynths.forEach(s => { try { s.volume.value = vol; } catch {} });
}

export function setUnison(voices: number, detune: number): void {
  unisonVoices = voices;
  unisonDetune = detune;
  if (voiceGains.length === 0) return;
  // Seamless — just fade gains in/out, no disposal, no gap
  for (let i = 0; i < MAX_VOICES; i++) {
    const targetGain = i < voices ? 1 : 0;
    try { voiceGains[i]?.gain.rampTo(targetGain, 0.08); } catch {}
  }
  applyUnisonDetune();
  applyUnisonVolume();
}


function rewireChainUnison(): void {
  if (!masterFilter) return;

  // Disconnect all synths
  unisonSynths.forEach(s => { try { s.disconnect(); } catch {} });
  chainEffects.forEach(e => { try { e.node.disconnect(); } catch {} });

  const active = chainEffects.filter(e => !e.muted);
  const dest = wetGain ?? masterFilter;
  const dryDest = dryGain ?? masterFilter;

  unisonSynths.forEach(s => {
    if (dryGain) s.connect(dryGain);
    if (active.length === 0) {
      s.connect(dest);
    } else {
      s.connect(active[0].node as any);
    }
  });

  if (active.length > 0) {
    for (let i = 0; i < active.length - 1; i++) {
      (active[i].node as any).connect(active[i + 1].node as any);
    }
    (active[active.length - 1].node as any).connect(dest);
  }
}

function triggerUnisonAttack(note: string): void {
  // Trigger all voices — gain nodes control which are heard
  unisonSynths.forEach(s => { try { s.triggerAttack(note); } catch {} });
}

function triggerUnisonRelease(): void {
  unisonSynths.forEach(s => { try { s.triggerRelease(); } catch {} });
}

function triggerUnisonAttackRelease(note: string, dur: string, time?: number): void {
  unisonSynths.forEach(s => {
    try {
      if (time !== undefined) s.triggerAttackRelease(note, dur, time);
      else s.triggerAttackRelease(note, dur);
    } catch {}
  });
}

// ── Noise oscillator ──────────────────────────────────────────────────────────
function startNoiseNode(): void {
  stopNoiseNode();
  if (!masterFilter) return;
  noiseGain = new Tone.Gain(0.8);
  noiseNode = new Tone.Noise({ type: 'pink', volume: -6 });
  // Connect noise through same chain as synth voices
  if (dryGain) noiseGain.connect(dryGain);
  const active = chainEffects.filter(e => !e.muted);
  if (active.length === 0) {
    const dest = wetGain ?? masterFilter;
    noiseGain.connect(dest);
  } else {
    noiseGain.connect(active[0].node as any);
  }
  noiseNode.connect(noiseGain);
  noiseNode.start();
}

function stopNoiseNode(): void {
  try { noiseNode?.stop(); noiseNode?.dispose(); noiseNode = null; } catch {}
  try { noiseGain?.dispose(); noiseGain = null; } catch {}
}

export function setNoiseMode(enabled: boolean, noiseType: 'white' | 'pink' | 'brown' = 'pink'): void {
  isNoiseMode = enabled;
  if (enabled) {
    // Silence synth voices, start noise
    voiceGains.forEach(g => { try { g.gain.rampTo(0, 0.1); } catch {} });
    if (noiseNode) {
      noiseNode.type = noiseType;
    } else {
      startNoiseNode();
    }
  } else {
    // Stop noise, restore synth voices
    stopNoiseNode();
    for (let i = 0; i < unisonVoices; i++) {
      try { voiceGains[i]?.gain.rampTo(1, 0.1); } catch {}
    }
  }
}
