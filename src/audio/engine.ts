import * as Tone from 'tone';
import { EffectName, createEffectNode, applyDotLive, applyDotRelease } from './effects';
import { Voice } from './voice';
import { Patch, LayerConfig } from './patch';
import { SampleVoice } from './sampleVoice';
import { GranularEngine, renderToneBuffer } from './granular';
import { GrainScatter, renderPulseSource } from './grainScatter';
import { Microcosm as MicrocosmCore } from './microcosm';

interface ChainEffect {
  id: number;
  name: EffectName;
  node: Tone.ToneAudioNode;
  muted: boolean;
}

let patch: Patch | null = null;
let patchBus: Tone.Gain | null = null;  // patch layers sum here, then into chain

let masterGain: Tone.Gain | null = null;
let masterFilter: Tone.Filter | null = null;
let dryGain: Tone.Gain | null = null;
let wetGain: Tone.Gain | null = null;
let chainEffects: ChainEffect[] = [];
let triggerLoop: Tone.Loop | Tone.Sequence | null = null;
let currentMode = 'FREE';
let currentNote = 'D3';
let arpNotes: string[] = [];
let currentOscType = 'triangle';
let currentShape = 0.6;
let engineReady = false;

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

// ── Engine lifecycle ──────────────────────────────────────────────────────────
export function initEngine(note: string, shape: number): void {
  teardown();
  currentNote = note;
  currentShape = shape;

  const limiter    = new Tone.Limiter(-1).toDestination();
  const compressor = new Tone.Compressor({ threshold: -24, ratio: 8, attack: 0.003, release: 0.5, knee: 6 }).connect(limiter);
  masterGain   = new Tone.Gain(1.0).connect(compressor);
  masterFilter = new Tone.Filter({ frequency: 18000, type: 'lowpass', rolloff: -24 }).connect(masterGain);
  dryGain = new Tone.Gain(0).connect(masterFilter);
  wetGain = new Tone.Gain(1).connect(masterFilter);

  createVoices(shape);
  rewireChain();
  engineReady = true;
}

export function teardown(): void {
  stopSequence();
  engineReady = false;
  if (masterGain) {
    masterGain.gain.rampTo(0, 0.08);
    const g = masterGain, p = patch, pb = patchBus, fx = [...chainEffects];
    const mf = masterFilter, dg = dryGain, wg = wetGain;
    setTimeout(() => {
      try { p?.dispose(); } catch {}
      try { pb?.disconnect(); pb?.dispose(); } catch {}
      fx.forEach(e => { try { (e.node as any).dispose(); } catch {} });
      try { mf?.dispose(); } catch {}
      try { dg?.dispose(); } catch {}
      try { wg?.dispose(); } catch {}
      try { g?.dispose(); } catch {}
    }, 250);
    masterGain = null; masterFilter = null; dryGain = null; wetGain = null;
    patch = null; patchBus = null; chainEffects = [];
  }
}

// ── Voice pool ────────────────────────────────────────────────────────────────
function createVoices(shape: number): void {
  if (patch) { try { patch.dispose(); } catch {} }
  if (patchBus) { try { patchBus.disconnect(); } catch {} }

  patchBus = new Tone.Gain(1);
  patch = new Patch(patchBus);
  patch.setAmpEnvelope(shapeToEnv(shape));
  // Default layer 0 uses current osc type
  patch.setLayer(0, { enabled: true, waveform: currentOscType });
}

// ── Chain wiring ──────────────────────────────────────────────────────────────
function rewireChain(): void {
  if (!masterFilter || !patchBus) return;
  try { patchBus.disconnect(); } catch {}
  chainEffects.forEach(e => { try { e.node.disconnect(); } catch {} });

  const active = chainEffects.filter(e => !e.muted);
  const dest = wetGain ?? masterFilter;

  if (dryGain) patchBus.connect(dryGain);
  if (active.length === 0) {
    patchBus.connect(dest);
  } else {
    patchBus.connect(active[0].node as any);
    for (let i = 0; i < active.length - 1; i++) {
      (active[i].node as any).connect(active[i + 1].node as any);
    }
    (active[active.length - 1].node as any).connect(dest);
  }
}

