import * as Tone from 'tone';
import { renderToneBuffer } from './granular';

// GrainScatter — the Microcosm core.
// Takes a one-shot buffer, fires many short grain voices from it at randomised
// times, positions, pans and pitches → ping-pong delay → shimmer reverb.
// One pulse blooms into a 3D cloud that scatters and decays.
export class GrainScatter {
  readonly output: Tone.Gain;

  private buffer: Tone.ToneAudioBuffer | null = null;
  private pingpong: Tone.PingPongDelay;
  private reverb: Tone.Freeverb;
  private shimmer: Tone.PitchShift;   // octave-up shimmer feed
  private preGain: Tone.Gain;          // grains land here, then split to fx
  private _headroom: Tone.Gain;
  private activePlayers: Tone.Player[] = [];
  private holdLoop: Tone.Loop | null = null;
  private holding = false;

  // scatter params
  private density = 14;        // grains per pulse
  private spread = 1.4;        // seconds the cloud spreads over
  private pitches = [0, 12, 7, 19];  // semitone offsets (root, octave, fifth, octave+fifth)

  constructor() {
    this.output = new Tone.Gain(1);
    this.preGain = new Tone.Gain(0.5);

    // Shimmer: an octave-up pitch shift, fed back lightly for the cathedral bloom
    this.shimmer = new Tone.PitchShift({ pitch: 12, wet: 0.5, windowSize: 0.1 });

    // Ping-pong delay — the "pinging everywhere"
    this.pingpong = new Tone.PingPongDelay({ delayTime: 0.3, feedback: 0.55, wet: 0.6 });

    // Big reverb — places the cloud in a huge space
    this.reverb = new Tone.Freeverb({ roomSize: 0.9, dampening: 2500, wet: 0.7 });
    this._headroom = new Tone.Gain(0.5); // prevent reverb overload

    // Chain: preGain → shimmer → pingpong → reverb → output
    this.preGain.connect(this.shimmer);
    this.shimmer.connect(this.pingpong);
    this.pingpong.connect(this._headroom);
    this._headroom.connect(this.reverb);
    this.reverb.connect(this.output);
  }

  setBuffer(buffer: Tone.ToneAudioBuffer): void {
    this.buffer = buffer;
  }

  // Fire one pulse — scatter a cloud of grains from the source
  pulse(): void {
    if (!this.buffer) return;
    const now = Tone.now();
    const dur = this.buffer.duration;

    for (let i = 0; i < this.density; i++) {
      // Random time within the spread window
      const t = now + Math.random() * this.spread;
      // Random position in the source buffer
      const pos = Math.random() * Math.max(0.01, dur - 0.2);
      // Grain length
      const glen = 0.15 + Math.random() * 0.35;
      // Random pan — the 3D spray
      const pan = (Math.random() * 2 - 1) * 0.9;
      // Pitch from the shimmer set + tiny detune
      const semi = this.pitches[Math.floor(Math.random() * this.pitches.length)]
                   + (Math.random() * 0.3 - 0.15);
      const rate = Math.pow(2, semi / 12);

      try {
        const player = new Tone.Player(this.buffer);
        const panner = new Tone.Panner(pan);
        const vGain = new Tone.Gain(0.0);
        player.playbackRate = rate;
        player.fadeIn = 0.05;
        player.fadeOut = 0.1;
        player.connect(panner);
        panner.connect(vGain);
        vGain.connect(this.preGain);

        // Grain amplitude — quieter for higher density
        const amp = 0.18 / Math.sqrt(this.density) * 4;
        vGain.gain.setValueAtTime(0, t);
        vGain.gain.linearRampToValueAtTime(amp, t + 0.05);
        vGain.gain.linearRampToValueAtTime(0, t + glen);

        player.start(t, pos, glen + 0.1);

        // Cleanup after the grain finishes
        const cleanupMs = (t - now + glen + 0.3) * 1000;
        setTimeout(() => {
          try { player.dispose(); panner.dispose(); vGain.dispose(); } catch {}
        }, cleanupMs + 200);
      } catch {}
    }
  }

