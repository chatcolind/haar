// src/midi/bindings.ts — BINDING ENGINE
// Matches incoming MIDI to Haar actions. Owns pickup (soft-takeover),
// persistence (localStorage), and Learn mode. Device profiles = saved binding sets.

import { midiSubscribe, type MidiMessage } from './midi';
import {
  dispatchTrigger, dispatchContinuous, readContinuous,
  type TriggerActionId, type ContinuousActionId, type ActionParam,
} from './actions';

export type BindingSource =
  | { kind: 'note'; channel: number; note: number }                        // one pad/button
  | { kind: 'cc'; channel: number; cc: number }                            // one knob/fader
  | { kind: 'noterange'; channel: number; low: number; high: number; rootMidi: number }  // key zone
  | { kind: 'gridmatrix'; channel: number; origin: number; cols: number; rows: number }; // pad rectangle: note = origin + row*cols + col (row 0 = TOP)

export type Binding = {
  id: string;                       // unique
  source: BindingSource;
  actionId: TriggerActionId | ContinuousActionId;
  param?: ActionParam;              // e.g. constellation column
  pickup?: boolean;                 // continuous only; default true
  layer?: string;                   // 'base' (default) | 'orb' | future layers; untagged fires on all layers? No — see matchesLayer
  holdActionId?: TriggerActionId;   // optional: long-press (>=500ms) fires THIS instead of actionId (tap)
  holdParam?: ActionParam;
};

// ---- TAP vs HOLD ----
// For bindings with holdActionId: note-on arms a timer; note-off <500ms = TAP (actionId);
// timer firing first = HOLD (holdActionId) and the eventual note-off is swallowed.
const HOLD_MS = 500;
const holdTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const holdFired: Record<string, boolean> = {};

// ---- LAYERS ----
// One control can mean different things per layer. The layer key itself is a
// special binding (actionId 'layer.toggle'). Continuous/trigger bindings tagged
// with a layer fire only when that layer is active; noterange (keys) bindings
// are layer-independent (the keyboard is always the conductor).
let activeLayer = 'base';
const layerListeners = new Set<(l: string) => void>();
export function getActiveLayer(): string { return activeLayer; }
export function setActiveLayer(l: string) {
  if (l === activeLayer) return;
  activeLayer = l;
  // pickup resets on layer switch so no control jumps with a stale engage
  for (const k in pickupEngaged) delete pickupEngaged[k];
  layerListeners.forEach(fn => fn(l));
}
export function onLayerChange(fn: (l: string) => void): () => void {
  layerListeners.add(fn); return () => { layerListeners.delete(fn); };
}
function matchesLayer(b: Binding): boolean {
  if (b.source.kind === 'noterange') return true;      // keys are universal
  return (b.layer ?? 'base') === activeLayer;
}

const LS_KEY = 'haar_midi_bindings_v1';
let bindings: Binding[] = [];
const pickupEngaged: Record<string, boolean> = {};

export function loadBindings(): Binding[] {
  try { bindings = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { bindings = []; }
  return bindings;
}
export function getBindings(): Binding[] { return bindings; }
export function saveBindings() { localStorage.setItem(LS_KEY, JSON.stringify(bindings)); }
export function addBinding(b: Binding) {
  // one control drives one action PER LAYER: same source may live on different layers
  bindings = bindings.filter(x => !(sameSource(x.source, b.source) && (x.layer ?? 'base') === (b.layer ?? 'base')));
  bindings.push(b); saveBindings();
}
export function removeBinding(id: string) {
  bindings = bindings.filter(b => b.id !== id); saveBindings();
}
export function replaceAll(list: Binding[]) { bindings = list; saveBindings(); }  // profile import

function sameSource(a: BindingSource, b: BindingSource): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'note' && b.kind === 'note') return a.channel === b.channel && a.note === b.note;
  if (a.kind === 'cc' && b.kind === 'cc') return a.channel === b.channel && a.cc === b.cc;
  if (a.kind === 'noterange' && b.kind === 'noterange') return a.channel === b.channel;
  return false;
}

// ---- LEARN MODE ----
// Arm with the target action; the next qualifying message becomes the binding.
// For noterange: two presses (low key, then high key) complete the zone.
type LearnState =
  | null
  | { actionId: TriggerActionId | ContinuousActionId; kind: 'trigger'|'continuous'; param?: ActionParam }
  | { actionId: 'conductor.note'; kind: 'noterange'; low?: { channel: number; note: number } };
let learn: LearnState = null;
let onLearnComplete: ((b: Binding) => void) | null = null;

export function armLearn(
  actionId: TriggerActionId | ContinuousActionId,
  kind: 'trigger'|'continuous'|'noterange',
  param: ActionParam,
  done: (b: Binding) => void,
) {
  learn = kind === 'noterange'
    ? { actionId: 'conductor.note', kind: 'noterange' }
    : kind === ('gridmatrix' as any)
    ? ({ actionId, kind: 'gridmatrix' } as any)
    : { actionId, kind, param } as LearnState;
  onLearnComplete = done;
}
export function cancelLearn() { learn = null; onLearnComplete = null; }
export function learnArmed(): boolean { return learn !== null; }

