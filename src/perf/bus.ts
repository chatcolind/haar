// PERFORMANCE BUS - the one door (docs/ARRANGE.md).
// Every parameter change reaches the core through an engine bridge function, and every bridge
// function passes here first - so mouse, APC knob and on-screen slider are captured in one place,
// addressed by orb id. Notes are captured one level up (playAt / releaseTouch) because the bridge
// only sees Hz and a note is what you edit. While a take is armed the bus keeps the log, stamped on
// the audio clock relative to the take's start; the record head writes it beside the wav.
export type PerfEvent = { t: number; k: string; id: string; v: number[]; s?: string };

let clock: () => number = () => 0;
let armedAt: number | null = null;
let log: PerfEvent[] = [];
let last: Record<string, string> = {};

export function perfClock(fn: () => number): void { clock = fn; }
export function perfArm(atAudioTime: number): void { armedAt = atAudioTime; log = []; last = {}; }
export function perfArmed(): boolean { return armedAt !== null; }
export function perfDisarm(): PerfEvent[] { const out = log; armedAt = null; log = []; last = {}; return out; }
export function perfEmit(k: string, id: string, v: number[] = [], s?: string): void {
  if (armedAt === null) return;
  const key = k + '|' + id + (s ? '|' + s : '');
  const sig = v.map(n => n.toFixed(4)).join(',');
  if (last[key] === sig) return;                 // same value again is not an event
  last[key] = sig;
  log.push({ t: clock() - armedAt, k, id, v, s });   // t < 0 = set before the take began: initial state
}
