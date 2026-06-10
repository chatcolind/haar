import * as Tone from 'tone';

export type EffectName =
  | 'Reverb' | 'Tape' | 'Delay' | 'Chorus' | 'Filter' | 'Pitch'
  | 'Modulate' | 'Grain' | 'Fuzz' | 'Crush' | 'Shimmer' | 'Warp'
  | 'Wobble' | 'Pulse' | 'Space';

function map(v: number, i0: number, i1: number, o0: number, o1: number) {
  return o0 + ((v - i0) / (i1 - i0)) * (o1 - o0);
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Smooth ramp — long enough to prevent any zipper noise
const R = 0.12;

// ── Smooth Reverb: feedback delay network instead of convolver ────────────────
export class SmoothReverb extends Tone.ToneAudioNode {
  name = 'SmoothReverb';
  input: Tone.Gain;
  output: Tone.Gain;

  private _delays: Tone.FeedbackDelay[] = [];
  private _wet: Tone.Gain;
  private _dry: Tone.Gain;
  private _mix: Tone.CrossFade;

  constructor() {
    super();
    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(0);  // Start at zero — fade in after connect

    this._mix = new Tone.CrossFade(0.5);
    this._wet = new Tone.Gain(1);
    this._dry = new Tone.Gain(1);

    // Four delay lines at prime-number offsets for diffusion
    const times = [0.029, 0.037, 0.041, 0.053];
    times.forEach(t => {
      const d = new Tone.FeedbackDelay({ delayTime: t, feedback: 0.55, wet: 1 });
      this._delays.push(d);
      this.input.connect(d);
      d.connect(this._mix.b);
    });

    this.input.connect(this._mix.a);
    this._mix.connect(this.output);

    // Fade in after a brief settle time
    setTimeout(() => {
      this.output.gain.rampTo(1, 0.08);
    }, 60);
  }

  setParams(x: number, y: number) {
    // X = room size (feedback), Y = wet/dry mix
    const feedback = clamp(map(x, 0, 1, 0.3, 0.78), 0.1, 0.85);
    const wet      = clamp(map(y, 0, 1, 0.05, 0.92), 0, 1);
    this._delays.forEach(d => safeRampTo(d.feedback, feedback, R));
    safeRampTo(this._mix.fade, wet, R);
  }

  dispose() {
    this._delays.forEach(d => d.dispose());
    this._mix.dispose();
    this._wet.dispose();
    this._dry.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}

// ── Smooth Tape: chorus + filter instead of waveshaper ───────────────────────
export class SmoothTape extends Tone.ToneAudioNode {
  name = 'SmoothTape';
  input: Tone.Gain;
  output: Tone.Gain;

  private _chorus: Tone.Chorus;
  private _filter: Tone.Filter;
  private _mix: Tone.CrossFade;

  constructor() {
    super();
    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Slow chorus for wow/flutter
    this._chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 5, depth: 0.5, wet: 1 }).start();
    // Gentle low-pass for tape HF rolloff
    this._filter = new Tone.Filter({ frequency: 6000, type: 'lowpass', rolloff: -12 });
    this._mix    = new Tone.CrossFade(0.4);

    this.input.connect(this._mix.a);
    this.input.connect(this._chorus);
    this._chorus.connect(this._filter);
    this._filter.connect(this._mix.b);
    this._mix.connect(this.output);
    this.output.gain.value = 0;
    setTimeout(() => { this.output.gain.rampTo(1, 0.08); }, 60);
  }

  setParams(x: number, y: number) {
    // X = wow/flutter intensity, Y = wet level
    const depth  = clamp(map(x, 0, 1, 0.1, 0.9), 0, 1);
    const freq   = clamp(map(x, 0, 1, 0.3, 2.5), 0.1, 5);
    const cutoff = clamp(map(x, 0, 1, 9000, 1800), 400, 18000);
    const wet    = clamp(map(y, 0, 1, 0.15, 0.92), 0, 1);
    this._chorus.depth = depth;
    this._chorus.frequency.rampTo(freq, R);
    safeRampTo(this._filter.frequency, cutoff, R);
    safeRampTo(this._mix.fade, wet, R);
  }

  dispose() {
    this._chorus.dispose();
    this._filter.dispose();
    this._mix.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}

// ── Smooth Fuzz: overdrive via gain staging + filter ─────────────────────────
export class SmoothFuzz extends Tone.ToneAudioNode {
  name = 'SmoothFuzz';
  input: Tone.Gain;
  output: Tone.Gain;

  private _drive: Tone.Gain;
  private _filter: Tone.Filter;
  private _mix: Tone.CrossFade;

  constructor() {
    super();
    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this._drive  = new Tone.Gain(3);
    this._filter = new Tone.Filter({ frequency: 4000, type: 'lowpass', rolloff: -12 });
    this._mix    = new Tone.CrossFade(0.4);

    this.input.connect(this._mix.a);
    this.input.connect(this._drive);
    this._drive.connect(this._filter);
    this._filter.connect(this._mix.b);
    this._mix.connect(this.output);
    this.output.gain.value = 0;
    setTimeout(() => { this.output.gain.rampTo(1, 0.08); }, 60);
  }

  setParams(x: number, y: number) {
    const drive  = clamp(map(x, 0, 1, 1, 12), 1, 20);
    const cutoff = clamp(map(x, 0, 1, 6000, 1500), 400, 18000);
    const wet    = clamp(map(y, 0, 1, 0.1, 0.9), 0, 1);
    safeRampTo(this._drive.gain, drive, R);
    safeRampTo(this._filter.frequency, cutoff, R);
    safeRampTo(this._mix.fade, wet, R);
  }

  dispose() {
    this._drive.dispose();
    this._filter.dispose();
    this._mix.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}

// ── Smooth Crush: wet-only modulation, bits set only on release ───────────────
export class SmoothCrush extends Tone.ToneAudioNode {
  name = 'SmoothCrush';
  input: Tone.Gain;
  output: Tone.Gain;

  private _crusher: Tone.BitCrusher;
  private _mix: Tone.CrossFade;

  constructor() {
    super();
    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    this._crusher = new Tone.BitCrusher({ bits: 8 });
    this._mix     = new Tone.CrossFade(0.3);

    this.input.connect(this._mix.a);
    this.input.connect(this._crusher);
    this._crusher.connect(this._mix.b);
    this._mix.connect(this.output);
  }

  setParams(x: number, y: number) {
    // Only wet changes during drag — no bit-depth changes
    const wet = clamp(map(y, 0, 1, 0.05, 0.85), 0, 1);
    safeRampTo(this._mix.fade, wet, R);
  }

  setParamsOnRelease(x: number, y: number) {
    this._crusher.bits.value = Math.round(map(x, 0, 1, 14, 3));
  }

  dispose() {
    this._crusher.dispose();
    this._mix.dispose();
    this.input.dispose();
    this.output.dispose();
    return this;
  }
}

// ── Standard effect factory ───────────────────────────────────────────────────
export function createEffectNode(name: EffectName): Tone.ToneAudioNode {
  switch (name) {
    case 'Reverb':   return new SmoothReverb();
    case 'Tape':     return new SmoothTape();
    case 'Fuzz':     return new SmoothFuzz();
    case 'Crush':    return new SmoothCrush();
    case 'Delay':    return new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.4, wet: 0.4 });
    case 'Chorus':   return new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0.5 }).start();
    case 'Filter':   return new Tone.Filter({ frequency: 2000, type: 'lowpass', rolloff: -24, Q: 1 });
    case 'Pitch':    return new Tone.PitchShift({ pitch: 0, wet: 0.5 });
    case 'Modulate': return new Tone.AutoFilter({ frequency: 0.3, depth: 0.6, wet: 0.5 }).start();
    case 'Grain':    return new Tone.Chorus({ frequency: 0.4, delayTime: 8, depth: 0.9, wet: 0.6 }).start();
    case 'Shimmer':  return new Tone.Chebyshev({ order: 20, wet: 0.3 });
    case 'Warp':     return new Tone.FrequencyShifter({ frequency: 0, wet: 0.5 });
    case 'Wobble':   return new Tone.Vibrato({ frequency: 1.5, depth: 0.15, wet: 0.6 });
    case 'Pulse':    return new Tone.Tremolo({ frequency: 2, depth: 0.5, wet: 0.6 }).start();
    case 'Space':    return new Tone.PingPongDelay({ delayTime: '8n', feedback: 0.35, wet: 0.4 });
    default:         return new Tone.Volume(0);
  }
}

