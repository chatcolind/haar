// RENDER - the offline mixdown. The same desk, the same cuts, the same ramps as Song play, run through an
// OfflineAudioContext (no speakers, faster than real time) and returned as stereo samples for the wav writer.
import { TapeMixer, type TrackMix, type MasterMix, type FxMix } from './tapeMixer';
import { cutBlocks, type Cut, type CutTrack } from './cuts';

export type RenderArgs = { tracks: CutTrack[]; bufs: Record<string, AudioBuffer | undefined>; mixes: TrackMix[]; master: MasterMix; fx: FxMix; bpm: number; spb: number; tailSec?: number; sampleRate?: number };
export type Rendered = { L: Float32Array; R: Float32Array; sampleRate: number; seconds: number };

// one cut as a player - mirrors microcosm.tapePlay: loop, gain, fades as ramps on the block's own gain node
export function playCut(ctx: BaseAudioContext, input: AudioNode, c: Cut): void {
  const src = ctx.createBufferSource(); src.buffer = c.buf;
  if (c.loopSec && c.loopSec > 0) { src.loop = true; src.loopStart = 0; src.loopEnd = c.loopSec; }
  const g = ctx.createGain(); src.connect(g); g.connect(input);
  const at = Math.max(c.at, ctx.currentTime);
  if (c.fadeIn > 0.005) { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, c.gain), at + c.fadeIn); } else g.gain.setValueAtTime(c.gain, at);
  if (c.dur > 0 && c.fadeOut > 0.005) { const fo = Math.min(c.fadeOut, c.dur); g.gain.setValueAtTime(c.gain, at + c.dur - fo); g.gain.exponentialRampToValueAtTime(0.0001, at + c.dur); }
  src.start(at, c.offset);
  if (c.dur > 0) src.stop(at + c.dur);
}

// the last bar any block reaches
export function songEndBar(tracks: CutTrack[]): number {
  let end = 0;
  for (const t of tracks) for (const b of t.blocks) end = Math.max(end, b.startBar + b.lenBars);
  return end;
}

export async function renderSong(a: RenderArgs): Promise<Rendered | null> {
  const endBar = songEndBar(a.tracks); if (endBar <= 0) return null;
  const sr = a.sampleRate ?? Object.values(a.bufs).find(Boolean)?.sampleRate ?? 48000;
  const seconds = endBar * a.spb + (a.tailSec ?? 3);   // room for the reverb and delay to die
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const mixer = new TapeMixer(ctx, Math.max(16, a.tracks.length), a.bpm);
  a.mixes.forEach((m, i) => mixer.setTrack(i, m)); mixer.setMaster(a.master); mixer.setFx(a.fx, a.bpm);
  const cuts = cutBlocks(a.tracks, a.bufs, 0, endBar, 0, a.spb);
  for (const c of cuts) playCut(ctx, mixer.channel(c.track).input, c);
  const out = await ctx.startRendering();
  let peak = 0; const l0 = out.getChannelData(0); for (let i = 0; i < l0.length; i += 16) peak = Math.max(peak, Math.abs(l0[i]));
  console.log('[render]', cuts.length, 'cuts ·', endBar, 'bars · peak', peak.toFixed(3));
  return { L: out.getChannelData(0), R: out.getChannelData(1), sampleRate: sr, seconds };
}