// ── Triggers — patch fires all enabled layers together ────────────────────────
function attackAll(note: string): void {
  patch?.triggerAttack(note);
}
function releaseAll(): void {
  patch?.triggerRelease();
}
function attackReleaseAll(note: string, dur: string, time?: number): void {
  patch?.triggerAttackRelease(note, dur, time);
}

function setAllEnv(shape: number): void {
  patch?.setAmpEnvelope(shapeToEnv(shape));
}

export function changeOscillator(type: string): void {
  const VALID = ['sine','triangle','sawtooth','square','fmsine'];
  if (!VALID.includes(type)) return;
  currentOscType = type;
  // Changes layer 0 (the primary layer) waveform
  patch?.setLayer(0, { waveform: type });
}

// ── Layer control (multi-layer patch) ─────────────────────────────────────────
export function setPatchLayer(index: number, config: Partial<LayerConfig>): void {
  patch?.setLayer(index, config);
}
export function getPatchLayers(): LayerConfig[] {
  return patch?.getLayers() ?? [];
}
export function setMovement(amount: number): void {
  patch?.setMovement(amount);
}

// Mute/unmute the dry synth (patchBus) — used when Microcosm should be heard alone
export function setDrySynthMuted(muted: boolean): void {
  if (patchBus) {
    try { patchBus.gain.rampTo(muted ? 0 : 1, 0.1); } catch {}
  }
}
export function loadPatchLayers(layers: LayerConfig[]): void {
  console.log('[engine] loadPatchLayers called, patch exists:', !!patch, 'layers:', layers.map(l => l.enabled));
  patch?.loadLayers(layers);
  console.log('[engine] after load, patch layers:', patch?.getLayers().map(l => l.enabled));
}

// Unison is replaced by multi-layer patch — keep a no-op for API compatibility
export function setUnison(_voiceCount: number, _detune: number): void {
  // deprecated — layering provides width now
}

// ── Sequence helpers ──────────────────────────────────────────────────────────
function stopSequence(): void {
  try { triggerLoop?.stop(0); triggerLoop?.dispose(); } catch {}
  triggerLoop = null;
}

export function stopTransportIfIdle(): void {
  try { Tone.getTransport().stop(); Tone.getTransport().cancel(); } catch {}
}

// ── FREE mode ─────────────────────────────────────────────────────────────────
export function startFree(note: string, shape: number, bpm: number): void {
  stopSequence();
  currentMode = 'FREE';
  currentNote = note;
  if (!engineReady) return;
  Tone.getTransport().bpm.value = bpm;
  setAllEnv(shape);
  if (shape > 0.4) {
    // Swell/drone — sustained held note
    attackAll(note);
  } else {
    // Pluck/ping — rhythmic loop
    const dur = noteDuration(shape);
    triggerLoop = new Tone.Loop(time => attackReleaseAll(currentNote, dur, time), '4n');
    (triggerLoop as Tone.Loop).start(0);
    if (Tone.getTransport().state !== 'started') Tone.getTransport().start('+0.05');
  }
}

// ── BEAT mode ─────────────────────────────────────────────────────────────────
export function startBeat(note: string, shape: number, rate: string, bpm: number): void {
  stopSequence();
  currentMode = 'BEAT';
  currentNote = note;
  if (!engineReady) return;
  Tone.getTransport().bpm.value = bpm;
  setAllEnv(shape);
  const dur = noteDuration(shape);
  triggerLoop = new Tone.Loop(time => attackReleaseAll(currentNote, dur, time), rate as Tone.Unit.Time);
  (triggerLoop as Tone.Loop).start(0);
  if (Tone.getTransport().state !== 'started') Tone.getTransport().start('+0.05');
}

