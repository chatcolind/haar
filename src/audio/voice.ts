import * as Tone from 'tone';

export interface VoiceConfig {
  waveform?: string;       // osc1 waveform
  subLevel?: number;       // 0-1, osc2 (sub) blend
  noiseLevel?: number;     // 0-1, noise layer blend
  drive?: number;          // saturation amount
  filterEnvAmount?: number; // 0-1 how far filter opens
}

// A complete layered synthesis voice:
// OSC1 (main) + OSC2 (sub, -1 oct) + NOISE → mix → drive → filter → ampVCA → out
// Separate filter envelope and amp envelope.
export class Voice {
  // Layers
  private osc1: Tone.OmniOscillator<any>;
  private osc2: Tone.OmniOscillator<any>;  // sub oscillator
  private noise: Tone.Noise;
  private osc1Gain: Tone.Gain;
  private osc2Gain: Tone.Gain;
  private noiseGain: Tone.Gain;

  // Signal path
  private mixBus: Tone.Gain;
  private drive: Tone.Distortion;
  private filter: Tone.Filter;

  // Envelopes
  private ampEnv: Tone.AmplitudeEnvelope;
  private filterEnv: Tone.FrequencyEnvelope;

  // State
  private waveform: string = 'triangle';
  private subLevelVal = 0.45;
  private noiseLevelVal = 0;
  private filterEnvAmountVal = 0.6;
  private baseFreq = 220;
  private detuneCents = 0;
  private _disposed = false;

  constructor(config: VoiceConfig = {}) {
    this.waveform        = config.waveform ?? 'triangle';
    this.subLevelVal     = config.subLevel ?? 0.45;
    this.noiseLevelVal   = config.noiseLevel ?? 0;
    this.filterEnvAmountVal = config.filterEnvAmount ?? 0.6;

    this.ampEnv = new Tone.AmplitudeEnvelope({
      attack: 0.5, decay: 0.3, sustain: 0.8, release: 3,
    });

    // ── Filter with its own envelope ──
    this.filter = new Tone.Filter({ frequency: 800, type: 'lowpass', rolloff: -24, Q: 1 });
    this.filterEnv = new Tone.FrequencyEnvelope({
      attack: 0.8, decay: 0.5, sustain: 0.6, release: 2.5,
      baseFrequency: 300,
      octaves: 4,
    });
    this.filterEnv.connect(this.filter.frequency);

    // ── Drive / saturation stage (pre-filter) ──
    this.drive = new Tone.Distortion({ distortion: config.drive ?? 0.15, wet: 0.5 });

    // ── Mix bus ──
    this.mixBus = new Tone.Gain(1);

    // ── Layer gains ──
    this.osc1Gain  = new Tone.Gain(1);
    this.osc2Gain  = new Tone.Gain(this.subLevelVal);
    this.noiseGain = new Tone.Gain(this.noiseLevelVal);

    // ── Oscillators ──
    this.osc1 = new Tone.OmniOscillator({ frequency: this.baseFreq, type: this.waveform as any });
    this.osc2 = new Tone.OmniOscillator({ frequency: this.baseFreq / 2, type: 'sine' }); // sub -1 oct
    this.noise = new Tone.Noise({ type: 'pink' });

    // ── Wire the path ──
    this.osc1.connect(this.osc1Gain);
    this.osc2.connect(this.osc2Gain);
    this.noise.connect(this.noiseGain);
    this.osc1Gain.connect(this.mixBus);
    this.osc2Gain.connect(this.mixBus);
    this.noiseGain.connect(this.mixBus);
    this.mixBus.connect(this.drive);
    this.drive.connect(this.filter);
    // AmplitudeEnvelope IS the VCA — audio flows through it
    this.filter.connect(this.ampEnv);

    // Start oscillators immediately — they run continuously, VCA controls audibility
    this.osc1.start();
    this.osc2.start();
    this.noise.start();
  }

  // Connect voice output to a destination
  connect(dest: Tone.InputNode): this {
    this.ampEnv.connect(dest);
    return this;
  }

  disconnect(): void {
    try { this.ampEnv.disconnect(); } catch {}
  }

