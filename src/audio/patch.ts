import * as Tone from 'tone';
import { Voice } from './voice';

export interface LayerConfig {
  enabled: boolean;
  waveform: string;
  octave: number;      // -2 to +2 offset
  detune: number;      // cents
  level: number;       // 0-1
  cutoff: number;      // Hz base filter
  pan: number;         // -1 to +1
}

export function defaultLayer(): LayerConfig {
  return { enabled: false, waveform: 'triangle', octave: 0, detune: 0, level: 0.7, cutoff: 2000, pan: 0 };
}

const MAX_LAYERS = 4;

// A Patch = up to 4 layers, each a full Voice, all triggered together as one sound.
export class Patch {
  private voices: Voice[] = [];
  private layerGains: Tone.Gain[] = [];
  private configs: LayerConfig[] = [];
  private output: Tone.Gain;

  constructor(output: Tone.Gain) {
    this.output = output;

    for (let i = 0; i < MAX_LAYERS; i++) {
      const cfg = defaultLayer();
      // Layer 0 on by default so there's always sound
      if (i === 0) cfg.enabled = true;
      this.configs.push(cfg);

      const gain = new Tone.Gain(cfg.enabled ? cfg.level : 0);
      this.layerGains.push(gain);

      const voice = new Voice({
        waveform: cfg.waveform,
        subLevel: 0.45,
        noiseLevel: 0,
        drive: 0.15,
        filterEnvAmount: 0.6,
      });
      voice.connect(gain);
      gain.connect(output);
      this.voices.push(voice);

      this.applyLayer(i);
    }
  }

  private applyLayer(i: number): void {
    const cfg = this.configs[i];
    const v = this.voices[i];
    if (!v) return;
    v.setWaveform(cfg.waveform);
    v.setOctaveOffset(cfg.octave);
    v.setDetune(cfg.detune);
    v.setBaseCutoff(cfg.cutoff);
    v.setPan(cfg.pan);
    this.layerGains[i].gain.rampTo(cfg.enabled ? cfg.level : 0, 0.05);
  }

  setLayer(i: number, partial: Partial<LayerConfig>): void {
    if (i < 0 || i >= MAX_LAYERS) return;
    this.configs[i] = { ...this.configs[i], ...partial };
    this.applyLayer(i);
  }

  getLayer(i: number): LayerConfig {
    return { ...this.configs[i] };
  }

  getLayers(): LayerConfig[] {
    return this.configs.map(c => ({ ...c }));
  }

  // ── Triggers — fire all enabled layers together ──
  triggerAttack(note: string, time?: number): void {
    this.voices.forEach((v, i) => {
      if (this.configs[i].enabled) { try { v.triggerAttack(note, time); } catch {} }
    });
  }
  triggerRelease(time?: number): void {
    this.voices.forEach(v => { try { v.triggerRelease(time); } catch {} });
  }
  triggerAttackRelease(note: string, dur: string, time?: number): void {
    this.voices.forEach((v, i) => {
      if (this.configs[i].enabled) { try { v.triggerAttackRelease(note, dur, time); } catch {} }
    });
  }

  setAmpEnvelope(env: { attack: number; decay: number; sustain: number; release: number }): void {
    this.voices.forEach(v => v.setAmpEnvelope(env));
  }

  setFilterEnvAmount(amount: number): void {
    this.voices.forEach(v => v.setFilterEnvAmount(amount));
  }

  setDrive(amount: number): void {
    this.voices.forEach(v => v.setDrive(amount));
  }

  // Load a full set of layer configs (for presets)
  loadLayers(layers: LayerConfig[]): void {
    for (let i = 0; i < MAX_LAYERS; i++) {
      this.configs[i] = layers[i] ? { ...layers[i] } : defaultLayer();
      this.applyLayer(i);
    }
  }

  dispose(): void {
    this.voices.forEach(v => { try { v.dispose(); } catch {} });
    this.layerGains.forEach(g => { try { g.dispose(); } catch {} });
    this.voices = [];
    this.layerGains = [];
  }
}

export { MAX_LAYERS };
