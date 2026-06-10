'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startAudio,
  createDrone,
  stopDrone,
  setDroneNote,
  disposeDrone,
} from '@/audio/engine';

const NOTE_MAP: Record<string, number> = {
  C:0, 'C#':1, D:2, 'D#':3, E:4, F:5,
  'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11,
};

export function useAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady]     = useState(false);
  const [rootNote, setRootNote]   = useState('D');
  const [octave, setOctave]       = useState(2);
  const firstGesture              = useRef(false);

  const getFullNote = useCallback((note: string, oct: number) => {
    return `${note}${oct}`;
  }, []);

  const play = useCallback(async () => {
    if (!firstGesture.current) {
      await startAudio();
      firstGesture.current = true;
      setIsReady(true);
    }
    createDrone(getFullNote(rootNote, octave));
    setIsPlaying(true);
  }, [rootNote, octave, getFullNote]);

  const stop = useCallback(() => {
    stopDrone();
    setIsPlaying(false);
  }, []);

  const changeNote = useCallback((note: string, oct: number) => {
    setRootNote(note);
    setOctave(oct);
    if (isPlaying) {
      setDroneNote(getFullNote(note, oct));
    }
  }, [isPlaying, getFullNote]);

  useEffect(() => {
    return () => disposeDrone();
  }, []);

  return { isPlaying, isReady, rootNote, octave, play, stop, changeNote };
}
