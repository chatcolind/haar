// THE TAPE MIXER - the arranger's desk (docs/ARRANGE.md). Built the same way on the live context and
// the offline one, so export prints exactly what you hear. Every block on a track plays into its channel.
//   channel: level -> 3-band EQ (lo shelf / mid peak / hi shelf, +-12 dB) -> pan -> sends (reverb, delay) -> master
//   fx:      reverb (generated IR: size, damping, mix)   delay (tempo-synced: beats, feedback, mix)
//   master:  level -> gentle limiter (a compressor at a high ratio, so a loud mix leaves clean) -> out
export type TrackMix = { level: number; pan: number; eq: { lo: number; mid: number; hi: number }; sends: { rev: number; dly: number }; mute?: boolean };
export type MasterMix = { level: number; limiter: boolean };
export type FxMix = { rev: { size: number; damp: number; mix: number }; dly: { beats: number; feedback: number; mix: number } };
export const TRACK_MIX_DEFAULT: TrackMix = { level: 0, pan: 0, eq: { lo: 0, mid: 0, hi: 0 }, sends: { rev: 0, dly: 0 } };
export const MASTER_MIX_DEFAULT: MasterMix = { level: 0, limiter: true };
export const FX_MIX_DEFAULT: FxMix = { rev: { size: 0.5, damp: 0.4, mix: 1 }, dly: { beats: 0.75, feedback: 0.35, mix: 1 } };

const db = (v: number) => Math.pow(10, v / 20);

type Channel = { input: GainNode; level: GainNode; lo: BiquadFilterNode; mid: BiquadFilterNode; hi: BiquadFilterNode; pan: StereoPannerNode; rev: GainNode; dly: GainNode; mute: GainNode; meter: AnalyserNode };

export class TapeMixer {
  readonly ctx: BaseAudioContext;
  readonly channels: Channel[] = [];
  readonly master: { in: GainNode; level: GainNode; limiter: DynamicsCompressorNode; out: GainNode; meter: AnalyserNode };
  readonly rev: { in: GainNode; conv: ConvolverNode; damp: BiquadFilterNode; wet: GainNode };
  readonly dly: { in: GainNode; delay: DelayNode; fb: GainNode; damp: BiquadFilterNode; wet: GainNode };
  private bpm = 92;
  private limiterOn = true;

