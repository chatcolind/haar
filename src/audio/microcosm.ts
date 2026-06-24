import * as Tone from 'tone';

// MICROCOSM — pure live processor, built 100% from native Web Audio nodes
// (Tone nodes cannot be connected to a raw AudioWorkletNode — proven — so the
// entire chain is native and lives in one context).
//
// Chain: nativeIn → worklet(ring buffer + grains) → filter → convolver(reverb)
//        → wetGain → out(nativeOut)
// Sources feed nativeIn. Output leaves via nativeOut → ctx.destination (or a tap).

export interface GrainSpec {
  startSamp: number; rate: number; lenSamp: number; gain: number; pan: number;
}

export class Microcosm {
  private ctx: AudioContext;
  readonly nativeIn: GainNode;     // sources connect here (native)
  readonly nativeOut: GainNode;    // processed signal leaves here (native)

  private node: AudioWorkletNode | null = null;
  private filter: BiquadFilterNode;
  private reverb: ConvolverNode;
  private reverbWet: GainNode;
  private reverbDry: GainNode;
  private ready = false;
  private _sr = 44100;

  constructor() {
    // Own dedicated native AudioContext — no Tone wrapping, no bridge seam.
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;
    this._sr = ctx.sampleRate;
    this.nativeIn = ctx.createGain();
    this.nativeOut = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 12000;
    this.filter.Q.value = 1;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.5, 2.5);
    this.reverbWet = ctx.createGain(); this.reverbWet.gain.value = 0.6;
    this.reverbDry = ctx.createGain(); this.reverbDry.gain.value = 0.5;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  async load(): Promise<void> {
    if (this.ready) return;
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch {} }
    await this.ctx.audioWorklet.addModule('/microcosm-processor.js');
    this.node = new AudioWorkletNode(this.ctx, 'microcosm-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    });
    // nativeIn → worklet → filter → [dry + reverb→wet] → nativeOut
    this.nativeIn.connect(this.node);
    this.node.connect(this.filter);
    this.filter.connect(this.reverbDry);
    this.filter.connect(this.reverb);
    this.reverb.connect(this.reverbWet);
    this.reverbDry.connect(this.nativeOut);
    this.reverbWet.connect(this.nativeOut);
    this.ready = true;
    console.log('[micro] native chain built, sr=', this._sr);
  }

  get sampleRate(): number { return this._sr; }
  get context(): AudioContext { return this.ctx; }
  get destination(): AudioDestinationNode { return this.ctx.destination; }
  get isReady(): boolean { return this.ready; }

  // Connect the Microcosm output somewhere (native node, e.g. ctx.destination)
  connectOut(dest: AudioNode): void { this.nativeOut.connect(dest); }

  spawnGrain(spec: GrainSpec): void {
    this.node?.port.postMessage({ type: 'grain', ...spec });
  }
  setFreeze(on: boolean): void { this.node?.port.postMessage({ type: 'freeze', value: on }); }
  clearGrains(): void { this.node?.port.postMessage({ type: 'clearGrains' }); }

  setFilter(hz: number): void {
    try { this.filter.frequency.setTargetAtTime(Math.max(80, Math.min(18000, hz)), this.ctx.currentTime, 0.02); } catch {}
  }
  setSpace(wet: number): void {
    try {
      this.reverbWet.gain.setTargetAtTime(Math.max(0, Math.min(1, wet)), this.ctx.currentTime, 0.05);
    } catch {}
  }

  dispose(): void {
    try { this.node?.disconnect(); } catch {}
    [this.nativeIn, this.nativeOut, this.filter, this.reverb, this.reverbWet, this.reverbDry]
      .forEach(n => { try { n.disconnect(); } catch {} });
  }
}
