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
        // startSamp is interpreted as "samples behind the current write head".
        // This keeps reads in recent, safe audio and never crosses the write
        // head (which would cause a discontinuity = pop).
        const behind = m.startSamp;
        let pos = this.writePos - behind;
        while (pos < 0) pos += this.size;
        this.grains.push({
          pos,
          source: m.source || 'default',   // which source buffer this grain reads (constellation)
          engine: m.engine || '_',
          rate: m.rate,
          remaining: m.lenSamp,
          total: m.lenSamp,
          gain: m.gain,
          panL: Math.cos((Math.max(-1, Math.min(1, m.pan + (this.enginePan[m.engine] || 0))) + 1) * 0.25 * Math.PI),
          panR: Math.sin((Math.max(-1, Math.min(1, m.pan + (this.enginePan[m.engine] || 0))) + 1) * 0.25 * Math.PI),
          // safety margin: how many samples of headroom before the write head
          maxRead: behind,
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
      } else if (m.type === 'removeSource') {
        if (m.id && m.id !== 'default') delete this.sources[m.id];
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
        // accumulate this grain's PANNED contribution into its engine's L/R bus
        panAccL[eng] = (panAccL[eng] || 0) + sMono * gr.panL;
        panAccR[eng] = (panAccR[eng] || 0) + sMono * gr.panR;
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
    }
    // 4. Cull finished grains
    this.grains = this.grains.filter(gr => gr.remaining > 0);

    return true;
  }
}

registerProcessor('microcosm-processor', MicrocosmProcessor);