// ── Scales / notes ────────────────────────────────────────────────────────────
const SCALE_INTERVALS: Record<string, number[]> = {
  'Ionian (Major)':[0,2,4,5,7,9,11],'Dorian':[0,2,3,5,7,9,10],
  'Phrygian':[0,1,3,5,7,8,10],'Phrygian Dominant':[0,1,4,5,7,8,10],
  'Lydian':[0,2,4,6,7,9,11],'Lydian Dominant':[0,2,4,6,7,9,10],
  'Mixolydian':[0,2,4,5,7,9,10],'Aeolian (Minor)':[0,2,3,5,7,8,10],
  'Locrian':[0,1,3,5,6,8,10],'Melodic Minor':[0,2,3,5,7,9,11],
  'Harmonic Minor':[0,2,3,5,7,8,11],'Hungarian Minor':[0,2,3,6,7,8,11],
  'Persian':[0,1,4,5,6,8,11],'Whole Tone':[0,2,4,6,8,10],
  'Diminished':[0,2,3,5,6,8,9,11],'Pentatonic Minor':[0,3,5,7,10],
  'Pentatonic Major':[0,2,4,7,9],'Blues':[0,3,5,6,7,10],
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

// ── ARP mode ──────────────────────────────────────────────────────────────────
export function startArp(config: {
  rootNote: string; octave: number; scale: string; steps: number;
  pattern: string; stepRate: string; bpm: number; shape: number;
}): void {
  stopSequence();
  currentMode = 'ARP';
  if (!engineReady) return;
  Tone.getTransport().bpm.value = config.bpm;
  setAllEnv(config.shape);
  arpNotes = buildNotes(config.rootNote, config.octave, config.scale, config.steps, config.pattern);
  const dur = noteDuration(config.shape);
  let idx = 0;
  triggerLoop = new Tone.Sequence(time => {
    attackReleaseAll(arpNotes[idx % arpNotes.length], dur, time);
    idx++;
  }, arpNotes, config.stepRate as Tone.Unit.Time);
  (triggerLoop as Tone.Sequence).start(0);
  if (Tone.getTransport().state !== 'started') Tone.getTransport().start('+0.05');
}

export function updateArpNotes(config: {
  rootNote: string; octave: number; scale: string; steps: number;
  pattern: string; stepRate: string; bpm: number; shape: number;
}): void {
  if (!engineReady) return;
  arpNotes = buildNotes(config.rootNote, config.octave, config.scale, config.steps, config.pattern);
  Tone.getTransport().bpm.value = config.bpm;
  setAllEnv(config.shape);
  const dur = noteDuration(config.shape);
  try { triggerLoop?.stop(0); triggerLoop?.dispose(); } catch {}
  let idx = 0;
  triggerLoop = new Tone.Sequence(time => {
    attackReleaseAll(arpNotes[idx % arpNotes.length], dur, time);
    idx++;
  }, arpNotes, config.stepRate as Tone.Unit.Time);
  (triggerLoop as Tone.Sequence).start(0);
  if (Tone.getTransport().state !== 'started') Tone.getTransport().start('+0.05');
}

// ── Shape morph live ──────────────────────────────────────────────────────────
export function updateShape(shape: number, note: string, mode: string): void {
  if (!engineReady) return;
  currentShape = shape;
  setAllEnv(shape);
  if (mode === 'FREE') {
    if (shape > 0.4) {
      if (triggerLoop) { stopSequence(); attackAll(note); }
    } else {
      if (!triggerLoop) {
        releaseAll();
        const dur = noteDuration(shape);
        setTimeout(() => {
          if (!engineReady) return;
          triggerLoop = new Tone.Loop(time => attackReleaseAll(currentNote, dur, time), '4n');
          (triggerLoop as Tone.Loop).start(0);
          if (Tone.getTransport().state !== 'started') Tone.getTransport().start('+0.05');
        }, 200);
      }
    }
  }
}

export function changeLiveNote(note: string, mode: string): void {
  currentNote = note;
  if (!engineReady) return;
  if (mode === 'FREE' && currentShape > 0.4) {
    releaseAll();
    setTimeout(() => attackAll(note), 300);
  }
}

// ── Layer controls (sub / noise / drive / filter env) ─────────────────────────
export function setSubLevel(_level: number): void {
  // Sub is now per-layer config in the Patch; kept for API compatibility
}
export function setNoiseLayer(_level: number): void {
  // Noise is now a layer waveform in the Patch
}
export function setDrive(amount: number): void {
  patch?.setDrive(amount);
}
export function setFilterEnvAmount(amount: number): void {
  patch?.setFilterEnvAmount(amount);
}

// ── Noise mode (full noise source, silences pitched voices) ───────────────────
export function setNoiseMode(_enabled: boolean): void {
  // Noise is now configured as a layer waveform in the Patch
}

// ── Effects management ────────────────────────────────────────────────────────
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

export function syncChain(modules: { id: number; name: string; muted: boolean; dotX: number; dotY: number; level: number; }[]): void {
  const moduleIds = new Set(modules.map(m => m.id));
  chainEffects.filter(e => !moduleIds.has(e.id)).forEach(e => removeEffect(e.id));
  const chainIds = new Set(chainEffects.map(e => e.id));
  modules.forEach(m => { if (!chainIds.has(m.id)) addEffect(m.id, m.name as EffectName); });
  modules.forEach(m => {
    const effect = chainEffects.find(e => e.id === m.id);
    if (effect && effect.muted !== m.muted) muteEffect(m.id, m.muted);
  });
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

export function disposeDrone(): void { teardown(); }

export function setTransportBpm(bpm: number): void {
  Tone.getTransport().bpm.value = bpm;
}

// ── Ball master control ───────────────────────────────────────────────────────
export function setBallPosition(x: number, y: number): void {
  if (masterFilter) {
    const freq = Math.pow(10, x * (Math.log10(18000) - Math.log10(20)) + Math.log10(20));
    masterFilter.frequency.rampTo(Math.min(18000, Math.max(20, freq)), 0.05);
  }
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
    if (!applyEffectParam._state) applyEffectParam._state = {};
    const key = `${id}`;
    if (!applyEffectParam._state[key]) applyEffectParam._state[key] = [0.5, 0.5];
    const [cx, cy] = applyEffectParam._state[key];

    switch (name) {
      case 'Reverb':
        // Tone.Freeverb: 0=roomSize(decay), 1=dampening, 2=wet
        if (paramIdx === 0) { try { node.roomSize.rampTo(Math.min(0.95, 0.5 + (value/20)*0.45), 0.1); } catch {} }
        if (paramIdx === 1) { try { node.dampening = 1000 + (value/200)*8000; } catch {} }
        if (paramIdx === 2) node.wet?.rampTo(pct, 0.1);
        break;
      case 'Tape':
        if (paramIdx === 0) { applyEffectParam._state[key] = [pct, cy]; node.setParams?.(pct, cy); }
        if (paramIdx === 1) { applyEffectParam._state[key] = [pct, cy]; node.setParams?.(pct, cy); }
        if (paramIdx === 2) { applyEffectParam._state[key] = [cx, pct]; node.setParams?.(cx, pct); }
        break;
      case 'Fuzz':
      case 'Crush':
        if (paramIdx === 0) { applyEffectParam._state[key] = [pct, cy]; node.setParams?.(pct, cy); }
        if (paramIdx === 1) { applyEffectParam._state[key] = [cx, pct]; node.setParams?.(cx, pct); }
        break;
      case 'Delay':
        if (paramIdx === 0) node.delayTime?.rampTo(pct * 1.5, 0.2);
        if (paramIdx === 1) node.feedback?.rampTo(pct * 0.95, 0.1);
        if (paramIdx === 2) node.wet?.rampTo(pct, 0.1);
        break;
      case 'Chorus':
      case 'Grain':
        if (paramIdx === 0) node.frequency?.rampTo(pct * 8, 0.1);
        if (paramIdx === 1) node.depth = pct;
        if (paramIdx === 2) node.wet?.rampTo(pct, 0.1);
        break;
      case 'Filter':
        if (paramIdx === 0) { const freq = Math.pow(10, pct * (Math.log10(18000) - Math.log10(80)) + Math.log10(80)); node.frequency?.rampTo(freq, 0.1); }
        if (paramIdx === 1) node.Q?.rampTo(pct * 18, 0.1);
        break;
      case 'Pitch':
        if (paramIdx === 0) node.pitch = Math.round(value);
        if (paramIdx === 1) node.wet?.rampTo(pct, 0.1);
        break;
      case 'Modulate':
        if (paramIdx === 0) node.frequency?.rampTo(pct * 5, 0.2);
        if (paramIdx === 1) node.depth?.rampTo(pct, 0.1);
        break;
      case 'Shimmer':
        if (paramIdx === 0) node.order = Math.round(2 + pct * 78);
        if (paramIdx === 1) node.wet?.rampTo(pct, 0.1);
        break;
      case 'Warp':
        if (paramIdx === 0) node.frequency?.rampTo((pct - 0.5) * 600, 0.2);
        if (paramIdx === 1) node.wet?.rampTo(pct, 0.1);
        break;
      case 'Wobble':
        if (paramIdx === 0) node.frequency?.rampTo(pct * 8, 0.1);
        if (paramIdx === 1) node.depth?.rampTo(pct * 0.5, 0.1);
        break;
      case 'Pulse':
        if (paramIdx === 0) node.frequency?.rampTo(pct * 10, 0.1);
        if (paramIdx === 1) node.depth?.rampTo(pct, 0.1);
        break;
      case 'Space':
        if (paramIdx === 0) node.delayTime?.rampTo(pct * 1.2, 0.2);
        if (paramIdx === 1) node.feedback?.rampTo(pct * 0.9, 0.1);
        if (paramIdx === 2) node.wet?.rampTo(pct, 0.1);
        break;
    }
  } catch { /* ignore */ }
}
applyEffectParam._state = {} as Record<string, [number, number]>;



// ── GRANULAR TRANSFORMATION PROOF ─────────────────────────────────────────────
let granular: GranularEngine | null = null;

export async function startGranular(waveform: string, freq: number): Promise<void> {
  if (!masterFilter) { console.log('[gran] press play first'); return; }
  if (granular) { try { granular.dispose(); } catch {} }
  granular = new GranularEngine();
  granular.output.connect(wetGain ?? masterFilter);
  console.log('[gran] rendering source tone...');
  const buf = await renderToneBuffer(waveform, freq, 2);
  console.log('[gran] rendered, starting granular cloud');
  granular.setBuffer(buf);
  granular.setLoop(true);
  granular.start();
  setDrySynthMuted(true);  // hear ONLY the transformation
}

export function granularFreeze(amount: number): void { granular?.freeze(amount); }
export function granularRate(r: number): void { granular?.setRate(r); }
export function granularDetune(c: number): void { granular?.setDetune(c); }
export function granularGrainSize(s: number): void { granular?.setGrainSize(s); }
export function granularReverse(rev: boolean): void { granular?.setReverse(rev); }
export function stopGranular(): void { try { granular?.stop(); } catch {} setDrySynthMuted(false); }


// ── MICROCOSM (GrainScatter) — self-contained, independent of synth PLAY ───────
let scatter: GrainScatter | null = null;
let scatterReady = false;
let microMaster: Tone.Gain | null = null;

async function ensureMicrocosm(): Promise<void> {
  // Start audio context if the synth never initialised it
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }
  if (!scatter) {
    // The Microcosm has its own output to destination, independent of the synth chain,
    // via a limiter for safety.
    const limiter = new Tone.Limiter(-1).toDestination();
    microMaster = new Tone.Gain(1).connect(limiter);
    scatter = new GrainScatter();
    scatter.output.connect(microMaster);
    const buf = await renderPulseSource('sine', 220);
    scatter.setBuffer(buf);
    scatterReady = true;
  }
}

