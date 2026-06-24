import * as Tone from 'tone';

export interface SampleVoiceConfig {
  urls?: Record<string, string>;   // note → sample URL map
  baseUrl?: string;
  filterEnvAmount?: number;
}

// A SampleVoice mirrors the Voice interface but its source is a Tone.Sampler
// playing real recorded audio. Drops into the Patch as a layer.
export class SampleVoice {
  private sampler: Tone.Sampler;
  private filter: Tone.Filter;
  private panner: Tone.Panner;
  private lfoFilter: Tone.LFO;
  private movementGain: Tone.Gain;

  private detuneCents = 0;
  private octaveOffset = 0;
  private movementAmount = 0.5;
  private _disposed = false;
  private _loaded = false;

  constructor(config: SampleVoiceConfig = {}) {
    // Default to the hosted Tone.js casio piano set for development
    const urls = config.urls ?? {
      'A1': 'A1.mp3', 'A2': 'A2.mp3',
    };
    const baseUrl = config.baseUrl ?? 'https://tonejs.github.io/audio/casio/';

    this.filter = new Tone.Filter({ frequency: 4000, type: 'lowpass', rolloff: -24, Q: 1 });
    this.panner = new Tone.Panner(0);

    this.sampler = new Tone.Sampler({
      urls,
      baseUrl,
      attack: 0.4,
      release: 2.5,
      onload: () => { this._loaded = true; },
    });

    // Signal path: sampler → filter → panner → out
    this.sampler.connect(this.filter);
    this.filter.connect(this.panner);

    // Movement — filter breathing
    const r = 0.7 + Math.random() * 0.6;
    this.movementGain = new Tone.Gain(this.movementAmount);
    this.lfoFilter = new Tone.LFO({ frequency: 0.08 * r, min: -800, max: 800, type: 'sine' });
    this.lfoFilter.connect(this.movementGain);
    this.movementGain.connect(this.filter.frequency);
    this.lfoFilter.start();
  }

  connect(dest: Tone.InputNode): this {
    this.panner.connect(dest);
    return this;
  }
  disconnect(): void {
    try { this.panner.disconnect(); } catch {}
  }

  private applyNote(note: string | number): string {
    // Apply octave offset + detune to the requested note
    const freq = typeof note === 'number' ? note : Tone.Frequency(note).toFrequency();
    const octMult = Math.pow(2, this.octaveOffset);
    const detuneMult = Math.pow(2, this.detuneCents / 1200);
    return (freq * octMult * detuneMult).toString() + 'hz';
  }

  triggerAttack(note: string | number, time?: number): void {
    if (this._disposed) return;
    const n = this.applyNote(note);
    try {
      if (time !== undefined) this.sampler.triggerAttack(n, time);
      else this.sampler.triggerAttack(n);
    } catch {}
  }
  triggerRelease(time?: number): void {
    if (this._disposed) return;
    try { this.sampler.releaseAll(time); } catch {}
  }
  triggerAttackRelease(note: string | number, dur: Tone.Unit.Time, time?: number): void {
    if (this._disposed) return;
    const n = this.applyNote(note);
    try {
      if (time !== undefined) this.sampler.triggerAttackRelease(n, dur, time);
      else this.sampler.triggerAttackRelease(n, dur);
    } catch {}
  }

  // Interface parity with Voice (some are no-ops for samples)
  setAmpEnvelope(env: { attack: number; decay: number; sustain: number; release: number }): void {
    try { this.sampler.attack = env.attack; this.sampler.release = env.release; } catch {}
  }
  setWaveform(_t: string): void { /* n/a for samples */ }
  setSubLevel(_l: number): void { /* n/a */ }
  setNoiseLevel(_l: number): void { /* n/a */ }
  setDrive(_a: number): void { /* n/a — drive could be added later */ }
  setFilterEnvAmount(_a: number): void { /* sample filter is static + LFO */ }
  setDetune(cents: number): void { this.detuneCents = cents; }
  setOctaveOffset(oct: number): void { this.octaveOffset = oct; }
  setBaseCutoff(hz: number): void { this.filter.frequency.value = Math.max(80, Math.min(18000, hz)); }
  setPan(pan: number): void { this.panner.pan.rampTo(Math.max(-1, Math.min(1, pan)), 0.05); }
  setVolume(db: number): void { try { this.sampler.volume.value = db; } catch {} }
  setMovement(amount: number): void {
    this.movementAmount = amount;
    this.movementGain.gain.rampTo(amount, 0.2);
  }

  get loaded(): boolean { return this._loaded; }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    try { this.lfoFilter.stop(); } catch {}
    [this.sampler, this.filter, this.panner, this.lfoFilter, this.movementGain]
      .forEach(n => { try { (n as any).dispose(); } catch {} });
  }
}
