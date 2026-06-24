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

    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'grain') {
        // spawn a grain reader
        this.grains.push({
          // position in ring (samples), playback rate, length (samples), gain, pan
          pos: m.startSamp,
          rate: m.rate,
          remaining: m.lenSamp,
          total: m.lenSamp,
          gain: m.gain,
          panL: Math.cos((m.pan + 1) * 0.25 * Math.PI),
          panR: Math.sin((m.pan + 1) * 0.25 * Math.PI),
          age: 0,
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

    // 3. Render active grains (linear interp read, raised-cosine window)
    for (let g = 0; g < this.grains.length; g++) {
      const gr = this.grains[g];
      for (let i = 0; i < n; i++) {
        if (gr.remaining <= 0) break;
        // raised-cosine amplitude window over the grain's life
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (gr.total - gr.remaining) / gr.total);
        // linear interpolation read
        const p = gr.pos;
        const i0 = Math.floor(p) % this.size;
        const i1 = (i0 + 1) % this.size;
        const frac = p - Math.floor(p);
        const s = (this.ring[i0] * (1 - frac) + this.ring[i1] * frac) * gr.gain * w;
        outL[i] += s * gr.panL;
        outR[i] += s * gr.panR;
        gr.pos += gr.rate;
        if (gr.pos >= this.size) gr.pos -= this.size;
        if (gr.pos < 0) gr.pos += this.size;
        gr.remaining--;
      }
    }
    // 4. Cull finished grains
    this.grains = this.grains.filter(gr => gr.remaining > 0);

    return true;
  }
}

registerProcessor('microcosm-processor', MicrocosmProcessor);
