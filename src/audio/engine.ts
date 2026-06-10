import * as Tone from 'tone';

let synth: Tone.PolySynth | null = null;
let gainNode: Tone.Gain | null = null;
let isStarted = false;

export async function startAudio(): Promise<void> {
  await Tone.start();
  isStarted = true;
}

export function isAudioStarted(): boolean {
  return isStarted;
}

export function createDrone(note: string): void {
  stopDrone();

  gainNode = new Tone.Gain(1).toDestination();

  synth = new Tone.PolySynth(Tone.FMSynth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 4, decay: 0.1, sustain: 1, release: 8 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 6, decay: 0.1, sustain: 1, release: 8 },
    modulationIndex: 2,
    harmonicity: 1.005,
  }).connect(gainNode);

  synth.set({ detune: (Math.random() - 0.5) * 8 });
  synth.triggerAttack([note]);
}

export function stopDrone(): void {
  if (gainNode) {
    // Ramp gain to zero over 80ms — instant to the ear, no click
    gainNode.gain.rampTo(0, 0.08);
    const g = gainNode;
    const s = synth;
    setTimeout(() => {
      s?.dispose();
      g?.dispose();
    }, 200);
    gainNode = null;
    synth = null;
  }
}

export function setDroneNote(note: string): void {
  if (!synth) return;
  const voices = (synth as any)._voices ?? [];
  const activeNotes = voices.map((v: any) => v._note).filter(Boolean);
  if (activeNotes.length > 0) {
    synth.triggerRelease(activeNotes);
  }
  setTimeout(() => {
    synth?.triggerAttack([note]);
  }, 800);
}

export function disposeDrone(): void {
  stopDrone();
}
