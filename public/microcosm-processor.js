// Microcosm ring-buffer granular processor (AudioWorklet).
// Runs on the audio thread. The live input is continuously written into a
// circular buffer. The main thread sends 'grain' messages to spawn reader
// voices that play back slices of the buffer at any position/speed/gain/pan.
// This is the core of every Microcosm engine — record and playback happen
// simultaneously, sample-accurate, no latency.

class MicrocosmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = sampleRate; // global in worklet scope
    this.bufferSeconds = 4;
    this.size = Math.floor(this.sampleRate * this.bufferSeconds);
    this.ring = new Float32Array(this.size);   // DEFAULT source ring (synth) — unchanged path
    this.writePos = 0;
    // ONE-BUFFER PRIMITIVE: every source is a worklet-owned buffer read by grain position.
    // The default source's buffer IS this.ring (aliased) with a live writer, so the existing
    // freeze/write/seam/capture code is byte-for-byte unchanged. Sample sources are added here
    // with no writer (filled once, zero-copy). Grains carry a `source` id (absent => default).
    this.sources = { default: { buf: this.ring, len: this.size, live: true } };
    this.frozen = false;        // HOLD — read from the frozen loop buffer instead of live ring
    this.recording = true;
    this.freezeBuf = null;      // tempo-locked captured loop (Float32Array), grains read this when frozen
    this._fauve = {};   // FAUVE per-orb fragment players, keyed by orb id: { srcId, idx, pos, gain }
    this.freezeLen = 0;         // length of the freeze loop in samples
    this.freezeReverse = false; // play the frozen loop backwards

    // Active grain voices
    this.grains = [];
    // Per-engine channel pan (-1..1), applied on top of each grain's own pan
    this.enginePan = {};
    // Per-engine 3-band EQ. gains in dB (-12..+12), 0 = flat (transparent).
    // State + coeffs are lazily created per ACTIVE engine id (handful, not stored orbs).
    this.engineEQ = {};       // id -> { lo, mid, hi }  (dB gains)
    this.eqState = {};        // id -> per-band biquad state {x1,x2,y1,y2} for L and R
    this._sr = sampleRate;    // worklet global

    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'enginePan') {
        this.enginePan[m.id] = m.pan;
        return;
      }
      if (m.type === 'engineEQ') {
        this.engineEQ[m.id] = { lo: m.lo||0, mid: m.mid||0, hi: m.hi||0 };
        this._recalcEQ(m.id);
        return;
      }
      if (m.type === 'grain') {
        const srcId = m.source || 'default';
        const src = this.sources[srcId] || this.sources.default;
        let pos, maxRead;
        if (src.live) {
          // LIVE ring: startSamp = samples behind the write head (recent, safe, never crosses it)
          const behind = m.startSamp;
          pos = this.writePos - behind;
          while (pos < 0) pos += this.size;
          maxRead = behind;
        } else {
          // STATIC source (WAV): read from the source's POSITION (0..1 into the buffer) plus a
          // spray so grains scatter around the point (avoids a static/combed sound). This is
          // what lets you freeze on one moment or slowly scan through the sample.
          // per-ORB position/spray if the grain carries them, else the source's default
          const p01   = (m.position != null) ? m.position : ((src.position != null) ? src.position : 0.0);
          const spray = (m.spray != null)    ? m.spray    : ((src.spray != null)    ? src.spray    : 0.08);
          const centre = p01 * src.len;
          const jitter = (Math.random() * 2 - 1) * spray * src.len;
          pos = centre + jitter;
          // CLAMP (don't wrap) so no grain reads ACROSS the loop seam at 0/end — the source of
          // the edge pops. A grain reads ~ rate*lenSamp samples over its life, so keep its whole
          // read window inside [margin, len - readSpan - margin]. Grains near the edges read
          // INWARD instead of wrapping past the discontinuity → clean at every position.
          const readSpan = Math.min(src.len * 0.5, (m.rate || 1) * (m.lenSamp || 0));
          const margin = Math.min(src.len * 0.02, this._sr * 0.01);   // ~10ms safety
          const lo = margin, hi = Math.max(margin + 1, src.len - readSpan - margin);
          if (pos < lo) pos = lo;
          if (pos > hi) pos = hi;
          maxRead = src.len;
        }
        // ── CHAOS (staged mayhem 0..1) — the real Fauve/Aphex destruction ──────────────
        // Layered so every knob position is a distinct usable sound:
        //   0.00-0.33  DISORDER: grains leap to RANDOM positions in the buffer (source shatters,
        //              reassembled out of order — stays tonal because it is the same material).
        //   0.33-0.66  PITCH SCATTER: grains jump by random octave/fifth steps (warble/glitch).
        //   0.66-1.00  STUTTER + REVERSE: grains shorten + machine-gun-repeat, some play backward.
        let chaosRate = 1;            // multiplies the grain rate (pitch)
        let chaosLenMul = 1;          // multiplies grain length (stutter = shorter)
        const chaos = m.chaos || 0;
        if (chaos > 0) {
          // DISORDER — ramps in over 0..0.33; probability of a full random jump scales up
          const disorder = Math.min(1, chaos / 0.33);
          if (Math.random() < disorder * 0.9) {
            const usable = maxRead > 4 ? maxRead : (src.len || this.size);
            if (src.live) {
              // jump to a random recent point in the ring, staying ~30ms BEHIND the write head so
              // a grain never lands on the record seam (old/new discontinuity → pop).
              const guard = Math.floor(this._sr * 0.03);
              const safe = Math.max(1, usable - guard);
              pos = this.writePos - (guard + Math.floor(Math.random() * safe));
              while (pos < 0) pos += this.size;
              maxRead = usable;
            } else {
              // jump anywhere in the static buffer (clamped inward like the normal read)
              const readSpan = Math.min(src.len * 0.5, (m.rate || 1) * (m.lenSamp || 0));
              const margin = Math.min(src.len * 0.02, this._sr * 0.01);
              const lo = margin, hi = Math.max(margin + 1, src.len - readSpan - margin);
              pos = lo + Math.random() * (hi - lo);
            }
          }
          // PITCH SCATTER — ramps in over 0.33..0.66. Random musical multiple (oct/fifth up/down).
          const scatter = Math.max(0, Math.min(1, (chaos - 0.33) / 0.33));
          if (scatter > 0 && Math.random() < scatter * 0.7) {
            const steps = [0.25, 0.5, 0.5, 1, 1.5, 2, 2, 3, 4];   // musical-ish ratios
            chaosRate = steps[(Math.random() * steps.length) | 0];
            if (Math.random() < 0.35) chaosRate *= -1;             // sometimes reverse via -rate
          }
          // STUTTER + REVERSE — ramps in over 0.66..1.0. Short, repeated, sometimes backward.
          const stut = Math.max(0, Math.min(1, (chaos - 0.66) / 0.34));
          if (stut > 0) {
            if (Math.random() < stut * 0.8) chaosLenMul = 0.12 + Math.random() * 0.35;  // tiny grains = buzzy stutter
            if (Math.random() < stut * 0.5) chaosRate = -Math.abs(chaosRate || 1);       // force reverse
          }
        }
        // ── ABSENCE (controlled chaos, two-sided -1..+1) ────────────────────────────────
        // RIGHT (>0): dropouts — with probability scaling to absence, skip the grain entirely
        // (gaps, stutter, holes). Full right ≈ most grains vanish.
        // LEFT (<0): flutter — randomize the grain's gain per grain (organic amplitude shimmer).
        // Full left ≈ wild per-grain volume swings. Centre (0) = clean, no effect.
        let grainGain = m.gain;
        let dropGrain = false;
        const absence = m.absence || 0;
        if (absence > 0) {
          // dropout probability ramps to ~0.92 at full right (never a total kill, so it still lives)
          if (Math.random() < absence * 0.92) dropGrain = true;   // this grain simply won't spawn
        } else if (absence < 0) {
          const amt = -absence;                          // 0..1
          // random gain factor; at full left this dips dramatically (^3 skews toward quiet)
          const r = Math.pow(Math.random(), 1 + amt * 3);
          grainGain = m.gain * (1 - amt + amt * r * 1.6);   // blend clean→wild as amt rises
        }
        const finalRate = m.rate * chaosRate;
        const finalLen = Math.max(64, Math.floor(m.lenSamp * chaosLenMul));
        // POP FIX (character-neutral): a grain reads |finalRate| * len samples over its life.
        // Long engines (Tunnel = 0.6-1.6s grains) at chaos rates (up to 4x) demand a read window
        // far bigger than the frozen buffer, so they overrun the loop seam → pop. For a static
        // source: (1) CAP the grain length so its whole read window fits inside the buffer, then
        // (2) clamp pos so the (now-fitting) window can't reach the seam. Grain plays a slightly
        // shorter chunk (imperceptible on long grains) but physically cannot hit the discontinuity.
        let safeLen = finalLen;
        if (!src.live) {
          const mg = Math.min(src.len * 0.02, this._sr * 0.01);
          const avail = Math.max(1, src.len - 2 * mg);          // usable span inside the margins
          const rateAbs = Math.max(0.0001, Math.abs(finalRate));
          const maxLen = Math.floor(avail / rateAbs);            // longest grain whose read fits
          if (safeLen > maxLen) safeLen = Math.max(64, maxLen);  // trim to fit (keep audible)
          const span = rateAbs * safeLen;
          const clo = mg + (finalRate < 0 ? span : 0);
          const chi = Math.max(clo + 1, src.len - mg - (finalRate > 0 ? span : 0));
          if (pos < clo) pos = clo;
          if (pos > chi) pos = chi;
        }
        if (!dropGrain) this.grains.push({
          pos,
          source: srcId,   // which source buffer this grain reads (constellation)
          engine: m.engine || '_',
          rate: finalRate,
          remaining: safeLen,
          total: safeLen,
          gain: grainGain,
          panL: Math.cos((Math.max(-1, Math.min(1, m.pan + (this.enginePan[m.engine] || 0))) + 1) * 0.25 * Math.PI),
          panR: Math.sin((Math.max(-1, Math.min(1, m.pan + (this.enginePan[m.engine] || 0))) + 1) * 0.25 * Math.PI),
          // safety margin: how many samples of headroom before the write head
          maxRead,
        });
      } else if (m.type === 'freeze') {
        if (m.value) {
          this._captureFreeze(m.samples || Math.floor(this._sr));  // capture tempo-locked slice
          this.frozen = true;
          this.freezePos = 0;       // start the loop player at the top of the captured bar
          this.recording = false;   // stop overwriting the ring while frozen
          this.grains.length = 0;   // clear in-flight grains so none jump buffers mid-window (pop)
        } else {
          this.frozen = false;
          this.freezeReverse = false;
          this.recording = true;    // resume live recording into the ring
          this._smoothRingSeam();   // crossfade the stale write-head seam so resume is click-free
          this.grains.length = 0;   // clear so grains restart cleanly in the live ring
        }
      } else if (m.type === 'freezeReverse') {
        this.freezeReverse = !!m.value;
      } else if (m.type === 'clearGrains') {
        this.grains.length = 0;
      } else if (m.type === 'loadSource') {
        // Register a static source: a worklet-owned buffer with NO writer, read by grain
        // position (one-buffer primitive). channelData arrives zero-copy (transferred).
        if (m.id && m.channelData && m.channelData.length > 1) {
          this.sources[m.id] = { buf: m.channelData, len: m.channelData.length, live: false };
        }
      } else if (m.type === 'freezeSource') {
        // FREEZE: capture the most-recent `seconds` of the live ring into a NEW static source,
        // reusing the PROVEN seam-crossfade from _captureFreeze so the loop point is click-free.
        // Registered as a static source -> gets full per-orb position/scan (like a loaded WAV).
        if (m.id) {
          const sz = this.size;
          let len = Math.min(Math.floor(this._sr * (m.seconds || 2.0)), sz - 1);
          if (len < 64) len = 64;
          const buf = new Float32Array(len);
          // copy the most recent `len` samples ending at the write head, chronological order
          const start = (this.writePos - len + sz) % sz;
          for (let k = 0; k < len; k++) buf[k] = this.ring[(start + k) % sz];
          // crossfade the loop seam: blend the tail into the head over ~15ms (raised-cosine),
          // so a grain crossing end->start hits no discontinuity. Exactly _captureFreeze's method.
          const xf = Math.min(Math.floor(this._sr * 0.015), Math.floor(len / 4));
          for (let k = 0; k < xf; k++) {
            const t = k / xf;
            const g = 0.5 - 0.5 * Math.cos(Math.PI * t);   // 0..1
            const tail = buf[len - xf + k];
            buf[k] = buf[k] * g + tail * (1 - g);
          }
          this.sources[m.id] = { buf, len, live: false };
        }
      } else if (m.type === 'fauveOn') {
        // FAUVE per-orb: slice the source at zero crossings (if not already) and start a fragment
        // player for this orb. m.orbId = orb, m.srcId = its source, m.minMs = min fragment length.
        const src = this.sources[m.srcId];
        if (src && src.buf && m.orbId) {
          if (!src.fragments || src.fragments.length < 2) {
            const buf = src.buf, len = src.len;
            const minLen = Math.max(1, Math.floor(this._sr * ((m.minMs || 25) / 1000)));
            const bounds = [0]; let last = 0; let prev = buf[0];
            for (let k = 1; k < len; k++) {
              const cur = buf[k];
              if (((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) && (k - last) >= minLen) { bounds.push(k); last = k; }
              prev = cur;
            }
            if (bounds[bounds.length - 1] !== len) bounds.push(len);
            src.fragments = bounds;
            console.log('[fauve] sliced', m.srcId, 'fragments', bounds.length - 1);
          }
          this._fauve[m.orbId] = { srcId: m.srcId, idx: 0, pos: 0, gain: (m.gain != null ? m.gain : 0.6), disorder: 0, repeat: 0, reverse: 0, rev: false, gaps: 0, silent: false, rate: 1 };
          console.log('[fauve] ON orb', m.orbId, 'src', m.srcId);
        }
      } else if (m.type === 'fauveParam') {
        const fv = this._fauve[m.orbId];
        if (fv && m.key) fv[m.key] = m.value;
      } else if (m.type === 'fauveOff') {
        if (this._fauve[m.orbId]) { delete this._fauve[m.orbId]; console.log('[fauve] OFF orb', m.orbId); }
      } else if (m.type === 'removeSource') {
        if (m.id && m.id !== 'default') delete this.sources[m.id];
      } else if (m.type === 'sourcePosition') {
        const src = this.sources[m.id];
        if (src) { if (m.position != null) src.position = m.position; if (m.spray != null) src.spray = m.spray; }
      } else if (m.type === 'config') {
        if (typeof m.recording === 'boolean') this.recording = m.recording;
      }
    };
  }

  // Smooth the live ring's write-head seam (used on freeze release so resuming grains don't pop).
  _smoothRingSeam() {
    const xf = Math.min(Math.floor(this._sr * 0.012), Math.floor(this.size / 4));
    if (xf < 8) return;
    const w = this.writePos, sz = this.size;
    for (let k = 0; k < xf; k++) {
      const t = k / xf; const g = 0.5 - 0.5 * Math.cos(Math.PI * t);
      const after = (w + k) % sz, before = (w - xf + k + sz) % sz;
      this.ring[after] = this.ring[after] * g + this.ring[before] * (1 - g);
    }
  }
    // Capture a tempo-locked slice (N samples ending at the write head) into a dedicated
  // freeze loop buffer, with a crossfaded seam so it loops seamlessly (no pops).
  _captureFreeze(samples) {
    const sz = this.size;
    let len = Math.min(samples, sz - 1);
    if (len < 64) len = 64;
    const buf = new Float32Array(len);
    // copy the most recent `len` samples ending at writePos
    const start = (this.writePos - len + sz) % sz;
    for (let k = 0; k < len; k++) buf[k] = this.ring[(start + k) % sz];
    // crossfade the loop seam: blend the tail into the head over ~15ms so end meets start
    const xf = Math.min(Math.floor(this._sr * 0.015), Math.floor(len / 4));
    for (let k = 0; k < xf; k++) {
      const t = k / xf;
      const g = 0.5 - 0.5 * Math.cos(Math.PI * t);   // raised-cosine 0..1
      // head sample k gets a blend of itself and the corresponding tail sample
      const tail = buf[len - xf + k];
      buf[k] = buf[k] * g + tail * (1 - g);
    }
    this.freezeBuf = buf;
    this.freezeLen = len;
  }
    // ── 3-band EQ (low-shelf, peaking mid, high-shelf) per engine ──────────
  _recalcEQ(id) {
    const sr = this._sr || 48000;
    const g = this.engineEQ[id] || { lo:0, mid:0, hi:0 };
    const mk = (type, f0, dB, Q) => this._biquad(type, f0, dB, Q, sr);
    const st = this.eqState[id] || (this.eqState[id] = {});
    // update coefficients IN PLACE — preserve filter history (x/y) so changing
    // the gain mid-signal doesn't wipe state and cause a pop/click.
    const setBand = (key, type, f0, dB, Q) => {
      const c = mk(type, f0, dB, Q);
      if (!st[key]) st[key] = { xL:[0,0], yL:[0,0], xR:[0,0], yR:[0,0] };
      st[key].b0 = c.b0; st[key].b1 = c.b1; st[key].b2 = c.b2; st[key].a1 = c.a1; st[key].a2 = c.a2;
    };
    setBand('lo','lowshelf', 250, g.lo, 0.7);
    setBand('mid','peaking', 1200, g.mid, 1.0);
    setBand('hi','highshelf',4000, g.hi, 0.7);
    st.flat = (g.lo===0 && g.mid===0 && g.hi===0);
  }
  _biquad(type, f0, dBgain, Q, sr) {
    const A = Math.pow(10, dBgain/40);
    const w0 = 2*Math.PI*f0/sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw/(2*Q);
    let b0,b1,b2,a0,a1,a2;
    if (type==='peaking') {
      b0=1+alpha*A; b1=-2*cw; b2=1-alpha*A;
      a0=1+alpha/A; a1=-2*cw; a2=1-alpha/A;
    } else if (type==='lowshelf') {
      const s2=2*Math.sqrt(A)*alpha;
      b0=A*((A+1)-(A-1)*cw+s2); b1=2*A*((A-1)-(A+1)*cw); b2=A*((A+1)-(A-1)*cw-s2);
      a0=(A+1)+(A-1)*cw+s2; a1=-2*((A-1)+(A+1)*cw); a2=(A+1)+(A-1)*cw-s2;
    } else { // highshelf
      const s2=2*Math.sqrt(A)*alpha;
      b0=A*((A+1)+(A-1)*cw+s2); b1=-2*A*((A-1)+(A+1)*cw); b2=A*((A+1)+(A-1)*cw-s2);
      a0=(A+1)-(A-1)*cw+s2; a1=2*((A-1)-(A+1)*cw); a2=(A+1)-(A-1)*cw-s2;
    }
    return { b0:b0/a0, b1:b1/a0, b2:b2/a0, a1:a1/a0, a2:a2/a0 };
  }
  _eqBand(b, x, ch) {
    const xs = ch==='L'?b.xL:b.xR, ys = ch==='L'?b.yL:b.yR;
    const y = b.b0*x + b.b1*xs[0] + b.b2*xs[1] - b.a1*ys[0] - b.a2*ys[1];
    xs[1]=xs[0]; xs[0]=x; ys[1]=ys[0]; ys[0]=y;
    return y;
  }
  _applyEQ(id, sampleL, sampleR) {
    const st = this.eqState[id];
    if (!st || st.flat) return [sampleL, sampleR];
    let l = sampleL, r = sampleR;
    l = this._eqBand(st.lo,l,'L'); r = this._eqBand(st.lo,r,'R');
    l = this._eqBand(st.mid,l,'L'); r = this._eqBand(st.mid,r,'R');
    l = this._eqBand(st.hi,l,'L'); r = this._eqBand(st.hi,r,'R');
    return [l, r];
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const inCh = input && input[0] ? input[0] : null;
    const n = outL.length;

    // 1. Write live input into the ring (unless frozen)
    if (inCh && this.recording && !this.frozen) {
      for (let i = 0; i < n; i++) {
        this.ring[this.writePos] = inCh[i];
        this.writePos = (this.writePos + 1) % this.size;
      }
    }

    // 2. Clear output
    for (let i = 0; i < n; i++) { outL[i] = 0; outR[i] = 0; }

    // 3. Render active grains — SAMPLE-MAJOR so each engine's mono mix can be
    //    filtered (EQ) with continuous biquad state before panning.
    //    Per-engine work scales with ACTIVE engines only (handful), not stored orbs.
    for (let i = 0; i < n; i++) {
      // per-engine mono accumulators for this sample
      const acc = this._eqAcc || (this._eqAcc = {});
      for (const k in acc) acc[k] = 0;
      // also track each grain's pan contribution by engine (pan applied after EQ)
      // We accumulate mono per engine, plus a weighted pan sum to preserve per-grain pan.
      const panAccL = this._panAccL || (this._panAccL = {});
      const panAccR = this._panAccR || (this._panAccR = {});
      for (const k in panAccL) { panAccL[k] = 0; panAccR[k] = 0; }

      for (let g = 0; !this.frozen && g < this.grains.length; g++) {
        const gr = this.grains[g];
        if (gr.remaining <= 0) continue;
        const phase = (gr.total - gr.remaining) / gr.total;
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
        const p = gr.pos;
        // read from THIS grain's source buffer (default source's buf === this.ring, so the
        // default path is byte-for-byte identical). Non-default sources read their own buffer.
        const src = this.sources[gr.source] || this.sources.default;
        const sbuf = src.buf, slen = src.len;
        const i0 = Math.floor(p) % slen;
        const i1 = (i0 + 1) % slen;
        const frac = p - Math.floor(p);
        const sMono = (sbuf[i0] * (1 - frac) + sbuf[i1] * frac) * gr.gain * w;
        const eng = gr.engine || '_';
        // FAUVE: if this orb is in Fauve mode, silence its normal grain output (we hear only
        // the fragment player). Advance still happens below so grain lifecycle is unaffected.
        if (!this._fauve[eng]) {
          panAccL[eng] = (panAccL[eng] || 0) + sMono * gr.panL;
          panAccR[eng] = (panAccR[eng] || 0) + sMono * gr.panR;
        }
        // advance grain (wrap within THIS grain's source length)
        gr.pos += gr.rate;
        if (gr.pos >= slen) gr.pos -= slen;
        if (gr.pos < 0) gr.pos += slen;
        if (gr.rate > 1) {
          gr.maxRead -= (gr.rate - 1);
          if (gr.maxRead <= 64 && gr.remaining > 1) gr.remaining = 1;
        }
        gr.remaining--;
      }

      // EQ each engine's bus (continuous biquad state), then sum to output.
      for (const eng in panAccL) {
        let l = panAccL[eng], r = panAccR[eng];
        if (this.eqState[eng] && !this.eqState[eng].flat) {
          const o = this._applyEQ(eng, l, r); l = o[0]; r = o[1];
        }
        outL[i] += l;
        outR[i] += r;
      }
      // FREEZE LOOP PLAYER: one clean read head over the captured bar (bypasses grains).
      if (this.frozen && this.freezeBuf && this.freezeLen > 0) {
        const fl = this.freezeLen;
        let pos = this.freezePos;
        let rp = this.freezeReverse ? (fl - 1 - pos) : pos;
        const a0 = Math.floor(rp) % fl;
        const a1 = (a0 + 1) % fl;
        const fr = rp - Math.floor(rp);
        const fb = this.freezeBuf;
        let smp = (fb[a0] * (1 - fr) + fb[a1] * fr) * 0.35;   // trim: captured sum is hot vs grained output
        // short fade at loop edges to guarantee no seam click
        const edge = 256;
        if (pos < edge) smp *= pos / edge;
        else if (pos > fl - edge) smp *= (fl - pos) / edge;
        outL[i] += smp;
        outR[i] += smp;
        this.freezePos += 1;
        if (this.freezePos >= fl) this.freezePos = 0;
      }
      // ── FAUVE per-orb fragment players ──────────────────────────────────────────────
      for (const oid in this._fauve) {
        const fv = this._fauve[oid];
        const src = this.sources[fv.srcId];
        if (!src || !src.fragments || src.fragments.length < 2) continue;
        const frags = src.fragments, buf = src.buf;
        const a = frags[fv.idx], b = frags[fv.idx + 1];
        const flen = b - a;
        const rate = fv.rate || 1;                    // pitch multiplier (follows the note)
        // REVERSE: read the fragment back-to-front (fv.rev set when the fragment starts)
        const rp = fv.rev ? (b - fv.pos) : (a + fv.pos);
        const i0 = Math.floor(rp), i1 = i0 + 1;
        const fr = rp - i0;
        let smp = fv.silent ? 0 : (((buf[i0] || 0) * (1 - fr)) + ((buf[i1] || 0) * fr)) * fv.gain;
        const ef = Math.min(64, flen >> 1);          // edge fade so joins never click
        if (fv.pos < ef) smp *= fv.pos / ef;
        else if (fv.pos > flen - ef) smp *= (flen - fv.pos) / ef;
        outL[i] += smp; outR[i] += smp;
        fv.pos += rate;                               // advance by pitch rate (was +1 = native/low)
        if (fv.pos >= flen) {
          fv.pos = 0;
          const nF = frags.length - 1;
          // REPEAT: chance to replay the SAME fragment (stutter — makes rhythm from a static note)
          if (Math.random() < (fv.repeat || 0)) {
            // keep fv.idx (repeat the fragment)
          } else if (Math.random() < (fv.disorder || 0)) {
            fv.idx = (Math.random() * nF) | 0;          // DISORDER: random fragment
          } else {
            fv.idx++; if (fv.idx >= nF) fv.idx = 0;     // next fragment
          }
          // REVERSE: decide if the NEW fragment plays backward
          fv.rev = Math.random() < (fv.reverse || 0);
          // GAPS: decide if the NEW fragment is dropped to silence (still advances = keeps timing)
          fv.silent = Math.random() < (fv.gaps || 0);
        }
      }
    }
    // 4. Cull finished grains
    this.grains = this.grains.filter(gr => gr.remaining > 0);

    return true;
  }
}

registerProcessor('microcosm-processor', MicrocosmProcessor);
