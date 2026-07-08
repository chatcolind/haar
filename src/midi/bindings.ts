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
  | { kind: 'noterange'; channel: number; low: number; high: number; rootMidi: number }; // key zone

export type Binding = {
  id: string;                       // unique
  source: BindingSource;
  actionId: TriggerActionId | ContinuousActionId;
  param?: ActionParam;              // e.g. constellation column
  pickup?: boolean;                 // continuous only; default true
  layer?: string;                   // 'base' (default) | 'orb' | future layers; untagged fires on all layers? No — see matchesLayer
};

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
    : { actionId, kind, param } as LearnState;
  onLearnComplete = done;
}
export function cancelLearn() { learn = null; onLearnComplete = null; }
export function learnArmed(): boolean { return learn !== null; }

// ---- DISPATCH ----
function handle(m: MidiMessage) {
  // Learn intercepts everything first
  if (learn) {
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
    if (s.kind === 'note' && m.type === 'noteon' && m.channel === s.channel && m.data1 === s.note) {
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
