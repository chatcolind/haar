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
  // Mosaic engine driver
  private mosaicTimer: number | null = null;
  private activity = 0.5;     // 0..1 density
  private grainSpread = 0.5;  // X: 0 = small/tight, 1 = large/diffuse
  private pitchSpread = 0.5;  // Y: 0 = unison, 1 = full octave-stack
  // Engine rack — each independently on/off with its own fader level
  private rack: Record<string, { active: boolean; level: number }> = {
    mosaic:  { active: false, level: 0.8 },
    haze:    { active: false, level: 0.8 },
    tunnel:  { active: false, level: 0.8 },
    strum:   { active: false, level: 0.8 },
    reverse: { active: false, level: 0.8 },
    shimmer: { active: false, level: 0.8 },
    glitch:  { active: false, level: 0.8 },
    warp:    { active: false, level: 0.8 },
    swarm:   { active: false, level: 0.8 },
    swell:   { active: false, level: 0.8 },
    bubbles: { active: false, level: 0.8 },
    chop:    { active: false, level: 0.8 },
  };
  private engineTickAccum: Record<string, number> = {
    mosaic: 0, haze: 0, tunnel: 0, strum: 0,
    reverse: 0, shimmer: 0, glitch: 0, warp: 0, swarm: 0, swell: 0, bubbles: 0, chop: 0,
  };
  // pitch sets revealed progressively by pitchSpread
  private pitchTiers = [
    [1],                    // unison
    [1, 1, 2],              // + octave up
    [1, 2, 1.5],            // + fifth
    [1, 2, 1.5, 0.5],       // + octave down (full bright stack)
  ];

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

  // ── MOSAIC ENGINE ──────────────────────────────────────────────────────
  // Continuously spawns overlapping grains from the live ring buffer at
  // octave-stacked speeds. Activity controls density + number of voices.
  setEngineActive(id: string, on: boolean): void {
    if (this.rack[id]) this.rack[id].active = on;
  }
  setEngineLevel(id: string, level: number): void {
    if (this.rack[id]) this.rack[id].level = Math.max(0, Math.min(1, level));
  }
  anyEngineActive(): boolean {
    return Object.values(this.rack).some(e => e.active);
  }

  // Single master clock (10ms). Each active engine accumulates toward its own
  // interval and fires when due — so all selected engines run simultaneously,
  // each scaled by its own fader level.
  startEngine(): void {
    if (this.mosaicTimer !== null) return;
    const STEP = 10;
    const tick = () => {
      for (const id of Object.keys(this.rack)) {
        const e = this.rack[id];
        if (!e.active) continue;
        this.engineTickAccum[id] -= STEP;
        if (this.engineTickAccum[id] <= 0) {
          let next = 100;
          if (id === 'mosaic') next = this.tickMosaic(e.level);
          else if (id === 'haze') next = this.tickHaze(e.level);
          else if (id === 'tunnel') next = this.tickTunnel(e.level);
          else if (id === 'strum') next = this.tickStrum(e.level);
          else if (id === 'reverse') next = this.tickReverse(e.level);
          else if (id === 'shimmer') next = this.tickShimmer(e.level);
          else if (id === 'glitch') next = this.tickGlitch(e.level);
          else if (id === 'warp') next = this.tickWarp(e.level);
          else if (id === 'swarm') next = this.tickSwarm(e.level);
          else if (id === 'swell') next = this.tickSwell(e.level);
          else if (id === 'bubbles') next = this.tickBubbles(e.level);
          else if (id === 'chop') next = this.tickChop(e.level);
          this.engineTickAccum[id] = next;
        }
      }
      this.mosaicTimer = window.setTimeout(tick, STEP);
    };
    tick();
  }
  stopEngine(): void {
    if (this.mosaicTimer !== null) { clearTimeout(this.mosaicTimer); this.mosaicTimer = null; }
    this.clearGrains();
  }

  // ── MOSAIC: bright, octave-stacked overlapping loops ──
  private tickMosaic(lvl: number = 1): number {
    const voices = 1 + Math.round(this.activity * 3);
    const tier = this.pitchTiers[Math.min(3, Math.floor(this.pitchSpread * 4))];
    const baseLen = 0.04 + this.grainSpread * 0.36;
    const spreadRange = 0.1 + this.grainSpread * 1.9;
    for (let v = 0; v < voices; v++) {
      const rate = tier[Math.floor(Math.random() * tier.length)];
      const lenSamp = Math.floor(this._sr * (baseLen * (0.7 + Math.random() * 0.6)));
      const behind = Math.floor(this._sr * (0.15 + Math.random() * spreadRange));
      const gain = 0.35 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 90 - this.activity * 50;
  }

  // ── HAZE: slow, long, diffuse wash — no octave jumps, dense overlapping ──
  private tickHaze(lvl: number = 1): number {
    const voices = 2 + Math.round(this.activity * 3);
    // Long grains (0.4s..1.2s), slight detune only — smeared, no rhythm
    const baseLen = 0.4 + this.grainSpread * 0.8;
    for (let v = 0; v < voices; v++) {
      // tiny random detune around unison (±pitchSpread semitones), no octaves
      const cents = (Math.random() * 2 - 1) * this.pitchSpread * 100;
      const rate = Math.pow(2, cents / 1200);
      const lenSamp = Math.floor(this._sr * (baseLen * (0.8 + Math.random() * 0.4)));
      const behind = Math.floor(this._sr * (0.3 + Math.random() * 2.5));
      const gain = 0.28 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    // slow, steady replenishment
    return 160 - this.activity * 70;
  }

  // ── TUNNEL: deep sustained drone — long grains, octave-DOWN emphasis ──
  private tickTunnel(lvl: number = 1): number {
    const voices = 2 + Math.round(this.activity * 2);
    const downTiers = [[0.5], [0.5, 1], [0.5, 0.25, 1]];
    const tier = downTiers[Math.min(2, Math.floor(this.pitchSpread * 3))];
    const baseLen = 0.6 + this.grainSpread * 1.0;
    for (let v = 0; v < voices; v++) {
      const rate = tier[Math.floor(Math.random() * tier.length)];
      const lenSamp = Math.floor(this._sr * (baseLen * (0.8 + Math.random() * 0.4)));
      const behind = Math.floor(this._sr * (0.5 + Math.random() * 2.0));
      const gain = 0.3 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 180 - this.activity * 80;
  }

  // ── STRUM: rhythmic, sequenced bursts — tight grains fired in quick runs ──
  private strumStep = 0;
  private tickStrum(lvl: number = 1): number {
    // fire a quick ascending run of short grains
    const tier = this.pitchTiers[Math.min(3, Math.floor(this.pitchSpread * 4))];
    const rate = tier[this.strumStep % tier.length];
    this.strumStep++;
    const lenSamp = Math.floor(this._sr * (0.06 + this.grainSpread * 0.1));
    const behind = Math.floor(this._sr * (0.15 + Math.random() * 0.6));
    this.spawnGrain({ startSamp: behind, rate, lenSamp, gain: 0.4 * lvl, pan: Math.random() * 2 - 1 });
    // rhythmic spacing — faster with activity
    return 70 - this.activity * 40;
  }

  // ── REVERSE: grains played backwards — swelling, blooming, ethereal ──
  private warpPhase = 0;
  private tickReverse(lvl: number = 1): number {
    const voices = 2 + Math.round(this.activity * 2);
    const tier = this.pitchTiers[Math.min(3, Math.floor(this.pitchSpread * 4))];
    const baseLen = 0.2 + this.grainSpread * 0.5;
    for (let v = 0; v < voices; v++) {
      const semi = tier[Math.floor(Math.random() * tier.length)];
      const rate = -Math.abs(semi); // negative = reverse, always
      const lenSamp = Math.floor(this._sr * (baseLen * (0.8 + Math.random() * 0.4)));
      // Start point must be far enough back that playing BACKWARD (toward older
      // audio) for the grain's duration stays inside the safe zone and never
      // hits the write head. Reverse reads from `behind` toward `behind + len`.
      const lenSec = lenSamp / this._sr;
      const behind = Math.floor(this._sr * (0.4 + Math.random() * 0.8));
      const gain = 0.45 / Math.sqrt(voices) * 1.6 * lvl;  // louder — reverse was too quiet
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 130 - this.activity * 60;
  }

  // ── SHIMMER: crystalline upward octave stacking — glassy, cathedral height ──
  private tickShimmer(lvl: number = 1): number {
    const voices = 2 + Math.round(this.activity * 3);
    // upward intervals: octave, octave+fifth, two octaves
    const upTiers = [[2], [2, 3], [2, 3, 4]];
    const tier = upTiers[Math.min(2, Math.floor(this.pitchSpread * 3))];
    const baseLen = 0.15 + this.grainSpread * 0.35;
    for (let v = 0; v < voices; v++) {
      const rate = tier[Math.floor(Math.random() * tier.length)];
      const lenSamp = Math.floor(this._sr * (baseLen * (0.7 + Math.random() * 0.6)));
      const behind = Math.floor(this._sr * (0.2 + Math.random() * 1.5));
      const gain = 0.22 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 80 - this.activity * 40;
  }

  // ── GLITCH: very short grains, stuttering repeated bursts — mechanical ──
  private glitchPos = 0;
  private glitchRepeat = 0;
  private tickGlitch(lvl: number = 1): number {
    // repeat the same position several times (stutter), then jump
    if (this.glitchRepeat <= 0) {
      this.glitchPos = 0.1 + Math.random() * 1.5;
      this.glitchRepeat = 2 + Math.floor(Math.random() * 5);
    }
    this.glitchRepeat--;
    const lenSamp = Math.floor(this._sr * (0.02 + this.grainSpread * 0.04));
    const behind = Math.floor(this._sr * this.glitchPos);
    const rate = Math.random() < this.pitchSpread * 0.5 ? 2 : 1; // occasional octave jump
    this.spawnGrain({ startSamp: behind, rate, lenSamp, gain: 0.4 * lvl, pan: Math.random() * 2 - 1 });
    return 45 - this.activity * 25;
  }

  // ── WARP: grain rate modulated by slow LFO — seasick, tape wow/flutter ──
  private tickWarp(lvl: number = 1): number {
    this.warpPhase += 0.08;
    const voices = 2 + Math.round(this.activity * 2);
    // LFO bends pitch ±depth (depth grows with pitchSpread)
    const depth = 0.06 + this.pitchSpread * 0.25;
    const lfo = Math.sin(this.warpPhase) * depth;
    const baseLen = 0.25 + this.grainSpread * 0.5;
    for (let v = 0; v < voices; v++) {
      const rate = 1 + lfo + (Math.random() * 0.02 - 0.01);
      const lenSamp = Math.floor(this._sr * (baseLen * (0.8 + Math.random() * 0.4)));
      const behind = Math.floor(this._sr * (0.3 + Math.random() * 1.8));
      const gain = 0.3 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 100 - this.activity * 50;
  }

  // ── SWARM: many tiny micro-detuned grains, high density — insect cloud ──
  private tickSwarm(lvl: number = 1): number {
    const voices = 3 + Math.round(this.activity * 5);
    for (let v = 0; v < voices; v++) {
      // tiny grains, micro-detune around unison (no octaves)
      const cents = (Math.random() * 2 - 1) * (10 + this.pitchSpread * 60);
      const rate = Math.pow(2, cents / 1200);
      const lenSamp = Math.floor(this._sr * (0.01 + this.grainSpread * 0.03));
      const behind = Math.floor(this._sr * (0.15 + Math.random() * 1.5));
      const gain = 0.18 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 35 - this.activity * 18;
  }

  // ── SWELL: Hendrix-style reverse bursts — discrete longer reversed grains,
  // each blooming up to a peak, fired in rhythmic spaced hits (not a wash) ──
  private tickSwell(lvl: number = 1): number {
    const tier = this.pitchTiers[Math.min(3, Math.floor(this.pitchSpread * 4))];
    // 1-2 grains per hit (a small reversed chord), longer so the swell is heard
    const voices = 1 + Math.round(this.pitchSpread * 1);
    const baseLen = 0.35 + this.grainSpread * 0.5;  // 0.35s..0.85s — clear swells
    for (let v = 0; v < voices; v++) {
      const semi = tier[Math.floor(Math.random() * tier.length)];
      const rate = -Math.abs(semi);
      const lenSamp = Math.floor(this._sr * (baseLen * (0.9 + Math.random() * 0.2)));
      const behind = Math.floor(this._sr * (0.3 + Math.random() * 0.6));
      const gain = 0.5 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: (Math.random() * 2 - 1) * 0.5 });
    }
    // RHYTHMIC spacing — discrete hits, faster with activity (700ms..180ms apart)
    return 700 - this.activity * 520;
  }

  // ── BUBBLES: sparse short pops with space between — each a different size ──
  private tickBubbles(lvl: number = 1): number {
    // single bubble per tick — the SPACE between is the character
    const lenSamp = Math.floor(this._sr * (0.02 + Math.random() * 0.03));  // 20-50ms pop
    // each bubble a random pitch (size) — wider with pitchSpread
    const cents = (Math.random() * 2 - 1) * (200 + this.pitchSpread * 1000);
    const rate = Math.pow(2, cents / 1200);
    const behind = Math.floor(this._sr * (0.15 + Math.random() * 1.5));
    this.spawnGrain({ startSamp: behind, rate, lenSamp, gain: 0.5 * lvl, pan: (Math.random() * 2 - 1) * 0.9 });
    // SPACE between bubbles — random gaps, fewer gaps with activity
    const base = 500 - this.activity * 350;   // avg 500ms..150ms
    return base * (0.4 + Math.random() * 1.2); // randomised so they're irregular
  }

  // ── CHOP/SWISH: one long ~3s swishing gesture, then ~3s rest, repeating ──
  // A macro cycle: during the SWISH phase, fire a stream of grains whose pan
  // sweeps L→R and amplitude swells then fades (the swish). Then silence (rest).
  private chopPhase: 'swish' | 'rest' = 'rest';
  private chopElapsed = 0;       // ms into current phase
  private chopSwishMs = 3000;
  private chopRestMs = 3000;
  private tickChop(lvl: number = 1): number {
    const STEP = 60; // ms between grain bursts within a swish
    if (this.chopPhase === 'rest') {
      this.chopElapsed += STEP;
      if (this.chopElapsed >= this.chopRestMs) { this.chopPhase = 'swish'; this.chopElapsed = 0; }
      return STEP;
    }
    // SWISH phase — progress 0..1 across the ~3s gesture
    const prog = this.chopElapsed / this.chopSwishMs;
    // amplitude swells up then fades (raised cosine over the whole swish)
    const env = Math.sin(Math.PI * prog);
    // pan sweeps left→right across the gesture
    const pan = -1 + 2 * prog;
    const rate = this.pitchSpread > 0.5 ? 0.5 : 1;
    const lenSamp = Math.floor(this._sr * (0.08 + this.grainSpread * 0.12));
    const behind = Math.floor(this._sr * (0.2 + Math.random() * 1.0));
    this.spawnGrain({ startSamp: behind, rate, lenSamp, gain: 0.6 * env * lvl, pan });
    this.chopElapsed += STEP;
    if (this.chopElapsed >= this.chopSwishMs) { this.chopPhase = 'rest'; this.chopElapsed = 0; }
    return STEP;
  }
  setActivity(a: number): void { this.activity = Math.max(0, Math.min(1, a)); }
  setGrainSpread(x: number): void { this.grainSpread = Math.max(0, Math.min(1, x)); }
  setPitchSpread(y: number): void { this.pitchSpread = Math.max(0, Math.min(1, y)); }

  dispose(): void {
    this.stopMosaic();
    try { this.node?.disconnect(); } catch {}
    [this.nativeIn, this.nativeOut, this.filter, this.reverb, this.reverbWet, this.reverbDry]
      .forEach(n => { try { n.disconnect(); } catch {} });
  }
}