export async function microcosmSetSource(waveform: string, freq: number): Promise<void> {
  await ensureMicrocosm();
  const buf = await renderPulseSource(waveform, freq);
  scatter?.setBuffer(buf);
}

export async function microcosmPulse(): Promise<void> {
  await ensureMicrocosm();
  scatter?.pulse();
}

export async function microcosmHold(on: boolean): Promise<void> {
  await ensureMicrocosm();
  if (on) scatter?.startHold();
  else scatter?.stopHold();
}

// XY pad — X = ping-pong feedback/wet (space), Y = shimmer amount (height)
export function microcosmXY(x: number, y: number): void {
  if (!scatter) return;
  scatter.setPingPong(0.3 + x * 0.55, 0.3 + x * 0.5);
  scatter.setShimmer(y);
}
export function microcosmDensity(n: number): void { scatter?.setDensity(n); }
export function microcosmSpread(s: number): void { scatter?.setSpread(s); }
export function microcosmReverb(w: number): void { scatter?.setReverb(w); }

export function microcosmStop(): void {
  scatter?.stopHold();
}

// ── MICROCOSM ENGINE ───────────────────────────────────────────────────────
let microcosmCore: MicrocosmCore | null = null;
let microTestOsc: OscillatorNode | null = null;
let microSrcGain: GainNode | null = null;  // source feed gain (for ducking on pitch change)