// ── Live parameter updates (during drag) ─────────────────────────────────────
export function applyDotLive(name: EffectName, node: Tone.ToneAudioNode, x: number, y: number): void {
  try {
    if (node instanceof SmoothReverb) { node.setParams(x, y); return; }
    if (node instanceof SmoothTape)   { node.setParams(x, y); return; }
    if (node instanceof SmoothFuzz)   { node.setParams(x, y); return; }
    if (node instanceof SmoothCrush)  { node.setParams(x, y); return; }

    switch (name) {
      case 'Delay': {
        const d = node as Tone.FeedbackDelay;
        d.feedback.rampTo(clamp(map(y, 0, 1, 0.1, 0.82), 0, 0.9), R);
        d.wet.rampTo(clamp(map(x, 0, 1, 0.05, 0.8), 0, 1), R);
        break;
      }
      case 'Chorus': {
        const c = node as Tone.Chorus;
        c.frequency.rampTo(clamp(map(x, 0, 1, 0.3, 6), 0.1, 10), R);
        c.wet.rampTo(clamp(map(y, 0, 1, 0.1, 0.9), 0, 1), R);
        break;
      }
      case 'Filter': {
        const f = node as Tone.Filter;
        const freq = Math.pow(10, map(x, 0, 1, Math.log10(120), Math.log10(10000)));
        f.frequency.rampTo(clamp(freq, 80, 18000), R);
        f.Q.rampTo(clamp(map(y, 0, 1, 0.5, 12), 0.1, 18), R);
        break;
      }
      case 'Pitch': {
        const p = node as Tone.PitchShift;
        p.wet.rampTo(clamp(map(y, 0, 1, 0.1, 0.9), 0, 1), R);
        break;
      }
      case 'Modulate': {
        const a = node as Tone.AutoFilter;
        a.frequency.rampTo(clamp(map(x, 0, 1, 0.02, 2.5), 0.01, 5), R * 2);
        a.depth.rampTo(clamp(map(y, 0, 1, 0.1, 0.9), 0, 1), R);
        break;
      }
      case 'Grain': {
        const c = node as Tone.Chorus;
        c.frequency.rampTo(clamp(map(x, 0, 1, 0.1, 3), 0.05, 5), R);
        c.wet.rampTo(clamp(map(y, 0, 1, 0.1, 0.9), 0, 1), R);
        break;
      }
      case 'Shimmer': {
        const c = node as Tone.Chebyshev;
        c.wet.rampTo(clamp(map(y, 0, 1, 0.02, 0.5), 0, 1), R);
        break;
      }
      case 'Warp': {
        const f = node as Tone.FrequencyShifter;
        f.frequency.rampTo(map(x, 0, 1, -250, 250), 0.3);
        f.wet.rampTo(clamp(map(y, 0, 1, 0.1, 0.85), 0, 1), R);
        break;
      }
      case 'Wobble': {
        const v = node as Tone.Vibrato;
        v.frequency.rampTo(clamp(map(x, 0, 1, 0.3, 6), 0.1, 10), R);
        v.depth.rampTo(clamp(map(y, 0, 1, 0.02, 0.4), 0, 1), R);
        break;
      }
      case 'Pulse': {
        const t = node as Tone.Tremolo;
        t.frequency.rampTo(clamp(map(x, 0, 1, 0.3, 8), 0.1, 15), R);
        t.depth.rampTo(clamp(map(y, 0, 1, 0.1, 0.9), 0, 1), R);
        break;
      }
      case 'Space': {
        const p = node as Tone.PingPongDelay;
        p.feedback.rampTo(clamp(map(y, 0, 1, 0.1, 0.75), 0, 0.9), R);
        p.wet.rampTo(clamp(map(x, 0, 1, 0.05, 0.8), 0, 1), R);
        break;
      }
    }
  } catch { /* ignore */ }
}

// ── Release updates (non-rampable parameters) ─────────────────────────────────
export function applyDotRelease(name: EffectName, node: Tone.ToneAudioNode, x: number, y: number): void {
  try {
    if (node instanceof SmoothCrush) { node.setParamsOnRelease(x, y); return; }
    if (name === 'Pitch') {
      const p = node as Tone.PitchShift;
      p.pitch = Math.round(map(x, 0, 1, -12, 12));
    }
    if (name === 'Shimmer') {
      const c = node as Tone.Chebyshev;
      c.order = Math.round(map(x, 0, 1, 2, 80));
    }
  } catch { /* ignore */ }
}

export function applyDotToEffect(name: EffectName, node: Tone.ToneAudioNode, x: number, y: number, _level: number): void {
  applyDotLive(name, node, x, y);
}

// Helper — cancel any scheduled ramp then start a clean new one
export function safeRampTo(param: Tone.Param<any> | Tone.Signal<any>, value: number, time: number): void {
  try {
    const now = Tone.context.currentTime;
    (param as any).cancelAndHoldAtTime(now);
    param.linearRampToValueAtTime(value, now + time);
  } catch {
    try { param.rampTo(value, time); } catch {}
  }
}