  private setFrequency(note: string | number): void {
    const freq = typeof note === 'number' ? note : Tone.Frequency(note).toFrequency();
    this.baseFreq = freq;
    const detuneMult = Math.pow(2, this.detuneCents / 1200);
    this.osc1.frequency.value = freq * detuneMult;
    this.osc2.frequency.value = (freq / 2) * detuneMult; // sub stays -1 oct
    // Filter base tracks the note
    this.filterEnv.baseFrequency = Math.max(120, freq * 0.8);
  }

  triggerAttack(note: string | number, time?: number): void {
    if (this._disposed) return;
    this.setFrequency(note);
    if (time !== undefined) {
      this.ampEnv.triggerAttack(time);
      this.filterEnv.triggerAttack(time);
    } else {
      this.ampEnv.triggerAttack();
      this.filterEnv.triggerAttack();
    }
  }

  triggerRelease(time?: number): void {
    if (this._disposed) return;
    if (time !== undefined) {
      this.ampEnv.triggerRelease(time);
      this.filterEnv.triggerRelease(time);
    } else {
      this.ampEnv.triggerRelease();
      this.filterEnv.triggerRelease();
    }
  }

  triggerAttackRelease(note: string | number, dur: Tone.Unit.Time, time?: number): void {
    if (this._disposed) return;
    this.setFrequency(note);
    if (time !== undefined) {
      this.ampEnv.triggerAttackRelease(dur, time);
      this.filterEnv.triggerAttackRelease(dur, time);
    } else {
      this.ampEnv.triggerAttackRelease(dur);
      this.filterEnv.triggerAttackRelease(dur);
    }
  }

  // Shape dial drives the amp envelope
  setAmpEnvelope(env: { attack: number; decay: number; sustain: number; release: number }): void {
    this.ampEnv.attack  = env.attack;
    this.ampEnv.decay   = env.decay;
    this.ampEnv.sustain = env.sustain;
    this.ampEnv.release = env.release;
    // Filter envelope follows amp timing loosely for cohesion
    this.filterEnv.attack  = Math.max(0.05, env.attack * 1.2);
    this.filterEnv.decay   = Math.max(0.1, env.decay * 1.5);
    this.filterEnv.sustain = 0.4 + env.sustain * 0.3;
    this.filterEnv.release = Math.max(0.3, env.release * 0.9);
  }

  setWaveform(type: string): void {
    this.waveform = type;
    try { this.osc1.type = type as any; } catch {}
  }

  setLayerMix(osc1: number, sub: number, noise: number): void {
    this.osc1Gain.gain.rampTo(osc1, 0.05);
    this.osc2Gain.gain.rampTo(sub, 0.05);
    this.noiseGain.gain.rampTo(noise, 0.05);
    this.subLevelVal = sub;
    this.noiseLevelVal = noise;
  }

  setSubLevel(level: number): void {
    this.subLevelVal = level;
    this.osc2Gain.gain.rampTo(level, 0.05);
  }

  setNoiseLevel(level: number): void {
    this.noiseLevelVal = level;
    this.noiseGain.gain.rampTo(level, 0.05);
  }

  setDrive(amount: number): void {
    this.drive.distortion = amount;
  }

  setFilterEnvAmount(amount: number): void {
    this.filterEnvAmountVal = amount;
    this.filterEnv.octaves = 1 + amount * 5; // 1-6 octaves of sweep
  }

  setDetune(cents: number): void {
    this.detuneCents = cents;
    const detuneMult = Math.pow(2, cents / 1200);
    this.osc1.frequency.value = this.baseFreq * detuneMult;
    this.osc2.frequency.value = (this.baseFreq / 2) * detuneMult;
  }

  setVolume(db: number): void {
    // Convert dB to linear for the mix bus
    this.mixBus.gain.rampTo(Tone.dbToGain(db), 0.05);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    try { this.osc1.stop(); this.osc1.dispose(); } catch {}
    try { this.osc2.stop(); this.osc2.dispose(); } catch {}
    try { this.noise.stop(); this.noise.dispose(); } catch {}
    [this.osc1Gain, this.osc2Gain, this.noiseGain, this.mixBus,
     this.drive, this.filter, this.ampEnv, this.filterEnv]
      .forEach(n => { try { (n as any).dispose(); } catch {} });
  }
}
