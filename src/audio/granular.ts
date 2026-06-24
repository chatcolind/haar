import * as Tone from 'tone';

// Renders a short oscillator tone to a buffer the GrainPlayer can transform.
export async function renderToneBuffer(
  waveform: string = 'sine',
  freq: number = 220,
  duration: number = 2,
): Promise<Tone.ToneAudioBuffer> {
  const rendered = await Tone.Offline(({ transport }) => {
    const osc = new Tone.Oscillator({ frequency: freq, type: waveform as any });
    // Gentle fade in/out so the captured buffer has no clicks
    const env = new Tone.AmplitudeEnvelope({ attack: 0.1, decay: 0.1, sustain: 1, release: 0.3 });
    osc.connect(env);
    env.toDestination();
    osc.start(0);
    env.triggerAttack(0);
    env.triggerRelease(duration - 0.3);
    osc.stop(duration);
  }, duration);
  return new Tone.ToneAudioBuffer(rendered.get() as AudioBuffer);
}

export interface GranularConfig {
  grainSize?: number;   // seconds per grain (0.01-0.5)
  overlap?: number;     // grain overlap (0.1-1)
  rate?: number;        // playback rate / stretch (0.1-2) — independent of pitch
  detune?: number;      // pitch in cents (-2400 to +2400)
  reverse?: boolean;
  loop?: boolean;
}

// The transformation core: a GrainPlayer that turns any buffer into an
// evolving texture — freeze, stretch, pitch, reverse, loop.
export class GranularEngine {
  readonly output: Tone.Gain;
  private grain: Tone.GrainPlayer | null = null;
  private buffer: Tone.ToneAudioBuffer | null = null;
  private cfg: Required<GranularConfig>;
  private _playing = false;

  constructor() {
    this.output = new Tone.Gain(1);
    this.cfg = {
      grainSize: 0.2, overlap: 0.5, rate: 1, detune: 0, reverse: false, loop: true,
    };
  }

  setBuffer(buffer: Tone.ToneAudioBuffer): void {
    this.buffer = buffer;
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.buffer) return;
    const wasPlaying = this._playing;
    if (this.grain) { try { this.grain.stop(); this.grain.dispose(); } catch {} }

    this.grain = new Tone.GrainPlayer({
      url: this.buffer,
      grainSize: this.cfg.grainSize,
      overlap: this.cfg.overlap,
      playbackRate: this.cfg.rate,
      detune: this.cfg.detune,
      reverse: this.cfg.reverse,
      loop: this.cfg.loop,
    });
    this.grain.connect(this.output);
    if (wasPlaying) { try { this.grain.start(); } catch {} }
  }

  start(): void {
    if (!this.grain) return;
    try { this.grain.start(); this._playing = true; } catch {}
  }
  stop(): void {
    if (!this.grain) return;
    try { this.grain.stop(); this._playing = false; } catch {}
  }

  // ── Transformation controls (live) ──
  setGrainSize(s: number): void {
    this.cfg.grainSize = s;
    if (this.grain) try { this.grain.grainSize = s; } catch {}
  }
  setOverlap(o: number): void {
    this.cfg.overlap = o;
    if (this.grain) try { this.grain.overlap = o; } catch {}
  }
  setRate(r: number): void {
    // Stretch — slower rate = longer, more frozen, pitch unchanged
    this.cfg.rate = r;
    if (this.grain) try { this.grain.playbackRate = r; } catch {}
  }
  setDetune(cents: number): void {
    // Pitch — independent of rate
    this.cfg.detune = cents;
    if (this.grain) try { this.grain.detune = cents; } catch {}
  }
  setReverse(rev: boolean): void {
    this.cfg.reverse = rev;
    // reverse needs a rebuild to take effect cleanly
    this.rebuild();
  }
  setLoop(loop: boolean): void {
    this.cfg.loop = loop;
    if (this.grain) try { this.grain.loop = loop; } catch {}
  }
  // Freeze = extreme stretch, near-zero rate → one moment sustained forever
  freeze(amount: number): void {
    // amount 0 = normal, 1 = fully frozen
    const r = Math.max(0.02, 1 - amount * 0.98);
    this.setRate(r);
    this.setGrainSize(0.05 + amount * 0.25); // larger grains when frozen = smoother
  }

  dispose(): void {
    try { this.grain?.stop(); this.grain?.dispose(); } catch {}
    try { this.output.dispose(); } catch {}
  }
}