  // HOLD — continuous auto-scatter; the texture sustains forever until stopped.
  // Re-fires a few grains on a repeating interval so the cloud never decays.
  startHold(): void {
    if (this.holding || !this.buffer) return;
    this.holding = true;
    // Fire an initial bloom immediately
    this.pulse();
    // Then keep replenishing — interval short enough to overlap into a continuous wash
    this.holdLoop = new Tone.Loop(() => {
      this.scatterBurst(Math.max(2, Math.round(this.density / 3)));
    }, 0.35);
    this.holdLoop.start(0);
    if (Tone.getTransport().state !== 'started') Tone.getTransport().start('+0.05');
  }

  stopHold(): void {
    this.holding = false;
    try { this.holdLoop?.stop(0); this.holdLoop?.dispose(); } catch {}
    this.holdLoop = null;
    // grains already scheduled tail off naturally through the reverb
  }

  get isHolding(): boolean { return this.holding; }

  // Fire a small burst of grains (used by hold loop) — same scatter logic, fewer grains
  private scatterBurst(count: number): void {
    if (!this.buffer) return;
    const now = Tone.now();
    const dur = this.buffer.duration;
    for (let i = 0; i < count; i++) {
      const t = now + Math.random() * 0.4;
      const pos = Math.random() * Math.max(0.01, dur - 0.2);
      const glen = 0.15 + Math.random() * 0.35;
      const pan = (Math.random() * 2 - 1) * 0.9;
      const semi = this.pitches[Math.floor(Math.random() * this.pitches.length)] + (Math.random() * 0.3 - 0.15);
      const rate = Math.pow(2, semi / 12);
      try {
        const player = new Tone.Player(this.buffer);
        const panner = new Tone.Panner(pan);
        const vGain = new Tone.Gain(0);
        player.playbackRate = rate;
        player.fadeIn = 0.05; player.fadeOut = 0.1;
        player.connect(panner); panner.connect(vGain); vGain.connect(this.preGain);
        const amp = 0.18 / Math.sqrt(this.density) * 4;
        vGain.gain.setValueAtTime(0, t);
        vGain.gain.linearRampToValueAtTime(amp, t + 0.05);
        vGain.gain.linearRampToValueAtTime(0, t + glen);
        player.start(t, pos, glen + 0.1);
        const cleanupMs = (t - now + glen + 0.3) * 1000;
        setTimeout(() => { try { player.dispose(); panner.dispose(); vGain.dispose(); } catch {} }, cleanupMs + 200);
      } catch {}
    }
  }

  setDensity(n: number): void { this.density = Math.max(2, Math.min(40, Math.round(n))); }
  setSpread(s: number): void { this.spread = Math.max(0.1, Math.min(5, s)); }
  setShimmer(amount: number): void { try { this.shimmer.wet.rampTo(amount, 0.1); } catch {} }
  setPingPong(feedback: number, wet: number): void {
    try { this.pingpong.feedback.rampTo(Math.min(0.9, feedback), 0.1); this.pingpong.wet.rampTo(wet, 0.1); } catch {}
  }
  setReverb(wet: number): void { try { this.reverb.wet.rampTo(wet, 0.1); } catch {} }

  dispose(): void {
    this.stopHold();
    this.activePlayers.forEach(p => { try { p.dispose(); } catch {} });
    [this.output, this.preGain, this._headroom, this.shimmer, this.pingpong, this.reverb]
      .forEach(n => { try { (n as any).dispose(); } catch {} });
  }
}

// Convenience — render a one-shot tone for scattering
export async function renderPulseSource(waveform: string, freq: number): Promise<Tone.ToneAudioBuffer> {
  // Short plucked one-shot — a transient, ideal for distinct scattering (not a continuous tone)
  return renderToneBuffer(waveform, freq, 0.8, true);
}
