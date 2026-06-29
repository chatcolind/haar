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
    this.ring = new Float32Array(this.size);
    this.writePos = 0;
    this.frozen = false;        // HOLD — stop writing, keep reading
    this.recording = true;

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
        this.frozen = m.value;
        this.recording = !m.value;
      } else if (m.type === 'clearGrains') {
        this.grains.length = 0;
      } else if (m.type === 'config') {
        if (typeof m.recording === 'boolean') this.recording = m.recording;
      }
    };
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

      for (let g = 0; g < this.grains.length; g++) {
        const gr = this.grains[g];
        if (gr.remaining <= 0) continue;
        const phase = (gr.total - gr.remaining) / gr.total;
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
        const p = gr.pos;
        const i0 = Math.floor(p) % this.size;
        const i1 = (i0 + 1) % this.size;
        const frac = p - Math.floor(p);
        const sMono = (this.ring[i0] * (1 - frac) + this.ring[i1] * frac) * gr.gain * w;
        const eng = gr.engine || '_';
        // accumulate this grain's PANNED contribution into its engine's L/R bus
        panAccL[eng] = (panAccL[eng] || 0) + sMono * gr.panL;
        panAccR[eng] = (panAccR[eng] || 0) + sMono * gr.panR;
        // advance grain
        gr.pos += gr.rate;
        if (gr.pos >= this.size) gr.pos -= this.size;
        if (gr.pos < 0) gr.pos += this.size;
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
    }
    // 4. Cull finished grains
    this.grains = this.grains.filter(gr => gr.remaining > 0);

    return true;
  }
}

registerProcessor('microcosm-processor', MicrocosmProcessor);
