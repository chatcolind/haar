// src/midi/apcFeedback.ts — APC Key 25 LED feedback
// Translates Haar state -> pad lights. Device-specific by nature; the ONLY
// file that knows the APC's colour palette and grid layout. Haar core stays clean.

import { midiGetOutput } from './midi';
import { getBindings } from './bindings';

// mk1 palette: 0 off, 1 green, 2 green-blink, 3 red, 4 red-blink, 5 yellow, 6 yellow-blink

export type FeedbackSnapshot = {
  // one entry per live constellation column, in column order
  columns: { muted: boolean }[];
};

/** Repaint pads bound to const.mute using the current snapshot. */
export function apcPaint(snap: FeedbackSnapshot) {
  const out = midiGetOutput('APC');
  if (!out) return;
  // light exactly the pads the USER bound to const.mute — the profile drives the lights
  const muteBindings = getBindings().filter(b => b.actionId === 'const.mute' && b.source.kind === 'note');
  for (const b of muteBindings) {
    const col = typeof b.param === 'number' ? b.param : -1;
    const src = b.source as { kind: 'note'; channel: number; note: number };
    const st = snap.columns[col];
    const color = !st ? 0 : st.muted ? 3 : 1;   // no constellation: dark · muted: red · playing: green
    out.send([0x90 | (src.channel & 0x0f), src.note, color]);
  }
}

/** Turn off every pad we manage (on unload/reset). */
export function apcDark() {
  const out = midiGetOutput('APC');
  if (!out) return;
  const muteBindings = getBindings().filter(b => b.actionId === 'const.mute' && b.source.kind === 'note');
  for (const b of muteBindings) {
    const src = b.source as { kind: 'note'; channel: number; note: number };
    out.send([0x90 | (src.channel & 0x0f), src.note, 0]);
  }
}
