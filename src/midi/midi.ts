// src/midi/midi.ts — Web MIDI access layer
// Requests MIDI access, tracks connected devices, fans out incoming
// messages to subscribers. No mapping logic lives here — this is the pipe.

export type MidiMessage = {
  deviceName: string;
  status: number;      // raw status byte
  type: 'noteon' | 'noteoff' | 'cc' | 'other';
  channel: number;     // 0-15
  data1: number;       // note number or CC number
  data2: number;       // velocity or CC value
  ts: number;          // performance.now() timestamp
};

type Listener = (m: MidiMessage) => void;

let access: MIDIAccess | null = null;
const listeners = new Set<Listener>();

function parse(deviceName: string, data: Uint8Array, ts: number): MidiMessage {
  const status = data[0] ?? 0;
  const hi = status & 0xf0;
  const channel = status & 0x0f;
  const data1 = data[1] ?? 0;
  const data2 = data[2] ?? 0;
  let type: MidiMessage['type'] = 'other';
  if (hi === 0x90 && data2 > 0) type = 'noteon';
  else if (hi === 0x80 || (hi === 0x90 && data2 === 0)) type = 'noteoff';
  else if (hi === 0xb0) type = 'cc';
  return { deviceName, status, type, channel, data1, data2, ts };
}

let _lastKey = '';
function wireInputs() {
  if (!access) return;
  access.inputs.forEach(input => {
    input.onmidimessage = (e: MIDIMessageEvent) => {
      if (!e.data) return;
      const d = new Uint8Array(e.data);
      // Dedupe: identical bytes at identical timestamp = duplicate port delivery, not a real event
      const key = e.timeStamp + ':' + d.join(',');
      if (key === _lastKey) return;
      _lastKey = key;
      const msg = parse(input.name ?? 'unknown', d, e.timeStamp);
      listeners.forEach(fn => fn(msg));
    };
  });
}

/** Request Web MIDI access (idempotent). Returns device names or null if unavailable/denied. */
export async function midiInit(): Promise<{ inputs: string[]; outputs: string[] } | null> {
  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) return null;
  try {
    if (!access) {
      access = await navigator.requestMIDIAccess({ sysex: false });
      access.onstatechange = () => wireInputs(); // re-wire on hot-plug
    }
    wireInputs();
    return {
      inputs: [...access.inputs.values()].map(i => i.name ?? 'unknown'),
      outputs: [...access.outputs.values()].map(o => o.name ?? 'unknown'),
    };
  } catch {
    return null;
  }
}

/** Subscribe to all incoming MIDI messages. Returns an unsubscribe fn. */
export function midiSubscribe(fn: Listener): () => void {
  listeners.add(fn);
  console.log('[midi] listeners now:', listeners.size);
  return () => { listeners.delete(fn); };
}

/** Get an output port by (partial) name — for RGB pad feedback later. */
export function midiGetOutput(nameContains: string): MIDIOutput | null {
  if (!access) return null;
  for (const o of access.outputs.values()) {
    if ((o.name ?? '').toLowerCase().includes(nameContains.toLowerCase())) return o;
  }
  return null;
}

/** TEST: sweep the APC grid — lights all 40 pads with ascending velocity (colour) values.
 *  Grid notes 0-39, bottom-left = 0 on APC Key 25. Throwaway diagnostic. */
export function midiTestGridSweep() {
  const out = midiGetOutput('APC');
  if (!out) { console.log('[midi] no APC output found'); return; }
  for (let n = 0; n < 40; n++) {
    out.send([0x90, n, (n % 6) + 1]);  // ch0 note-on, velocity cycles 1-6
  }
  console.log('[midi] grid sweep sent');
}

/** Clear all 40 grid pads (velocity 0 = off). */
export function midiGridClear() {
  const out = midiGetOutput('APC');
  if (!out) return;
  for (let n = 0; n < 40; n++) out.send([0x90, n, 0]);
}

/** Set one grid pad. col 0-7 (left-right), row 0-4 (bottom-top), color: 0 off, 1 green, 2 green-blink, 3 red, 4 red-blink, 5 yellow, 6 yellow-blink. */
export function midiGridSet(col: number, row: number, color: number) {
  const out = midiGetOutput('APC');
  if (!out) return;
  out.send([0x90, row * 8 + col, color]);
}
