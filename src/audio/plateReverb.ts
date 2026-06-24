import * as Tone from 'tone';

// An allpass diffuser built from a delay + feedforward/feedback gains.
// This is the standard Schroeder allpass: y = -g*x + delayed(x + g*y)
class Allpass {
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private delay: Tone.Delay;
  private fbGain: Tone.Gain;
  private ffGain: Tone.Gain;
  private inGain: Tone.Gain;

  constructor(delayTime: number, g: number) {
    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.delay  = new Tone.Delay(delayTime, 1);
    this.fbGain = new Tone.Gain(g);
    this.ffGain = new Tone.Gain(-g);
    this.inGain = new Tone.Gain(1);

    // input → inGain → delay
    this.input.connect(this.inGain);
    this.inGain.connect(this.delay);
    // delay → output (the delayed signal)
    this.delay.connect(this.output);
    // delay → feedback → back into inGain
    this.delay.connect(this.fbGain);
    this.fbGain.connect(this.inGain);
    // input → feedforward (-g) → output
    this.input.connect(this.ffGain);
    this.ffGain.connect(this.output);
  }

  connect(dest: Tone.InputNode): void { this.output.connect(dest as any); }
  setDamp(_f: number): void {}
  dispose(): void {
    [this.input, this.output, this.delay, this.fbGain, this.ffGain, this.inGain]
      .forEach(n => { try { n.dispose(); } catch {} });
  }
}

// Dattorro-style plate reverb — dense, lush tail from cheap nodes.
export class PlateReverb extends Tone.ToneAudioNode {
  readonly name = 'PlateReverb';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private _wet: Tone.Gain;
  private _dry: Tone.Gain;
  private _merge: Tone.Gain;
  private _safetyLimiter: Tone.Limiter;
  private _preDelay: Tone.Delay;
  private _inDiff: Allpass[] = [];

  private _delA1: Tone.Delay; private _delA2: Tone.Delay;
  private _delB1: Tone.Delay; private _delB2: Tone.Delay;
  private _apA1: Allpass; private _apA2: Allpass;
  private _apB1: Allpass; private _apB2: Allpass;
  private _dampA: Tone.Filter; private _dampB: Tone.Filter;
  private _fbA: Tone.Gain; private _fbB: Tone.Gain;

  constructor() {
    super();
    this.input  = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this._wet   = new Tone.Gain(0.5);
    this._safetyLimiter = new Tone.Limiter(-3);
    this._dry   = new Tone.Gain(0.5);
    this._merge = new Tone.Gain(0.25);

    // Dry path
    this.input.connect(this._dry);
    this._dry.connect(this.output);

    // Pre-delay
    this._preDelay = new Tone.Delay(0.02, 0.2);
    this.input.connect(this._preDelay);

    // Input diffusion — 4 allpass
    const inDiffTimes = [0.0043, 0.0036, 0.0127, 0.0093];
    let node: any = this._preDelay;
    inDiffTimes.forEach(t => {
      const ap = new Allpass(t, 0.7);
      node.connect(ap.input);
      this._inDiff.push(ap);
      node = ap.output;
    });
    const diffused = node as Tone.Gain;

    // Tank branches
    this._fbA = new Tone.Gain(0.5);
    this._fbB = new Tone.Gain(0.5);

    this._apA1 = new Allpass(0.060, 0.5);
    this._delA1 = new Tone.Delay(0.075, 0.3);
    this._dampA = new Tone.Filter({ frequency: 4000, type: 'lowpass' });
    this._apA2 = new Allpass(0.030, 0.5);
    this._delA2 = new Tone.Delay(0.090, 0.3);

    this._apB1 = new Allpass(0.067, 0.5);
    this._delB1 = new Tone.Delay(0.069, 0.3);
    this._dampB = new Tone.Filter({ frequency: 4000, type: 'lowpass' });
    this._apB2 = new Allpass(0.0089, 0.5);
    this._delB2 = new Tone.Delay(0.080, 0.3);

    // Branch A: diffused + fbB → apA1 → delA1 → dampA → apA2 → delA2 → fbA
    diffused.connect(this._apA1.input);
    this._fbB.connect(this._apA1.input);
    this._apA1.connect(this._delA1);
    this._delA1.connect(this._dampA);
    this._dampA.connect(this._apA2.input);
    this._apA2.connect(this._delA2);
    this._delA2.connect(this._fbA);

    // Branch B: fbA → apB1 → delB1 → dampB → apB2 → delB2 → fbB
    this._fbA.connect(this._apB1.input);
    this._apB1.connect(this._delB1);
    this._delB1.connect(this._dampB);
    this._dampB.connect(this._apB2.input);
    this._apB2.connect(this._delB2);
    this._delB2.connect(this._fbB);

    // Output taps — sum tank delay nodes for density
    this._delA1.connect(this._merge);
    this._delA2.connect(this._merge);
    this._delB1.connect(this._merge);
    this._delB2.connect(this._merge);

    this._merge.connect(this._safetyLimiter);
    this._safetyLimiter.connect(this._wet);
    this._wet.connect(this.output);
  }

  setParams(x: number, y: number): void {
    const decay = 0.3 + x * 0.4; // max 0.7 — safe below self-oscillation
    this._fbA.gain.rampTo(decay, 0.1);
    this._fbB.gain.rampTo(decay, 0.1);
    this._wet.gain.rampTo(y, 0.1);
    this._dry.gain.rampTo(1 - y * 0.7, 0.1);
  }
  setDecay(seconds: number): void {
    const fb = Math.min(0.7, 0.3 + (seconds / 20) * 0.4);
    this._fbA.gain.rampTo(fb, 0.1);
    this._fbB.gain.rampTo(fb, 0.1);
  }
  setPreDelay(seconds: number): void {
    this._preDelay.delayTime.rampTo(Math.min(0.2, seconds), 0.05);
  }
  setWet(amount: number): void {
    this._wet.gain.rampTo(amount, 0.1);
    this._dry.gain.rampTo(1 - amount * 0.7, 0.1);
  }
  setDamping(freq: number): void {
    this._dampA.frequency.rampTo(freq, 0.1);
    this._dampB.frequency.rampTo(freq, 0.1);
  }

  dispose(): this {
    super.dispose();
    this._inDiff.forEach(ap => ap.dispose());
    [this._apA1,this._apA2,this._apB1,this._apB2].forEach(ap => ap.dispose());
    [this.input,this.output,this._wet,this._dry,this._merge,this._preDelay,
     this._delA1,this._delA2,this._delB1,this._delB2,
     this._dampA,this._dampB,this._fbA,this._fbB,this._safetyLimiter]
      .forEach(n => { try { (n as any).dispose(); } catch {} });
    return this;
  }
}
