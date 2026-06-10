'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startAudio, initEngine, teardown,
  startFree, stopFreeNote,
  startBeat, startArp, updateArpNotes,
  updateShape, changeLiveNote, changeOscillator, setTransportBpm,
  disposeDrone, muteEffect, removeEffect, syncChain,
  updateEffectDotLive, updateEffectDotRelease,
} from '@/audio/engine';

export type TriggerMode = 'FREE' | 'BEAT' | 'ARP';

export function useAudio() {
  const [isPlaying, setIsPlaying]     = useState(false);
  const [oscType, setOscType]           = useState('sine');
  const [rootNote, setRootNote]       = useState('D');
  const [octave, setOctave]           = useState(2);
  const [shape, setShape]             = useState(0.85);
  const [triggerMode, setTriggerModeState] = useState<TriggerMode>('FREE');

  const firstGesture  = useRef(false);
  const lastLive      = useRef<Record<number, number>>({});
  const modeRef       = useRef<TriggerMode>('FREE');
  const noteRef       = useRef('D2');
  const shapeRef      = useRef(0.85);
  const arpConfigRef  = useRef({ scale:'Dorian', steps:4, pattern:'Up', stepRate:'16n', bpm:110 });

  const getNote = (n: string, o: number) => `${n}${o}`;

  // ── Play — first press only ───────────────────────────────────────────────
  const play = useCallback(async (config?: {
    scale?: string; steps?: number; pattern?: string;
    stepRate?: string; bpm?: number;
  }) => {
    if (!firstGesture.current) {
      await startAudio();
      firstGesture.current = true;
    }
    if (config) arpConfigRef.current = { ...arpConfigRef.current, ...config };

    const note = getNote(rootNote, octave);
    initEngine(note, shape);

    if (modeRef.current === 'FREE') {
      startFree(note, shapeRef.current, arpConfigRef.current.bpm);
    } else if (modeRef.current === 'BEAT') {
      startBeat(note, shape, arpConfigRef.current.stepRate, arpConfigRef.current.bpm);
    } else if (modeRef.current === 'ARP') {
      startArp({ rootNote, octave, shape, ...arpConfigRef.current });
    }
    setIsPlaying(true);
  }, [rootNote, octave, shape]);

  // ── Stop — full teardown ──────────────────────────────────────────────────
  const stop = useCallback(() => {
    teardown();
    setIsPlaying(false);
  }, []);

  // ── Switch mode LIVE — no stop ────────────────────────────────────────────
  const setTriggerMode = useCallback((mode: TriggerMode) => {
    modeRef.current = mode;
    setTriggerModeState(mode);
    if (!isPlaying) return;

    const note = noteRef.current;
    if (mode === 'FREE') {
      startFree(note, shapeRef.current, arpConfigRef.current.bpm);
    } else if (mode === 'BEAT') {
      startBeat(note, shapeRef.current, arpConfigRef.current.stepRate, arpConfigRef.current.bpm);
    } else if (mode === 'ARP') {
      const [n, o] = [note.slice(0, -1), parseInt(note.slice(-1))];
      startArp({ rootNote: n, octave: o, shape: shapeRef.current, ...arpConfigRef.current });
    }
  }, [isPlaying]);

  // ── Update arp config live ────────────────────────────────────────────────
  const updateArpConfig = useCallback((config: Partial<typeof arpConfigRef.current>) => {
    arpConfigRef.current = { ...arpConfigRef.current, ...config };
    if (!isPlaying) return;
    const note = noteRef.current;
    if (modeRef.current === 'ARP') {
      const [n, o] = [note.slice(0, -1), parseInt(note.slice(-1))];
      updateArpNotes({ rootNote: n, octave: o, shape: shapeRef.current, ...arpConfigRef.current });
    } else if (modeRef.current === 'BEAT') {
      startBeat(note, shapeRef.current, arpConfigRef.current.stepRate, arpConfigRef.current.bpm);
    }
  }, [isPlaying]);

  // ── Change note live ──────────────────────────────────────────────────────
  const changeNote = useCallback((note: string, oct: number) => {
    setRootNote(note);
    setOctave(oct);
    noteRef.current = getNote(note, oct);
    if (!isPlaying) return;
    changeLiveNote(getNote(note, oct), modeRef.current);
    // If ARP, rebuild notes with new root
    if (modeRef.current === 'ARP') {
      updateArpNotes({ rootNote: note, octave: oct, shape: shapeRef.current, ...arpConfigRef.current });
    }
    // If BEAT, update the note ref — next trigger picks it up
    if (modeRef.current === 'BEAT') {
      startBeat(getNote(note, oct), shapeRef.current, arpConfigRef.current.stepRate, arpConfigRef.current.bpm);
    }
  }, [isPlaying]);

  // ── Change shape live ─────────────────────────────────────────────────────
  const changeShape = useCallback((newShape: number) => {
    setShape(newShape);
    shapeRef.current = newShape;
    if (!isPlaying) return;
    updateShape(newShape, noteRef.current, modeRef.current);
    // Update beat/arp duration live
    if (modeRef.current === 'BEAT') {
      startBeat(noteRef.current, newShape, arpConfigRef.current.stepRate, arpConfigRef.current.bpm);
    }
    if (modeRef.current === 'ARP') {
      const note = noteRef.current;
      const [n, o] = [note.slice(0, -1), parseInt(note.slice(-1))];
      updateArpNotes({ rootNote: n, octave: o, shape: newShape, ...arpConfigRef.current });
    }
  }, [isPlaying]);

  // ── Effects ───────────────────────────────────────────────────────────────
  const syncChainModules = useCallback((modules: {
    id: number; name: string; muted: boolean;
    dotX: number; dotY: number; level: number;
  }[]) => {
    if (!isPlaying) return;
    syncChain(modules);
  }, [isPlaying]);

  const onDotMove = useCallback((id: number, x: number, y: number) => {
    if (!isPlaying) return;
    const now = Date.now();
    if (now - (lastLive.current[id] || 0) < 33) return;
    lastLive.current[id] = now;
    updateEffectDotLive(id, x, y);
  }, [isPlaying]);

  const onDotRelease = useCallback((id: number, x: number, y: number) => {
    if (!isPlaying) return;
    updateEffectDotRelease(id, x, y);
  }, [isPlaying]);

  const onMuteEffect   = useCallback((id: number, muted: boolean) => muteEffect(id, muted), []);
  const onRemoveEffect = useCallback((id: number) => removeEffect(id), []);

  useEffect(() => () => disposeDrone(), []);

  return {
    isPlaying, rootNote, octave, shape, triggerMode, oscillator: oscType,
    changeOscillator: (type: string) => { setOscType(type); changeOscillator(type); },
    setBpm: (bpm: number) => { arpConfigRef.current.bpm = bpm; setTransportBpm(bpm); },
    play, stop,
    changeNote, changeShape, setTriggerMode, updateArpConfig,
    syncChainModules, onDotMove, onDotRelease,
    onMuteEffect, onRemoveEffect,
  };
}