// ---- DISPATCH ----
function handle(m: MidiMessage) {
  // Learn intercepts everything first
  if (learn) {
    if ((learn as any).kind === 'gridmatrix') {
      if (m.type !== 'noteon') return;
      const L: any = learn;
      if (!L.first) { L.first = { channel: m.channel, note: m.data1 }; return; }   // TOP-LEFT pad
      if (m.channel !== L.first.channel) return;
      // APC grid: note 0 bottom-left, row*8+col upward. TOP-LEFT press has the HIGHER note.
      const tl = L.first.note, br = m.data1;
      const cols = (br % 8) - (tl % 8) + 1;
      const rows = Math.floor(tl / 8) - Math.floor(br / 8) + 1;
      if (cols < 1 || rows < 1) return;   // presses out of order/shape — ignore, keep waiting
      const b: Binding = {
        id: 'b' + Date.now(),
        source: { kind: 'gridmatrix', channel: L.first.channel, origin: tl, cols, rows },
        actionId: 'grid.matrix' as any,
      };
      addBinding(b); onLearnComplete?.(b); learn = null; onLearnComplete = null;
      return;
    }
    if (learn.kind === 'noterange') {
      if (m.type !== 'noteon') return;
      if (!('low' in learn) || !learn.low) {
        (learn as any).low = { channel: m.channel, note: m.data1 };  // first press = low end
        return;
      }
      const lo = (learn as any).low;
      if (m.channel !== lo.channel) return;
      const low = Math.min(lo.note, m.data1), high = Math.max(lo.note, m.data1);
      const b: Binding = {
        id: 'b' + Date.now(),
        source: { kind: 'noterange', channel: lo.channel, low, high, rootMidi: 60 },
        actionId: 'conductor.note',
      };
      addBinding(b); onLearnComplete?.(b); learn = null; onLearnComplete = null;
      return;
    }
    const src: BindingSource | null =
      learn.kind === 'trigger' && m.type === 'noteon' ? { kind: 'note', channel: m.channel, note: m.data1 }
      : learn.kind === 'continuous' && m.type === 'cc' ? { kind: 'cc', channel: m.channel, cc: m.data1 }
      : null;
    if (!src) return;
    const b: Binding = { id: 'b' + Date.now(), source: src, actionId: learn.actionId, param: (learn as any).param, pickup: learn.kind === 'continuous' ? true : undefined, layer: activeLayer };
    addBinding(b); onLearnComplete?.(b); learn = null; onLearnComplete = null;
    return;
  }

  // Normal dispatch
  for (const b of bindings) {
    const s = b.source;
    if (!matchesLayer(b) && (b.actionId as string) !== 'layer.toggle') continue;
    if (s.kind === 'note' && (m.type === 'noteon' || m.type === 'noteoff') && m.channel === s.channel && m.data1 === s.note) {
      if (b.holdActionId) {
        if (m.type === 'noteon') {
          holdFired[b.id] = false;
          holdTimers[b.id] = setTimeout(() => {
            holdFired[b.id] = true;
            dispatchTrigger(b.holdActionId as TriggerActionId, b.holdParam ?? b.param);
          }, HOLD_MS);
        } else {
          clearTimeout(holdTimers[b.id]);
          if (!holdFired[b.id]) dispatchTrigger(b.actionId as TriggerActionId, b.param);  // quick release = TAP
        }
        continue;
      }
      if (m.type !== 'noteon') continue;   // plain bindings: noteon only, as before
      if ((b.actionId as string) === 'layer.toggle') { setActiveLayer(activeLayer === 'base' ? 'orb' : 'base'); continue; }
      dispatchTrigger(b.actionId as TriggerActionId, b.param);
    } else if (s.kind === 'cc' && m.type === 'cc' && m.channel === s.channel && m.data1 === s.cc) {
      const v = m.data2 / 127;
      if (b.pickup !== false) {
        const cur = readContinuous(b.actionId as ContinuousActionId, b.param);
        if (!pickupEngaged[b.id]) {
          if (Math.abs(v - cur) > 0.04) continue;
          pickupEngaged[b.id] = true;
        }
      }
      dispatchContinuous(b.actionId as ContinuousActionId, v, b.param);
    } else if (s.kind === 'gridmatrix' && (m.type === 'noteon' || m.type === 'noteoff') && m.channel === s.channel) {
      // origin = TOP-LEFT note. APC notes grow upward, so visual row r (0=top) sits at note origin - r*8.
      const col = (m.data1 % 8) - (s.origin % 8);
      const vrow = Math.floor(s.origin / 8) - Math.floor(m.data1 / 8);
      if (col < 0 || col >= s.cols || vrow < 0 || vrow >= s.rows) continue;   // outside the rectangle
      const key = b.id + ':' + m.data1;
      if (m.type === 'noteon') {
        holdFired[key] = false;
        holdTimers[key] = setTimeout(() => {
          holdFired[key] = true;
          // HOLD: row 0 = mute whole constellation, rows 1+ = mute that orb
          if (vrow === 0) dispatchTrigger('const.mute', col);
          else dispatchTrigger('orb.muteToggle' as TriggerActionId, { col, row: vrow - 1 });
        }, HOLD_MS);
      } else {
        clearTimeout(holdTimers[key]);
        if (!holdFired[key]) {
          // TAP: row 0 = select constellation, rows 1+ = select that orb (comes to the front)
          if (vrow === 0) dispatchTrigger('const.select' as TriggerActionId, col);
          else dispatchTrigger('orb.select', { col, row: vrow - 1 });
        }
      }
    } else if (s.kind === 'noterange' && m.type === 'noteon' && m.channel === s.channel
               && m.data1 >= s.low && m.data1 <= s.high) {
      dispatchTrigger('conductor.note', m.data1 - s.rootMidi);  // semis from zone root; absolute-key handling stays in the handler
    }
  }
}

let wired = false;
export function startBindingEngine() {
  if (wired) return;
  wired = true;
  loadBindings();
  midiSubscribe(handle);
}