async function ensureMicrocosmCore(): Promise<void> {
  if (!microcosmCore) {
    microcosmCore = new MicrocosmCore();
    await microcosmCore.load();
    microcosmCore.connectOut(microcosmCore.destination);
  }
  // Temporary internal source until the cross-context synth feed is built:
  // a native oscillator in the Microcosm's own context feeding its input.
  const ctx = microcosmCore.context;
  if (!microTestOsc) {
    microTestOsc = ctx.createOscillator();
    microTestOsc.type = 'triangle';
    microTestOsc.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0.32;  // headroom: high notes + octave-up grains were railing
    microSrcGain = g;
    microTestOsc.connect(g);
    g.connect(microcosmCore.nativeIn);
    microTestOsc.start();
  }
}

export async function microcosmStart(): Promise<void> {
  await ensureMicrocosmCore();
  microcosmCore?.startEngine();
  console.log('[micro] mosaic engine started');
}
export function microcosmStopEngine(): void {
  microcosmCore?.stopEngine();
}
export function microcosmEngineActive(id: string, on: boolean): void { microcosmCore?.setEngineActive(id, on); }
export function microcosmEngineLevel(id: string, level: number): void { microcosmCore?.setEngineLevel(id, level); }
export function microcosmMasterLevel(v: number): void { (microcosmCore as any)?.setMasterGain(v); }
export function microcosmEnginePan(id: string, pan: number): void { (microcosmCore as any)?.setPan(id, pan); }
export function microcosmEngineEQ(id: string, lo: number, mid: number, hi: number): void { (microcosmCore as any)?.setEQ(id, lo, mid, hi); }
export function microcosmActivity(a: number): void { microcosmCore?.setActivity(a); }
export function microcosmGrainSpread(x: number): void { microcosmCore?.setGrainSpread(x); }
export function microcosmPitchSpread(y: number): void { microcosmCore?.setPitchSpread(y); }
export function microcosmSetFilter(hz: number): void { microcosmCore?.setFilter(hz); }
export function microcosmSetSpace(w: number): void { microcosmCore?.setSpace(w); }
export function microcosmFreeze(on: boolean): void { microcosmCore?.setFreeze(on); }
export function microcosmArmedPalette(name: string): void { (microcosmCore as any)?.setArmedPalette(name); }
export function microcosmEngineAmount(id: string, amt: number): void { (microcosmCore as any)?.setEngineAmount(id, amt); }
export function microcosmGrainDensity(d: number): void { (microcosmCore as any)?.setDensity(d); }  // TEST DENSITY
// glide time for root changes (seconds). Slow = smooth tape-slide, no pop.
let microGlide = 0.28;
export function microcosmGlideTime(sec: number): void { microGlide = Math.max(0.02, sec); }
export function microcosmSourceFreq(hz: number): void {
  if (microTestOsc) {
    try {
      const ctx = microcosmCore!.context;
      const t = ctx.currentTime;
      const cur = microTestOsc.frequency.value;
      // pitch glide
      microTestOsc.frequency.cancelScheduledValues(t);
      microTestOsc.frequency.setValueAtTime(Math.max(1, cur), t);
      microTestOsc.frequency.exponentialRampToValueAtTime(Math.max(1, hz), t + microGlide);
      // DUCK the source briefly so in-flight grains crossing the pitch change aren't heard popping
      if (microSrcGain) {
        const base = 0.32;
        const dip = 0.06;        // near-silence during the change
        const tIn = 0.04;        // fade down
        const hold = microGlide; // stay low through the glide
        const tOut = 0.10;       // fade back up
        const g = microSrcGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(Math.max(0.0001, g.value), t);
        g.linearRampToValueAtTime(dip, t + tIn);
        g.setValueAtTime(dip, t + tIn + hold);
        g.linearRampToValueAtTime(base, t + tIn + hold + tOut);
      }
    } catch {}
  }
}