  constructor(ctx: BaseAudioContext, nTracks = 16, bpm = 92) {
    this.ctx = ctx; this.bpm = bpm;
    const master = { in: ctx.createGain(), level: ctx.createGain(), limiter: ctx.createDynamicsCompressor(), out: ctx.createGain(), meter: ctx.createAnalyser() };
    master.meter.fftSize = 256; master.meter.smoothingTimeConstant = 0.6;
    master.limiter.threshold.value = -1.5; master.limiter.knee.value = 2; master.limiter.ratio.value = 20; master.limiter.attack.value = 0.002; master.limiter.release.value = 0.12;
    master.in.connect(master.level); master.level.connect(master.limiter); master.limiter.connect(master.out); master.out.connect(ctx.destination); master.out.connect(master.meter);
    this.master = master;
    // reverb: a generated impulse - exponentially decaying noise, stereo, size in seconds
    const rev = { in: ctx.createGain(), conv: ctx.createConvolver(), damp: ctx.createBiquadFilter(), wet: ctx.createGain() };
    rev.damp.type = 'lowpass'; rev.damp.frequency.value = 6000;
    rev.in.connect(rev.conv); rev.conv.connect(rev.damp); rev.damp.connect(rev.wet); rev.wet.connect(master.in);
    this.rev = rev; this.setReverbSize(0.5);
    // delay: tempo-synced, with feedback through a lowpass so repeats soften
    const dly = { in: ctx.createGain(), delay: ctx.createDelay(4), fb: ctx.createGain(), damp: ctx.createBiquadFilter(), wet: ctx.createGain() };
    dly.damp.type = 'lowpass'; dly.damp.frequency.value = 4500;
    dly.in.connect(dly.delay); dly.delay.connect(dly.damp); dly.damp.connect(dly.fb); dly.fb.connect(dly.delay); dly.damp.connect(dly.wet); dly.wet.connect(master.in);
    dly.fb.gain.value = 0.35; dly.delay.delayTime.value = (60 / bpm) * 0.75;
    this.dly = dly;
    for (let i = 0; i < nTracks; i++) {
      const c: Channel = { input: ctx.createGain(), level: ctx.createGain(), lo: ctx.createBiquadFilter(), mid: ctx.createBiquadFilter(), hi: ctx.createBiquadFilter(), pan: ctx.createStereoPanner(), rev: ctx.createGain(), dly: ctx.createGain(), mute: ctx.createGain(), meter: ctx.createAnalyser() };
      c.meter.fftSize = 256; c.meter.smoothingTimeConstant = 0.6;
      c.lo.type = 'lowshelf'; c.lo.frequency.value = 180; c.mid.type = 'peaking'; c.mid.frequency.value = 1400; c.mid.Q.value = 0.9; c.hi.type = 'highshelf'; c.hi.frequency.value = 5200;
      c.rev.gain.value = 0; c.dly.gain.value = 0;
      c.input.connect(c.mute); c.mute.connect(c.level); c.level.connect(c.lo); c.lo.connect(c.mid); c.mid.connect(c.hi); c.hi.connect(c.pan); c.pan.connect(master.in); c.pan.connect(c.meter);
      c.pan.connect(c.rev); c.rev.connect(rev.in); c.pan.connect(c.dly); c.dly.connect(dly.in);
      this.channels.push(c);
    }
  }
  channel(i: number): Channel { return this.channels[Math.max(0, Math.min(this.channels.length - 1, i))]; }
  setTrack(i: number, m: TrackMix): void {
    const c = this.channel(i); const t = this.ctx.currentTime;
    c.level.gain.setTargetAtTime(db(m.level), t, 0.02); c.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, m.pan)), t, 0.02);
    c.lo.gain.setTargetAtTime(m.eq.lo, t, 0.02); c.mid.gain.setTargetAtTime(m.eq.mid, t, 0.02); c.hi.gain.setTargetAtTime(m.eq.hi, t, 0.02);
    c.rev.gain.setTargetAtTime(m.sends.rev, t, 0.02); c.dly.gain.setTargetAtTime(m.sends.dly, t, 0.02);
    c.mute.gain.setTargetAtTime(m.mute ? 0 : 1, t, 0.01);
  }
  setMaster(m: MasterMix): void {
    const t = this.ctx.currentTime; this.master.level.gain.setTargetAtTime(db(m.level), t, 0.02);
    if (m.limiter !== this.limiterOn) { this.limiterOn = m.limiter; this.master.level.disconnect(); if (m.limiter) { this.master.level.connect(this.master.limiter); } else { this.master.level.connect(this.master.out); } }
  }
  setFx(f: FxMix, bpm: number): void {
    this.bpm = bpm; const t = this.ctx.currentTime;
    this.setReverbSize(f.rev.size); this.rev.damp.frequency.setTargetAtTime(1500 + (1 - f.rev.damp) * 9000, t, 0.05); this.rev.wet.gain.setTargetAtTime(f.rev.mix, t, 0.02);
    this.dly.delay.delayTime.setTargetAtTime(Math.min(3.9, (60 / bpm) * f.dly.beats), t, 0.05); this.dly.fb.gain.setTargetAtTime(Math.min(0.92, f.dly.feedback), t, 0.02); this.dly.wet.gain.setTargetAtTime(f.dly.mix, t, 0.02);
  }
  private lastSize = -1;
  private setReverbSize(size: number): void {
    const s = Math.max(0.05, Math.min(1, size)); if (Math.abs(s - this.lastSize) < 0.02) return; this.lastSize = s;
    const sr = this.ctx.sampleRate, secs = 0.4 + s * s * 6.5, n = Math.floor(sr * secs), buf = this.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let seed = 1234 + ch * 77; for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; const r = seed / 4294967296 * 2 - 1; d[i] = r * Math.pow(1 - i / n, 2.2 + s * 1.5); } }
    this.rev.conv.buffer = buf;
  }
  // THE LIGHT: a small spectrum per channel and for the master - the skyline the strips draw
  private _bins = new Uint8Array(128);
  frame(nBands = 24): { bands: number[][]; master: number[] } {
    const read = (an: AnalyserNode) => { an.getByteFrequencyData(this._bins); const out: number[] = []; const per = Math.max(1, Math.floor(this._bins.length * 0.6 / nBands)); for (let b = 0; b < nBands; b++) { let m = 0; for (let k = 0; k < per; k++) { const v = this._bins[b * per + k]; if (v > m) m = v; } out.push(m / 255); } return out; };
    return { bands: this.channels.map(c => read(c.meter)), master: read(this.master.meter) };
  }
  dispose(): void { try { this.master.out.disconnect(); } catch {} }
}
