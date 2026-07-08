// src/midi/actions.ts — HAAR ACTION REGISTRY
// Haar's performable verbs, protocol-agnostic. MIDI/OSC/anything binds to THESE,
// never to Haar internals. page.tsx registers handlers; binding engines dispatch.

export type TriggerActionId =
  | 'conductor.note'      // param: semis offset within the bound range (special: fed by noterange bindings)
  | 'const.mute'          // param: constellation column index 0-7
  | 'orb.select'          // param: { col, row } orb matrix position
  | 'chords.engage'
  | 'chords.release'
  | 'master.stop'
  | 'scale.toggle'        // scale-lock on/off live
  | 'const.freeze'        // param: constellation column index
  | 'layer.toggle'        // hardware layer key: base <-> orb (handled inside the binding engine)
  | 'fauve.toggle'        // focused orb: Fauve on/off (WAV-sample orbs only, same guard as the screen button)
  | 'flavour.cycle'       // focused orb: step to the next flavour palette (wraps)
  | 'transport.playpause' // toggle play/stop
  | 'conductor.octaveUp'
  | 'conductor.octaveDown';

export type ContinuousActionId =
  | 'const.level'         // param: constellation column index 0-7, value 0..1
  | 'master.level'        // value 0..1
  | 'orb.x' | 'orb.y'     // selected orb XY, value 0..1
  | 'orb.density'         // selected orb, value 0..1
  | 'flavour.amount'      // focused orb: flavour amount 0..1
  | 'fauve.disorder' | 'fauve.repeat' | 'fauve.reverse' | 'fauve.gaps'; // selected orb

export type ActionParam = number | { col: number; row: number } | undefined;

export type ActionHandlers = {
  trigger: (id: TriggerActionId, param?: ActionParam) => void;
  continuous: (id: ContinuousActionId, value: number, param?: ActionParam) => void;
  // continuous state read-back: pickup needs "where is this value now?"
  readContinuous: (id: ContinuousActionId, param?: ActionParam) => number;
};

let handlers: ActionHandlers | null = null;

/** page.tsx calls this once with its real implementations. */
export function registerActionHandlers(h: ActionHandlers) { handlers = h; }

export function dispatchTrigger(id: TriggerActionId, param?: ActionParam) {
  handlers?.trigger(id, param);
}
export function dispatchContinuous(id: ContinuousActionId, value: number, param?: ActionParam) {
  handlers?.continuous(id, value, param);
}
export function readContinuous(id: ContinuousActionId, param?: ActionParam): number {
  return handlers ? handlers.readContinuous(id, param) : 0;
}

/** Human-readable catalogue for the Learn UI. */
export const ACTION_CATALOGUE: { id: TriggerActionId | ContinuousActionId; kind: 'trigger'|'continuous'|'noterange'; label: string; perColumn?: boolean }[] = [
  { id: 'conductor.note', kind: 'noterange',  label: 'Keys → Conductor' },
  { id: 'layer.toggle',   kind: 'trigger',    label: 'Layer key (base ↔ orb)' },
  { id: 'const.mute',     kind: 'trigger',    label: 'Constellation mute', perColumn: true },
  { id: 'const.level',    kind: 'continuous', label: 'Constellation level', perColumn: true },
  { id: 'master.level',   kind: 'continuous', label: 'Master level' },
  { id: 'transport.playpause', kind: 'trigger', label: 'Play / pause' },
  { id: 'conductor.octaveUp',  kind: 'trigger', label: 'Octave up' },
  { id: 'conductor.octaveDown', kind: 'trigger', label: 'Octave down' },
  { id: 'chords.engage',  kind: 'trigger',    label: 'Chords ENGAGE' },
  { id: 'chords.release', kind: 'trigger',    label: 'Chords RELEASE' },
  { id: 'master.stop',    kind: 'trigger',    label: 'Master stop' },
  { id: 'scale.toggle',   kind: 'trigger',    label: 'Scale-lock toggle' },
  { id: 'const.freeze',   kind: 'trigger',    label: 'Freeze constellation', perColumn: true },
  { id: 'orb.select',     kind: 'trigger',    label: 'Select orb (grid)', perColumn: true },
  { id: 'orb.x',          kind: 'continuous', label: 'Orb: spread X' },
  { id: 'orb.y',          kind: 'continuous', label: 'Orb: pitch spread Y' },
  { id: 'orb.density',    kind: 'continuous', label: 'Orb: density' },
  { id: 'flavour.cycle',  kind: 'trigger',    label: 'Flavour · next' },
  { id: 'flavour.amount', kind: 'continuous', label: 'Flavour · amount' },
  { id: 'fauve.toggle',   kind: 'trigger',    label: 'Fauve on / off' },
  { id: 'fauve.disorder', kind: 'continuous', label: 'Fauve: disorder' },
  { id: 'fauve.repeat',   kind: 'continuous', label: 'Fauve: repeat' },
  { id: 'fauve.reverse',  kind: 'continuous', label: 'Fauve: reverse' },
  { id: 'fauve.gaps',     kind: 'continuous', label: 'Fauve: gaps' },
];
