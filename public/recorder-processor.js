// HAAR RECORDER - a tape machine with one button. STEREO, UNTOUCHED.
// Copies its input verbatim - both channels - for exactly the samples asked.
// No fold, no gain, no processing of any kind. The print IS the recording.
class HaarRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufL = null; this.bufR = null;
    this.wp = 0;
    this.want = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'start') {
        this.asked = Math.max(1, d.lenSamp);
        this.exact = !!d.exact;                       // BAR-TRUE: exactly asked samples back, no splice, no headroom
        this.startFrame = d.startFrame || 0;          // BAR-TRUE: hold the head until this sample-clock frame
        this.want = this.exact ? this.asked : this.asked + Math.floor(sampleRate * 0.03);   // headroom for zero-cross splice
        this.bufL = new Float32Array(this.want);
        this.bufR = new Float32Array(this.want);
        this.wp = 0;
        console.log('[recorder] rolling -', (this.want / sampleRate).toFixed(2), 's stereo');
      }
      if (d.type === 'stop') { this.bufL = null; this.bufR = null; this.wp = 0; this.want = 0; }
    };
  }
  process(inputs) {
    if (!this.bufL) return true;
    const inp = inputs[0];
    if (!inp || !inp[0]) return true;
    const L = inp[0], R = inp[1] || inp[0];
    let i0 = 0;
    if (this.startFrame > currentFrame) {                   // the bar has not arrived
      if (this.startFrame >= currentFrame + L.length) return true;
      i0 = this.startFrame - currentFrame;                  // it falls inside this block: start on that sample
    }
    for (let i = i0; i < L.length && this.wp < this.want; i++) {
      this.bufL[this.wp] = L[i];
      this.bufR[this.wp] = R[i];
      this.wp++;
    }
    if (this.wp >= this.want) {
      const rawL = this.bufL, rawR = this.bufR, asked = this.asked;
      this.bufL = null; this.bufR = null; this.wp = 0; this.want = 0; this.asked = 0;
      if (this.exact) {                                     // BAR-TRUE: hand back exactly what was asked, verbatim
        this.exact = false; this.startFrame = 0;
        this.port.postMessage({ type: 'done', bufL: rawL.buffer, bufR: rawR.buffer, len: rawL.length }, [rawL.buffer, rawR.buffer]);
        console.log('[recorder] bar-true take complete -', rawL.length, 'samples verbatim');
        return true;
      }
      // ZERO-CROSS SPLICE (the razor law): start at the first upward zero crossing,
      // end at the last upward crossing within reach - the join meets at zero, no pop.
      // Every sample BETWEEN the cuts is verbatim.
      let st = 0;
      for (let i = 1; i < rawL.length - asked; i++) {
        if (rawL[i - 1] <= 0 && rawL[i] > 0) { st = i; break; }
      }
      let en = Math.min(st + asked, rawL.length);
      for (let i = en; i > st + 16; i--) {
        if (rawL[i - 1] <= 0 && rawL[i] > 0) { en = i; break; }
      }
      const oL = rawL.slice(st, en), oR = rawR.slice(st, en);
      this.port.postMessage({ type: 'done', bufL: oL.buffer, bufR: oR.buffer, len: oL.length }, [oL.buffer, oR.buffer]);
      console.log('[recorder] take complete - spliced at zero crossings,', oL.length, 'samples verbatim');
    }
    return true;
  }
}
registerProcessor('haar-recorder', HaarRecorder);
