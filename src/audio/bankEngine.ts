import * as Tone from 'tone';
import { Snapshot } from './snapshot';
import { createEffectNode, applyDotLive, EffectName } from './effects';

// Shared master bus — all banks connect here
let masterBus: Tone.Gain | null = null;
let masterLimiter: Tone.Limiter | null = null;

function getOrCreateMasterBus(): Tone.Gain {
  if (!masterBus || masterBus.disposed) {
    masterLimiter = new Tone.Limiter(-2).toDestination();
    const comp = new Tone.Compressor({ threshold:-14, ratio:3, attack:0.01, release:0.3 }).connect(masterLimiter);
    masterBus = new Tone.Gain(0.9).connect(comp);
  }
  return masterBus;
}

interface BankChainEffect {
  name: EffectName;
  node: Tone.ToneAudioNode;
  muted: boolean;
}

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

export class BankEngine {
  private synth: Tone.Synth;
  private gainNode: Tone.Gain;
  private panNode: Tone.Panner;
  private limiter: Tone.Limiter;
  private effects: BankChainEffect[] = [];
  private triggerLoop: Tone.Loop | Tone.Sequence | null = null;
  private snapshot: Snapshot;
  private _muted = false;
  private _fader = 80;
  private _disposed = false;

  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot;

    const bus    = getOrCreateMasterBus();
    this.limiter  = new Tone.Limiter(-1).toDestination(); // kept for type compat, unused
    this.panNode  = new Tone.Panner(0).connect(bus);
    this.gainNode = new Tone.Gain(0).connect(this.panNode);
    // Fade in smoothly to avoid click on connect
    setTimeout(() => { this.gainNode.gain.rampTo(this.faderToGain(80), 0.15); }, 50);

    // Match volume levels from main engine
    const shapeVol = snapshot.triggerMode === 'ARP' ? -40 : 20;

    this.synth = new Tone.Synth({
      oscillator: { type: snapshot.oscType as any },
      envelope: shapeToEnv(snapshot.shape),
      volume: shapeVol,
    });

    // Build effects chain
    this.buildEffects(snapshot.effects);

    // Wire synth through effects to gain
    this.rewire();

    // Start playing
    this.startPlayback();
  }

  private buildEffects(effects: Snapshot['effects']): void {
    this.effects = effects.map(e => ({
      name: e.name as EffectName,
      node: createEffectNode(e.name as EffectName),
      muted: e.muted,
    }));

    // Apply dot positions
    effects.forEach((e, i) => {
      if (!this.effects[i].muted) {
        applyDotLive(e.name as EffectName, this.effects[i].node, e.dotX, e.dotY);
      }
    });
  }

  private rewire(): void {
    try { this.synth.disconnect(); } catch {}
    this.effects.forEach(e => { try { e.node.disconnect(); } catch {} });

    const active = this.effects.filter(e => !e.muted);
    if (active.length === 0) {
      this.synth.connect(this.gainNode);
      return;
    }
    this.synth.connect(active[0].node as any);
    for (let i = 0; i < active.length - 1; i++) {
      (active[i].node as any).connect(active[i + 1].node as any);
    }
    (active[active.length - 1].node as any).connect(this.gainNode);
  }

  private startPlayback(): void {
    const { note, shape, triggerMode, bpm, stepRate, arpConfig } = this.snapshot;

    if (triggerMode === 'FREE') {
      if (shape > 0.85) {
        this.synth.triggerAttack(note);
      } else {
        const dur = noteDuration(shape);
        Tone.getTransport().bpm.value = bpm;
        this.triggerLoop = new Tone.Loop(time => {
          if (!this._muted) this.synth.triggerAttackRelease(note, dur, time);
        }, '4n');
        (this.triggerLoop as Tone.Loop).start(0);
        if (Tone.getTransport().state !== 'started') {
          Tone.getTransport().start('+0.05');
        }
      }
    } else if (triggerMode === 'BEAT') {
      const dur = noteDuration(shape);
      Tone.getTransport().bpm.value = bpm;
      this.triggerLoop = new Tone.Loop(time => {
        if (!this._muted) this.synth.triggerAttackRelease(note, dur, time);
      }, stepRate as Tone.Unit.Time);
      (this.triggerLoop as Tone.Loop).start(0);
      Tone.getTransport().start('+0.05');
    } else if (triggerMode === 'ARP') {
      const { scale, steps, pattern } = arpConfig;
      const noteParts = note.match(/([A-G]#?)(\d+)/);
      const rootNote  = noteParts ? noteParts[1] : 'D';
      const octave    = noteParts ? parseInt(noteParts[2]) : 2;
      const notes     = buildNotes(rootNote, octave, scale, steps, pattern);
      const dur       = noteDuration(shape);
      Tone.getTransport().bpm.value = bpm;
      let idx = 0;
      this.triggerLoop = new Tone.Sequence(time => {
        if (!this._muted) this.synth.triggerAttackRelease(notes[idx % notes.length], dur, time);
        idx++;
      }, notes, stepRate as Tone.Unit.Time);
      (this.triggerLoop as Tone.Sequence).start(0);
      Tone.getTransport().start('+0.05');
    }
  }

  private faderToGain(fader: number): number {
    // Logarithmic fader — 80 = unity (0dB), 100 = +3dB, 0 = silence
    if (fader === 0) return 0;
    return Math.pow(fader / 80, 1.5);
  }

  setFader(value: number): void {
    this._fader = value;
    if (!this._muted) {
      this.gainNode.gain.rampTo(this.faderToGain(value), 0.05);
    }
  }

  setPan(value: number): void {
    // value 0-100, centre = 50
    const pan = (value - 50) / 50;
    this.panNode.pan.rampTo(pan, 0.05);
  }

  mute(): void {
    this._muted = true;
    this.gainNode.gain.rampTo(0, 0.02);
  }

  unmute(): void {
    this._muted = false;
    this.gainNode.gain.rampTo(this._fader / 100, 0.02);
  }

  fadeOut(onComplete: () => void): void {
    this.gainNode.gain.rampTo(0, 6);
    setTimeout(() => {
      this.dispose();
      onComplete();
    }, 6200);
  }

  getSnapshot(): Snapshot {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    try { this.triggerLoop?.stop(0); this.triggerLoop?.dispose(); } catch {}
    try { this.synth.triggerRelease(); } catch {}
    setTimeout(() => {
      try { this.synth.dispose(); } catch {}
      this.effects.forEach(e => { try { (e.node as any).dispose(); } catch {} });
      try { this.gainNode.dispose(); } catch {}
      try { this.panNode.dispose(); } catch {}
      try { this.limiter.dispose(); } catch {}
    }, 500);
  }
}
