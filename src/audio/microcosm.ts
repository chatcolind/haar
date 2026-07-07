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
  private limiter: DynamicsCompressorNode;  // catches peaks — never clip

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
  private density = 0.5;      // TEST: 0 = sparse single notes, 1 = dense cluster
  // Engine rack — each independently on/off with its own fader level
  // rack now keyed by ORB ID (still =engine-type for the 12 defaults until page.tsx mints ids).
  // Each entry carries engineType = which recipe to run. Dispatch reads engineType, not the key.
  private rack: Record<string, { engineType: string; active: boolean; level: number }> = {
    mosaic:  { engineType: 'mosaic',  active: false, level: 0.8 },
    haze:    { engineType: 'haze',    active: false, level: 0.8 },
    tunnel:  { engineType: 'tunnel',  active: false, level: 0.8 },
    strum:   { engineType: 'strum',   active: false, level: 0.8 },
    reverse: { engineType: 'reverse', active: false, level: 0.8 },
    shimmer: { engineType: 'shimmer', active: false, level: 0.8 },
    glitch:  { engineType: 'glitch',  active: false, level: 0.8 },
    warp:    { engineType: 'warp',    active: false, level: 0.8 },
    swarm:   { engineType: 'swarm',   active: false, level: 0.8 },
    swell:   { engineType: 'swell',   active: false, level: 0.8 },
    bubbles: { engineType: 'bubbles', active: false, level: 0.8 },
    chop:    { engineType: 'chop',    active: false, level: 0.8 },
  };
  private engineTickAccum: Record<string, number> = {
    mosaic: 0, haze: 0, tunnel: 0, strum: 0,
    reverse: 0, shimmer: 0, glitch: 0, warp: 0, swarm: 0, swell: 0, bubbles: 0, chop: 0,
  };
  // per-orb density (0..1). Each engine's tick reads this[_currentEngine] and
  // interprets it in its own character (voices/overlap + fire-rate, curved).
  private engineDensity: Record<string, number> = {
    mosaic: 0.5, haze: 0.5, tunnel: 0.5, strum: 0.5,
    reverse: 0.5, shimmer: 0.5, glitch: 0.5, warp: 0.5, swarm: 0.5, swell: 0.5, bubbles: 0.5, chop: 0.5,
  };
  // pitch sets revealed progressively by pitchSpread
  private pitchTiers = [
    [1],                    // unison
    [1, 1, 2],              // + octave up
    [1, 2, 1.5],            // + fifth
    [1, 2, 1.5, 0.5],       // + octave down (full bright stack)
  ];

  // ===== FLAVOUR SYSTEM ==========================================================
  // Constant consonant bed (octaves + fifths) — always present, the "open" sound.
  private consonant = [1, 2, 1.5, 0.5];   // root, 8ve up, 5th, 8ve down (dropped 8ve+5th: aliased high notes)
  // Flavour palettes: each is a set of COLOUR-tone ratios layered over the bed.
  // 'open' has none (pure). Others are just-intonation colour tones that define them.
  static FLAVOUR_PALETTES: Record<string, number[]> = {
    open:      [],
    bhairav:   [16/15, 8/5],          // India: flat-2 (komal Re), flat-6 (komal Dha)
    hijaz:     [16/15, 5/4 * 16/15],  // Arabic: flat-2 + raised-3 (augmented 2nd gap)
    hirajoshi: [16/15, 8/5],          // Japan koto: flat-2, flat-6 (pentatonic colour)
    dorian:    [6/5, 16/9],           // modal: flat-3, flat-7 (gentle)
  };
  // The globally ARMED palette (chosen by the Flavour chip). Default open.
  private armedPalette: string = 'open';
  setArmedPalette(name: string): void {
    if (Microcosm.FLAVOUR_PALETTES[name]) this.armedPalette = name;
  }
  // per-orb palette (rack-by-orb-id). pickRate reads this[_currentEngine].
  private enginePalette: Record<string, string> = {};
  setOrbPalette(id: string, name: string): void {
    if (Microcosm.FLAVOUR_PALETTES[name]) this.enginePalette[id] = name;
  }
  // Per-engine flavour AMOUNT (0..1). DEFAULT 0 = pure octaves/fifths for every orb.
  private engineAmount: Record<string, number> = {};
  setEngineAmount(id: string, amt: number): void {
    this.engineAmount[id] = Math.max(0, Math.min(1, amt));
  }
  // Pick one playback rate for a grain of engine `id`:
  // mostly the consonant bed; with probability = THIS engine's amount, a colour
  // tone from the armed palette. amount 0 or palette 'open' => always consonant.
  private pickRate(id: string): number {
    const amt = this.engineAmount[id] ?? 0;
    const palName = this.enginePalette[id] ?? this.armedPalette;
    const pal = Microcosm.FLAVOUR_PALETTES[palName] ?? [];
    if (amt > 0 && pal.length && Math.random() < amt) {
      return pal[Math.floor(Math.random() * pal.length)];
    }
    return this.consonant[Math.floor(Math.random() * this.consonant.length)];
  }
  private get tiers() { return this.pitchTiers; } // engines still using tiers
  // ===== END FLAVOUR SYSTEM ======================================================


  constructor() {
    // Own dedicated native AudioContext — no Tone wrapping, no bridge seam.
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;
    this._sr = ctx.sampleRate;
    this.nativeIn = ctx.createGain();
    this.nativeOut = ctx.createGain();
    // limiter on the output bus: fast, hard, threshold just below 0dB — prevents clipping
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;
    // trim the bus a touch so we hit the limiter gently, not slam it
    this.nativeOut.gain.value = 0.8;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 8000;  // tame high-note aliasing
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
    await this.ctx.audioWorklet.addModule('/microcosm-processor.js?v=' + Date.now());
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

  // ── TAPE character (native nodes in the Microcosm's own context) ──
  private tapeWobbleDelay: DelayNode | null = null;   // modulated delay = wow/flutter
  private tapeWobbleLFO: OscillatorNode | null = null;
  private tapeWobbleDepth: GainNode | null = null;
  private tapeSat: WaveShaperNode | null = null;      // saturation
  private tapeRolloff: BiquadFilterNode | null = null; // HF loss
  private tapeHissGain: GainNode | null = null;       // hiss level
  private tapeBuilt = false;
  private buildTape(): void {
    if (this.tapeBuilt) return;
    const c = this.ctx;
    this.tapeWobbleDelay = c.createDelay(0.05);
    this.tapeWobbleDelay.delayTime.value = 0.004;   // base delay ~4ms
    this.tapeWobbleLFO = c.createOscillator();
    this.tapeWobbleLFO.frequency.value = 0.7;
    this.tapeWobbleDepth = c.createGain();
    this.tapeWobbleDepth.gain.value = 0;            // 0 = no wobble
    this.tapeWobbleLFO.connect(this.tapeWobbleDepth);
    this.tapeWobbleDepth.connect(this.tapeWobbleDelay.delayTime);
    this.tapeWobbleLFO.start();
    this.tapeSat = c.createWaveShaper();
    this.tapeSat.curve = this._satCurve(0);         // identity at 0
    this.tapeRolloff = c.createBiquadFilter();
    this.tapeRolloff.type = 'lowpass';
    this.tapeRolloff.frequency.value = 20000;
    // hiss: looping noise buffer
    const hb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const hd = hb.getChannelData(0);
    for (let i = 0; i < hd.length; i++) hd[i] = (Math.random() * 2 - 1) * 0.5;
    const hn = c.createBufferSource(); hn.buffer = hb; hn.loop = true;
    this.tapeHissGain = c.createGain(); this.tapeHissGain.gain.value = 0;
    hn.connect(this.tapeHissGain);
    this.tapeHissGain.connect(this.tapeRolloff);
    // makeup gain compensates for saturation boost so level stays constant
    this.tapeMakeup = c.createGain(); this.tapeMakeup.gain.value = 1;
    // chain: wobbleDelay -> sat -> rolloff -> makeup (makeup is the tape output)
    this.tapeWobbleDelay.connect(this.tapeSat);
    this.tapeSat.connect(this.tapeRolloff);
    this.tapeRolloff.connect(this.tapeMakeup);
    hn.start();
    this.tapeBuilt = true;
  }
  private tapeMakeup: GainNode | null = null;
  private _satCurve(amt: number): Float32Array {
    const n = 1024, curve = new Float32Array(n), k = amt * 40;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = k > 0 ? ((1 + k) * x) / (1 + k * Math.abs(x)) : x; }
    return curve;
  }
  // four independent tape ingredients (0..1) scaled by a master (0..1)
  private tape = { hiss: 0, sat: 0, wow: 0, roll: 0 };
  private tapeMaster = 1;
  setTapeBalance(k: 'hiss'|'sat'|'wow'|'roll', v: number): void { this.buildTape(); this.tape[k] = Math.max(0, Math.min(1, v)); this._applyTape(); }
  setTape(a: number): void { this.buildTape(); this.tapeMaster = Math.max(0, Math.min(1, a)); this._applyTape(); }   // master
  private tapeMuted = false;
  setTapeMute(on: boolean): void { this.buildTape(); this.tapeMuted = on; this._applyTape(); }
  private _applyTape(): void {
    const m = this.tapeMuted ? 0 : this.tapeMaster;
    const t = { hiss: this.tape.hiss*m, sat: this.tape.sat*m, wow: this.tape.wow*m, roll: this.tape.roll*m };
    if (this.tapeWobbleDepth) this.tapeWobbleDepth.gain.value = t.wow * 0.0025;              // wow/flutter
    if (this.tapeSat) this.tapeSat.curve = this._satCurve(t.sat * 0.5);                      // saturation (gentler)
    if (this.tapeMakeup) this.tapeMakeup.gain.value = 1 / (1 + t.sat * 1.2);                 // compensate sat boost
    if (this.tapeRolloff) this.tapeRolloff.frequency.value = 20000 - t.roll * 17000;         // HF rolloff
    if (this.tapeHissGain) this.tapeHissGain.gain.value = t.hiss * 0.03;                     // hiss
  }
  // Connect the Microcosm output somewhere (native node, e.g. ctx.destination)
  // Splice the tape chain between limiter and the destination.
  connectOut(dest: AudioNode): void {
    this.buildTape();
    this.nativeOut.connect(this.limiter);
    this.limiter.connect(this.tapeWobbleDelay as DelayNode);   // into tape
    (this.tapeMakeup as GainNode).connect(dest);      // tape out (post makeup) -> destination
  }
  // ── METRONOME: warm, round woodblock/rim knock, on its own gain bus ──
  // Kept separate from the main chain so it can later route to a distinct output (cue/click bus).
  private metroGain: GainNode | null = null;
  private metroLevel = 0.5;
  private buildMetro(): void {
    if (this.metroGain) return;
    this.metroGain = this.ctx.createGain();
    this.metroGain.gain.value = this.metroLevel;
    this.metroGain.connect(this.ctx.destination);   // straight out (splittable later)
  }
  setMetroLevel(v: number): void { this.buildMetro(); this.metroLevel = Math.max(0, Math.min(1, v)); if (this.metroGain) this.metroGain.gain.value = this.metroLevel; }
  // Return the metro bus so the main thread can later re-route it to another output.
  getMetroBus(): GainNode | null { this.buildMetro(); return this.metroGain; }
  // Play one warm knock at audio-clock time `when` (seconds). accent = beat 1 (higher + louder).
  click(accent: boolean, when?: number): void {
    this.buildMetro();
    const c = this.ctx;
    const t = (when != null && when > c.currentTime) ? when : c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    const f0 = accent ? 340 : 250;      // accent a bit higher
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.05);   // fast pitch drop = knock body
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = accent ? 1600 : 1300;    // round off the top (warm)
    const g = c.createGain();
    const peak = accent ? 0.9 : 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);              // gentle attack (not clicky)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);            // short round decay
    osc.connect(lp); lp.connect(g); g.connect(this.metroGain as GainNode);
    osc.start(t); osc.stop(t + 0.14);
  }

  private _currentEngine: string = '';
  spawnGrain(spec: GrainSpec): void {
    // per-orb HOME PITCH: transpose this orb's grains by its home semitone offset.
    // home ratio is an EXACT consonant interval (octave/fifth/etc) - never clamp it, that detunes.
    // detune (spec.rate's deviation from 1) is a small wobble; clamp only that to avoid alias.
    const home = this.engineHome[this._currentEngine] ?? 0;
    // UNIFIED PITCH MODEL (Slice 5 fix): the orb's total transpose is the SUM of separate,
    // independent parts so no driver clobbers another:
    //   tuning   — fixed root-detection correction, set once at load, never overwritten
    //   register — fixed constellation role (bass/mid/air)
    //   chordStep— moving, the ONLY thing the chord progression writes
    //   conductor— the keyboard/octave note, so the conductor moves sample orbs too
    const eng = this._currentEngine;
    const tuning   = this.engineTuning[eng]   ?? 0;
    const register = this.engineRegister[eng] ?? 0;
    const chordStep= this.engineChordStep[eng]?? 0;
    const conductor= this.engineConductor[eng]?? 0;
    const constT = tuning + register + chordStep + conductor;
    const homeRatio = Math.pow(2, (home + constT) / 12);
    // separate the detune wobble from unity, clamp the wobble modestly, then apply exact home
    const detune = spec.rate;                       // e.g. ~0.94..1.06 normally
    const detuneClamped = Math.sign(detune || 1) * Math.min(Math.abs(detune), 1.5);
    const r = detuneClamped * homeRatio;            // exact interval * gentle wobble
    // final safety only for extreme up-stacks (e.g. +2oct * wide detune): cap high but generous
    const capped = Math.sign(r || 1) * Math.min(Math.abs(r), 4.2);
    const source = this.engineSource[this._currentEngine] || 'default';
    const posEng = this.enginePosition[this._currentEngine];
    const sprayEng = this.engineSpray[this._currentEngine];
    const absEng = this.engineAbsence[this._currentEngine] || 0;
    const chaosEng = this.engineChaos[this._currentEngine] || 0;
    this.node?.port.postMessage({ type: 'grain', ...spec, rate: capped, engine: this._currentEngine, source, position: posEng, spray: sprayEng, absence: absEng, chaos: chaosEng });
  }
  // per-orb SOURCE (constellation): which loaded source buffer this orb's grains read.
  private engineSource: Record<string, string> = {};
  setEngineSource(id: string, sourceId: string): void { this.engineSource[id] = sourceId || 'default'; }
  // per-orb POSITION/scan into its (static) source buffer, 0..1, + spray. undefined => use source default.
  private enginePosition: Record<string, number | undefined> = {};
  private engineAbsence: Record<string, number> = {};   // per-orb ABSENCE (-1 flutter .. +1 dropouts)
  setOrbAbsence(id: string, v: number): void { this.engineAbsence[id] = Math.max(-1, Math.min(1, v)); }
  private engineChaos: Record<string, number> = {};   // per-orb CHAOS 0..1 (disorder→pitch→stutter)
  setOrbChaos(id: string, v: number): void { this.engineChaos[id] = Math.max(0, Math.min(1, v)); }
  private engineSpray: Record<string, number | undefined> = {};
  setOrbPosition(id: string, position: number, spray?: number): void {
    this.enginePosition[id] = position;
    if (spray != null) this.engineSpray[id] = spray;
  }
  // per-orb home pitch (semitones, absolute home; conductor transpose added later)
  private engineHome: Record<string, number> = {};
  // ── TEMPO LOCK (per orb) ──────────────────────────────────────────────
  // locked orbs fire on the tempo grid instead of their organic density rate.
  private bpm = 92;
  setBpm(n: number): void { this.bpm = Math.max(40, Math.min(200, n)); }
  private engineLocked: Record<string, boolean> = {};   // free (false) vs tempo-locked (true)
  private engineSubdiv: Record<string, number> = {};    // grid: 1=quarter,2=eighth,4=sixteenth,3=triplet
  private engineFill: Record<string, number> = {};      // 0..1 probability a grid point fires
  private engineSeed: Record<string, number> = {};      // seeds the fill dice (stable, re-rollable)
  private engineGridN: Record<string, number> = {};     // running grid-point counter per orb
  setOrbLock(id: string, on: boolean): void { this.engineLocked[id] = on; }
  setOrbSubdiv(id: string, n: number): void { this.engineSubdiv[id] = n; }
  setOrbFill(id: string, f: number): void { this.engineFill[id] = Math.max(0, Math.min(1, f)); }
  setOrbSeed(id: string, seed: number): void { this.engineSeed[id] = seed; this.engineGridN[id] = 0; }
  // deterministic hash -> 0..1 from (seed, grid index). Same seed+index = same result.
  private fillRoll(seed: number, n: number): number {
    let x = (seed * 2654435761 + n * 40503) >>> 0;
    x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13;
    return (x >>> 0) / 4294967295;
  }
  setOrbHome(id: string, semis: number): void { this.engineHome[id] = semis; }
  // per-orb CONSTELLATION transpose (semitones): register + chord step of the orb's constellation.
  // separate additive transpose parts per orb (unified pitch model)
  private engineTuning:   Record<string, number> = {};   // fixed root-detection correction
  private engineRegister: Record<string, number> = {};   // fixed constellation register role
  private engineChordStep:Record<string, number> = {};   // moving chord-progression step
  private engineConductor:Record<string, number> = {};   // keyboard/octave note
  setOrbTuning(id: string, semis: number): void { this.engineTuning[id] = semis; }
  setOrbRegister(id: string, semis: number): void { this.engineRegister[id] = semis; }
  setOrbChordStep(id: string, semis: number): void { this.engineChordStep[id] = semis; }
  setOrbConductor(id: string, semis: number): void { this.engineConductor[id] = semis; }
  // legacy shim: old callers set the whole thing → treat as chord-step (moving part)
  setOrbConstTranspose(id: string, semis: number): void { this.engineChordStep[id] = semis; }
  setFreeze(on: boolean, samples?: number): void { this.node?.port.postMessage({ type: 'freeze', value: on, samples: samples || 0 }); }
  setFreezeReverse(on: boolean): void { this.node?.port.postMessage({ type: 'freezeReverse', value: on }); }
  clearGrains(): void { this.node?.port.postMessage({ type: 'clearGrains' }); }
  // Register a static source buffer (constellation) in the worklet. Transfers the channel
  // data zero-copy (one-buffer primitive: worklet owns it, grains read by position).
  loadSource(id: string, audioBuffer: AudioBuffer): void {
    if (!this.node) return;
    // mono sum (average channels) into a fresh Float32Array we can transfer ownership of
    const n = audioBuffer.length, chs = audioBuffer.numberOfChannels;
    const mono = new Float32Array(n);
    for (let c = 0; c < chs; c++) {
      const cd = audioBuffer.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += cd[i] / chs;
    }
    this.node.port.postMessage({ type: 'loadSource', id, channelData: mono }, [mono.buffer]);
  }
  removeSource(id: string): void { this.node?.port.postMessage({ type: 'removeSource', id }); }
  // FREEZE the live ring into a new static source id (a captured snapshot, like loading a WAV).
  freezeSource(id: string, seconds: number = 2): void { this.node?.port.postMessage({ type: 'freezeSource', id, seconds }); }
  fauveOn(orbId: string, srcId: string, minMs: number = 25, gain: number = 0.6): void { this.node?.port.postMessage({ type: 'fauveOn', orbId, srcId, minMs, gain }); }
  fauveOff(orbId: string): void { this.node?.port.postMessage({ type: 'fauveOff', orbId }); }
  fauveOffAll(): void { this.node?.port.postMessage({ type: 'fauveOffAll' }); }
  fauveParam(orbId: string, key: string, value: number): void { this.node?.port.postMessage({ type: 'fauveParam', orbId, key, value }); }
  // clean pitch ratio for an orb (home + tuning + register + chord + conductor), no detune wobble.
  fauvePitchRatio(orbId: string): number {
    const home = this.engineHome[orbId] ?? 0;
    const constT = (this.engineTuning[orbId] ?? 0) + (this.engineRegister[orbId] ?? 0) + (this.engineChordStep[orbId] ?? 0) + (this.engineConductor[orbId] ?? 0);
    return Math.pow(2, (home + constT) / 12);
  }
  // push the current pitch ratio to an orb's Fauve player so fragments track the note.
  fauveUpdatePitch(orbId: string): void { this.node?.port.postMessage({ type: 'fauveParam', orbId, key: 'rate', value: this.fauvePitchRatio(orbId) }); }
  // Position/scan for a static (WAV) source: position 0..1 into the buffer, spray = scatter width.
  setSourcePosition(id: string, position: number, spray?: number): void {
    this.node?.port.postMessage({ type: 'sourcePosition', id, position, spray });
  }

  setFilter(hz: number): void {
    try { this.filter.frequency.setTargetAtTime(Math.max(80, Math.min(18000, hz)), this.ctx.currentTime, 0.02); } catch {}
  }
  // Direct sweep for the SWELL: sets cutoff + resonance immediately (no smoothing) so a
  // slow, deliberate sweep is heard as motion. Q rising into the sweep gives the physical 'wahh'.
  setSweep(hz: number, q: number): void {
    try {
      const f = Math.max(50, Math.min(18000, hz));
      this.filter.frequency.setValueAtTime(f, this.ctx.currentTime);
      this.filter.Q.setValueAtTime(Math.max(0.5, Math.min(18, q)), this.ctx.currentTime);
    } catch {}
  }
  resetFilter(): void {
    try {
      this.filter.frequency.setTargetAtTime(8000, this.ctx.currentTime, 0.05);
      this.filter.Q.setTargetAtTime(1, this.ctx.currentTime, 0.05);
    } catch {}
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
  setPan(id: string, pan: number): void {
    this.node?.port.postMessage({ type: 'enginePan', id, pan: Math.max(-1, Math.min(1, pan)) });
  }
  setEQ(id: string, lo: number, mid: number, hi: number): void {
    this.node?.port.postMessage({ type: 'engineEQ', id, lo, mid, hi });
  }
  setMasterGain(v: number): void {
    const g = Math.max(0, Math.min(1, v));
    this.nativeOut.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
  }
  setEngineLevel(id: string, level: number): void {
    if (this.rack[id]) this.rack[id].level = Math.max(0, Math.min(1, level));
  }
  // GRACEFUL JOIN: ramp an orb's level from 0 up to `target` over `seconds` so it blooms into
  // the mix instead of punching in. Click-free (grains just get progressively louder). Cancels
  // any prior fade on the same orb.
  private _fadeTimers: Record<string, any> = {};
  fadeInEngine(id: string, target: number, seconds: number = 1.5): void {
    if (!this.rack[id]) return;
    if (this._fadeTimers[id]) { clearInterval(this._fadeTimers[id]); }
    const tgt = Math.max(0, Math.min(1, target));
    const stepMs = 40;
    const steps = Math.max(1, Math.floor((seconds * 1000) / stepMs));
    let n = 0;
    this.rack[id].level = 0;
    this._fadeTimers[id] = setInterval(() => {
      n++;
      const t = n / steps;                       // 0..1
      const eased = t * t * (3 - 2 * t);         // smoothstep — gentle bloom
      if (this.rack[id]) this.rack[id].level = tgt * eased;
      if (n >= steps) { if (this.rack[id]) this.rack[id].level = tgt; clearInterval(this._fadeTimers[id]); delete this._fadeTimers[id]; }
    }, stepMs);
  }
  // ---- dynamic rack (rack-by-orb-id) ----
  // Create a rack entry for an orb instance running a given engine recipe.
  // Idempotent: re-adding an existing orbId updates its engineType, keeps level/active.
  addOrb(orbId: string, engineType: string, level: number = 0.8): void {
    const existing = this.rack[orbId];
    this.rack[orbId] = {
      engineType,
      active: existing ? existing.active : false,
      level: existing ? existing.level : Math.max(0, Math.min(1, level)),
    };
    if (this.engineTickAccum[orbId] === undefined) this.engineTickAccum[orbId] = 0;
    if (this.engineDensity[orbId] === undefined) this.engineDensity[orbId] = 0.5;  // seed per-orb density
    if (this.enginePalette[orbId] === undefined) this.enginePalette[orbId] = 'open';  // seed per-orb palette
    if (this.engineHome[orbId] === undefined) this.engineHome[orbId] = 0;  // seed per-orb home pitch (0 = no transpose)
    if (this.engineLocked[orbId] === undefined) this.engineLocked[orbId] = false;  // born FREE
    if (this.engineSubdiv[orbId] === undefined) this.engineSubdiv[orbId] = 2;       // eighth notes
    if (this.engineFill[orbId] === undefined) this.engineFill[orbId] = 1;           // full fill
    if (this.engineSeed[orbId] === undefined) { this.engineSeed[orbId] = 1; this.engineGridN[orbId] = 0; }
  }
  // Remove an orb instance from the rack entirely.
  removeOrb(orbId: string): void {
    delete this.rack[orbId];
    delete this.engineTickAccum[orbId];
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
    // engine catalogue: engine-type -> its tick recipe. Dispatch is now a lookup,
    // not a 12-branch if. (Step 1 of rack-by-orb-id: behaviour identical.)
    const tickFns: Record<string, (lvl: number) => number> = {
      mosaic:  (l) => this.tickMosaic(l),
      haze:    (l) => this.tickHaze(l),
      tunnel:  (l) => this.tickTunnel(l),
      strum:   (l) => this.tickStrum(l),
      reverse: (l) => this.tickReverse(l),
      shimmer: (l) => this.tickShimmer(l),
      glitch:  (l) => this.tickGlitch(l),
      warp:    (l) => this.tickWarp(l),
      swarm:   (l) => this.tickSwarm(l),
      swell:   (l) => this.tickSwell(l),
      bubbles: (l) => this.tickBubbles(l),
      chop:    (l) => this.tickChop(l),
    };
    const tick = () => {
      for (const id of Object.keys(this.rack)) {
        const e = this.rack[id];
        if (!e.active) continue;
        this.engineTickAccum[id] -= STEP;
        if (this.engineTickAccum[id] <= 0) {
          this._currentEngine = id;   // tag grains with the ORB ID (the rack key)
          const fn = tickFns[e.engineType];   // recipe chosen by engineType, decoupled from id
          if (this.engineLocked[id]) {
            // TEMPO-LOCKED: grid delay from BPM+subdivision; fill dice decides fire vs rest.
            const subdiv = this.engineSubdiv[id] || 2;                 // default eighth notes
            const gridMs = (60 / this.bpm) * 1000 / subdiv;            // one grid step in ms
            const n = (this.engineGridN[id] || 0);
            const fill = this.engineFill[id] ?? 1;
            const seed = this.engineSeed[id] ?? 1;
            if (fill >= 1 || this.fillRoll(seed, n) < fill) {
              if (fn) fn(e.level);   // fire the grains (density still drives thickness)
            }
            this.engineGridN[id] = n + 1;
            this.engineTickAccum[id] = gridMs;
          } else {
            // FREE: organic density-driven rate (the fn returns its own next delay).
            const next = fn ? fn(e.level) : 100;
            this.engineTickAccum[id] = next;
          }
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
    // TEST DENSITY: voices + firing rate driven by density (not activity)
    const d = this.engineDensity[this._currentEngine] ?? 0.5;   // per-orb density
    const voices = 1 + Math.round(d * 4);                       // 1..5 voices
    const tier = this.tiers[Math.min(this.tiers.length-1, Math.floor(this.pitchSpread * 4))];
    const baseLen = 0.04 + this.grainSpread * 0.36;
    const spreadRange = 0.1 + this.grainSpread * 1.9;
    for (let v = 0; v < voices; v++) {
      const rate = this.pickRate(this._currentEngine);   // flavour-aware grain pitch
      const lenSamp = Math.floor(this._sr * (baseLen * (0.7 + Math.random() * 0.6)));
      const behind = Math.floor(this._sr * (0.15 + Math.random() * spreadRange));
      const gain = 0.35 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    // sparse = slow ticks (notes arrive one at a time), dense = fast ticks
    return 60 * Math.pow(260/60, 1 - d);   // ~260ms (sparse) .. ~60ms (dense), geometric
  }

  // ── HAZE: slow, long, diffuse wash — no octave jumps, dense overlapping ──
  private tickHaze(lvl: number = 1): number {
    const voices = 2 + Math.round(this.curDensity * 3);
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
    return 160 - this.curDensity * 70;
  }

  // ── TUNNEL: deep sustained drone — long grains, octave-DOWN emphasis ──
  private tickTunnel(lvl: number = 1): number {
    const voices = 2 + Math.round(this.curDensity * 2);
    const downTiers = [[0.5], [0.5, 1], [0.5, 0.25, 1]];
    const tier = downTiers[Math.min(2, Math.floor(this.pitchSpread * 3))];
    const baseLen = 0.6 + this.grainSpread * 1.0;
    for (let v = 0; v < voices; v++) {
      const rate = this.pickRate(this._currentEngine);
      const lenSamp = Math.floor(this._sr * (baseLen * (0.8 + Math.random() * 0.4)));
      const behind = Math.floor(this._sr * (0.5 + Math.random() * 2.0));
      const gain = 0.3 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 180 - this.curDensity * 80;
  }

  // ── STRUM: rhythmic, sequenced bursts — tight grains fired in quick runs ──
  private strumStep = 0;
  private tickStrum(lvl: number = 1): number {
    // fire a quick ascending run of short grains
    const tier = this.tiers[Math.min(this.tiers.length-1, Math.floor(this.pitchSpread * 4))];
    const rate = tier[this.strumStep % tier.length];
    this.strumStep++;
    const lenSamp = Math.floor(this._sr * (0.06 + this.grainSpread * 0.1));
    const behind = Math.floor(this._sr * (0.15 + Math.random() * 0.6));
    this.spawnGrain({ startSamp: behind, rate, lenSamp, gain: 0.4 * lvl, pan: Math.random() * 2 - 1 });
    // rhythmic spacing — faster with activity
    return 70 - this.curDensity * 40;
  }

  // ── REVERSE: grains played backwards — swelling, blooming, ethereal ──
  private warpPhase = 0;
  private tickReverse(lvl: number = 1): number {
    const voices = 2 + Math.round(this.curDensity * 2);
    const tier = this.tiers[Math.min(this.tiers.length-1, Math.floor(this.pitchSpread * 4))];
    const baseLen = 0.2 + this.grainSpread * 0.5;
    for (let v = 0; v < voices; v++) {
      const semi = this.pickRate(this._currentEngine);
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
    return 130 - this.curDensity * 60;
  }

  // ── SHIMMER: crystalline upward octave stacking — glassy, cathedral height ──
  private tickShimmer(lvl: number = 1): number {
    const voices = 2 + Math.round(this.curDensity * 3);
    // upward intervals: octave, octave+fifth, two octaves
    const upTiers = [[2], [2, 3], [2, 3, 4]];
    const tier = upTiers[Math.min(2, Math.floor(this.pitchSpread * 3))];
    const baseLen = 0.15 + this.grainSpread * 0.35;
    for (let v = 0; v < voices; v++) {
      const rate = this.pickRate(this._currentEngine);
      const lenSamp = Math.floor(this._sr * (baseLen * (0.7 + Math.random() * 0.6)));
      const behind = Math.floor(this._sr * (0.2 + Math.random() * 1.5));
      const gain = 0.22 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 80 - this.curDensity * 40;
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
    return 45 - this.curDensity * 25;
  }

  // ── WARP: grain rate modulated by slow LFO — seasick, tape wow/flutter ──
  private tickWarp(lvl: number = 1): number {
    this.warpPhase += 0.08;
    const voices = 2 + Math.round(this.curDensity * 2);
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
    return 100 - this.curDensity * 50;
  }

  // ── SWARM: many tiny micro-detuned grains, high density — insect cloud ──
  private tickSwarm(lvl: number = 1): number {
    const voices = 3 + Math.round(this.curDensity * 5);
    for (let v = 0; v < voices; v++) {
      // tiny grains, micro-detune around unison (no octaves)
      const cents = (Math.random() * 2 - 1) * (10 + this.pitchSpread * 60);
      const rate = Math.pow(2, cents / 1200);
      const lenSamp = Math.floor(this._sr * (0.01 + this.grainSpread * 0.03));
      const behind = Math.floor(this._sr * (0.15 + Math.random() * 1.5));
      const gain = 0.18 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: Math.random() * 2 - 1 });
    }
    return 35 - this.curDensity * 18;
  }

  // ── SWELL: Hendrix-style reverse bursts — discrete longer reversed grains,
  // each blooming up to a peak, fired in rhythmic spaced hits (not a wash) ──
  private tickSwell(lvl: number = 1): number {
    const tier = this.tiers[Math.min(this.tiers.length-1, Math.floor(this.pitchSpread * 4))];
    // 1-2 grains per hit (a small reversed chord), longer so the swell is heard
    const voices = 1 + Math.round(this.pitchSpread * 1);
    const baseLen = 0.35 + this.grainSpread * 0.5;  // 0.35s..0.85s — clear swells
    for (let v = 0; v < voices; v++) {
      const semi = this.pickRate(this._currentEngine);
      const rate = -Math.abs(semi);
      const lenSamp = Math.floor(this._sr * (baseLen * (0.9 + Math.random() * 0.2)));
      const behind = Math.floor(this._sr * (0.3 + Math.random() * 0.6));
      const gain = 0.5 / Math.sqrt(voices) * 1.6 * lvl;
      this.spawnGrain({ startSamp: behind, rate, lenSamp, gain, pan: (Math.random() * 2 - 1) * 0.5 });
    }
    // RHYTHMIC spacing — discrete hits, faster with activity (700ms..180ms apart)
    return 700 - this.curDensity * 520;
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
    const base = 500 - this.curDensity * 350;   // avg 500ms..150ms
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
  // per-orb density for the engine currently ticking (rack-by-orb-id)
  private get curDensity(): number { return this.engineDensity[this._currentEngine] ?? 0.5; }
  setGrainSpread(x: number): void { this.grainSpread = Math.max(0, Math.min(1, x)); }
  setPitchSpread(y: number): void { this.pitchSpread = Math.max(0, Math.min(1, y)); }
  setDensity(id: string, d: number): void { this.engineDensity[id] = Math.max(0, Math.min(1, d)); }

  dispose(): void {
    this.stopMosaic();
    try { this.node?.disconnect(); } catch {}
    [this.nativeIn, this.nativeOut, this.limiter, this.filter, this.reverb, this.reverbWet, this.reverbDry]
      .forEach(n => { try { n.disconnect(); } catch {} });
  }
}
