// CUTS - the arranger's maths with no audio in it: which slice of each block plays, when, at what gain, with
// what fades. The live tape and the offline mixdown both read the same list, so they can never disagree.
export type CutBlock = { id: string; startBar: number; lenBars: number; offset?: number; srcBars?: number; gain?: number; fadeIn?: number; fadeOut?: number };
export type CutTrack = { mute?: boolean; solo?: boolean; blocks: CutBlock[] };
export type Cut = { buf: AudioBuffer; at: number; gain: number; offset: number; dur: number; loopSec?: number; fadeIn: number; fadeOut: number; track: number };

export function cutBlocks(tracks: CutTrack[], bufs: Record<string, AudioBuffer | undefined>, fromBar: number, toBar: number, t0: number, spb: number): Cut[] {
  const out: Cut[] = [];
  const anySolo = tracks.some(t => t.solo);
  tracks.forEach((t, ti) => {
    if (t.mute || (anySolo && !t.solo)) return;
    for (const b of t.blocks) {
      const buf = bufs[b.id]; if (!buf) continue;
      const bs = b.startBar, be = b.startBar + b.lenBars;
      const s0 = Math.max(bs, fromBar), e0 = Math.min(be, toBar);
      if (e0 <= s0) continue;
      const loopSec = b.srcBars && b.srcBars < b.lenBars + (b.offset || 0) ? b.srcBars * spb : undefined;   // needs to go round: loop the source
      let offset = ((b.offset || 0) + (s0 - bs)) * spb; if (loopSec) offset = offset % loopSec;
      // the block's own voice: gain in dB, fades in bars - trimmed when the region starts inside the block or ends before its end
      const gain = Math.pow(10, (b.gain ?? 0) / 20);
      const fadeIn = Math.max(0, (b.fadeIn ?? 0) - (s0 - bs)) * spb;
      const fadeOut = (e0 >= be - 1e-6) ? Math.min(b.fadeOut ?? 0, e0 - s0) * spb : 0;
      out.push({ buf, at: t0 + (s0 - fromBar) * spb, gain, offset, dur: (e0 - s0) * spb, loopSec, fadeIn, fadeOut, track: ti });
    }
  });
  return out;
}
