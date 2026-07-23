'use client';

import { useState, useEffect, useRef } from 'react';
import Orb, { ORB_COLORS } from '../../components/field/Orb';
import { midiInit, midiSubscribe, midiTestGridSweep, midiGridClear, midiGridSet, midiGetOutput, type MidiMessage } from '../../midi/midi';
import { registerActionHandlers } from '../../midi/actions';
import { startBindingEngine, armLearn, cancelLearn, getBindings, removeBinding, replaceAll, getActiveLayer, onLayerChange, setActiveContext, type Binding } from '../../midi/bindings';
import { ACTION_CATALOGUE } from '../../midi/actions';
import { apcPaint } from '../../midi/apcFeedback';
import {
  startAudio, microcosmStart, microcosmStopEngine,
  microcosmEngineActive, microcosmEngineLevel, microcosmFadeInEngine, microcosmMasterLevel, microcosmEnginePan, microcosmEngineEQ,
  microcosmAddOrb, microcosmRemoveOrb,
  microcosmGrainSpread, microcosmPitchSpread, microcosmOrbXY, microcosmOnGrain, microcosmDrainGrains, microcosmOrbSlot, microcosmConstTape, microcosmConstTapeBalance, microcosmSourceFreq, microcosmTape, microcosmTapeBalance, microcosmTapeMute,
  microcosmClick, microcosmMetroLevel, microcosmAudioTime, microcosmLoadSource, microcosmSourcePosition, microcosmOrbPosition, microcosmOrbAbsence, microcosmOrbChaos, microcosmFreezeSource, microcosmFauveOn, microcosmFauveOff, microcosmFauveOffAll, microcosmFauveParam, microcosmFauveUpdatePitch, microcosmEngineSource, microcosmOrbConstTranspose, microcosmOrbTuning, microcosmOrbRegister, microcosmOrbChordStep, microcosmOrbConductor,
  microcosmGrainDensity, microcosmArmedPalette, microcosmOrbPalette, microcosmOrbHome, microcosmEngineAmount, microcosmSetFilter, microcosmSweep, microcosmResetFilter,
  microcosmBpm, microcosmOrbLock, microcosmOrbSubdiv, microcosmOrbFill, microcosmOrbSeed,
  microcosmRecipeAB, microcosmRecipeGet, microcosmRecipeSet, microcosmRecipeReset,
  microcosmInputOn, microcosmInputOff, microcosmLiveArm, microcosmSynthOn, microcosmSynthOff,
  microcosmMonitor,
  microcosmInputLevel, microcosmInputDevices, microcosmCaptureLive,
  microcosmTapOn, microcosmTapOff, microcosmCaptureTap, samplerClick, samplerLoopPlay, samplerLoopStop, samplerLoopPos,
  samplerExportWav, microcosmAddOrb as samplerAddOrb, microcosmRemoveOrb as samplerRemoveOrb, microcosmEngineSource as samplerEngineSource, microcosmEngineActive as samplerEngineActive,
} from '../../audio/engine';

type OrbDef = { id: string; label: string; colorKey: any; engineType: string };
// id is the orb INSTANCE id (unique); engineType is which scattering recipe it runs.
// For these defaults id === engineType; once orbs are user-created, ids diverge.
const ALL_ORBS: OrbDef[] = [
  // TEST BHAIRAV: Bhairav-capable engines first (mosaic/shimmer/warp/glitch use tiers)
  { id: 'mosaic',  label: 'Mosaic',  colorKey: 'tunnel',  engineType: 'mosaic'  },
  { id: 'shimmer', label: 'Shimmer', colorKey: 'shimmer', engineType: 'shimmer' },
  { id: 'warp',    label: 'Warp',    colorKey: 'warp',    engineType: 'warp'    },
  { id: 'glitch',  label: 'Glitch',  colorKey: 'glitch',  engineType: 'glitch'  },
  { id: 'bubbles', label: 'Bubbles', colorKey: 'bubbles', engineType: 'bubbles' },
  { id: 'tunnel',  label: 'Tunnel',  colorKey: 'tunnel',  engineType: 'tunnel'  },
  { id: 'strum',   label: 'Strum',   colorKey: 'strum',   engineType: 'strum'   },
  { id: 'haze',    label: 'Haze',    colorKey: 'haze',    engineType: 'haze'    },
  { id: 'swarm',   label: 'Swarm',   colorKey: 'swarm',   engineType: 'swarm'   },
  { id: 'reverse', label: 'Reverse', colorKey: 'shimmer', engineType: 'reverse' },
];

const FIELD_H = 0.70;
const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];   // scale-lock labels use flats
// base frequencies for octave 0 reference (G3..F4 around the 220Hz source)
// chromatic frequencies, octave 4 (equal temperament). Ascending C..B.
const NOTE_BASE: Record<string, number> = {
  'C':261.63, 'C#':277.18, 'D':293.66, 'D#':311.13, 'E':329.63, 'F':349.23,
  'F#':369.99, 'G':392.00, 'G#':415.30, 'A':440.00, 'A#':466.16, 'B':493.88,
};
// flavour palettes for the picker — name, label, colour, one-line descriptor
const FLAVOURS = [
  { id:'open',      name:'Open',      col:'#e6ebff', desc:'octaves & fifths · pure' },
  { id:'bhairav',   name:'Bhairav',   col:'#ffcf6b', desc:'India · flat-2, flat-6' },
  { id:'hijaz',     name:'Hijaz',     col:'#c9a0ff', desc:'Arabic · raised 2nd' },
  { id:'hirajoshi', name:'Hirajoshi', col:'#ff9bb0', desc:'Japan · koto' },
  { id:'dorian',    name:'Dorian',    col:'#7af5c8', desc:'modal · flat-3, flat-7' },
];
const flavourOf = (id: string) => FLAVOURS.find(f => f.id === id) ?? FLAVOURS[0];
const CENTRE = { fx: 0.50, fy: 0.46, size: 260 };

type XY = { x: number; y: number };
const defaultXY = (): Record<string, XY> =>
  Object.fromEntries(ALL_ORBS.map(o => [o.id, { x: 0.5, y: 0.5 }]));

// Seeded-random scatter with VARIED sizes + collision rejection.
// Organic look, but guaranteed no overlap (uses visible-glow radii).
// ── MUSIC OF THE SPHERES (Slice 6) ────────────────────────────────────────────
// Each constellation = an orbital SYSTEM: a faint source star at centre, orbs on
// elliptical orbits around it. Systems laid out left→right in GRID COLUMN ORDER
// (the field mirrors the Akai). Deterministic per orb: stable ellipse + phase.
type OrbitSpec = {
  orbId: string; constId: string; tint: string; sysIdx: number;
  cx: number; cy: number;          // system centre (the source star)
  rx: number; ry: number;          // ellipse radii
  tilt: number;                    // ellipse rotation (radians)
  phase0: number;                  // starting angle
  periodBars: number;              // 4 / 8 / 16 — one revolution per N bars
  size: number;                    // orb visual size
};
function orbitalField(
  consts: { id: string; orbIds: string[] }[],
  tints: string[],
  W: number, H: number,
): { systems: { constId: string; tint: string; cx: number; cy: number; label: number }[]; orbits: OrbitSpec[] } {
  const live = consts.filter(c => c.orbIds.length > 0);
  const n = live.length;
  const systems: { constId: string; tint: string; cx: number; cy: number; label: number }[] = [];
  const orbits: OrbitSpec[] = [];
  if (n === 0) return { systems, orbits };
  // System centres: spread across the field, gentle vertical stagger so it reads celestial not gridded
  // Each system's footprint = its outermost ring; size rings so every system FITS
  // its share of the width with a margin, and keep centres clear of the edges.
  const maxOrbs = Math.max(...live.map(c => c.orbIds.length));
  const slotW = W / n;                                     // each system's horizontal territory
  const outerMax = slotW * 0.46;                           // orbits FILL the system's territory (the bleed disc) — grand, not huddled
  const GOLDEN = 2.399963;                                 // golden angle: system-mates spread apart, never bunch
  live.forEach((c, si) => {
    const cx = slotW * si + slotW * 0.5;
    const cy = H * (0.46 + 0.10 * Math.sin(si * 2.1));     // gentler stagger
    const tint = tints[si % tints.length];
    systems.push({ constId: c.id, tint, cx, cy, label: si + 1 });
    const m = c.orbIds.length;
    c.orbIds.forEach((oid, oi) => {
      let seed = 7; for (let k = 0; k < oid.length; k++) seed = (seed * 31 + oid.charCodeAt(k)) & 0x7fffffff;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      // rings spaced evenly from ~45% to 100% of the system's allowed radius
      const t = m === 1 ? 1 : oi / (m - 1);
      const rx = outerMax * (0.45 + 0.55 * t) * (0.96 + rnd() * 0.08);
      const ry = rx * (0.30 + rnd() * 0.10);               // fuller sweep vertically, still clearly orbital
      const tilt = (rnd() - 0.5) * 0.32;
      const phase0 = oi * GOLDEN + rnd() * 0.4;            // golden-angle spread: no bunching
      const periods = [4, 8, 8, 16, 16];
      const periodBars = periods[Math.min(oi, periods.length - 1)];
      const size = Math.min(84, slotW * 0.16) - oi * 4;
      orbits.push({ orbId: oid, constId: c.id, tint, sysIdx: si, cx, cy, rx, ry, tilt, phase0, periodBars, size });
    });
  });
  return { systems, orbits };
}
/** Position on the ellipse at musical time t (bars elapsed). */
function orbitPos(o: OrbitSpec, bars: number): { x: number; y: number; z: number } {
  const a = o.phase0 + (bars / o.periodBars) * Math.PI * 2;
  const ex = Math.cos(a) * o.rx, ey = Math.sin(a) * o.ry;
  const x = o.cx + ex * Math.cos(o.tilt) - ey * Math.sin(o.tilt);
  const y = o.cy + ex * Math.sin(o.tilt) + ey * Math.cos(o.tilt);
  return { x, y, z: Math.sin(a) };   // z: -1 = far side (behind the star), +1 = near side
}

function satelliteSlots(count: number, W: number, H: number, centreSize: number, salt: number = 0) {
  const n = count - 1;
  if (n <= 0) return [];

  // deterministic PRNG so positions are stable per count (no jitter each render)
  let seed = 1000 + n * 97 + salt * 7919;   // salt: different constellations get different scatters
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const cx = W * 0.5, cy = H * 0.5;
  const cenR = centreSize * 0.95;               // centre glow radius
  const gap = 22;
  const padX = 110, padY = 90;                  // keep off the screen edges

  // base satellite size shrinks with count; each orb varies +/- around it
  const baseSize = n <= 3 ? 138 : n <= 5 ? 120 : n <= 7 ? 106 : 92;

  type S = { x:number; y:number; size:number; r:number };
  const placed: S[] = [];

  for (let i = 0; i < n; i++) {
    const size = baseSize * (0.82 + rnd() * 0.36);   // varied size per orb
    const r = size * 0.92;                            // its glow radius
    let ok = false;
    for (let tries = 0; tries < 300 && !ok; tries++) {
      const x = padX + rnd() * (W - padX * 2);
      const y = padY + rnd() * (H - padY * 2);
      // clear of centre?
      if (Math.hypot(x - cx, y - cy) < cenR + r + gap) continue;
      // clear of all placed satellites?
      let clash = false;
      for (const q of placed) {
        if (Math.hypot(x - q.x, y - q.y) < r + q.r + gap) { clash = true; break; }
      }
      if (clash) continue;
      placed.push({ x, y, size, r });
      ok = true;
    }
    // fallback: if no spot found in 300 tries, drop it on a wide ring (still clears)
    if (!ok) {
      const a = (i / n) * Math.PI * 2;
      const rr = cenR + r + gap + 40;
      placed.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, size, r });
    }
  }
  return placed.map(s => ({ x: s.x, y: s.y, size: s.size }));
}

export default function FieldPage() {
  // ---- field instances (rack-by-orb-id): the live orbs on the field ----
  // Each is { id (unique instance), engineType (recipe), label, colorKey }. Starts with one default Mosaic.
  type FieldOrb = { id: string; engineType: string; label: string; colorKey: any };
  const [fieldOrbs, setFieldOrbs] = useState<FieldOrb[]>([]);  // blank field — add orbs to begin
  // ── CONSTELLATIONS (Slice 4) ──────────────────────────────────────────
  // A constellation is a named group of orbs sharing ONE source. The default synth
  // constellation always exists, so single-constellation = today's Haar exactly.
  type Constellation = {
    id: string; name: string; sourceId: string;   // sourceId 'default' = synth (1:1)
    orbIds: string[];
    register: number;                              // semitone offset (Slice 5)
    pitchMode: 'varispeed' | 'grainshift';         // (Slice 5)
    tune?: number;                                 // root-detection tuning offset (semitones)
    position?: number;                             // constellation base scan position 0..1
  };
  const DEFAULT_CONST_ID = 'const_default';
  // per-constellation TINT (Stage 1 source identity): a small palette cycled by constellation
  // order, so same-constellation orbs share a hue on the field. Default synth = neutral.
  const CONST_TINTS = ['#8ab6ff','#ffce8a','#7af5c8','#d46090','#b79dff','#f0d0a0','#88e0d0','#e89ab0'];
  function constFor(orbId: string) { return constellations.find(c => c.orbIds.includes(orbId)); }
  function tintFor(orbId: string): string | undefined {
    const c = constFor(orbId); if (!c) return undefined;
    if (c.id === DEFAULT_CONST_ID) return undefined;   // plain synth = no tint
    const idx = constellations.filter(x => x.id !== DEFAULT_CONST_ID).findIndex(x => x.id === c.id);
    return CONST_TINTS[((idx % CONST_TINTS.length) + CONST_TINTS.length) % CONST_TINTS.length];
  }
  const [constellations, setConstellations] = useState<Constellation[]>([
    { id: DEFAULT_CONST_ID, name: 'Synth', sourceId: 'default', orbIds: [], register: 0, pitchMode: 'varispeed' },
  ]);
  // which constellation new orbs join / is currently "forward". Defaults to the synth one.
  const [activeConstId, setActiveConstId] = useState<string>(DEFAULT_CONST_ID);
  const constCounter = useRef(0);
  function createConstellation(name: string, sourceId: string): string {
    const id = `const_${++constCounter.current}`;
    setConstellations(prev => [...prev, { id, name, sourceId, orbIds: [], register: 0, pitchMode: 'varispeed' }]);
    return id;
  }
  // Move an orb into a constellation (removing it from any other), and route its grains
  // to that constellation's source via the proven Slice-3 mechanism.
  function assignOrbToConstellation(orbId: string, constId: string, sourceIdHint?: string): void {
    let routed = sourceIdHint;
    setConstellations(prev => {
      const next = prev.map(c => ({
        ...c,
        orbIds: c.id === constId
          ? Array.from(new Set([...c.orbIds, orbId]))
          : c.orbIds.filter(o => o !== orbId),
      }));
      // read the source from the up-to-date array (avoids stale-closure lookup)
      if (routed == null) { const c = next.find(x => x.id === constId); routed = c ? c.sourceId : 'default'; }
      // PRUNE: a constellation with no orbs ceases to exist (default synth exempt — structural)
      return next.filter(c => c.orbIds.length > 0 || c.id === DEFAULT_CONST_ID);
    });
    if (routed != null) microcosmEngineSource(orbId, routed);
  }
  // ROOT-DETECTION → tuning offset (Slice 5): given a detected fundamental Hz, return the
  // semitone shift that lands it on the NEAREST pitch of the current root (minimal movement,
  // keeps the sample in its natural register but in tune). 0 if no pitch detected.
  function tuningOffsetFor(detectedHz: number): number {
    if (!detectedHz || detectedHz <= 0) return 0;
    const rootHz = NOTE_BASE[lockKey] ?? 261.63;
    // semitone distance from root to detected, then take the fractional part to nearest note
    const semisFromRoot = 12 * Math.log2(detectedHz / rootHz);
    const nearestNote = Math.round(semisFromRoot);           // nearest in-key octave/note of root grid
    // offset that moves detected onto that exact grid note = -(fractional detune)
    const offset = nearestNote - semisFromRoot;               // small ± correction into tune
    return Math.round(offset * 100) / 100;                    // 2dp semitones (can be fractional)
  }
  const orbCounter = useRef<Record<string, number>>({});
  function mintOrbId(engineType: string): string {
    const n = (orbCounter.current[engineType] || 0) + 1;
    orbCounter.current[engineType] = n;
    return `${engineType}_${n}`;
  }
  function addFieldOrb(engineType: string, label: string, colorKey: any): string {
    const id = mintOrbId(engineType);
    volRef.current[id] = 0.7;
    densRef.current[id] = 0.5;
    amountRef.current[id] = 0;
    flavourRef.current[id] = 'open';
    muteRef.current[id] = false;
    soloSetRef.current[id] = false;
    panRef.current[id] = 0;
    eqRef.current[id] = { lo:0, mid:0, hi:0 };
    offsetRef.current[id] = 0;  // born at root (no transpose)
    lockRef.current[id] = false;   // born FREE
    subdivRef.current[id] = 2;     // eighth notes
    fillRef.current[id] = 1;       // full fill
    seedRef.current[id] = 1;       // stable starting seed
    setFieldOrbs(prev => [...prev, { id, engineType, label, colorKey }]);
    // (membership set authoritatively by the caller, e.g. doCreateOrb, to avoid stale state)
    return id;
  }
  function removeFieldOrb(id: string): void {
    microcosmEngineActive(id, false);
    microcosmRemoveOrb(id);
    setFieldOrbs(prev => prev.filter(o => o.id !== id));
    // membership cleanup + PRUNE: no ghost ids; empty constellations cease to exist (default exempt)
    setConstellations(prev => prev
      .map(c => ({ ...c, orbIds: c.orbIds.filter(o => o !== id) }))
      .filter(c => c.orbIds.length > 0 || c.id === DEFAULT_CONST_ID));
  }
  const [selected, setSelected] = useState<string>('');
  const [focused, setFocused] = useState<string | null>(null); // orb in focused (controls-beside) view
  const [focusShown, setFocusShown] = useState(false); // drives the in/out transition (lags focused)
  const [mixOpen, setMixOpen] = useState(false);   // mix desk visible
  const [mixShown, setMixShown] = useState(false); // drives the desk slide transition
  const [masterVol, setMasterVol] = useState(0.85);  // master fader
  const masterVolRef = useRef(0.85); useEffect(() => { masterVolRef.current = masterVol; }, [masterVol]);
  const lastOrbTap = useRef<{ id:string; t:number }>({ id:'', t:0 });
  const [dim, setDim] = useState({ w: 1440, h: 900 });
  const [state, setState] = useState<'idle'|'playing'|'stopped'>('idle');
  const [muted, setMuted] = useState(false);
  const [xyMap, setXyMap] = useState<Record<string, XY>>(defaultXY);
  const [lockKey, setLockKey] = useState('C');   // the LOCKED root (yellow), double-click to set
  const [recipeAB, setRecipeAB] = useState(true);   // DEV scaffolding: recipe vs legacy tunnel
  const [planetOpen, setPlanetOpen] = useState(false);   // WORKBENCH: inside-the-planet dev view
  const [inputOn, setInputOn] = useState(false);   // SOURCES: live input door (dev chip)
  const [samplerOpen, setSamplerOpen] = useState(false);   // SAMPLER station
  const [samplerDevs, setSamplerDevs] = useState<{id:string;label:string}[]>([]);
  const [samplerDev, setSamplerDev] = useState<string>('');
  const [devListOpen, setDevListOpen] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [loopPlaying, setLoopPlaying] = useState(false);
  const [loopPos, setLoopPos] = useState(0);
  const [loopA, setLoopA] = useState(0);        // loop window 0..1 into the capture
  const [loopB, setLoopB] = useState(1);
  const waveWrapRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<''|'A'|'B'>('');
  function replayIfPlaying(over?: { reverse?: boolean; a?: number; b?: number; data?: Float32Array }) {
    if (!loopPlaying || !capture) return;
    samplerLoopPlay(over?.data || capture.data, {
      rate: capVari * Math.pow(2, (capReg + capFine) / 12),
      reverse: over?.reverse ?? capReverse,
      start01: over?.a ?? loopA, end01: over?.b ?? loopB });
  }
  function handleDragMove(clientX: number) {
    const el = waveWrapRef.current; if (!el || !dragHandleRef.current) return;
    const r = el.getBoundingClientRect();
    let f = (clientX - r.left - 10) / (r.width - 20);
    f = Math.max(0, Math.min(1, f));
    if (snapOn && capture && capture.bars > 0) {
      const beats = capture.bars * 4;
      f = Math.round(f * beats) / beats;
    }
    if (dragHandleRef.current === 'A') setLoopA(Math.min(f, loopB - 0.02));
    else setLoopB(Math.max(f, loopA + 0.02));
  }
  useEffect(() => {
    const mv = (ev: PointerEvent) => handleDragMove(ev.clientX);
    const up = () => {
      if (dragHandleRef.current && loopPlaying && capture) {
        samplerLoopPlay(capture.data, { rate: capVari * Math.pow(2, (capReg + capFine) / 12), reverse: capReverse, start01: loopA, end01: loopB });
      }
      dragHandleRef.current = '';
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  });
  const loopRafRef = useRef<number>(0);
  useEffect(() => {
    if (!loopPlaying) { cancelAnimationFrame(loopRafRef.current); return; }
    const track = () => { const p2 = samplerLoopPos(); if (p2 >= 0) setLoopPos(p2); loopRafRef.current = requestAnimationFrame(track); };
    loopRafRef.current = requestAnimationFrame(track);
    return () => cancelAnimationFrame(loopRafRef.current);
  }, [loopPlaying]);
  const [meterLvl, setMeterLvl] = useState({ rms: 0, peak: 0 });
  const meterRafRef = useRef<number>(0);
  async function openSampler() {
    await ensureStarted();
    microcosmSynthOff();
    try { const devs = await microcosmInputDevices(); setSamplerDevs(devs); } catch {}
    setSamplerOpen(true);   // silent on open - the record button owns the mic
  }
  const [snapBars, setSnapBars] = useState<number>(4);           // 1/2/4/8, 0 = free (4s)
  const [capture, setCapture] = useState<{ id:string; data:Float32Array; bars:number }|null>(null);
  const [selStation, setSelStation] = useState<'clean'|'engine'|'chain'>('clean');
  const SAMPLER_ORB = 'sampler_orb';
  const [orbAgain, setOrbAgain] = useState(false);            // live engine playing over the capture
  const takeStackRef = useRef<{ id:string; data:Float32Array; bars:number }[]>([]);   // undo takes
  const [gateLit, setGateLit] = useState(false);
  const gateIvRef = useRef<number>(0);
  const gateLoudRef = useRef(0);
  function gateStart() {
    window.clearInterval(gateIvRef.current);
    gateLoudRef.current = 0;
    microcosmEngineLevel(SAMPLER_ORB, 0);
    gateIvRef.current = window.setInterval(() => {
      const lvl = microcosmInputLevel();
      const now = Date.now();
      if (lvl.rms > 0.03) gateLoudRef.current = now;
      const open = now - gateLoudRef.current < 1400;
      setGateLit(prev => { if (prev !== open) microcosmEngineLevel(SAMPLER_ORB, open ? 0.85 : 0); return open; });
    }, 50);
  }
  function gateStop() { window.clearInterval(gateIvRef.current); setGateLit(false); }
  // the audition orb: engine station selected -> a hidden orb runs the engine.
  // diet: the LIVE ring while hunting/recording; the CAPTURE while orb-again.
  function samplerOrbSet(on: boolean, sourceId: string) {
    samplerRemoveOrb(SAMPLER_ORB);
    if (on) {
      samplerAddOrb(SAMPLER_ORB, samplerEngine, 0.85);
      samplerEngineSource(SAMPLER_ORB, sourceId);
      samplerEngineActive(SAMPLER_ORB, true);
      microcosmTapOn(SAMPLER_ORB);
    } else {
      microcosmTapOff();
    }
  }
  function stationChanged(stIn: 'clean'|'engine'|'chain') {
    let st = stIn;
    // tap the lit engine again -> off, back to clean (the stop you asked for)
    if (st !== 'clean' && st === selStation) st = 'clean';
    setSelStation(st); setOrbAgain(false);
    if (st === 'clean') {
      gateStop(); samplerOrbSet(false, '');
      microcosmMonitor(recState !== 'idle');     // dry guitar while listening
    } else {
      microcosmMonitor(false);                   // wet only - Haar law
      samplerOrbSet(true, 'live');
      if (recState !== 'idle') gateStart();      // gated: silent until the first note
      else microcosmEngineLevel(SAMPLER_ORB, 0.85);
    }
  }
  function toggleOrbAgain() {
    if (!capture) return;
    const next = !orbAgain;
    setOrbAgain(next);
    if (next) { if (selStation === 'clean') setSelStation('engine'); samplerOrbSet(true, capture.id); }
    else samplerOrbSet(selStation !== 'clean', 'live');
  }
  function armCapture() {
    // witnessed grab of the engine's output, tail-folded in the worklet
    const spb = (60 / bpm) * 4;
    const secs = snapBars > 0 ? snapBars * spb : 4;
    const lenSamp = Math.floor(48000 * Math.min(secs, 11.5));
    const tailSamp = Math.floor(48000 * Math.min(spb, 2.5));
    const id = 'cap_' + Date.now();
    microcosmCaptureTap(id, lenSamp, tailSamp, (cid, data) => {
      setCapture({ id: cid, data, bars: snapBars });
      say('take landed'); console.log('[sampler] TAKE landed', cid, data.length, 'samples (tail-folded)');
    });
  }
  const [fadeMode, setFadeMode] = useState<''|'in'|'out'>('');
  const [toast, setToast] = useState('');
  const toastTRef = useRef<number>(0);
  function say(msg: string) { setToast(msg); window.clearTimeout(toastTRef.current); toastTRef.current = window.setTimeout(()=>setToast(''), 1800); }
  const [fadeA, setFadeA] = useState(0);
  const [fadeB, setFadeB] = useState(0);
  const fadeDragRef = useRef(false);
  function fadedCopy(): Float32Array | null {
    if (!capture || fadeB - fadeA < 0.005) return null;
    const d2 = capture.data.slice();
    const s0 = Math.floor(fadeA * d2.length);
    const e0 = Math.floor(fadeB * d2.length);
    const span = Math.max(1, e0 - s0);
    for (let i2 = s0; i2 < e0; i2++) {
      const f2 = (i2 - s0) / span;
      const g2 = Math.sin(((fadeMode === 'in') ? f2 : 1 - f2) * Math.PI / 2);
      d2[i2] *= g2;
    }
    return d2;
  }
  function fadePreview() {
    const d2 = fadedCopy();
    if (d2) replayIfPlaying({ data: d2 });
  }
  function fadeProcess() {
    const d2 = fadedCopy();
    if (!d2 || !capture) return;
    takeStackRef.current.push({ id: capture.id, data: capture.data, bars: capture.bars });
    const nc = { id: 'cap_' + Date.now(), data: d2, bars: capture.bars };
    setCapture(nc);
    replayIfPlaying({ data: d2 });
    setFadeMode(''); setFadeA(0); setFadeB(0);
    say('fade ' + fadeMode + ' processed'); console.log('[sampler] FADE processed');
  }
  function barFitInfo() {
    if (!capture) return null;
    const spb = (60 / bpm) * 4;
    const secs = capture.data.length / 48000;
    const bars = Math.max(1, Math.round(secs / spb));
    const target = bars * spb;
    return { secs, bars, target, rate: secs / target, st: 12 * Math.log2(secs / target) };
  }
  function fitToBar(keepKey: boolean = false) {
    // varispeed-bake: resample the whole capture to exactly N bars (tape law - pitch moves with it)
    const info = barFitInfo(); if (!info || !capture) return;
    if (Math.abs(info.secs - info.target) < 0.015) { say('already on the bar'); return; }
    takeStackRef.current.push(capture);
    const outLen = Math.round(info.target * 48000);
    const d2 = new Float32Array(outLen);
    const src = capture.data;
    for (let i2 = 0; i2 < outLen; i2++) {
      const pos = i2 * (src.length - 1) / (outLen - 1);
      const i0 = Math.floor(pos); const fr = pos - i0;
      d2[i2] = src[i0] * (1 - fr) + (src[i0 + 1] ?? src[i0]) * fr;
    }
    const nc = { id: 'cap_' + Date.now(), data: d2, bars: info.bars };
    setCapture(nc); setLoopA(0); setLoopB(1);
    if (keepKey) {
      // FIT+KEY: cancel the varispeed pitch shift via the pitch stack (visible, reversible)
      const comp = -info.st;                            // e.g. fit dropped -2.2 -> comp +2.2
      const wholeReg = 0;                               // stays within the fine row's +-5 for typical fits
      const fine = Math.max(-5, Math.min(5, Math.round(comp)));
      setCapReg(wholeReg); setCapFine(fine); setPitchSemi(wholeReg + fine);
      // residual cents ride varispeed so the compensation is EXACT
      // residual stays UNCOMPENSATED: varispeed must remain 1.00 or the loop leaves the
      // grid it was just fitted to (the click-drift bug). Nearest-semitone is the law.
      setCapVari(1.0);
      window.setTimeout(() => { if (loopPlaying) samplerLoopPlay(d2, { rate: Math.pow(2, fine / 12), reverse: capReverse, start01: 0, end01: 1 }); }, 0);
      say('fitted to ' + info.bars + (info.bars===1?' bar':' bars') + ' · key held'); console.log('[sampler] FIT+KEY ->', info.bars, 'bar(s)');
    } else {
      replayIfPlaying({ data: d2, a: 0, b: 1 });
      say('fitted to ' + info.bars + (info.bars===1?' bar':' bars') + ' · ' + (info.st>0?'+':'') + info.st.toFixed(1) + ' st'); console.log('[sampler] FIT ->', info.bars, 'bar(s)');
    }
  }
  function padToBar() {
    // append silence to the next bar boundary - pitch untouched, the rest becomes rhythm
    const info = barFitInfo(); if (!info || !capture) return;
    const spb = (60 / bpm) * 4;
    const barsUp = Math.ceil((info.secs - 0.015) / spb);
    const outLen = Math.round(barsUp * spb * 48000);
    if (outLen <= capture.data.length) { say('already on the bar'); return; }
    takeStackRef.current.push(capture);
    const d2 = new Float32Array(outLen);
    d2.set(capture.data);
    const nc = { id: 'cap_' + Date.now(), data: d2, bars: barsUp };
    setCapture(nc); setLoopA(0); setLoopB(1);
    replayIfPlaying({ data: d2, a: 0, b: 1 });
    say('padded to ' + barsUp + (barsUp===1?' bar':' bars')); console.log('[sampler] PAD ->', barsUp, 'bar(s)');
  }
  function fadeToggle(dir: 'in'|'out') {
    if (fadeMode === dir) { setFadeMode(''); setFadeA(0); setFadeB(0); replayIfPlaying(); }  // abandon, wav untouched
    else { setFadeMode(dir); setFadeA(0); setFadeB(0); }
  }
  function undoTake() {
    const prev = takeStackRef.current.pop();
    if (prev) { setCapture(prev); setLoopA(0); setLoopB(1); replayIfPlaying({ data: prev.data, a: 0, b: 1 }); say('undone'); console.log('[sampler] undo -> previous take'); }
  }
  const [samplerEngine, setSamplerEngine] = useState('tunnel');
  const [pitchSemi, setPitchSemi] = useState(0);          // combined register+fine, semitones
  const [capReg, setCapReg] = useState(0);                 // register in semitones: -24..+24 landmarks
  const [capFine, setCapFine] = useState(0);               // fine step -5..+5
  const [capName, setCapName] = useState('capture_01');
  const [naming, setNaming] = useState(false);   // name line appears only after SAVE is tapped
  const [capReverse, setCapReverse] = useState(false);
  const [capVari, setCapVari] = useState(1.0);
  const [sampFiles, setSampFiles] = useState<{name:string; bars:number; root:string}[]>([]);
  const [recState, setRecState] = useState<'idle'|'listening'|'counting'|'recording'>('idle');
  const [countLeft, setCountLeft] = useState(0);
  const clickIvRef = useRef<number>(0);
  const playClickIvRef = useRef<number>(0);
  const [recLeft, setRecLeft] = useState(0);
  const recTimerRef = useRef<number>(0);
  async function startRecord() {
    if (recState === 'idle') {
      // press 1 -> LISTENING: mic on, hear yourself through the selected station
      const ok = await microcosmInputOn(samplerDev || undefined);
      if (!ok) return;
      microcosmLiveArm(true); setInputOn(true);
      if (selStation === 'clean') microcosmMonitor(true);
      else { samplerOrbSet(true, 'live'); gateStart(); }
      cancelAnimationFrame(meterRafRef.current);
      const pump = () => { setMeterLvl(microcosmInputLevel()); meterRafRef.current = requestAnimationFrame(pump); };
      meterRafRef.current = requestAnimationFrame(pump);
      setRecState('listening');
      return;
    }
    if (recState === 'listening') {
      // press 2 -> COUNT-IN (one bar of click), then the take starts on the downbeat
      if (metroOn && snapBars > 0) beginCountIn(); else beginTake();
      return;
    }
    if (recState === 'counting') return;   // count-in is not interruptible; it's one bar
    // press while RECORDING -> stop: the take lands now
    window.clearTimeout(recTimerRef.current);
    window.clearInterval(clickIvRef.current);
    finishTake();
  }
  function beginCountIn() {
    setRecState('counting');
    const beatMs = (60 / bpm) * 1000;
    let beat = 0;
    setCountLeft(4);
    microcosmClick(true);
    clickIvRef.current = window.setInterval(() => {
      beat += 1;
      if (beat >= 4) { window.clearInterval(clickIvRef.current); beginTake(); }
      else { setCountLeft(4 - beat); microcosmClick(false); }
    }, beatMs);
  }
  function beginTake() {
    setRecState('recording');
    const spb = (60 / bpm) * 4;
    cancelAnimationFrame(meterRafRef.current);
    const pump = () => { setMeterLvl(microcosmInputLevel()); meterRafRef.current = requestAnimationFrame(pump); };
    meterRafRef.current = requestAnimationFrame(pump);
    // the metronome effect already covers the take when CLICK is lit (no private interval - was double-clicking)
    if (snapBars > 0) {
      const secs = snapBars * spb;
      setRecLeft(secs);
      const t0 = Date.now();
      const tick = () => {
        const left = secs - (Date.now() - t0) / 1000;
        if (left <= 0) { window.clearInterval(clickIvRef.current); finishTake(); }
        else { setRecLeft(left); recTimerRef.current = window.setTimeout(tick, 100); }
      };
      recTimerRef.current = window.setTimeout(tick, 100);
    }
  }
  function finishTake() {
    // the take lands and the cycle COMPLETES: mic off, engines off, back to quiet idle
    setRecState('idle');
    setRecLeft(0);
    gateStop();
    samplerOrbSet(false, '');
    microcosmMonitor(false);
    cancelAnimationFrame(meterRafRef.current);
    setMeterLvl({ rms: 0, peak: 0 });
    window.setTimeout(() => { microcosmLiveArm(false); microcosmInputOff(); setInputOn(false); }, 2200);  // after the tail-fold finishes eating the ring
    if (capture) takeStackRef.current.push(capture);
    if (selStation === 'clean') keepLast(); else armCapture();
  }
  function keepLast() {
    const spb = (60 / bpm) * 4;                                    // seconds per bar (4/4)
    const secs = snapBars > 0 ? snapBars * spb : 4;
    const lenSamp = Math.floor(48000 * Math.min(secs, 11.5));      // ring holds 12s - clamp with margin
    const id = 'cap_' + Date.now();
    microcosmCaptureLive(id, lenSamp, (cid, data) => {
setLoopA(0); setLoopB(1);       setCapture({ id: cid, data, bars: snapBars });
      console.log('[sampler] capture landed', cid, data.length, 'samples');
    });
  }
  function closeSampler() {
    cancelAnimationFrame(meterRafRef.current);
    gateStop(); samplerOrbSet(false, '');
    microcosmMonitor(false); microcosmLiveArm(false); microcosmInputOff(); setInputOn(false);
    setRecState('idle');
    setSamplerOpen(false);
  }
  const [rTick, setRTick] = useState(0);   // re-render pump for recipe dial values
  const [scaleLock, setScaleLock] = useState(false);      // SCALE-LOCK: snap notes to the song key
  const [selectedDial, setSelectedDial] = useState<null|'note'|'octave'|'scale'>(null);   // which key dial has keyboard focus
  const lastNoteKey = useRef<{letter:string;t:number}>({letter:'',t:0});   // repeat-letter toggles sharp
  const [scaleMode, setScaleMode] = useState<'major'|'minor'>('major');   // song scale type
  // scale intervals (semitones from root). Snap any semitone offset to the nearest in-key note.
  const SCALE_SEMIS: Record<string, number[]> = { major:[0,2,4,5,7,9,11], minor:[0,2,3,5,7,8,10] };
  function snapToScale(semis: number): number {
    if (!scaleLock) return semis;                          // off = free chromatic (today's behaviour)
    const scale = SCALE_SEMIS[scaleMode];
    const oct = Math.floor(semis / 12), within = ((semis % 12) + 12) % 12;
    // nearest scale degree to `within` (tie → lower)
    let best = scale[0], bestD = 99;
    for (const deg of scale) { const d = Math.abs(deg - within); if (d < bestD) { bestD = d; best = deg; } }
    return oct * 12 + best;
  }
  const [playNote, setPlayNote] = useState('C'); // current note being played (white)
  const [playSemi, setPlaySemi] = useState(0); // semitones from locked root      // octave offset of the played note from lock
  const [octave, setOctave] = useState(0);        // whole-keyboard register shift
  // ---- PROGRESSIONS (Chords): conductor steps through interval offsets on a bar clock ----
  type ProgStep = { note:string; oct:number; bars:number };
  function stepSemis(st: {note:string; oct:number}): number {
    // transpose = semitones from the locked root AT THE SONG OCTAVE to this step's note+oct.
    // The conductor already applies `octave` (song register), so the chord step must be measured
    // relative to the SONG octave (octave+4), NOT a fixed oct 4 — otherwise the step re-bakes the
    // octave the conductor already applied and the chord drops an extra register (double-octave).
    return (NOTES.indexOf(st.note) - NOTES.indexOf(lockKey)) + (st.oct - (octave + 4)) * 12;
  }
  const [bpm, setBpm] = useState(92);   // master tempo — reference frame for progression clock + locked orbs
  // THE METRONOME: CLICK lit = clicking, whenever the sampler is open. Practice at tempo,
  // no states required. (Needs audio started - ensured at sampler open.)
  // (sampler metronome removed - the field's bar-anchored scheduler is THE metronome)
  const bpmRef = useRef(92); useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  const barAnchorRef = useRef(0);   // performance.now() timestamp of a known bar boundary (free-running clock)
  const barAudioAnchorRef = useRef(0);   // audio-clock time of the same bar boundary (for sample-accurate metro sync)
  const freezeArmRef = useRef<any>(null);   // pending quantized-freeze timer
  // time in ms until the next HALF-BAR boundary from now, given current bpm
  function msToNextHalfBar(): number {
    const halfBarMs = (60 / bpm) * 4 * 1000;   // one full 4/4 bar
    if (!barAnchorRef.current) return 0;       // no anchor yet -> fire immediately
    const elapsed = performance.now() - barAnchorRef.current;
    const into = ((elapsed % halfBarMs) + halfBarMs) % halfBarMs;
    return halfBarMs - into;
  }
  useEffect(() => { microcosmBpm(bpm); }, [bpm]);   // push tempo to engine for locked-orb grid
  // KEY DIALS keyboard control: click a dial to select, then arrows change it; A-G types the note.
  useEffect(() => {
    if (!selectedDial) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        const d = k === 'ArrowUp' ? 1 : -1;
        if (selectedDial === 'note') { setLockKey(prev => NOTES[((NOTES.indexOf(prev)+d)%12+12)%12]); setScaleLock(true); }
        else if (selectedDial === 'octave') { setOctave(prev => Math.max(-2, Math.min(2, prev+d))); }
        else if (selectedDial === 'scale') { setScaleMode(m => m==='major'?'minor':'major'); setScaleLock(true); }
      } else if (selectedDial === 'note' && /^[a-gA-G]$/.test(k)) {
        e.preventDefault();
        const letter = k.toUpperCase();
        const now = Date.now();
        const repeat = lastNoteKey.current.letter === letter && (now - lastNoteKey.current.t) < 500;
        // natural note, or its sharp on repeat (if the sharp exists)
        const natural = letter;
        const sharp = letter + '#';
        const target = (repeat && NOTES.includes(sharp)) ? sharp : natural;
        if (NOTES.includes(target)) { setLockKey(target); setScaleLock(true); }
        lastNoteKey.current = { letter, t: now };
      } else if (k === 'Escape') {
        setSelectedDial(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDial]);
  const [bpmEditing, setBpmEditing] = useState(false);   // double-click Tempo to type a value
  const [chordsOpen, setChordsOpen] = useState(false);
  const [prog, setProg] = useState<ProgStep[]>([]);     // the sequence
  const progRef = useRef<ProgStep[]>([]);   // live mirror of prog so a running progression reads edits
  const progIdxRef = useRef(0);   // current step index (freeze pause/resume)
  const [dragIdx, setDragIdx] = useState<number|null>(null);   // chord block being dragged
  useEffect(() => { const up=()=>setDragIdx(null); window.addEventListener('pointerup',up); return ()=>window.removeEventListener('pointerup',up); }, []);
  useEffect(() => { progRef.current = prog; }, [prog]);
  // live mirror of constellations so the running progression can broadcast per-constellation
  const constRef = useRef<Constellation[]>([]);
  useEffect(() => { constRef.current = constellations; }, [constellations]);
  const [metroOn, setMetroOn] = useState(false);   // metronome click on/off
  const [metroLevel, setMetroLevel] = useState(0.5);   // metronome click volume 0..1
  const metroBeatRef = useRef(0);
  const metroNextRef = useRef(0);
  // METRONOME look-ahead scheduler — beats derived from the SHARED audio bar anchor,
  // so beat 1 (accent) always coincides with the progression's bar boundary.
  useEffect(() => {
    console.log('[metro] effect run - metroOn:', metroOn);
    if (!metroOn) return;
    let scheduledUntil = microcosmAudioTime();   // audio-time up to which we've already scheduled
    const anchor0 = scheduledUntil;              // FIX: stable anchor when no progression is running.
    // (The old fallback re-read audioTime every tick, so the anchor rode alongside 'now' and the
    //  next beat stayed perpetually beyond the horizon - the silent-scheduler bug.)
    console.log('[metro] scheduler starting - audioTime:', scheduledUntil);
    const tick = () => {
      const beatSec = 60 / bpm;
      const anchor = barAudioAnchorRef.current || anchor0;   // progression's anchor when live, else our latch
      const now = microcosmAudioTime();
      const horizon = now + 0.12;
      // first un-scheduled beat index from the (possibly updated) anchor
      let idx = Math.ceil((Math.max(scheduledUntil, now) - anchor) / beatSec);
      if (idx < 0) idx = 0;
      let when = anchor + idx * beatSec;
      while (when < horizon) {
        if (when > now) microcosmClick((idx % 4) === 0, when);   // accent on the bar downbeat (idx 0 from anchor)
        idx += 1;
        when = anchor + idx * beatSec;
      }
      scheduledUntil = horizon;
    };
    tick();
    const id = setInterval(tick, 25);
    return () => clearInterval(id);
  }, [metroOn, bpm]);
  const [progRunning, setProgRunning] = useState(false);
  const [progStepIdx, setProgStepIdx] = useState(0);    // which step is active (for UI highlight)
  const progTransposeRef = useRef(0);                   // current progression transpose (semitones), read by freq calc
  const progTimer = useRef<any>(null);
  const progRAF = useRef<any>(null);
  const [progProgress, setProgProgress] = useState(0);  // 0..1 fill target within active step
  const [progStepDur, setProgStepDur] = useState(0);    // ms duration of active step (drives CSS transition)
  const [progPickOct, setProgPickOct] = useState(4);    // octave for newly added chord steps
  // re-apply source frequency with current progression transpose folded in (no note re-trigger needed)
  function reapplySourceFreq() {
    const rootHz = NOTE_BASE[lockKey] ?? 261.63;
    microcosmSourceFreq(rootHz * Math.pow(2, (playSemi/12) + octave + (progTransposeRef.current/12)));
    // CONDUCTOR broadcast: the keyboard/octave note as a semitone offset, pushed to SAMPLE
    // orbs so they follow the key. The default/synth source is already pitched by
    // microcosmSourceFreq above, so skip its orbs to avoid double-transposing.
    const noteSemis = playSemi + octave * 12;
    const defaultOrbIds = new Set(constRef.current.filter(c => c.sourceId === 'default').flatMap(c => c.orbIds));
    for (const o of fieldOrbs) if (!defaultOrbIds.has(o.id)) microcosmOrbConductor(o.id, noteSemis);
  }
  const playAtRef = useRef(playAt); playAtRef.current = playAt;   // live mirror for MIDI closures
  const transportRef = useRef({ engage: () => {}, release: () => {}, stop: () => {}, playpause: () => {}, octave: (d:number) => {} });
  transportRef.current = {
    engage: () => { if (prog.length && !progRunning) runProg(); },
    release: () => { if (progRunning) stopProg(); },
    stop: () => doStop(),
    playpause: () => { if (state === 'playing') doStop(); else doStart(); },
    octave: (d: number) => setOctave(prev => Math.max(-2, Math.min(2, prev + d))),
  };
  // "the focused orb" for hardware: orb-back open ? that orb : the selected orb
  const orbCtlRef = useRef({ set: (k:string,v:number)=>{}, get: (k:string)=>0, toggleFauve: ()=>{}, cycleFlavour: ()=>{} });
  orbCtlRef.current = {
    set: (k, v) => {
      const id = focused ?? selected; if (!id) return;
      if (k === 'x' || k === 'y') {
        const cur = xyRef.current[id] ?? { x:0.5, y:0.5 };
        const nx = k==='x'?v:cur.x, ny = k==='y'?v:cur.y;
        const next = { ...xyRef.current, [id]: { x: nx, y: ny } };
        xyRef.current = next; setXyMap(next);
        microcosmOrbXY(id, nx, ny);   // PER-ORB
      }
      if (k === 'density') { densRef.current[id] = v; microcosmGrainDensity(id, v); forceOrb(x=>x+1); }
      if (k === 'flavour.amount') { amountRef.current[id] = v; microcosmEngineAmount(id, v); forceOrb(x=>x+1); }
      if (k === 'pan') { const p2 = v*2-1; panRef.current[id] = p2; microcosmEnginePan(id, p2); forceOrb(x=>x+1); }
      if (k === 'fauve.disorder') { fauveDisRef.current[id] = v; microcosmFauveParam(id,'disorder',v); forceFauve(x=>x+1); }
      if (k === 'fauve.repeat')   { fauveRepRef.current[id] = v; microcosmFauveParam(id,'repeat',v); forceFauve(x=>x+1); }
      if (k === 'fauve.reverse')  { fauveRevRef.current[id] = v; microcosmFauveParam(id,'reverse',v); forceFauve(x=>x+1); }
      if (k === 'fauve.gaps')     { fauveGapRef.current[id] = v; microcosmFauveParam(id,'gaps',v); forceFauve(x=>x+1); }
    },
    cycleFlavour: () => {
      const id = focused ?? selected; if (!id) return;
      const cur = flavourRef.current[id] ?? 'open';
      const i = FLAVOURS.findIndex(f => f.id === cur);
      const next = FLAVOURS[(i + 1) % FLAVOURS.length].id;
      flavourRef.current[id] = next;
      microcosmOrbPalette(id, next);
      forceOrb(x=>x+1);
    },
    toggleFauve: () => {
      const id = focused ?? selected; if (!id) return;
      const oc = constRef.current.find(c => c.orbIds.includes(id));
      if (!oc || oc.sourceId === 'default' || oc.sourceId.startsWith('src_frozen_')) return; // same guard as the screen button
      const now = !fauveRef.current[id];
      fauveRef.current[id] = now;
      if (now) { microcosmFauveOn(id, oc.sourceId); microcosmFauveUpdatePitch(id); } else microcosmFauveOff(id);
      forceFauve(x=>x+1);
    },
    get: (k) => {
      const id = focused ?? selected; if (!id) return 0;
      if (k === 'x') return (xyRef.current[id] ?? {x:0.5,y:0.5}).x;
      if (k === 'y') return (xyRef.current[id] ?? {x:0.5,y:0.5}).y;
      if (k === 'density') return densRef.current[id] ?? 0.5;
      if (k === 'flavour.amount') return amountRef.current[id] ?? 0;
      if (k === 'pan') return ((panRef.current[id] ?? 0)+1)/2;
      if (k === 'fauve.disorder') return fauveDisRef.current[id] ?? 0;
      if (k === 'fauve.repeat')   return fauveRepRef.current[id] ?? 0;
      if (k === 'fauve.reverse')  return fauveRevRef.current[id] ?? 0;
      if (k === 'fauve.gaps')     return fauveGapRef.current[id] ?? 0;
      return 0;
    },
  };

  // ── SINGLE PITCH SOURCE OF TRUTH ─────────────────────────────────────────
  // resolveCurrentPitch returns the CURRENT live musical context for a constellation: the moving
  // offsets an orb needs to arrive in tune with everything else RIGHT NOW.
  //   conductor = where the master keyboard is (playSemi + octave*12)
  //   chordStep = the progression's current transpose (so a joining orb lands on the CURRENT
  //               chord and follows along), 0 if no progression running.
  function resolveCurrentPitch(_constId: string): { conductor: number; chordStep: number } {
    const conductor = playSemi + octave * 12;
    const chordStep = progRunning ? progTransposeRef.current : 0;
    return { conductor, chordStep };
  }
  // applyJoinPitch sets BOTH moving slots on a joining orb so it enters correctly mid-anything.
  // The orb's own fixed root-detection tuning is applied separately and stays put.
  function applyJoinPitch(orbId: string, constId: string, isDefaultSource: boolean): void {
    const { conductor, chordStep } = resolveCurrentPitch(constId);
    if (!isDefaultSource) microcosmOrbConductor(orbId, conductor);
    microcosmOrbChordStep(orbId, chordStep);
  }
  function stopProg() {
    if (progTimer.current) { clearTimeout(progTimer.current); progTimer.current = null; }
    setProgRunning(false); setProgProgress(0); setProgStepDur(0);
    progTransposeRef.current = 0; setProgStepIdx(0); reapplySourceFreq();
    // reset each constellation to its register baseline (no chord step) when the progression stops
    for (const c of constRef.current) { for (const oid of c.orbIds) microcosmOrbChordStep(oid, 0); }   // clear moving part; tuning+register persist
  }
  const progStep = () => {
    const seq = progRef.current;
    if (seq.length === 0) { stopProg(); return; }
    let i = progIdxRef.current;
    if (i >= seq.length) i = 0;   // sequence shrank (chord removed) — wrap safely
    progIdxRef.current = i;
    const st = seq[i];
    const barMs = (60 / bpm) * 4 * 1000;
    const dur = barMs * st.bars;
    progTransposeRef.current = stepSemis(st);
    reapplySourceFreq();
    // STEP A: broadcast this step's transpose to every constellation, each adding its own
    // register offset, and push to all its orbs. (LINKED-style: one shared pattern for now.)
    const stepT = stepSemis(st);
    for (const c of constRef.current) {
      for (const oid of c.orbIds) microcosmOrbChordStep(oid, stepT);   // ONLY the moving chord part
    }
    // keep the live PREVIEW orb in step with the progression too, so auditioning follows the
    // chords exactly like a real orb would (preview is a faithful audition).
    if (createEngineRef.current) microcosmOrbChordStep(PREVIEW_ID, stepT);   // live ref, not stale closure
    setProgProgress(0);
    setProgStepIdx(i);
    setProgStepDur(0);
    requestAnimationFrame(() => requestAnimationFrame(() => { setProgStepDur(dur); setProgProgress(1); }));
    progTimer.current = setTimeout(() => { progIdxRef.current = (progIdxRef.current + 1) % Math.max(1, progRef.current.length); progStep(); }, dur);
  };
  function pauseProg() {   // freeze: hold the progression where it is
    if (progTimer.current) { clearTimeout(progTimer.current); progTimer.current = null; }
  }
  function resumeProg() {  // unfreeze: continue from the held step
    if (progRunning && !progTimer.current) progStep();
  }
  function runProg() {
    if (prog.length === 0) return;
    setProgRunning(true);
    progIdxRef.current = 0;
    // anchor the shared bar clock to the progression's downbeat so the metronome's
    // pulse 1 lines up with chord bar 1
    barAudioAnchorRef.current = microcosmAudioTime();
    barAnchorRef.current = performance.now();
    progStep();
  }
  const lastTap = useRef<{ key:string; t:number }>({ key:'', t:0 });
  const [palette, setPalette] = useState('open');     // armed flavour palette (global)
  const [createOpen, setCreateOpen] = useState(false);          // orb creation bloom
  // MIDI monitor (dev tool + foundation for controller rig)
  const [midiOpen, setMidiOpen] = useState(false);
  const [midiDevices, setMidiDevices] = useState<{inputs:string[];outputs:string[]}|null>(null);
  const [midiLog, setMidiLog] = useState<MidiMessage[]>([]);
  const [constMuteTick, setConstMuteTick] = useState(0);
  const [hoverConst, setHoverConst] = useState<string|null>(null); // cosmos: system under the pointer
  const [forwardConst, setForwardConst] = useState<string|null>(null); // constellation brought forward (interior view = the pre-Spheres field)
  const forwardConstRef = useRef<string|null>(null); useEffect(() => { forwardConstRef.current = forwardConst; }, [forwardConst]);
  const constTapeRef = useRef<Record<string, number>>({});   // per-constellation tape amount (0..1)
  const constTapeBalRef = useRef<Record<string, { wow:number; sat:number; roll:number; hiss:number }>>({});
  useEffect(() => {
    // CONSTELLATION REELS: slot = live-constellation index + 1 (stable while membership order holds).
    const live = constellations.filter(c => c.orbIds.length > 0);
    live.forEach((c, ci) => {
      const slot = c.id === DEFAULT_CONST_ID ? 0 : Math.min(8, ci + 1);
      c.orbIds.forEach(oid => microcosmOrbSlot(oid, slot));
      if (slot > 0) {
        const b = constTapeBalRef.current[c.id];
        if (b) (['wow','sat','roll','hiss'] as const).forEach(k => microcosmConstTapeBalance(slot, k, b[k]));
      }
    });
  }, [constellations]);
  useEffect(() => {
    if (!forwardConst) return;
    const alive = constellations.some(c => c.id === forwardConst && c.orbIds.length > 0);
    if (!alive) { setForwardConst(null); setFocused(null); }   // ghost interior: fall back (view rule picks cosmos or field)
  }, [constellations, forwardConst]);
  const fieldClickConst = (e: React.MouseEvent) => {
    if (!cosmosActive) return;                         // cosmos taps only exist in the cosmos
    if ((e.target as HTMLElement).closest('[data-orb]')) return;  // orb clicks keep their own meaning
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (py > fh) return;                               // below the field (keyboard/panels)
    for (const sys of fieldRef2.current.systems) {
      const d = Math.hypot(px - sys.cx, py - sys.cy);
      if (d < dim.w / Math.max(fieldRef2.current.systems.length, 1) * 0.45) { setForwardConst(sys.constId); return; }
    }
  };
  const fieldHover = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let best: string|null = null, bestD = Infinity;
    for (const sys of fieldRef2.current.systems) {
      const d = Math.hypot(px - sys.cx, py - sys.cy);
      if (d < bestD) { bestD = d; best = sys.constId; }
    }
    const territory = dim.w / Math.max(fieldRef2.current.systems.length, 1) * 0.45;
    setHoverConst(bestD < territory ? best : null);
    if (fieldRef2.current.systems.length === 0) {
      // FIELD MODE: nearest orb within reach reveals its name
      let bo: string|null = null, bd = Infinity;
      for (const oid in orbScreenPosRef.current) {
        const p2 = orbScreenPosRef.current[oid];
        const d = Math.hypot(px - p2.x, py - p2.y);
        if (d < bd) { bd = d; bo = oid; }
      }
      setHoverOrb(bd < 130 ? bo : null);
    }
  };
  const [midiView, setMidiView] = useState<'monitor'|'map'>('monitor');
  const [controlOpen, setControlOpen] = useState(false); // full-screen CONTROL (MIDI mapping) page
  const [learning, setLearning] = useState<string|null>(null);   // catalogue row id currently armed
  const [bindTick, setBindTick] = useState(0);                   // repaint bindings list
  const [hwLayer, setHwLayer] = useState('base');
  useEffect(() => onLayerChange(l => { setHwLayer(l); }), []);
  // LAYER LED: the layer key's own note lights when orb layer is active (track button red LED)
  useEffect(() => {
    const out = midiGetOutput('APC'); if (!out) return;
    const keys = getBindings().filter(b => (b.actionId as string) === 'layer.toggle' && b.source.kind === 'note');
    for (const b of keys) {
      const src = b.source as { channel: number; note: number };
      out.send([0x90 | (src.channel & 0x0f), src.note, hwLayer === 'orb' ? 1 : 0]);
    }
  }, [hwLayer, bindTick]);
  // LED FEEDBACK: repaint bound pads whenever constellation/mute state changes
  useEffect(() => {
    const live = constellations.filter(c => c.orbIds.length > 0);
    apcPaint({ columns: live.map(c => ({ muted: !!constMuteRef.current[c.id] })) });
  }, [constellations, constMuteTick, bindTick]);
  const lockKeyRefM = useRef(lockKey); useEffect(() => { lockKeyRefM.current = lockKey; }, [lockKey]);
  const heldKeysRef = useRef<number[]>([]);   // MIDI note stack: last-note priority with fallback (SH-101 style) // bumps when constellation mute changes (grid repaint)
  const knobPickupRef = useRef<Record<number, boolean>>({}); // soft-takeover: engaged once knob crosses current value
  useEffect(() => {
    let alive = true;
    let un: (()=>void)|null = null;
    midiInit().then(d => {
      if (!alive) return;               // effect already cleaned up — don't subscribe
      setMidiDevices(d);
      midiGridClear();                  // start from a dark grid — no stale LEDs from previous sessions
      un = midiSubscribe(m => setMidiLog(prev => [m, ...prev].slice(0, 12)));
    });
    return () => { alive = false; if (un) un(); };
  }, []);

  // ACTION HANDLERS: Haar's verbs, exposed to the binding engine. Refs keep them live.
  useEffect(() => {
    registerActionHandlers({
      trigger: (id, param) => {
        const liveConsts = () => constRef.current.filter(x => x.orbIds.length > 0);
        if (id === 'conductor.note' && typeof param === 'number') {
          // param = semis from zone rootMidi(60). Re-anchor to the TRUE root key (absolute mapping).
          const midiNote = 60 + param;
          const rootPc = NOTES.indexOf(lockKeyRefM.current);
          let rootMidi = 60 + rootPc; if (rootMidi > 66) rootMidi -= 12;
          const semis = midiNote - rootMidi;
          const noteName = NOTES[((midiNote % 12) + 12) % 12];
          playAtRef.current(noteName, semis);
        }
        if (id === 'const.mute' && typeof param === 'number') {
          if (forwardConstRef.current) {
            const oid = interiorOrderRef.current[param];
            if (oid) { muteRef.current[oid] = !muteRef.current[oid]; reapplyLevelsRef.current(); }
          } else {
            const c = liveConsts()[param]; if (c) toggleConstMuteRef.current(c.id);
          }
        }
        if (id === 'scale.toggle') setScaleLock(v => !v);
        if (id === ('view.console' as any)) setConsoleUp(v => !v);
        if (id === 'orb.select' && param && typeof param === 'object') {
          const c = constRef.current.filter(x => x.orbIds.length > 0)[param.col];
          const oid = c?.orbIds[param.row];
          if (oid) { setSelected(oid); setFocused(oid); }   // comes to the front: orb-back opens
        }
        if (id === ('orb.muteToggle' as any) && param && typeof param === 'object') {
          const c = constRef.current.filter(x => x.orbIds.length > 0)[(param as any).col];
          const oid = c?.orbIds[(param as any).row];
          if (oid) { muteRef.current[oid] = !muteRef.current[oid]; reapplyLevelsRef.current(); }
        }
        if (id === ('const.select' as any) && typeof param === 'number') {
          const c = constRef.current.filter(x => x.orbIds.length > 0)[param];
          const oid = c?.orbIds[0];
          if (oid) { setSelected(oid); setFocused(oid); }   // minimal true thing until State-B exists
        }
        if (id === 'chords.engage') transportRef.current.engage();
        if (id === 'chords.release') transportRef.current.release();
        if (id === 'master.stop') transportRef.current.stop();
        if (id === 'transport.playpause') transportRef.current.playpause();
        if (id === 'conductor.octaveUp') transportRef.current.octave(1);
        if (id === 'conductor.octaveDown') transportRef.current.octave(-1);
        if (id === 'fauve.toggle') orbCtlRef.current.toggleFauve();
        if (id === 'flavour.cycle') orbCtlRef.current.cycleFlavour();
      },
      continuous: (id, value, param) => {
        if (id === 'const.level' && typeof param === 'number') {
          if (forwardConstRef.current) {
            // INTERIOR: knob N = member orb N's own volume (slot order, centre first)
            const oid = interiorOrderRef.current[param];
            if (oid) { volRef.current[oid] = value; reapplyLevelsRef.current(); forceOrb(x=>x+1); }
          } else {
            const c = constRef.current.filter(x => x.orbIds.length > 0)[param];
            if (c) setConstLevelRef.current(c.id, value);
          }
        }
        if (id === 'orb.x') orbCtlRef.current.set('x', value);
        if (id === 'orb.y') orbCtlRef.current.set('y', value);
        if (id === 'orb.density') orbCtlRef.current.set('density', value);
        if (id === 'flavour.amount') orbCtlRef.current.set('flavour.amount', value);
        if (id === 'orb.pan') orbCtlRef.current.set('pan', value);
        if (id === 'master.level') { setMasterVol(value); microcosmMasterLevel(value); }
        if (id === 'fauve.disorder') orbCtlRef.current.set('fauve.disorder', value);
        if (id === 'fauve.repeat') orbCtlRef.current.set('fauve.repeat', value);
        if (id === 'fauve.reverse') orbCtlRef.current.set('fauve.reverse', value);
        if (id === 'fauve.gaps') orbCtlRef.current.set('fauve.gaps', value);
      },
      readContinuous: (id, param) => {
        if (id === 'const.level' && typeof param === 'number') {
          if (forwardConstRef.current) {
            const oid = interiorOrderRef.current[param];
            return oid ? (volRef.current[oid] ?? 0.7) : 0;
          }
          const c = constRef.current.filter(x => x.orbIds.length > 0)[param];
          return c ? (constLevelRef.current[c.id] ?? 1) : 0;
        }
        if (id === 'orb.x') return orbCtlRef.current.get('x');
        if (id === 'orb.y') return orbCtlRef.current.get('y');
        if (id === 'orb.density') return orbCtlRef.current.get('density');
        if (id === 'flavour.amount') return orbCtlRef.current.get('flavour.amount');
        if (id === 'orb.pan') return orbCtlRef.current.get('pan');
        if (id === 'master.level') return masterVolRef.current;
        if (id === 'fauve.disorder') return orbCtlRef.current.get('fauve.disorder');
        if (id === 'fauve.repeat') return orbCtlRef.current.get('fauve.repeat');
        if (id === 'fauve.reverse') return orbCtlRef.current.get('fauve.reverse');
        if (id === 'fauve.gaps') return orbCtlRef.current.get('fauve.gaps');
        return 0;
      },
    });
    startBindingEngine();
  }, []);


  const [createSrc, setCreateSrc] = useState<'synth'|'sample'|'livein'>('synth');
  const [createEngine, setCreateEngine] = useState<string | null>(null);  // selected engine type
  const createEngineRef = useRef<string | null>(null);   // live mirror so progStep sees preview state (no stale closure)
  useEffect(() => { createEngineRef.current = createEngine; }, [createEngine]);
  const [liveMode, setLiveMode] = useState(false);   // false=studio (instant preview), true=live (everything blooms)
  const [editingConstId, setEditingConstId] = useState<string | null>(null);   // double-click a chip to rename
  // CONSTELLATION targeting in the creation screen: which existing constellation a new orb
  // joins, or '__new__' to create a new one (with a name + the SOURCE row's source).
  const [createConstTarget, setCreateConstTarget] = useState<string>('__new__');
  const [createConstName, setCreateConstName] = useState<string>('');
  const [pendingWav, setPendingWav] = useState<File | null>(null);   // WAV chosen for a new constellation
  // retain raw WAV bytes per sourceId so songs can be saved self-contained (base64)
  const sourceBytesRef = useRef<Record<string, { name: string; b64: string }>>({});
  const posRef = useRef<Record<string, number>>({});   // per-orb POSITION 0..1 into its WAV source
  const fauveRef = useRef<Record<string, boolean>>({});   // per-orb FAUVE on/off
  const fauveDisRef = useRef<Record<string, number>>({});   // per-orb FAUVE disorder 0..1
  const fauveRepRef = useRef<Record<string, number>>({});   // per-orb FAUVE repeat 0..1
  const fauveRevRef = useRef<Record<string, number>>({});   // per-orb FAUVE reverse 0..1
  const fauveGapRef = useRef<Record<string, number>>({});   // per-orb FAUVE gaps 0..1
  const [, forceFauve] = useState(0);
  const absRef = useRef<Record<string, number>>({});   // per-orb ABSENCE -1(flutter)..0(off)..+1(dropouts)
  const chaosRef = useRef<Record<string, number>>({});   // per-orb CHAOS 0..1 (disorder→pitch→stutter)
  const [createList, setCreateList] = useState<string[]>([]);   // engines queued for this constellation (multi-add)
  function toggleEngineInList(engineType: string) {
    setCreateList(prev => [...prev, engineType]);   // tap adds one (can queue duplicates)
    previewEngine(engineType);                       // preview the most-recent tap
  }
  async function doCreateOrb() {
    // build the list: queued engines, or fall back to the single previewed engine
    const list = createList.length > 0 ? createList : (createEngine ? [createEngine] : []);
    if (list.length === 0) return;
    // Resolve the target constellation + its source id FIRST (no reliance on just-queued state).
    let targetId = createConstTarget;
    let sourceId = 'default';
    let tune = 0;
    if (targetId === '__new__') {
      const name = (createConstName.trim() || `Constellation ${constellations.length}`);
      if (createSrc === 'livein') {
        sourceId = 'live';   // the worklet's live ring - input's own 12s memory, no loading needed
      } else if (createSrc === 'sample' && pendingWav) {
        // give this constellation its OWN unique source id (so multiple WAV constellations
        // don't share/overwrite 'src_pending'), and load the WAV under it.
        sourceId = `src_${Date.now()}`;
        const ps = (window as any).__pendingSrc;
        const res = await microcosmLoadSource(sourceId, pendingWav);
        tune = (ps && ps.tune != null) ? ps.tune : tuningOffsetFor(res.rootHz);
        // re-key the retained bytes from the pending id to this real source id (for saving)
        if (sourceBytesRef.current['src_pending']) {
          sourceBytesRef.current[sourceId] = sourceBytesRef.current['src_pending'];
          delete sourceBytesRef.current['src_pending'];
        }
      }
      targetId = createConstellation(name, sourceId);
      const _t = tune; setConstellations(prev => prev.map(c => c.id === targetId ? { ...c, tune: _t } : c));
    } else {
      // adding to an EXISTING constellation: inherit its source AND its tuning so the new
      // orb grains the same WAV, in tune, like the rest of that constellation.
      const existing = constellations.find(c => c.id === targetId);
      sourceId = existing ? existing.sourceId : 'default';
      tune = existing ? (existing.tune || 0) : 0;
    }
    setActiveConstId(targetId);
    const newOrbIds: string[] = [];
    for (const engineType of list) {
      const cat = ALL_ORBS.find(o => o.engineType === engineType);
      const id = addFieldOrb(engineType, cat?.label || engineType, cat?.colorKey || 'tunnel');
      newOrbIds.push(id);
      microcosmEngineSource(id, sourceId);              // route to the constellation's source
      if (tune) microcosmOrbTuning(id, tune);           // FIXED tuning slot (never overwritten by chords)
      applyJoinPitch(id, targetId, sourceId === 'default');   // arrive in the current key + on the current chord
      // seamless add: the newly-added orb inherits the PREVIEW's current level (in live mode the
      // preview has been blooming in), so committing it never jumps — it's already at that level.
      const joinLevel = (engineType === createEngine && (window as any).__previewLevel != null) ? (window as any).__previewLevel : orbLevel(id);
      volRef.current[id] = joinLevel;
      if (started.current && state==='playing') { microcosmAddOrb(id, engineType, joinLevel); microcosmEngineActive(id, true); microcosmEngineLevel(id, joinLevel); }
    }
    // AUTHORITATIVE membership (no stale state): record new orbs into the target constellation
    setConstellations(prev => prev.map(c => ({ ...c, orbIds: c.id === targetId ? Array.from(new Set([...c.orbIds, ...newOrbIds])) : c.orbIds.filter(o => !newOrbIds.includes(o)) })));
    setCreateEngine(null);
    setCreateList([]);
    stopPreview();
    setCreateConstName('');
    setPendingWav(null);
    setCreateOpen(false); setForwardConst(null); setFocused(null);   // auto-exit to field after adding
  }
  // exit the creation screen without adding — reset all pending selections cleanly
  function cancelCreate() {
    stopPreview();
    setCreateEngine(null);
    setCreateList([]);
    setCreateConstName('');
    setPendingWav(null);
    setCreateConstTarget('__new__');
    setCreateSrc('synth');
    setCreateOpen(false); setForwardConst(null); setFocused(null);
  }
  // FREEZE a synth constellation: snapshot the live ring into a static source, convert the
  // constellation to it, re-route its orbs. It then behaves exactly like a WAV constellation
  // (per-orb POSITION/scan lights up). This completes position/scan on the synth side.
  const [freezeSecs, setFreezeSecs] = useState<2|4|8>(2);   // freeze capture length
  function doFreeze(constId: string, seconds: number) {
    const c = constRef.current.find(x => x.id === constId);
    if (!c) return;
    const frozenId = `src_frozen_${Date.now()}`;
    microcosmFreezeSource(frozenId, seconds);              // capture `seconds` of the ring
    // PITCH CORRECTION: the frozen buffer holds the pitch the synth was playing when captured
    // (conductor offset = playSemi + octave*12). Once frozen it becomes a sample orb and receives
    // the live conductor broadcast on top. To keep it IN TUNE with live orbs, set its tuning to
    // cancel the baked-in pitch: tuning = -(captured conductor offset). Net = current conductor pitch.
    const capturedOffset = playSemi + octave * 12;
    // default position to the MIDDLE of the buffer (not 0) so grains read clean centre content,
    // away from the loop seam at 0/1 where the crossfade can still leave a small discontinuity.
    for (const oid of c.orbIds) {
      microcosmEngineSource(oid, frozenId);
      microcosmOrbPosition(oid, 0.5, 0.06); posRef.current[oid] = 0.5;
      microcosmOrbTuning(oid, -capturedOffset);   // cancel baked-in pitch → tracks the key
      microcosmOrbChordStep(oid, progRunning ? progTransposeRef.current : 0);   // land on current chord
    }
    setConstellations(prev => prev.map(x => x.id === constId ? { ...x, sourceId: frozenId, position: 0.5, tune: -capturedOffset } : x));
  }
  // release a frozen constellation back to the live synth (default) source
  function unFreeze(constId: string) {
    const c = constRef.current.find(x => x.id === constId);
    if (!c) return;
    for (const oid of c.orbIds) { microcosmEngineSource(oid, 'default'); microcosmOrbPosition(oid, 0, 0.06); }
    setConstellations(prev => prev.map(x => x.id === constId ? { ...x, sourceId: 'default' } : x));
  }
  const PREVIEW_ID = 'preview_temp';
  async function previewEngine(engineType: string) {
    setCreateEngine(engineType);
    await ensureStarted();
    microcosmRemoveOrb(PREVIEW_ID);
    microcosmAddOrb(PREVIEW_ID, engineType, 0.8);
    // RESET the reused preview orb's pitch slots so nothing leaks between previews — e.g. a
    // prior WAV preview left a tuning offset that would detune a later synth preview.
    microcosmOrbTuning(PREVIEW_ID, 0);
    microcosmOrbRegister(PREVIEW_ID, 0);
    microcosmOrbChordStep(PREVIEW_ID, 0);
    microcosmOrbConductor(PREVIEW_ID, 0);
    // Route the preview to whatever source the SELECTED constellation actually uses:
    //  - existing constellation -> its already-loaded source id + its tuning
    //  - new constellation with a chosen WAV -> the pending source
    //  - otherwise -> synth (default)
    const existing = createConstTarget !== '__new__' ? constellations.find(c => c.id === createConstTarget) : null;
    if (existing && existing.sourceId !== 'default') {
      microcosmEngineSource(PREVIEW_ID, existing.sourceId);
      if (existing.tune) microcosmOrbTuning(PREVIEW_ID, existing.tune);
    } else if (createConstTarget==='__new__' && createSrc==='livein') {
      microcosmEngineSource(PREVIEW_ID, 'live');   // preview granulates YOU, live, while choosing
    } else if (createConstTarget==='__new__' && createSrc==='sample' && (window as any).__pendingSrc) {
      const ps = (window as any).__pendingSrc;
      microcosmEngineSource(PREVIEW_ID, ps.id);
      if (ps.tune) microcosmOrbTuning(PREVIEW_ID, ps.tune);
    } else {
      microcosmEngineSource(PREVIEW_ID, 'default');
    }
    // arrive at the CURRENT pitch context immediately (conductor + chord). Ongoing progression
    // steps reach the preview via progStep's createEngineRef broadcast (a live ref, not a stale
    // closure), so preview follows the chords identically to a real orb.
    const _prevExisting = createConstTarget !== '__new__' ? constellations.find(c=>c.id===createConstTarget) : null;
    const _prevIsDefault = _prevExisting ? _prevExisting.sourceId === 'default'
                          : !(createSrc==='sample' && (window as any).__pendingSrc);
    applyJoinPitch(PREVIEW_ID, createConstTarget, _prevIsDefault);
    microcosmEngineActive(PREVIEW_ID, true);
    // STUDIO: instant/full for snappy auditioning. LIVE: slow graceful entry to ~90% — the
    // preview IS the bloom-in; when you then add the orb it's already playing at level (no second fade).
    if (liveMode) { microcosmFadeInEngine(PREVIEW_ID, 0.9, 2.0); (window as any).__previewLevel = 0.9; }
    else { microcosmEngineLevel(PREVIEW_ID, 0.8); (window as any).__previewLevel = 0.8; }
  }
  function stopPreview() {
    microcosmEngineActive(PREVIEW_ID, false);
    microcosmRemoveOrb(PREVIEW_ID);
  }
  // ---- SAVE / RECALL songs (Universe) — localStorage ----
  const [songMenu, setSongMenu] = useState<null | 'save' | 'open'>(null);
  const [songName, setSongName] = useState('');
  const [currentSongName, setCurrentSongName] = useState<string>('');   // the loaded/saved song, for the header
  // ── IndexedDB for source audio (WAV blobs) — localStorage can't hold audio (~5MB cap) ──
  function idbOpen(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
      const req = indexedDB.open('haar_audio', 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('sources')) db.createObjectStore('sources'); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async function idbSet(key: string, val: any): Promise<void> {
    const db = await idbOpen();
    await new Promise<void>((res, rej) => { const tx = db.transaction('sources','readwrite'); tx.objectStore('sources').put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  }
  async function idbGet(key: string): Promise<any> {
    const db = await idbOpen();
    const val = await new Promise<any>((res, rej) => { const tx = db.transaction('sources','readonly'); const r = tx.objectStore('sources').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    db.close(); return val;
  }
  function listSongs(): {name:string;ts:number}[] {
    try { return JSON.parse(localStorage.getItem('haar_songs_index') || '[]'); } catch { return []; }
  }
  function saveSong(name: string) {
    const orbs = fieldOrbs.map(o => ({
      id:o.id, engineType:o.engineType, label:o.label, colorKey:o.colorKey,
      vol: volRef.current[o.id] ?? 0.7, dens: densRef.current[o.id] ?? 0.5,
      amount: amountRef.current[o.id] ?? 0, flavour: flavourRef.current[o.id] ?? 'open',
      mute: !!muteRef.current[o.id], solo: !!soloSetRef.current[o.id],
      pan: panRef.current[o.id] ?? 0, eq: eqRef.current[o.id] ?? {lo:0,mid:0,hi:0},
      xy: xyRef.current[o.id] ?? {x:0.5,y:0.5},
      offset: offsetRef.current[o.id] ?? 0,
      locked: !!lockRef.current[o.id], subdiv: subdivRef.current[o.id] ?? 2,
      fill: fillRef.current[o.id] ?? 1, seed: seedRef.current[o.id] ?? 1,
      fauve: !!fauveRef.current[o.id], fauveDis: fauveDisRef.current[o.id] ?? 0, fauveRep: fauveRepRef.current[o.id] ?? 0, fauveRev: fauveRevRef.current[o.id] ?? 0, fauveGap: fauveGapRef.current[o.id] ?? 0,
    }));
    // constellations: full structure (name, source, members, register, pitch, tuning)
    const consts = constellations.map(c => ({
      id:c.id, name:c.name, sourceId:c.sourceId, orbIds:c.orbIds,
      register:c.register, pitchMode:c.pitchMode,
      tune: c.tune ?? 0,
    }));
    // source audio (WAV bytes) → IndexedDB (localStorage can't hold audio). Song JSON keeps only
    // the source ids + names; the actual base64 blobs live in IndexedDB keyed by source id.
    const sourceMeta: Record<string, {name:string}> = {};
    for (const c of constellations) {
      const sb = sourceBytesRef.current[c.sourceId];
      if (sb) { sourceMeta[c.sourceId] = { name: sb.name }; idbSet('src_'+c.sourceId, sb).catch(err=>console.warn('[idb] save failed', c.sourceId, err)); }
    }
    localStorage.setItem('haar_song_'+name, JSON.stringify({ name, ts:Date.now(), orbs, prog, bpm, key: { lockKey, scaleLock, scaleMode, octave }, tape: { master: tapeMaster, bal: tapeBal, muted: tapeMuted }, constellations: consts, sourceMeta }));
    const idx = listSongs().filter(s=>s.name!==name); idx.push({name, ts:Date.now()});
    localStorage.setItem('haar_songs_index', JSON.stringify(idx));
    setCurrentSongName(name); setSongMenu(null); setSongName('');
  }
  async function loadSong(name: string) {
    let data; try { data = JSON.parse(localStorage.getItem('haar_song_'+name) || ''); } catch { return; }
    if (!data?.orbs) return;
    fieldOrbs.forEach(o => removeFieldOrb(o.id));
    await ensureStarted();
    const restored: FieldOrb[] = [];
    for (const o of data.orbs) {
      volRef.current[o.id]=o.vol; densRef.current[o.id]=o.dens; amountRef.current[o.id]=o.amount;
      flavourRef.current[o.id]=o.flavour; muteRef.current[o.id]=o.mute; soloSetRef.current[o.id]=o.solo;
      panRef.current[o.id]=o.pan; eqRef.current[o.id]=o.eq; xyRef.current[o.id]=o.xy; offsetRef.current[o.id]=o.offset ?? 0;
      lockRef.current[o.id]=!!o.locked; subdivRef.current[o.id]=o.subdiv ?? 2; fillRef.current[o.id]=o.fill ?? 1; seedRef.current[o.id]=o.seed ?? 1;
      fauveRef.current[o.id]=!!o.fauve; fauveDisRef.current[o.id]=o.fauveDis ?? 0; fauveRepRef.current[o.id]=o.fauveRep ?? 0; fauveRevRef.current[o.id]=o.fauveRev ?? 0; fauveGapRef.current[o.id]=o.fauveGap ?? 0;
      // FAUVE: restore the refs now; actually activate after constellations are set up (needs sourceId)
      fauveRef.current[o.id]=!!o.fauve; fauveDisRef.current[o.id]=o.fauveDis ?? 0; fauveRepRef.current[o.id]=o.fauveRep ?? 0; fauveRevRef.current[o.id]=o.fauveRev ?? 0; fauveGapRef.current[o.id]=o.fauveGap ?? 0;
      const n = parseInt((o.id.split('_')[1]||'0')); orbCounter.current[o.engineType]=Math.max(orbCounter.current[o.engineType]||0, n);
      restored.push({ id:o.id, engineType:o.engineType, label:o.label, colorKey:o.colorKey });
      microcosmAddOrb(o.id, o.engineType, o.vol);
      microcosmEngineActive(o.id, true); microcosmEngineLevel(o.id, o.vol);
      microcosmEnginePan(o.id, o.pan); microcosmEngineEQ(o.id, o.eq.lo, o.eq.mid, o.eq.hi);
      microcosmGrainDensity(o.id, o.dens); microcosmEngineAmount(o.id, o.amount); microcosmOrbPalette(o.id, o.flavour);
      microcosmOrbHome(o.id, o.offset ?? 0);
      microcosmOrbLock(o.id, !!o.locked); microcosmOrbSubdiv(o.id, o.subdiv ?? 2); microcosmOrbFill(o.id, o.fill ?? 1); microcosmOrbSeed(o.id, o.seed ?? 1);
    }
    stopProg(); setProg(data.prog ?? []);  // restore progression (stop any running one first)
    if (data.bpm) { setBpm(data.bpm); microcosmBpm(data.bpm); }  // restore tempo
    // restore SONG KEY (root + scale-lock + major/minor + octave). Old songs without a key are left as-is.
    if (data.key) {
      if (data.key.lockKey) { setLockKey(data.key.lockKey); setPlayNote(data.key.lockKey); }
      if (typeof data.key.scaleLock === 'boolean') setScaleLock(data.key.scaleLock);
      if (data.key.scaleMode) setScaleMode(data.key.scaleMode);
      if (typeof data.key.octave === 'number') setOctave(data.key.octave);
      // TUNE THE ENGINE to the restored key now — state alone doesn't move the source,
      // so without this a loaded song hums at the previous/default pitch (C) until a key press.
      const _rootHz = NOTE_BASE[data.key.lockKey ?? 'C'] ?? 261.63;
      const _oct = typeof data.key.octave === 'number' ? data.key.octave : 0;
      microcosmSourceFreq(_rootHz * Math.pow(2, _oct));
      setPlaySemi(0);
    }
    // restore tape settings (master, four ingredients, mute) and apply to the engine
    if (data.tape) {
      const tp = data.tape;
      const bal = tp.bal ?? { hiss:0, sat:0, wow:0, roll:0 };
      setTapeBal(bal); setTapeMaster(tp.master ?? 0); setTapeMuted(!!tp.muted);
      (['hiss','sat','wow','roll'] as const).forEach(k => microcosmTapeBalance(k, (bal as any)[k] ?? 0));
      microcosmTape(tp.master ?? 0);
      microcosmTapeMute(!!tp.muted);
    }
    // ── restore CONSTELLATIONS (structure + WAV sources + routing + tuning) ──
    if (data.constellations && Array.isArray(data.constellations)) {
      // 1. reload each saved WAV source. NEW format: audio blobs live in IndexedDB (keyed by
      // src_<id>), with data.sourceMeta listing ids. OLD format: base64 inline in data.sources.
      const meta = data.sourceMeta || {};
      const legacy = data.sources || {};
      const sids = Object.keys(meta).length ? Object.keys(meta) : Object.keys(legacy);
      for (const sid of sids) {
        try {
          let sb = null as null | {name:string;b64:string};
          if (meta[sid]) { sb = await idbGet('src_'+sid); }        // IndexedDB (new)
          if (!sb && legacy[sid]) { sb = legacy[sid]; }             // inline base64 (old)
          if (!sb || !sb.b64) { console.warn('[load] no audio for source', sid); continue; }
          const binStr = atob(sb.b64);
          const bytes = new Uint8Array(binStr.length);
          for (let i=0;i<binStr.length;i++) bytes[i]=binStr.charCodeAt(i);
          await microcosmLoadSource(sid, new File([bytes], sb.name || 'source.wav'));
          sourceBytesRef.current[sid] = sb;   // retain for re-saving
        } catch(err) { console.warn('[load] source restore failed', sid, err); }
      }
      // 2. restore the constellations state
      const restoredConsts = data.constellations.map((c:any) => ({
        id:c.id, name:c.name, sourceId:c.sourceId, orbIds:c.orbIds||[],
        register:c.register||0, pitchMode:c.pitchMode||'varispeed', tune:c.tune||0,
      }));
      setConstellations(restoredConsts.length ? restoredConsts : [{ id: DEFAULT_CONST_ID, name:'Synth', sourceId:'default', orbIds:[], register:0, pitchMode:'varispeed' }]);
      // 3. re-route + re-tune + re-register each orb per its constellation
      for (const c of restoredConsts) {
        for (const oid of c.orbIds) {
          microcosmEngineSource(oid, c.sourceId);
          if (c.tune) microcosmOrbTuning(oid, c.tune);
          if (c.register) microcosmOrbRegister(oid, c.register);
          if (fauveRef.current[oid] && c.sourceId !== 'default') {
            microcosmFauveOn(oid, c.sourceId);
            microcosmFauveUpdatePitch(oid);
            microcosmFauveParam(oid, 'disorder', fauveDisRef.current[oid] ?? 0);
            microcosmFauveParam(oid, 'repeat', fauveRepRef.current[oid] ?? 0);
            microcosmFauveParam(oid, 'reverse', fauveRevRef.current[oid] ?? 0);
            microcosmFauveParam(oid, 'gaps', fauveGapRef.current[oid] ?? 0);
          }
        }
      }
      // keep the source-id counter clear of collisions is unnecessary (timestamp ids)
    }
    setFieldOrbs(restored); setCurrentSongName(name); setSongMenu(null);
  }
  const [life, setLife] = useState(0.32);
  const [tapeAmt, setTapeAmt] = useState(0);   // Tape character amount 0..1 (drag the button)
  const [tapeOpen, setTapeOpen] = useState(false);   // tape breakout panel
  const [tapeBal, setTapeBal] = useState({ hiss: 0, sat: 0, wow: 0, roll: 0 });   // four tape ingredients 0..1
  const tapeActive = tapeBal.hiss>0.01 || tapeBal.sat>0.01 || tapeBal.wow>0.01 || tapeBal.roll>0.01;
  const [tapeMaster, setTapeMaster] = useState(0);   // master multiplier (starts at 0 = tape off)
  const [tapeMuted, setTapeMuted] = useState(false);   // tape bypass toggle
  const [solo, setSolo] = useState(false);      // TEST SOLO
  const soloRef = useRef(false);                // TEST SOLO
  const [density, setDensity] = useState(0.5);  // TEST DENSITY
  const amountRef = useRef<Record<string, number>>({}); // per-orb flavour amount (default 0)
  const volRef = useRef<Record<string, number>>({});   // per-orb volume (default 0.7)
  const densRef = useRef<Record<string, number>>({});  // per-orb density (default 0.5)
  const constMuteRef = useRef<Record<string, boolean>>({}); // per-CONSTELLATION mute (grid/rig tier)
  const constLevelRef = useRef<Record<string, number>>({}); // per-CONSTELLATION level multiplier 0..1 (default 1)
  const muteRef = useRef<Record<string, boolean>>({});  // per-channel mute (mixer)
  const soloSetRef = useRef<Record<string, boolean>>({}); // per-channel solo (mixer)

  // ── ORB-BACK voice state (UI ready; engine wiring = multi-voice source layer, later) ──
  type VoiceDef = { id: string; type: string; on: boolean; oct: number; level: number; detune: number };
  const voicesRef = useRef<Record<string, VoiceDef[]>>({});   // per-orb voice list
  const [selVoice, setSelVoice] = useState<string | null>(null); // selected voice id (this orb)
  function defaultVoices(): VoiceDef[] {
    return [
      { id:'v_tri',   type:'Tri',   on:true,  oct:0, level:0.75, detune:0 },
      { id:'v_sine',  type:'Sine',  on:true,  oct:0, level:0.7,  detune:0 },
      { id:'v_noise', type:'Noise', on:false, oct:0, level:0.5,  detune:0 },
    ];
  }
  function getVoices(orbId: string): VoiceDef[] {
    if (!voicesRef.current[orbId]) voicesRef.current[orbId] = defaultVoices();
    return voicesRef.current[orbId];
  }
  // ---- per-orb FX chain (signal path) — UI ready, not yet audible ----
  type FxDef = { id: string; type: string; on: boolean; fixed?: boolean; params: Record<string, number> };
  const fxRef = useRef<Record<string, FxDef[]>>({});   // per-orb effect chain
  const [selFx, setSelFx] = useState<string | null>(null); // selected effect id (this orb)
  function defaultFx(): FxDef[] {
    return [
      { id:'fx_grain',  type:'Grain',  on:true, fixed:true,  params:{ size:0.5, spread:0.4, density:0.5 } },
      { id:'fx_filter', type:'Filter', on:true,              params:{ cutoff:0.7, res:0.2, type:0 } },
      { id:'fx_reverb', type:'Reverb', on:true,              params:{ size:0.5, decay:0.5, mix:0.3 } },
      { id:'fx_delay',  type:'Delay',  on:true,              params:{ time:0.3, feedback:0.3, mix:0.25 } },
      { id:'fx_out',    type:'Out',    on:true, fixed:true,  params:{ level:0.8 } },
    ];
  }
  function getFx(orbId: string): FxDef[] {
    if (!fxRef.current[orbId]) fxRef.current[orbId] = defaultFx();
    return fxRef.current[orbId];
  }
  const flavourRef = useRef<Record<string, string>>({});  // per-orb palette id (UI per-orb; engine still global)
  // per-orb REGISTER: interval offset in semitones from the root (consonant set). Default 0 = root.
  const offsetRef = useRef<Record<string, number>>({});
  // per-orb TEMPO LOCK state (free vs locked; subdivision, fill, seed)
  const lockRef = useRef<Record<string, boolean>>({});
  const subdivRef = useRef<Record<string, number>>({});
  const fillRef = useRef<Record<string, number>>({});
  const seedRef = useRef<Record<string, number>>({});
  function applyLock(id: string) {
    microcosmOrbLock(id, !!lockRef.current[id]);
    microcosmOrbSubdiv(id, subdivRef.current[id] ?? 2);
    microcosmOrbFill(id, fillRef.current[id] ?? 1);
    microcosmOrbSeed(id, seedRef.current[id] ?? 1);
  }
  function applyHome(id: string) {
    microcosmOrbHome(id, offsetRef.current[id] ?? 0);
  }
  const panRef = useRef<Record<string, number>>({});    // per-channel pan (-1..1, 0=centre)
  const eqRef = useRef<Record<string, {lo:number;mid:number;hi:number}>>({}); // per-channel EQ dB (-12..12, 0=flat)
  const [expandedChannel, setExpandedChannel] = useState<string|null>(null); // mixer channel expanded sideways
  const [, forceOrb] = useState(0); // re-render after per-orb ref writes
  const [, forceAmt] = useState(0);
  const started = useRef(false);
  const mutedRef = useRef(false);
  const xyRef = useRef<Record<string, XY>>(defaultXY());

  const orbs = fieldOrbs;                 // field renders from live instances (was ALL_ORBS.slice(0,count))
  const count = fieldOrbs.length;        // count now derives from instances (drives positioning)

  useEffect(() => {
    const update = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // RACK: activate ALL visible orbs' engines (present = playing)
  // per-orb level = the orb's OWN volume (the mixer fader is the single source of truth).
  // selection no longer changes volume; mute/solo still gate it.
  function reapplyLevels(){ fieldOrbs.forEach(o => { microcosmEngineLevel(o.id, orbLevel(o.id)); }); }
  function orbLevel(id: string): number {
    if (mutedRef.current) return 0;
    if (muteRef.current[id]) return 0;                    // per-channel mute (mixer)
    const oc = constRef.current.find(c => c.orbIds.includes(id));
    if (oc && constMuteRef.current[oc.id]) return 0;   // constellation mute (group tier)
    const cl = oc ? (constLevelRef.current[oc.id] ?? 1) : 1;  // constellation level (group tier)
    const anySolo = Object.values(soloSetRef.current).some(Boolean);
    if (anySolo && !soloSetRef.current[id]) return 0;     // solo: non-soloed channels silent
    return (volRef.current[id] ?? 0.7) * cl;                     // the fader value
  }
  function toggleConstMute(constId: string) {
    constMuteRef.current[constId] = !constMuteRef.current[constId];
    reapplyLevels();
    setConstMuteTick(t => t + 1);   // repaint anything showing mute state
  }
  function setConstLevel(constId: string, v: number) {
    constLevelRef.current[constId] = Math.max(0, Math.min(1, v));
    reapplyLevels();
  }
  const reapplyLevelsRef = useRef(reapplyLevels); reapplyLevelsRef.current = reapplyLevels;
  const orbLevelRef = useRef(orbLevel); orbLevelRef.current = orbLevel;   // driver reads live levels for amplitude glow
  const toggleConstMuteRef = useRef(toggleConstMute); toggleConstMuteRef.current = toggleConstMute;
  const setConstLevelRef = useRef(setConstLevel); setConstLevelRef.current = setConstLevel;
  function activateRack() {
    if (!started.current) return;
    fieldOrbs.forEach(o => {
      const on = orbs.some(v => v.id === o.id);
      if (on) microcosmAddOrb(o.id, o.engineType, orbLevel(o.id));  // register instance (id carries engineType)
      microcosmEngineActive(o.id, on);
      if (on) microcosmEngineLevel(o.id, orbLevel(o.id));
    });
    // PER-ORB XY restore: every orb gets its own stored shaping (no global wipe)
    fieldOrbs.forEach(o => { const v = xyRef.current[o.id] ?? { x:0.5, y:0.5 }; microcosmOrbXY(o.id, v.x, v.y); });
    // FAUVE: re-activate for orbs whose setting is on (stop silenced them but kept the ref)
    for (const oid in fauveRef.current) {
      if (!fauveRef.current[oid]) continue;
      const c = constRef.current.find(x => x.orbIds.includes(oid));
      if (!c || c.sourceId === 'default') continue;
      microcosmFauveOn(oid, c.sourceId);
      microcosmFauveUpdatePitch(oid);
      microcosmFauveParam(oid, 'disorder', fauveDisRef.current[oid] ?? 0);
      microcosmFauveParam(oid, 'repeat', fauveRepRef.current[oid] ?? 0);
      microcosmFauveParam(oid, 'reverse', fauveRevRef.current[oid] ?? 0);
      microcosmFauveParam(oid, 'gaps', fauveGapRef.current[oid] ?? 0);
    }
  }

  useEffect(() => { if (started.current && state==='playing') activateRack(); /* eslint-disable-next-line */ }, [count]);

  // Spacebar = Start/Stop (ignore when typing in an input/textarea)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement;
      const tag = (t?.tagName || '').toLowerCase();
      const type = (t as HTMLInputElement)?.type;
      // only block space for TEXT entry (where space types a char) — not range sliders/buttons
      if (tag === 'textarea' || t?.isContentEditable) return;
      if (tag === 'input' && type !== 'range') return;
      // also blur a focused range slider so repeated space doesn't get swallowed
      if (tag === 'input' && type === 'range') t.blur();
      e.preventDefault();
      if (state === 'playing') doStop(); else doStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    /* eslint-disable-next-line */
  }, [state]);

  // play a note `semis` semitones from the locked root (negative = down, positive = up)
  // KEY DIALS: vertical scrub (drag up = +1 step, down = -1) like the tempo dial. Calls step(delta).
  function keyScrub(e: React.PointerEvent, step: (d: number) => void) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY; let acc = 0;
    el.classList.add('dial-active');
    const move = (ev: PointerEvent) => { const steps = Math.round((y0 - ev.clientY) / 16); if (steps !== acc) { step(steps - acc); acc = steps; } };
    const up = () => { el.classList.remove('dial-active'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  function playAt(note: string, semis: number) {
    const rootHz = NOTE_BASE[lockKey] ?? 261.63;
    const snapped = snapToScale(semis);                    // SCALE-LOCK: snap the played note to key
    const hz = rootHz * Math.pow(2, (snapped / 12) + octave + (progTransposeRef.current/12));
    microcosmSourceFreq(hz);
    setPlayNote(note); setPlaySemi(snapped);
    // CONDUCTOR: push the note offset to SAMPLE orbs (default/synth already moved via SourceFreq)
    const noteSemis = snapToScale(semis + octave * 12);   // SCALE-LOCK: snap to key when on (else raw)
    const defaultOrbIds = new Set(constRef.current.filter(c => c.sourceId === 'default').flatMap(c => c.orbIds));
    for (const o of fieldOrbs) if (!defaultOrbIds.has(o.id)) microcosmOrbConductor(o.id, noteSemis);
  }
  // double-click a note to LOCK it as the root (yellow); single tap to play
  // `semis` = semitone distance from current locked root
  function tapNote(note: string, semis: number) {
    const now = Date.now();
    const tapId = note + ':' + semis;
    if (lastTap.current.key === tapId && now - lastTap.current.t < 320) {
      // double-click -> LOCK this note as the new root; it becomes the centre (0 semis)
      setLockKey(note);
      setPlayNote(note); setPlaySemi(0);
      const rootHz = NOTE_BASE[note] ?? 261.63;
      microcosmSourceFreq(rootHz * Math.pow(2, octave));
      const noteSemis = 0 + octave * 12;
      const defIds = new Set(constRef.current.filter(c => c.sourceId === 'default').flatMap(c => c.orbIds));
      for (const o of fieldOrbs) if (!defIds.has(o.id)) microcosmOrbConductor(o.id, noteSemis);
      lastTap.current = { key:'', t:0 };
    } else {
      // single tap -> play this note (semis from current locked root)
      playAt(note, semis);
      lastTap.current = { key: tapId, t: now };
    }
  }

  async function ensureStarted() {
    if (started.current) return;
    started.current = true;
    await startAudio(); await microcosmStart(); microcosmSynthOn();   // classic default; livein/wav paths mute it
    // tune the source to the locked root so audio matches the yellow label from note one
    const rootHz = NOTE_BASE[lockKey] ?? 261.63;
    microcosmSourceFreq(rootHz * Math.pow(2, octave));
    setPlayNote(lockKey); setPlaySemi(0);
    setState('playing'); activateRack();
  }
  function enterFocus(id: string) { setSelected(id); setFocused(id); requestAnimationFrame(()=>setFocusShown(true)); }
  function exitFocus() { setFocusShown(false); setTimeout(()=>setFocused(null), 920); }
  const lastBackTap = useRef<{ id:string; t:number }>({ id:'', t:0 });
  function handleBackTap(id: string) {   // double-tap the focused orb -> exit back to field (mirrors enter)
    const now = Date.now();
    if (lastBackTap.current.id === id && now - lastBackTap.current.t < 320) {
      lastBackTap.current = { id:'', t:0 };
      exitFocus();
      return;
    }
    lastBackTap.current = { id, t: now };
  }
  function openMix() { setMixOpen(true); requestAnimationFrame(()=>setMixShown(true)); }
  function closeMix() { setMixShown(false); setTimeout(()=>setMixOpen(false), 420); }
  // tap empty field to dismiss any open panel (tape / chords / mixer)
  function closePanels() { if (tapeOpen) setTapeOpen(false); if (chordsOpen) setChordsOpen(false); if (mixOpen) closeMix(); }
  async function handleSelect(id: string) {
    // double-tap the same orb -> enter focused view
    const now = Date.now();
    if (lastOrbTap.current.id === id && now - lastOrbTap.current.t < 320) {
      lastOrbTap.current = { id:'', t:0 };
      enterFocus(id);
      return;
    }
    lastOrbTap.current = { id, t: now };
    setSelected(id);
    await ensureStarted();
    if (state === 'stopped') return;
    // selection drives the XY controls only — volume stays each orb's own (the fader's truth)
    fieldOrbs.forEach(o => {
      if (orbs.some(v => v.id === o.id)) microcosmEngineLevel(o.id, orbLevel(o.id));
    });
    const v = xyRef.current[id] ?? { x:0.5, y:0.5 };
    microcosmOrbXY(id, v.x, v.y);   // PER-ORB: selection no longer wipes other orbs' shaping
  }
  const [swelling, setSwelling] = useState(false);
  const swellRAF = useRef<number>(0);
  // SWELL: one-shot gust — ramp grain+pitch spread up fast, then ease back to the current XY baseline.
  function doSwell() {
    const id = focused ?? selected;
    const base = (id && xyRef.current[id]) ? xyRef.current[id] : { x: 0.5, y: 0.5 };
    const densBase = (id && densRef.current[id] != null) ? densRef.current[id] : 0.5;
    // capture per-orb level baselines so we can crescendo the WHOLE field and restore
    const orbs = fieldOrbs.map(o => o.id);
    const levBase: Record<string, number> = {};
    orbs.forEach(oid => { levBase[oid] = orbLevel(oid); });
    cancelAnimationFrame(swellRAF.current);
    setSwelling(true);
    const t0 = performance.now();
    // FILTER WAVE — slow deep dive, upward overshoot past normal, slow settle home. ~6.5s.
    // Phase 1 (dive):     from resting cutoff, glide slowly DOWN to a deep low (Q sings). ~2.6s
    // Phase 2 (surge):    upward force sweeps UP and OVERSHOOTS past normal to wide open. ~1.4s
    // Phase 3 (return):   slow glide back DOWN from the overshoot to the resting cutoff. ~2.4s
    const NEUTRAL = 8000;     // resting cutoff
    const LOW = 70;           // deep low point of the dive (much lower)
    const HIGH = 5000;        // overshoot ceiling (lower)
    const dive = 2600, surge = 1400, ret = 2400, total = dive + surge + ret;
    const Qbase = 1, Qpeak = 13;
    const step = () => {
      const e = performance.now() - t0;
      let hz: number, q: number;
      if (e < dive) {
        const k = e / dive;
        const ec = k * k;                                  // slow start, accelerating down
        hz = NEUTRAL * Math.pow(LOW / NEUTRAL, ec);        // NEUTRAL -> LOW
        q = Qbase + (Qpeak - Qbase) * k;                   // resonance builds into the dive
      } else if (e < dive + surge) {
        const k = (e - dive) / surge;
        const ec = 1 - Math.pow(1 - k, 3);                 // strong ease-out = upward force
        hz = LOW * Math.pow(HIGH / LOW, ec);               // LOW -> HIGH (overshoots past NEUTRAL)
        q = Qpeak + (Qbase - Qpeak) * ec;                  // resonance releases as it opens
      } else {
        const k = Math.min(1, (e - dive - surge) / ret);
        const ec = 1 - Math.pow(1 - k, 2);                 // slow glide back
        hz = HIGH * Math.pow(NEUTRAL / HIGH, ec);          // HIGH -> NEUTRAL (settle home)
        q = Qbase;
      }
      microcosmSweep(hz, q);
      if (e < total) { swellRAF.current = requestAnimationFrame(step); }
      else { microcosmResetFilter(); setSwelling(false); }
    };
    swellRAF.current = requestAnimationFrame(step);
  }
  function handleXY(nx: number, ny: number) {
    const id = selected;
    const next = { ...xyRef.current, [id]: { x:nx, y:ny } };
    xyRef.current = next; setXyMap(next);
    microcosmOrbXY(id, nx, ny);   // PER-ORB: only this orb's grains change; others keep their shaping
  }
  async function doStart() {
    if (!started.current) { await ensureStarted(); return; }
    await microcosmStart(); activateRack(); setState('playing'); barAnchorRef.current = performance.now(); barAudioAnchorRef.current = microcosmAudioTime();
  }
  function doStop() { microcosmStopEngine(); microcosmFauveOffAll(); setState('stopped'); }   // silence Fauve audio but KEEP fauveRef (your setting) so save/restart preserves it
  function toggleMute() {
    const m = !mutedRef.current; mutedRef.current=m; setMuted(m);
    activateRack();
  }

  // ── LAYOUT MODEL ──────────────────────────────────────────────
  // The screen has two territories: TOP (field-or-focus) and BOTTOM (mixer, when open).
  // Opening the mixer shrinks the TOP; the field re-lays-out into the smaller height.
  const MIXER_H = 0.40;                    // mixer occupies 40% of screen when open
  const [survey, setSurvey] = useState(false);   // hold N: every name in light at once
  const [hoverOrb, setHoverOrb] = useState<string|null>(null);   // interior: orb near the pointer
  const [consoleUp, setConsoleUp] = useState(true);   // bottom console (keyboard/tokens): up = working, down = full sky
  const topFrac = mixOpen ? (1 - MIXER_H) : consoleUp ? FIELD_H : 0.93;  // console down -> the cosmos takes the window
  const fh = dim.h * topFrac;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'n' || e.key === 'N') setSurvey(true);
      if (e.key === 'c' || e.key === 'C') setConsoleUp(v => !v);
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'n' || e.key === 'N') setSurvey(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  }, []);              // field height drives ALL orb positions (auto re-layout)
  const mixerH = dim.h * MIXER_H;          // mixer territory height
  const bottomBarH = dim.h * 0.30;         // the keyboard/field/system bar height (field state)
  // ──────────────────────────────────────────────────────────────
  // SPHERES layout: systems + orbits replace the scatter. Static (bars=0) in A1; A2 animates.
  const liveConstCount = constellations.filter(c => c.orbIds.length > 0).length;
  const cosmosActive = liveConstCount >= 2 && !forwardConst;   // cosmos ONLY with 2+ constellations; one constellation = the original field
  useEffect(() => { setActiveContext(cosmosActive ? 'cosmos' : 'interior'); }, [cosmosActive]);
  const field = cosmosActive ? orbitalField(constellations, CONST_TINTS, dim.w, fh) : { systems: [], orbits: [] };
  // A2: ORBIT DRIVER — one rAF loop moves positioning wrappers imperatively (React stays out of the 60fps path).
  const DEPTH_BLUR = false;   // EXPERIMENT: true = atmospheric blur for far orbs, false = crisp bodies (depth via scale+light only)
  const orbWrapRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fieldWrapRefs = useRef<Record<string, HTMLDivElement | null>>({}); // interior/single-field orbs: idle drift + centre breath
  // GRAIN COMETS: pool of real-grain sparks drawn on one canvas by the driver
  const cometCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const starfieldRef = useRef<{ w:number; layers:{x:number;y:number;r:number;a:number}[][] } | null>(null);
  const orbScreenPosRef = useRef<Record<string,{x:number;y:number}>>({});   // driver publishes positions here each frame

  const fieldRef2 = useRef(field); fieldRef2.current = field;
  const selectedRef2 = useRef(selected); selectedRef2.current = selected;
  useEffect(() => {
    let raf = 0;
    const barSec = () => (60 / (bpmRef.current || 92)) * 4;   // 4/4 bar length in seconds
    const t0 = performance.now();
    const step = (now: number) => {
      const bars = (now - t0) / 1000 / barSec();
      microcosmDrainGrains();   // grain emission visuals retired — drain and discard so the queue never pools
      for (const o of fieldRef2.current.orbits) {
        const el = orbWrapRefs.current[o.orbId];
        if (!el) continue;
        // (no selection exemption: in the cosmos every orb orbits)
        const p = orbitPos(o, bars);
        el.style.transformOrigin = `${o.cx}px ${o.cy}px`;      // scale pivots on the ORB, not the screen corner
        const near = (p.z + 1) / 2;                            // 0 far .. 1 near
        const scale = 0.55 + near * 1.05;                      // CINEMA range: far 0.55x .. near 1.6x — parallax you feel
        el.style.transform = `translate(${(p.x - o.cx).toFixed(1)}px, ${(p.y - o.cy).toFixed(1)}px) scale(${scale.toFixed(3)})`;
        el.style.opacity = (0.55 + near * 0.45).toFixed(3);    // far dims (depth)
        orbScreenPosRef.current[o.orbId] = { x: p.x, y: p.y, d: near } as any;
        // one filter: amplitude brightness + DEPTH BLUR (far = atmospheric diffuse, near = crisp)
        const clv = Math.sqrt(Math.max(0, Math.min(1, orbLevelRef.current(o.orbId))));
        const blur = DEPTH_BLUR ? (1 - near) * 2.6 : 0;
        el.style.filter = `brightness(${(0.18 + clv * 1.17).toFixed(3)})` + (blur > 0.05 ? ` blur(${blur.toFixed(2)}px)` : '');
        if (!el.style.transition) el.style.transition = 'filter 0.6s ease';
        el.style.zIndex = p.z < 0 ? '4' : '12';                // far side passes BEHIND the source star (star svg z=1? star sits behind; use orb layering)
      }
      // FIELD MODE idle drift: micro-orbits around each slot (a few px, tempo-locked) + centre orb breath
      if (Math.floor(now / 5000) !== (window as any).__driftTick) {
        (window as any).__driftTick = Math.floor(now / 5000);
        const conn = Object.values(fieldWrapRefs.current).filter(e => e && e.isConnected);
        console.log('[drift] refs:', Object.keys(fieldWrapRefs.current).length, 'connected:', conn.length,
          'sample transform:', conn[0] ? (conn[0] as HTMLElement).style.transform : 'n/a');
      }
      for (const oid in fieldWrapRefs.current) {
        const el = fieldWrapRefs.current[oid];
        if (!el || !el.isConnected) continue;
        let h = 7; for (let k = 0; k < oid.length; k++) h = (h * 31 + oid.charCodeAt(k)) & 0x7fffffff;
        const phase = (h % 628) / 100;                       // stable per-orb phase
        const isCentre = el.dataset.centre === '1';
        // AMPLITUDE GLOW: light follows the mixer's truth. Full level = full burn;
        // muted/silent = ember (25%). Smoothed by CSS transition on filter.
        const lv = Math.sqrt(Math.max(0, Math.min(1, orbLevelRef.current(oid))));   // perceptual: 50% vol reads ~74% light
        el.style.filter = `brightness(${(0.18 + lv * 1.17).toFixed(3)})`;   // headroom: full level BURNS (~1.35), default (~0.84 after sqrt) ~= full colour   // 5% ember .. 100% full colour
        if (!el.style.transition) el.style.transition = 'filter 0.6s ease';
        if (isCentre) {
          el.style.transform = '';                            // the workbench holds still
        } else {
          const a = (bars / 4) * Math.PI * 2 + phase;        // one wander per 4 bars — visible, unhurried
          const dx = Math.cos(a) * 26, dy = Math.sin(a * 1.3 + phase) * 16;
          el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        }
        // publish interior position for comets: wrapper origin is the slot; Orb centres itself at slot x/y
        const r = el.getBoundingClientRect();
        orbScreenPosRef.current[oid] = { x: r.left + r.width/2, y: r.top + r.height/2 };
      }
      // PLANET SPIN: drift each body's light point around its face (tempo-locked) — motion sells the sphere
      {
        const la = (bars / 8) * Math.PI * 2;                         // one lighting cycle per 8 bars
        const lx = 38 + Math.cos(la) * 16, ly = 32 + Math.sin(la) * 12;
        document.querySelectorAll('.planet-light').forEach(g => { g.setAttribute('cx', lx + '%'); g.setAttribute('cy', ly + '%'); });
        const tx = 104 - lx, ty = 104 - ly;                          // terminator opposes the light
        document.querySelectorAll('.planet-term').forEach(g => { g.setAttribute('cx', tx + '%'); g.setAttribute('cy', ty + '%'); });
      }
      // PARALLAX STARFIELD: three layers sliding at different rates with the world's turn
      {
        const cv2 = cometCanvasRef.current;
        if (cv2) {
          const ctx2 = cv2.getContext('2d');
          if (ctx2) {
            ctx2.clearRect(0, 0, cv2.width, cv2.height);
            ctx2.globalCompositeOperation = 'source-over';
            if (!starfieldRef.current || starfieldRef.current.w !== cv2.width) {
              const layers = [] as { x:number;y:number;r:number;a:number }[][];
              let sd = 42;
              const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
              for (let L = 0; L < 3; L++) {
                const stars = [] as { x:number;y:number;r:number;a:number }[];
                for (let i = 0; i < 70; i++) stars.push({ x: rnd()*cv2.width, y: rnd()*cv2.height, r: 0.5 + rnd()*(L===2?1.4:0.8), a: 0.12 + rnd()*0.3 });
                layers.push(stars);
              }
              starfieldRef.current = { w: cv2.width, layers };
            }
            const drift = bars * 6;                              // world-turn drives the slide
            starfieldRef.current.layers.forEach((stars, L) => {
              const par = (L + 1) * 0.35;                        // deeper layers slide less
              ctx2.fillStyle = '#cfd8ff';
              for (const st of stars) {
                const sx = (st.x + drift * par) % cv2.width;
                ctx2.globalAlpha = st.a * (0.7 + 0.3 * Math.sin(now / 900 + st.x));   // gentle twinkle
                ctx2.beginPath(); ctx2.arc(sx, st.y, st.r, 0, Math.PI * 2); ctx2.fill();
              }
            });
            ctx2.globalAlpha = 1;
          }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  const centrePos = { x: CENTRE.fx * dim.w, y: CENTRE.fy * fh, size: CENTRE.size };
  // INTERIOR layout (faithful to pre-Spheres original, scoped to the forward constellation):
  // sats from TOTAL member count; selected takes centrePos; others index into sats.
  const iMembers = forwardConst ? orbs.filter(x => constFor(x.id)?.id === forwardConst) : orbs;
  const iSalt = forwardConst ? Array.from(forwardConst).reduce((a,ch)=>a+ch.charCodeAt(0),0) : 0;  // single constellation: salt 0 = EXACT original layout
  const iSats = satelliteSlots(iMembers.length, dim.w, fh, CENTRE.size, iSalt);
  const iOthers = iMembers.filter(o => o.id !== selected);
  const interiorOrderRef = useRef<string[]>([]);
  interiorOrderRef.current = (() => {
    const sel = iMembers.find(o => o.id === selected)?.id;
    return sel ? [sel, ...iMembers.filter(o => o.id !== sel).map(o => o.id)] : iMembers.map(o => o.id);
  })();
  const interiorSlotFor = (id: string) => {
    if (id === selected) return centrePos;
    const idx = iOthers.findIndex(o => o.id === id);
    return iSats[idx] ?? centrePos;
  };
  const slotFor = (id: string) => {
    if (id === selected) return centrePos;               // interim: Slice B makes this orbital
    const o = field.orbits.find(ob => ob.orbId === id);
    if (!o) return centrePos;
    const p = orbitPos(o, 0);
    return { x: p.x, y: p.y, size: o.size };
  };
  const zlabel: React.CSSProperties = { fontSize:11.5, fontWeight:500, letterSpacing:'0.25em', color:'rgba(255,255,255,0.3)', marginBottom:14 };

  return (
    <main onPointerMove={fieldHover} onClick={fieldClickConst} style={{ position:'fixed', inset:0, overflow:'hidden', touchAction:'none', background:'radial-gradient(ellipse at 50% 28%, #10131f 0%, #070810 66%, #04050a 100%)', fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', color:'#fff' }}>
      {/* SPHERES: source stars + orbit paths (behind everything) */}
      {cosmosActive && <svg style={{ position:'absolute', left:0, top:0, width:'100%', height:fh, pointerEvents:'none', zIndex:1 }}>
        {field.systems.map(sys => {
          const name = constellations.find(c => c.id === sys.constId)?.name ?? '';
          const hov = hoverConst === sys.constId;
          return (
          <g key={sys.constId}>
            {/* AMBIENT BLEED: the system's light staining surrounding space */}
            <circle cx={sys.cx} cy={sys.cy} r={Math.min(dim.w / Math.max(field.systems.length,1) * 0.52, 420)} fill={sys.tint} opacity={0.012} />
            {/* SOURCE STAR: a true luminary — layered corona, hot core, faint spill into the void */}
            <circle cx={sys.cx} cy={sys.cy} r={90} fill={sys.tint} opacity={hov ? 0.10 : 0.06} />
            <circle cx={sys.cx} cy={sys.cy} r={44} fill={sys.tint} opacity={0.14} />
            <circle cx={sys.cx} cy={sys.cy} r={16} fill={sys.tint} opacity={0.5} />
            <circle cx={sys.cx} cy={sys.cy} r={6.5} fill="#fff" opacity={0.95} />
            <text x={sys.cx} y={sys.cy - 40} textAnchor="middle"
              fontFamily='"Space Mono", monospace' fontSize={13} letterSpacing="0.3em"
              fill={sys.tint} opacity={(hov || survey) ? 0.9 : 0} style={{ transition:'opacity 0.5s' }}>
              {name.toUpperCase()}
            </text>
          </g>
          );
        })}
        {field.orbits.map(o => (
          <ellipse key={o.orbId} cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry}
            transform={`rotate(${(o.tilt*180/Math.PI).toFixed(1)} ${o.cx} ${o.cy})`}
            fill="none" stroke={o.tint} strokeOpacity={0.055} strokeWidth={0.7} />
        ))}
      </svg>}
      {forwardConst && liveConstCount >= 2 && (
        <>
          <div style={{ position:'absolute', top:26, left:0, right:0, textAlign:'center', zIndex:2, pointerEvents:'none' }}>
            <span style={{ fontFamily:'"Space Mono", monospace', fontSize:13, letterSpacing:'0.35em', color: CONST_TINTS[Math.max(0, constellations.filter(c=>c.orbIds.length>0).findIndex(c=>c.id===forwardConst)) % CONST_TINTS.length], opacity:0.9 }}>
              {(constellations.find(c=>c.id===forwardConst)?.name ?? '').toUpperCase()}
            </span>

          </div>
          <div className="haar-hover" onClick={()=>{ setForwardConst(null); setFocused(null); }}
            style={{ position:'absolute', top:26, left:340, zIndex:260, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
            {/* the cosmos in miniature: an orbit seen edge-on, a body upon it */}
            <svg width="30" height="18" viewBox="0 0 30 18" style={{ opacity:0.4, transition:'opacity 0.25s' }}
              onMouseEnter={(e)=>{ (e.currentTarget as SVGElement).style.opacity='0.85'; }}
              onMouseLeave={(e)=>{ (e.currentTarget as SVGElement).style.opacity='0.4'; }}>
              <ellipse cx="15" cy="9" rx="13" ry="5" fill="none" stroke="#E8E2D6" strokeWidth="0.8" />
              <circle cx="24.5" cy="6.4" r="2.1" fill="#E8E2D6" />
            </svg>
            <span className="haar-lbl" style={{ fontFamily:'"Space Mono", monospace', fontSize:9.5, letterSpacing:'0.3em', color:'rgba(232,226,214,0.6)' }}>COSMOS</span>
          </div>
        </>
      )}
      {/* GRAIN COMETS canvas — every real grain, drawn as a spark */}
      <canvas ref={cometCanvasRef} width={dim.w} height={fh}
        style={{ position:'absolute', left:0, top:0, width:dim.w, height:fh, pointerEvents:'none', zIndex:20 }} />
      {/* tap-out backdrop: when a panel is open, a click on empty field dismisses it */}
      {(tapeOpen || chordsOpen || mixOpen) && (
        <div onClick={closePanels} style={{ position:'absolute', inset:0, zIndex:200, background:'transparent' }} />
      )}
      <style>{`
        @keyframes tapeRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        input[type=range] { -webkit-appearance: none; appearance: none; background: rgba(232,226,214,0.12); border-radius: 2px; outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 13px; height: 13px; border-radius: 50%; background: currentColor; cursor: pointer; box-shadow: 0 0 8px rgba(232,176,112,0.5); }
        .haar-lbl { opacity: 0; transition: opacity 0.25s ease; pointer-events: none; }
        .haar-hover:hover .haar-lbl { opacity: 0.85; }
        .haar-sectionlbl { opacity: 0; transition: opacity 0.25s ease; pointer-events: none; }
        .haar-section:hover .haar-sectionlbl { opacity: 1; }
        .dial-active { filter: brightness(1.4); }
      `}</style>
      {/* WORKBENCH: inside the planet (dev skin - styling pass comes after the interaction proves out) */}
      {planetOpen && (() => {
        const R = microcosmRecipeGet('tunnel') || {};
        const row = (label: string, key: string, min: number, max: number, step: number) => (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:10, letterSpacing:'0.1em', color:'rgba(255,255,255,0.55)', width:150, fontFamily:'Space Mono, monospace' }}>{label}</span>
            <input type="range" min={min} max={max} step={step} value={R[key] ?? 0}
              onChange={(e)=>{ microcosmRecipeSet('tunnel', key, parseFloat(e.target.value)); setRTick(x=>x+1); }}
              style={{ flex:1, accentColor:'#a6ffd8' }} />
            <span style={{ fontSize:10.5, color:'#a6ffd8', width:46, textAlign:'right', fontFamily:'Space Mono, monospace' }}>{(R[key] ?? 0).toFixed(2)}</span>
          </div>
        );
        return (
          <div style={{ position:'absolute', inset:0, zIndex:400, background:'rgba(4,5,10,0.96)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, fontFamily:'Rajdhani, sans-serif' }}>
            <div style={{ width:'min(620px, 82%)', display:'flex', flexDirection:'column', gap:11 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
                <span style={{ fontSize:13, letterSpacing:'0.3em', color:'#a6ffd8' }}>INSIDE · TUNNEL</span>
                <div style={{ display:'flex', gap:16, alignItems:'baseline' }}>
                  <span onClick={()=>{
                    const rr = (min:number,max:number,step:number)=>{ const v=min+Math.random()*(max-min); return Math.round(v/step)*step; };
                    microcosmRecipeSet('tunnel','voicesBase', rr(1,8,1));
                    microcosmRecipeSet('tunnel','voicesDensity', rr(0,6,1));
                    microcosmRecipeSet('tunnel','lenBase', rr(0.02,2.0,0.01));
                    microcosmRecipeSet('tunnel','lenSpreadX', rr(0,2.0,0.05));
                    microcosmRecipeSet('tunnel','behindMin', rr(0.1,2.0,0.05));
                    microcosmRecipeSet('tunnel','behindRange', rr(0.1,3.0,0.05));
                    microcosmRecipeSet('tunnel','tickBase', rr(30,700,5));
                    microcosmRecipeSet('tunnel','tickDensity', rr(0,400,5));
                    microcosmRecipeSet('tunnel','gain', rr(0.1,0.5,0.01));
                    microcosmRecipeSet('tunnel','panWidth', rr(0,1,0.05));
                    setRTick(x=>x+1);
                  }} style={{ fontSize:10, letterSpacing:'0.12em', color:'#d8a6ff', cursor:'pointer' }}>ROLL</span>
                  <span onClick={()=>{ microcosmRecipeReset('tunnel'); setRTick(x=>x+1); }} style={{ fontSize:10, letterSpacing:'0.12em', color:'#ffd8a6', cursor:'pointer' }}>RESET</span>
                  <span onClick={()=>setPlanetOpen(false)} style={{ fontSize:13, color:'rgba(255,255,255,0.6)', cursor:'pointer' }}>×</span>
                </div>
              </div>
              {row('VOICES BASE', 'voicesBase', 1, 8, 1)}
              {row('VOICES + DENSITY', 'voicesDensity', 0, 6, 1)}
              {row('GRAIN LEN BASE s', 'lenBase', 0.02, 2.0, 0.01)}
              {row('GRAIN LEN + X', 'lenSpreadX', 0, 2.0, 0.05)}
              {row('MEMORY MIN s', 'behindMin', 0.1, 2.0, 0.05)}
              {row('MEMORY RANGE s', 'behindRange', 0.1, 3.0, 0.05)}
              {row('TICK BASE ms', 'tickBase', 30, 700, 5)}
              {row('TICK - DENSITY ms', 'tickDensity', 0, 400, 5)}
              {row('GRAIN GAIN', 'gain', 0.05, 0.7, 0.01)}
              {row('PAN WIDTH', 'panWidth', 0, 1, 0.05)}
              <div style={{ fontSize:9.5, color:'rgba(255,255,255,0.3)', marginTop:6, fontFamily:'Space Mono, monospace' }}>dev skin · edits are live on all tunnel orbs · RESET = shipped tunnel</div>
            </div>
          </div>
        );
      })()}
      {/* SAMPLER - FINAL SCREEN. One centre axis, one label voice, framed wave, contrast floor. */}
      {samplerOpen && (() => {
        const H = dim.h || 800;
        const R = Math.max(430, H - 150);
        const C = (f: number, cap: number) => Math.min(cap, Math.round(R * f));
        const segs = 28;
        const db = meterLvl.rms > 0 ? 20 * Math.log10(meterLvl.rms) : -60;
        const lit = Math.max(0, Math.min(segs, Math.round(((db + 60) / 60) * segs)));
        const clip = meterLvl.peak > 0.98;
        const W = (t: string, col?: string) => <div style={{ fontSize:10, letterSpacing:'0.3em', color: col || 'rgba(255,255,255,0.5)', marginTop:7, textAlign:'center', fontFamily:'Rajdhani, sans-serif' }}>{t}</div>;
        const meterAlive = recState !== 'idle';
        return (
          <div style={{ position:'absolute', inset:0, zIndex:500, background:'#04050a', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'Rajdhani, sans-serif', color:'rgba(255,255,255,0.85)', boxSizing:'border-box', padding:'18px 0 12px' }}>
            <div style={{ width:'min(1400px, 90%)', display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
              {/* HEADER */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', height:34, flexShrink:0 }}>
                <span style={{ fontSize:15, letterSpacing:'0.34em', color:'#e8b800' }}>S A M P L E R</span>
                <span onClick={closeSampler} style={{ fontSize:16, color:'rgba(255,255,255,0.6)', cursor:'pointer' }}>×</span>
              </div>
              {/* INPUT STRIP */}
              <div style={{ display:'flex', gap:22, alignItems:'center', height:52, flexShrink:0 }}>
                <div style={{ position:'relative' }}>
                  <span onClick={()=>setDevListOpen(o=>!o)} style={{ fontSize:12, fontFamily:'Space Mono, monospace', color:'rgba(255,255,255,0.7)', cursor:'pointer' }}>
                    {(samplerDevs.find(dv=>dv.id===samplerDev)?.label || 'this machine')} ▾
                  </span>
                  {devListOpen && (
                    <div style={{ position:'absolute', top:26, left:0, zIndex:10, display:'flex', flexDirection:'column', gap:11, padding:'15px 19px', background:'rgba(6,8,14,0.98)', borderRadius:14, border:'0.5px solid rgba(255,255,255,0.12)' }}>
                      {samplerDevs.map(dv => (
                        <span key={dv.id} onClick={async ()=>{ setDevListOpen(false); setSamplerDev(dv.id); microcosmLiveArm(false); microcosmInputOff(); const ok=await microcosmInputOn(dv.id||undefined); if(ok) microcosmLiveArm(true); }}
                          style={{ fontSize:12, fontFamily:'Space Mono, monospace', whiteSpace:'nowrap', cursor:'pointer', color: dv.id===samplerDev ? '#7af5c8' : 'rgba(255,255,255,0.6)' }}>{dv.label}</span>
                      ))}
                      <span style={{ fontSize:12, fontFamily:'Space Mono, monospace', color:'#d8a6ff', cursor:'pointer' }}>haar out</span>
                    </div>
                  )}
                </div>
                <div style={{ flex:1, display:'flex', gap:2, height:12, alignItems:'center' }}>
                  {Array.from({length:segs}).map((_,i2)=>(
                    <div key={i2} style={{ flex:1, height:'100%', borderRadius:1, transition:'background 0.3s',
                      background: (meterAlive && i2 < lit) ? (i2 > segs*0.85 ? '#efa027' : i2 > segs*0.7 ? '#5dcaa5' : '#1d9e75') : 'rgba(255,255,255,0.07)' }} />
                  ))}
                </div>
                <span style={{ fontSize:13, fontFamily:'Space Mono, monospace', minWidth:50, textAlign:'right', color: clip ? '#d63020' : '#5dcaa5' }}>{meterAlive ? (clip ? 'CLIP' : (db <= -59 ? '' : db.toFixed(0) + ' dB')) : ''}</span>


              </div>
              {/* MAIN */}
              <div style={{ flex:1, minHeight:0, display:'grid', gridTemplateRows:'0.72fr 2.9fr 0.95fr 1.05fr', alignItems:'center', justifyItems:'center' }}>
                {/* TRANSPORT - one balanced cluster on the axis */}
                <div style={{ display:'flex', gap:44, alignItems:'flex-start' }}>
                  <div>
                    <style>{`@keyframes recpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
                    <div onClick={startRecord} style={{ width:C(0.098,80), height:C(0.098,80), margin:'0 auto', borderRadius:'50%', border:'1.5px solid rgba(214,48,32,0.75)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow: recState==='idle' ? '0 0 14px rgba(214,48,32,0.15)' : '0 0 30px rgba(214,48,32,0.4)' }}>
                      {recState==='counting'
                        ? <span style={{ fontSize:20, fontFamily:'Space Mono, monospace', color:'#d63020' }}>{countLeft}</span>
                        : recState==='recording' && snapBars > 0
                          ? <span style={{ fontSize:14, fontFamily:'Space Mono, monospace', color:'#d63020' }}>{recLeft.toFixed(1)}</span>
                          : <div style={{ width:'30%', height:'30%', borderRadius:'50%', background:'radial-gradient(circle, #ffb3a8 0%, #d63020 60%, rgba(214,48,32,0.3) 100%)',
                              animation: recState==='listening' ? 'recpulse 1.2s ease-in-out infinite' : 'none',
                              opacity: recState==='idle' ? 0.4 : 1,
                              boxShadow: recState==='recording' ? '0 0 24px rgba(214,48,32,1)' : '0 0 12px rgba(214,48,32,0.5)' }} />}
                    </div>
                    {recState==='listening'
                      ? <div onClick={(ev)=>{ ev.stopPropagation(); gateStop(); samplerOrbSet(false, ''); microcosmMonitor(false); cancelAnimationFrame(meterRafRef.current); setMeterLvl({rms:0,peak:0}); microcosmLiveArm(false); microcosmInputOff(); setInputOn(false); setRecState('idle'); }} style={{ cursor:'pointer' }}>{W('LISTENING · TAP HERE TO STOP', '#d63020')}</div>
                      : W(recState==='idle' ? 'RECORD' : recState==='counting' ? 'COUNT-IN' : 'RECORDING', recState!=='idle' ? '#d63020' : undefined)}
                  </div>
                  <div>
                    <div style={{ display:'flex', gap:13, alignItems:'center', height:C(0.098,80) }}>
                      {[1,2,4,8,0].map(nb => { const on = snapBars===nb; return (
                        <div key={nb} onClick={()=>setSnapBars(nb)} style={{ width:C(on?0.062:0.054, on?52:45), height:C(on?0.062:0.054, on?52:45), borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Space Mono, monospace', fontSize: nb===0?10:13, border: on?'1px solid #e8b800':'1px solid rgba(232,184,0,0.28)', color: on?'#e8b800':'rgba(232,184,0,0.55)', boxShadow: on?'0 0 18px rgba(232,184,0,0.35)':'none', transition:'all 0.2s' }}>{nb===0?'free':nb}</div>
                      ); })}
                    </div>
                    {W('BARS')}
                  </div>
                  <div style={{ display:'flex', gap:20, alignItems:'flex-start' }}>
<div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:C(0.098,80) }}>
                      <div onPointerDown={(e)=>{ const startY=e.clientY; const startV=metroLevel; let moved=false; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const mv=(ev:PointerEvent)=>{ if(Math.abs(ev.clientY-startY)>3) moved=true; const v=Math.max(0,Math.min(1, startV + (startY-ev.clientY)/160)); setMetroLevel(v); microcosmMetroLevel(v); }; const up=()=>{ if(!moved){ setMetroOn(n=>!n); } window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); }; window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); }} style={{ width:C(0.052,44), height:C(0.052,44), borderRadius:'50%', border: metroOn?'1.5px solid #7af5c8':'1px solid rgba(122,245,200,0.35)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background: metroOn?`radial-gradient(circle, rgba(122,245,200,${0.15+metroLevel*0.3}) 0%, transparent 70%)`:'transparent', boxShadow: metroOn?`0 0 ${12+metroLevel*14}px rgba(122,245,200,${0.3+metroLevel*0.3})`:'none' }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background: metroOn?'#7af5c8':'rgba(122,245,200,0.35)', boxShadow: metroOn?'0 0 8px rgba(122,245,200,0.9)':'none' }} />
                      </div>
                      
                    </div>
                    {W(metroOn ? 'CLICK · ' + Math.round(metroLevel*100) + '%' : 'CLICK', metroOn ? '#7af5c8' : undefined)}

                  </div>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:C(0.098,80) }}>
                    <div onPointerDown={(e)=>{ const startY=e.clientY; const startB=bpm; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const mv=(ev:PointerEvent)=>{ const nb=Math.max(40,Math.min(220, Math.round(startB + (startY-ev.clientY)/2))); setBpm(nb); }; const up=()=>{ window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); }; window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); }}
                      style={{ width:C(0.052,44), height:C(0.052,44), margin:'0 auto', borderRadius:'50%', border:'1px solid rgba(154,255,200,0.5)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'ns-resize', touchAction:'none', boxShadow:'0 0 12px rgba(154,255,200,0.15)' }}>
                      <span style={{ fontSize:11, fontFamily:'Space Mono, monospace', color:'#9affc8', lineHeight:1 }}>{bpm}</span>
                    </div>
                    </div>
                    {W('BPM', '#9affc8')}
                  </div>
                  </div>
                </div>
                {/* LOOP EDITOR - framed, one instrument */}
                <div style={{ width:'100%' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:10 }}>
                    <div style={{ display:'flex', gap:38, alignItems:'baseline' }}>
                      <span style={{ fontSize:13, fontFamily:'Space Mono, monospace', color: capture ? '#5dcaa5' : 'rgba(255,255,255,0.3)', cursor:'pointer' }}>{capture ? 'A2 ▴▾' : '— ▴▾'} <span style={{ fontSize:10, letterSpacing:'0.3em', color:'rgba(255,255,255,0.5)', marginLeft:6 }}>ROOT</span></span>
                      <span style={{ fontSize:13, fontFamily:'Space Mono, monospace', color:'rgba(255,255,255,0.6)' }}>{(() => { if (!capture) return '— s · — bars'; const bb = capture.bars > 0 ? capture.bars : 0; if (bb > 0) return (capture.data.length/48000).toFixed(2) + ' s · ' + bb + (bb === 1 ? ' bar' : ' bars'); const spb2 = (60/bpm)*4; const secs2 = capture.data.length/48000; const nb2 = Math.max(1, Math.round(secs2/spb2)); const off2 = secs2 - nb2*spb2; return secs2.toFixed(2) + ' s · free · ' + (Math.abs(off2) < 0.02 ? 'on the bar' : (off2 > 0 ? '+' : '') + off2.toFixed(2) + ' s vs ' + nb2 + ' bar' + (nb2===1?'':'s')); })()}</span>
                      <span style={{ fontSize:13, fontFamily:'Space Mono, monospace', color:'rgba(255,255,255,0.4)' }}>−1 dB <span style={{ fontSize:10, letterSpacing:'0.3em', color:'rgba(255,255,255,0.4)', marginLeft:6 }}>NORM</span></span>
                    </div>
                    <span style={{ fontSize:13, fontFamily:'Space Mono, monospace', color:'#d8a6ff', cursor:'ns-resize' }}>{capVari.toFixed(2)}× <span style={{ fontSize:9, letterSpacing:'0.28em', color:'rgba(255,255,255,0.45)' }}>VARISPEED</span></span>
                  </div>
                  <div ref={waveWrapRef}
                    onPointerDown={(ev)=>{ if (!fadeMode || !capture) return; const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const f2 = Math.max(0, Math.min(1, (ev.clientX - r.left - 10) / (r.width - 20))); fadeDragRef.current = true; setFadeA(f2); setFadeB(f2); }}
                    onPointerMove={(ev)=>{ if (!fadeDragRef.current || !fadeMode) return; const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const f2 = Math.max(0, Math.min(1, (ev.clientX - r.left - 10) / (r.width - 20))); setFadeB(prev => Math.max(f2, fadeA + 0.002)); if (f2 < fadeA) { setFadeA(f2); } }}
                    onPointerUp={()=>{ if (fadeDragRef.current) { fadeDragRef.current = false; fadePreview(); } }}
                    style={{ position:'relative', padding:'0 10px', cursor: fadeMode ? 'crosshair' : 'default' }}>
                    <svg viewBox="0 0 900 150" preserveAspectRatio="none" style={{ width:'100%', height:C(0.29,225), display:'block' }}>
                      <defs>
                        <linearGradient id="wv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="rgba(255,255,255,0.58)" />
                          <stop offset="0.5" stopColor="rgba(255,255,255,0.32)" />
                          <stop offset="1" stopColor="rgba(255,255,255,0.58)" />
                        </linearGradient>
                      </defs>
                      {Array.from({length:17}).map((_,gi)=>{ const x2 = gi*(900/16); const isBar = gi % 4 === 0; return (
                        <line key={gi} x1={x2} y1="0" x2={x2} y2="150" stroke={isBar?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.08)'} strokeWidth={isBar?1:0.5} />
                      ); })}
                      <rect x={loopA*900} y="0" width={(loopB-loopA)*900} height="150" fill="rgba(232,184,0,0.05)" />
                      {fadeMode && fadeB > fadeA && (
                        <>
                          <rect x={fadeA*900} y="0" width={(fadeB-fadeA)*900} height="150" fill="rgba(93,202,165,0.09)" />
                          <polygon points={fadeMode==='in'
                            ? `${fadeA*900},150 ${fadeB*900},150 ${fadeB*900},8`
                            : `${fadeA*900},8 ${fadeA*900},150 ${fadeB*900},150`}
                            fill="none" stroke="rgba(93,202,165,0.7)" strokeWidth="1.2" />
                        </>
                      )}
                      {(() => {
                        if (!capture) {
                          return <line x1="0" y1="75" x2="900" y2="75" stroke="rgba(255,255,255,0.12)" strokeWidth="0.75" />;
                        }
                        const N = 360, d0 = capture.data, step = Math.max(1, Math.floor(d0.length / N));
                        const up: string[] = [], dn: string[] = [];
                        for (let i2 = 0; i2 < N; i2++) {
                          let mxP = 0, mxN = 0; const base = i2 * step;
                          for (let j2 = 0; j2 < step; j2 += 4) { const v = d0[base + j2] || 0; if (v > mxP) mxP = v; if (v < mxN) mxN = v; }
                          const x2 = (i2 / N * 900).toFixed(1);
                          up.push(x2 + ',' + (75 - Math.max(1.5, Math.min(1, mxP * 1.5) * 70)).toFixed(1));
                          dn.push(x2 + ',' + (75 + Math.max(1.5, Math.min(1, -mxN * 1.5) * 70)).toFixed(1));
                        }
                        return <polygon points={up.join(' ') + ' ' + dn.reverse().join(' ')} fill="url(#wv)" />;
                      })()}
                      {loopPlaying && (() => { const cx = (loopA + loopPos * (loopB - loopA)) * 900; return <line x1={cx} y1="0" x2={cx} y2="150" stroke="rgba(122,245,200,0.9)" strokeWidth="1.2" />; })()}
                    </svg>
                    <div onPointerDown={()=>{ dragHandleRef.current = 'A'; }} style={{ position:'absolute', left:`calc(10px + ${loopA*100}%)`, top:0, bottom:0, width:16, marginLeft:-8, cursor:'ew-resize', display:'flex', flexDirection:'column', alignItems:'center', touchAction:'none' }}>
                      <div style={{ width:2.5, flex:1, background:'#e8b800', boxShadow:'0 0 10px rgba(232,184,0,0.7)' }} />
                      <div style={{ width:13, height:13, borderRadius:'50%', background:'#e8b800', boxShadow:'0 0 12px rgba(232,184,0,0.9)', marginTop:-6 }} />
                    </div>
                    <div onPointerDown={()=>{ dragHandleRef.current = 'B'; }} style={{ position:'absolute', left:`calc(10px + ${loopB*100}%)`, top:0, bottom:0, width:16, marginLeft:-8, cursor:'ew-resize', display:'flex', flexDirection:'column', alignItems:'center', touchAction:'none' }}>
                      <div style={{ width:2.5, flex:1, background:'#e8b800', boxShadow:'0 0 10px rgba(232,184,0,0.7)' }} />
                      <div style={{ width:13, height:13, borderRadius:'50%', background:'#e8b800', boxShadow:'0 0 12px rgba(232,184,0,0.9)', marginTop:-6 }} />
                    </div>
                  </div>
                  {toast && <div style={{ textAlign:'center', fontSize:11, fontFamily:'Space Mono, monospace', color:'rgba(255,255,255,0.55)', marginTop:10 }}>{toast}</div>}
                  <div style={{ display:'flex', gap:30, alignItems:'flex-start', justifyContent:'center', marginTop:16 }}>
                    <div>
                      <div onClick={()=>{ const next = !loopPlaying; setLoopPlaying(next);
                        if (next && capture) samplerLoopPlay(capture.data, { rate: capVari * Math.pow(2, (capReg + capFine) / 12), reverse: capReverse, start01: loopA, end01: loopB });
                        else samplerLoopStop(); }} style={{ width:C(0.088,72), height:C(0.088,72), margin:'0 auto', borderRadius:'50%', border:'1.5px solid rgba(122,245,200,0.9)', background:'rgba(122,245,200,0.06)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 0 26px rgba(122,245,200,0.35)' }}>
                        <span style={{ fontSize:C(0.028,23), color:'#7af5c8' }}>{loopPlaying ? '■' : '▶'}</span>
                      </div>
                      {W('PLAY', '#7af5c8')}
                    </div>
                    <div>
                      <div onClick={()=>{
                        if (!capture) return;
                        if (loopA <= 0.001 && loopB >= 0.999) return;   // nothing to cut
                        takeStackRef.current.push(capture);              // undo restores pre-cut audio
                        const s0 = Math.floor(loopA * capture.data.length);
                        const e0 = Math.floor(loopB * capture.data.length);
                        const cutData = capture.data.slice(s0, e0);
                        const secs = cutData.length / 48000;
                        const spb = (60 / bpm) * 4;
                        const wholeBars = Math.round(secs / spb);
                        const nc = { id: 'cap_' + Date.now(), data: cutData, bars: (Math.abs(wholeBars * spb - secs) < 0.03 ? wholeBars : 0) };
                        setCapture(nc); setLoopA(0); setLoopB(1);
                        replayIfPlaying({ data: cutData, a: 0, b: 1 });
                        say('cut · ' + secs.toFixed(2) + ' s kept'); console.log('[sampler] CUT ->', secs.toFixed(2), 's');
                      }} style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(255,255,255,0.85)', fontSize:C(0.023,19) }}>✂</div>
                      {W('CUT')}
                    </div>
                    <div>
                      <div onClick={()=>fadeToggle('in')} style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border: fadeMode==='in' ? '1px solid #5dcaa5' : '1px solid rgba(255,255,255,0.55)', boxShadow: fadeMode==='in' ? '0 0 18px rgba(93,202,165,0.4)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                        <svg width="45%" height="45%" viewBox="0 0 24 24"><polygon points="3,20 21,20 21,4" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                      </div>
                      {W('FADE IN', fadeMode==='in' ? '#5dcaa5' : undefined)}
                    </div>
                    <div>
                      <div onClick={()=>fadeToggle('out')} style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border: fadeMode==='out' ? '1px solid #5dcaa5' : '1px solid rgba(255,255,255,0.55)', boxShadow: fadeMode==='out' ? '0 0 18px rgba(93,202,165,0.4)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                        <svg width="45%" height="45%" viewBox="0 0 24 24"><polygon points="3,4 3,20 21,20" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                      </div>
                      {W('FADE OUT', fadeMode==='out' ? '#5dcaa5' : undefined)}
                    </div>
                    <div>
                      <div onClick={()=>{ setCapReverse(r=>{ const nv = !r; replayIfPlaying({ reverse: nv }); return nv; }); }} style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border: capReverse?'1px solid #d8a6ff':'1px solid rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color: capReverse?'#d8a6ff':'rgba(255,255,255,0.85)', fontSize:C(0.023,19), boxShadow: capReverse?'0 0 18px rgba(216,166,255,0.4)':'none' }}>⇄</div>
                      {W('REVERSE', capReverse ? '#d8a6ff' : undefined)}
                    </div>
                    <div>
                      <div onClick={undoTake} style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(255,255,255,0.85)', fontSize:C(0.023,19) }}>↺</div>
                      {W('UNDO')}
                    </div>
                    <div>
                      <div onClick={()=>setSnapOn(sn=>!sn)} style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border: snapOn?'1px solid #e8b800':'1px solid rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow: snapOn?'0 0 18px rgba(232,184,0,0.35)':'none' }}>
                        <div style={{ display:'flex', gap:3.5, alignItems:'center' }}>
                          <div style={{ width:1.5, height:15, background: snapOn?'#e8b800':'rgba(255,255,255,0.75)' }} />
                          <div style={{ width:1.5, height:9, background: snapOn?'#e8b800':'rgba(255,255,255,0.55)' }} />
                          <div style={{ width:1.5, height:15, background: snapOn?'#e8b800':'rgba(255,255,255,0.75)' }} />
                        </div>
                      </div>
                      {W('SNAP', snapOn ? '#e8b800' : undefined)}
                    </div>
                    <div>
                      <div onClick={fitToBar} title="varispeed to the nearest bar (pitch moves)" style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Space Mono, monospace', fontSize:11, color:'rgba(255,255,255,0.85)' }}>≡</div>
                      {W('FIT BAR')}
                    </div>
                    <div>
                      <div onClick={()=>fitToBar(true)} title="fit to the bar AND stay at your key" style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Space Mono, monospace', fontSize:10, color:'rgba(255,255,255,0.85)' }}>≡♪</div>
                      {W('FIT+KEY')}
                    </div>
                    <div>
                      <div onClick={padToBar} title="append silence to the next bar (pitch untouched)" style={{ width:C(0.066,55), height:C(0.066,55), margin:'0 auto', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontFamily:'Space Mono, monospace', fontSize:11, color:'rgba(255,255,255,0.85)' }}>‥|</div>
                      {W('PAD BAR')}
                    </div>
                    {fadeMode && fadeB - fadeA >= 0.005 && (
                      <div>
                        <div onClick={fadeProcess} style={{ width:C(0.072,60), height:C(0.072,60), margin:'0 auto', borderRadius:'50%', border:'1.5px solid rgba(93,202,165,0.9)', background:'rgba(93,202,165,0.07)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 0 22px rgba(93,202,165,0.4)' }}>
                          <span style={{ fontSize:15, color:'#5dcaa5' }}>✓</span>
                        </div>
                        {W('PROCESS', '#5dcaa5')}
                      </div>
                    )}
                  </div>
                </div>
                {/* PITCH */}
                <div style={{ display:'flex', flexDirection:'column', gap:13, alignItems:'center' }}>
                  <div style={{ display:'flex', gap:15, alignItems:'center' }}>
                    {([[-24,'-2 OCT'],[-12,'-OCT'],[0,'ROOT'],[12,'+OCT'],[24,'+2 OCT']] as const).map(([v3,lbl]) => { const on = capReg === v3; return (
                      <div key={v3}>
                        <div onClick={()=>{ setCapReg(v3); setPitchSemi(v3 + capFine); }} style={{ width:C(on?0.06:0.052, on?50:43), height:C(on?0.06:0.052, on?50:43), margin:'0 auto', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', border: on?'1px solid #e8b800':'1px solid rgba(255,255,255,0.35)', boxShadow: on?'0 0 18px rgba(232,184,0,0.35)':'none', transition:'all 0.2s' }}>
                          {on && <div style={{ width:8, height:8, borderRadius:'50%', background:'#e8b800', boxShadow:'0 0 9px rgba(232,184,0,0.9)' }} />}
                        </div>
                        {W(lbl, on ? '#e8b800' : undefined)}
                      </div>
                    ); })}
                  </div>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    {[-5,-4,-3,-2,-1,0,1,2,3,4,5].map(v3 => { const on = capFine === v3; return (
                      <div key={v3} onClick={()=>{ setCapFine(v3); setPitchSemi(capReg + v3); }} style={{ width:C(on?0.049:0.043, on?41:36), height:C(on?0.049:0.043, on?41:36), borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Space Mono, monospace', fontSize:10, border: on?'1px solid #e8b800':'1px solid rgba(255,255,255,0.3)', color: on?'#e8b800':'rgba(255,255,255,0.55)', boxShadow: on?'0 0 14px rgba(232,184,0,0.3)':'none', transition:'all 0.2s' }}>{v3 > 0 ? '+' + v3 : v3}</div>
                    ); })}
                    <span style={{ fontSize:9, letterSpacing:'0.28em', color:'rgba(255,255,255,0.45)', marginLeft:12 }}>SEMITONES</span>
                    <span style={{ fontSize:13, fontFamily:'Space Mono, monospace', color:'#e8b800' }}>{(capReg+capFine) === 0 ? 'root' : ((capReg+capFine) > 0 ? '+' : '') + (capReg+capFine) + ' st'}</span>
                  </div>
                </div>
                {/* STATIONS + KEEP - one row, balanced on the axis */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:'5.4vw' }}>
                  {([['clean','CLEAN','radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(160,170,190,0.5) 40%, rgba(160,170,190,0.08) 75%, transparent 100%)','rgba(200,210,225,0.5)'],
                     ['engine', samplerEngine.toUpperCase() + ' ✦ ▾','radial-gradient(circle, #cfe0ff 0%, #1B5CE8 45%, rgba(27,92,232,0.15) 78%, transparent 100%)','rgba(27,92,232,0.55)'],
                     ['chain','FULL CHAIN','radial-gradient(circle, #ffe9c9 0%, rgba(232,184,0,0.55) 45%, rgba(232,184,0,0.1) 78%, transparent 100%)','rgba(232,184,0,0.45)']] as const).map(([k3,t3,bg3,gl3]) => {
                    const on = selStation === k3; const dsz = C(on?0.088:0.072, on?72:59);
                    return (
                      <div key={k3} onClick={()=>stationChanged(k3 as any)} style={{ textAlign:'center', cursor:'pointer' }}>
                        <div style={{ width:dsz, height:dsz, margin:'0 auto', borderRadius:'50%', background: bg3, boxShadow: on ? (k3!=='clean' && recState==='listening' && gateLit ? '0 0 54px ' + gl3 : '0 0 38px ' + gl3) : 'none', animation: (on && k3!=='clean' && recState==='listening' && !gateLit) ? 'recpulse 1.2s ease-in-out infinite' : 'none', transition:'all 0.25s' }} />
                        {W(t3, on ? 'rgba(255,255,255,0.85)' : undefined)}
                      </div>
                    );
                  })}
                  <div style={{ width:1, height:C(0.09,74), background:'rgba(255,255,255,0.1)', margin:'0 6px' }} />
                  <div>
                    <div onClick={()=>setNaming(true)} style={{ width:C(0.084,70), height:C(0.084,70), margin:'0 auto', borderRadius:'50%', border:'1px solid rgba(122,245,200,0.65)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 0 24px rgba(122,245,200,0.3)' }}>
                      <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="#7af5c8" strokeWidth="1.4"><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3" /><rect x="8" y="13" width="8" height="6" /></svg>
                    </div>
                    {W('SAVE', '#7af5c8')}
                  </div>
                  <div>
                    <div onClick={()=>{ setCapture(null); setNaming(false); }} style={{ width:C(0.062,52), height:C(0.062,52), margin:'0 auto', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.35)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:15 }}>×</div>
                    {W('DISCARD')}
                  </div>
                </div>
              </div>
            </div>
            {naming && (
              <div style={{ position:'absolute', bottom:14, left:0, right:0, display:'flex', gap:18, alignItems:'baseline', justifyContent:'center' }}>
                <input autoFocus value={capName} onChange={e=>setCapName(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){
                    if (capture) {
                      const s0 = Math.floor(loopA * capture.data.length);
                      const e0 = Math.floor(loopB * capture.data.length);
                      let seg = capture.data.slice(s0, e0);
                      if (capReverse) seg = seg.slice().reverse();
                      samplerExportWav(seg, capName);
                      say('saved · ' + capName + '.wav → Downloads');
                    }
                    setNaming(false);
                  } if(e.key==='Escape') setNaming(false); }}
                  style={{ background:'transparent', border:'none', borderBottom:'0.5px solid rgba(122,245,200,0.5)', color:'rgba(255,255,255,0.9)', fontSize:14, fontFamily:'Space Mono, monospace', padding:'3px 10px', width:260, outline:'none', textAlign:'center' }} />
                <span style={{ fontSize:10, letterSpacing:'0.26em', color:'rgba(255,255,255,0.4)' }}>ENTER TO KEEP</span>
              </div>
            )}
          </div>
        );
      })()}
      {/* DEV A/B chip - temporary scaffolding, remove with the workbench build */}
      <div onClick={()=>{ const nv = !recipeAB; setRecipeAB(nv); microcosmRecipeAB(nv); }}
        style={{ position:'absolute', top:14, right:64, zIndex:300, padding:'4px 12px', borderRadius:12,
          border:'0.5px solid rgba(255,255,255,0.25)', fontSize:10, letterSpacing:'0.12em', cursor:'pointer',
          color: recipeAB ? '#a6ffd8' : '#ffd8a6', background:'rgba(10,12,20,0.7)', fontFamily:'Space Mono, monospace' }}>
        TUNNEL: {recipeAB ? 'RECIPE' : 'LEGACY'}
      </div>
      {/* SOURCES dev chip - the door; real home is the sampler station */}
      <div onClick={async ()=>{ if (inputOn) { microcosmLiveArm(false); microcosmInputOff(); setInputOn(false); } else { const ok = await microcosmInputOn(); if (ok) microcosmLiveArm(true); setInputOn(ok); } }}
        style={{ position:'absolute', top:14, right:196, zIndex:300, padding:'4px 12px', borderRadius:12,
          border:'0.5px solid rgba(255,255,255,0.25)', fontSize:10, letterSpacing:'0.12em', cursor:'pointer',
          color: inputOn ? '#ff9d9d' : 'rgba(255,255,255,0.5)', background:'rgba(10,12,20,0.7)', fontFamily:'Space Mono, monospace' }}>
        INPUT: {inputOn ? 'LIVE' : 'OFF'}
      </div>
      <div style={{ position:'absolute', inset:0, opacity:0.6, pointerEvents:'none', backgroundImage:'radial-gradient(1px 1px at 20% 14%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 88% 9%, rgba(255,255,255,0.45), transparent), radial-gradient(1px 1px at 94% 42%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 8% 46%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 50% 8%, rgba(255,255,255,0.3), transparent)' }} />
      <div style={{ position:'absolute', top:24, left:32, fontSize:21, letterSpacing:'0.6em', fontWeight:500 }}>H A A R</div>






      {orbs.map((o) => {
        if (focused === o.id) return null;   // hide the focused orb in the field — it lives in the back
        if (!cosmosActive) {
          // FIELD MODE: the original pre-Spheres behaviour. Inside a constellation -> its members;
          // single constellation -> ALL orbs, exact original layout (salt 0).
          if (forwardConst && !(constFor(o.id)?.id === forwardConst)) return null;
          const slot = interiorSlotFor(o.id);
          return (
            <div key={o.id} ref={el => { fieldWrapRefs.current[o.id] = el; }}
              data-centre={selected===o.id ? '1' : '0'}
              style={{ position:'absolute', left:0, top:0, willChange:'transform' }}>
              <Orb id={o.id} label={o.label} colorKey={o.colorKey}
                subLabel={constFor(o.id)?.name} tint={tintFor(o.id)}
                x={slot.x} y={slot.y} size={slot.size} volume={0.7}
                hideLabel={!(survey || hoverOrb === o.id || selected === o.id)} hideWave
                selected={selected===o.id} xy={xyMap[o.id]} onSelect={handleSelect} onXY={handleXY} />
            </div>
          );
        }
        const spec = field.orbits.find(ob => ob.orbId === o.id);
        const isSel = false;  // cosmos: selection never centre-stages; systems only (interior owns selection)
        // SPHERES: orb renders AT its system centre inside a wrapper; the rAF driver
        // translates the wrapper along the orbit (selected orb: wrapper untouched, slotFor centres it).
        if (spec && !isSel) return (
          <div key={o.id} ref={el => { orbWrapRefs.current[o.id] = el; }}
            style={{ position:'absolute', left:0, top:0, willChange:'transform, opacity' }}>
            <Orb id={o.id} label={o.label} colorKey={o.colorKey}
              subLabel={constFor(o.id)?.name} tint={tintFor(o.id)}
              x={spec.cx} y={spec.cy} size={spec.size} volume={0.7} glowScale={0.7}
              hideLabel hideWave
              selected={false} xy={xyMap[o.id]} onSelect={handleSelect} onXY={handleXY} />
          </div>
        );
        const slot = slotFor(o.id);
        return (
          <Orb key={o.id} id={o.id} label={o.label} colorKey={o.colorKey}
            subLabel={constFor(o.id)?.name} tint={tintFor(o.id)}
            x={slot.x} y={slot.y} size={slot.size} volume={0.7}
            selected={selected===o.id} xy={xyMap[o.id]} onSelect={handleSelect} onXY={handleXY} />
        );
      })}

      {/* FOCUSED VIEW — orb left (alive), controls right on glass, universe faint behind */}
      {focused && (() => {
        const fo = fieldOrbs.find(o => o.id === focused);
        const fc = '#d8a6ff';  // breadcrumb tint (Orb resolves its own colour)
        return (
          <div style={{ position:'absolute', inset:0, zIndex:150, pointerEvents:'none' }}>
            {/* dim scrim — visual only, stops above the keyboard so it stays playable */}
            <div style={{ position:'absolute', left:0, right:0, top:0, bottom: consoleUp ? dim.h*0.30 : dim.h*0.06, background:'rgba(6,4,12,0.82)', backdropFilter:'blur(5px)', opacity: focusShown?1:0, transition:'opacity 0.42s ease, bottom 0.55s cubic-bezier(0.34,0.01,0.2,1)' }} />

            {/* breadcrumb + close */}
            <div style={{ position:'absolute', top:18, left:24, zIndex:3, display:'flex', alignItems:'center', gap:9, opacity: focusShown?1:0, transition:'opacity 0.42s ease', pointerEvents:'auto' }}>
              <span onClick={exitFocus} style={{ fontSize:13, letterSpacing:'0.1em', color:'rgba(255,255,255,0.45)', cursor:'pointer' }}>FIELD</span>
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.3)' }}>›</span>
              <span style={{ fontSize:13, letterSpacing:'0.1em', color:fc }}>{(fo?.label || focused).toUpperCase()}</span>
            {fieldOrbs.find(o=>o.id===focused)?.engineType==='tunnel' && (
                <span onClick={()=>setPlanetOpen(true)} style={{ marginLeft:10, padding:'2px 10px', borderRadius:10, border:'0.5px solid rgba(166,255,216,0.4)', fontSize:9.5, letterSpacing:'0.14em', color:'#a6ffd8', cursor:'pointer', fontFamily:'Space Mono, monospace' }}>ENTER</span>
              )}</div>
            <div onClick={exitFocus} style={{ position:'absolute', top:14, right:22, zIndex:3, width:30, height:30, borderRadius:'50%', border:'0.5px solid rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.6)', fontSize:15, cursor:'pointer', opacity: focusShown?1:0, transition:'opacity 0.42s ease', pointerEvents:'auto' }}>×</div>

            {/* THE ORB — CENTRED, large, alive + XY-playable. x,y = CENTRE in px. */}
            <Orb id={focused} label={fo?.label || focused} colorKey={fo?.colorKey || 'tunnel'}
              x={focusShown ? dim.w*0.50 : centrePos.x}
              y={focusShown ? fh*0.42 : centrePos.y}
              size={focusShown ? 240 : centrePos.size}
              volume={0.7}
              selected={true} xy={xyMap[focused]} onSelect={handleBackTap} onXY={handleXY} hideLabel />
            <div style={{ position:'absolute', left:0, right:0, top:fh*0.42 + 150, textAlign:'center', fontSize:14, letterSpacing:'0.16em', color:'#f4ecff', zIndex:3 }}>{(fo?.label || focused).toUpperCase()}</div>
            <div style={{ position:'absolute', left:0, right:0, top:fh*0.42 + 174, textAlign:'center', fontSize:13, letterSpacing:'0.12em', color:'rgba(255,255,255,0.4)', zIndex:3 }}>still live · drag to play XY</div>
            {/* ORB REGISTER — interval offset from root (consonant set). Orb-tinted. */}
            {(() => {
              const oc = ORB_COLORS[fo?.colorKey || 'tunnel'] || ORB_COLORS['tunnel'];
              const cur = offsetRef.current[focused] ?? 0;
              const INTERVALS = [
                { semis:-24, lbl:'-2 oct' }, { semis:-12, lbl:'-oct' },
                { semis:-7, lbl:'-5th' }, { semis:-5, lbl:'-4th' },
                { semis:0, lbl:'root' },
                { semis:5, lbl:'+4th' }, { semis:7, lbl:'+5th' },
                { semis:12, lbl:'+oct' }, { semis:24, lbl:'+2 oct' },
              ];
              return (
                <div style={{ position:'absolute', left:0, right:0, top:fh*0.42 + 206, display:'flex', justifyContent:'center', alignItems:'center', flexWrap:'wrap', gap:10, maxWidth:620, margin:'0 auto', zIndex:50, pointerEvents:'auto' }}>
                  {INTERVALS.map(iv => {
                    const sel = cur === iv.semis;
                    return (
                      <div key={iv.semis} onClick={()=>{ offsetRef.current[focused]=iv.semis; applyHome(focused); forceOrb(x=>x+1); }}
                        title={iv.lbl}
                        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', opacity: sel?1:0.5, transition:'opacity 0.2s, transform 0.2s', transform: sel?'scale(1.12)':'scale(1)' }}>
                        <div style={{ width: sel?30:22, height: sel?30:22, borderRadius:'50%',
                          boxShadow: sel?`0 0 16px 3px ${oc.mid}aa`:`0 0 8px 1px ${oc.mid}33`,
                          background: sel
                            ? `radial-gradient(circle, ${oc.core} 0%, ${oc.mid}77 55%, transparent 80%)`
                            : `radial-gradient(circle, ${oc.mid}44 0%, transparent 74%)` }} />
                        <div style={{ fontSize:10.5, letterSpacing:'0.04em', color: sel?oc.core:'rgba(255,255,255,0.55)' }}>{iv.lbl}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* LEFT COLUMN — level + voices (distributed) */}
            <div style={{ position:'absolute', left:'3%', top:64, bottom: (consoleUp ? dim.h*0.30 : dim.h*0.06) + 16, width:'26%', maxWidth:340, boxSizing:'border-box', paddingLeft:18, overflow:'auto', zIndex:60, display:'flex', flexDirection:'column', justifyContent:'space-between', gap:18, opacity: focusShown?1:0, transform: focusShown?'translateX(0)':'translateX(-30px)', transition:'opacity 0.42s ease, transform 0.48s cubic-bezier(0.34,0.01,0.2,1)', pointerEvents:'auto' }}>

              {/* LEVEL */}
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:9 }}>
                  <span style={{ fontSize:11, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)' }}>LEVEL</span>
                  {fieldOrbs.length>1 && <span onClick={()=>{ const id=focused; exitFocus(); setTimeout(()=>removeFieldOrb(id), 60); }} style={{ fontSize:10, letterSpacing:'0.08em', color:'rgba(255,120,90,0.7)', cursor:'pointer' }}>remove orb</span>}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
                  <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>VOLUME</span>
                  <span style={{ fontSize:12.5, color:'#d8a6ff' }}>{Math.round((volRef.current[focused] ?? 0.7)*100)}%</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <div onClick={()=>{ muteRef.current[focused]=!muteRef.current[focused]; reapplyLevels(); forceOrb(x=>x+1); }}
                    style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11,
                      background: muteRef.current[focused]?'rgba(255,120,90,0.3)':'transparent', border:`1px solid ${muteRef.current[focused]?'rgba(255,120,90,0.8)':'rgba(255,120,90,0.45)'}`, color: muteRef.current[focused]?'#ff8c6e':'rgba(255,140,110,0.85)' }}>M</div>
                  <div onClick={()=>{ soloSetRef.current[focused]=!soloSetRef.current[focused]; reapplyLevels(); forceOrb(x=>x+1); }}
                    style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11,
                      background: soloSetRef.current[focused]?'rgba(122,245,200,0.3)':'transparent', border:`1px solid ${soloSetRef.current[focused]?'rgba(122,245,200,0.8)':'rgba(122,245,200,0.45)'}`, color: soloSetRef.current[focused]?'#a6fff2':'rgba(122,245,200,0.85)' }}>S</div>
                  <input type="range" min={0} max={1} step={0.01} value={volRef.current[focused] ?? 0.7}
                    onChange={(e)=>{ const v=parseFloat(e.target.value); volRef.current[focused]=v; microcosmEngineLevel(focused, orbLevel(focused)); forceOrb(x=>x+1); }}
                    style={{ flex:1, accentColor:'#d8a6ff' }} />
                </div>
              </div>

              {/* VOICES — orbs + selected voice's sliders (UI ready; engine later) */}
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:11 }}>
                  <span style={{ fontSize:11, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)' }}>VOICES</span>
                  <span onClick={()=>{ voicesRef.current[focused]=defaultVoices(); setSelVoice(null); forceOrb(x=>x+1); }}
                    style={{ fontSize:10, letterSpacing:'0.08em', color:'rgba(255,255,255,0.35)', cursor:'pointer' }}>reset</span>
                </div>
                <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:13, flexWrap:'wrap' }}>
                  {getVoices(focused).map(v => {
                    const sel = selVoice === v.id;
                    return (
                      <div key={v.id} onClick={()=>setSelVoice(sel?null:v.id)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', opacity: v.on?1:0.4 }}>
                        <div style={{ width:34, height:34, borderRadius:'50%',
                          background:`radial-gradient(circle, rgba(216,166,255,${v.on?0.9:0.4}), rgba(138,61,245,0.3) 55%, transparent 78%)`,
                          boxShadow: v.on?`0 0 ${sel?16:12}px ${sel?3:2}px rgba(216,166,255,${sel?0.7:0.5})`:'none',
                          border: sel?'2px solid #e0bfff':'2px solid transparent' }} />
                        <div style={{ fontSize:11, color: v.on?'#e0bfff':'rgba(255,255,255,0.5)' }}>{v.type}{sel?' ✦':''}</div>
                      </div>
                    );
                  })}
                  <div onClick={()=>{ const vs=getVoices(focused); vs.push({ id:'v_'+Date.now(), type:'Sine', on:true, oct:0, level:0.7, detune:0 }); forceOrb(x=>x+1); }}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer' }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', border:'1px dashed rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.55)', fontSize:13 }}>+</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>add</div>
                  </div>
                </div>
                {(() => {
                  const vs = getVoices(focused);
                  const v = vs.find(x => x.id === selVoice) || vs[0];
                  if (!v) return null;
                  const setV = (k: 'oct'|'level'|'detune', val: number) => { (v as any)[k] = val; forceOrb(x=>x+1); };
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ fontSize:10.5, color:'#e0bfff', letterSpacing:'0.08em' }}>{v.type.toUpperCase()}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', width:42 }}>OCTAVE</span>
                        <input type="range" min={-2} max={2} step={1} value={v.oct} onChange={(e)=>setV('oct', parseInt(e.target.value))} style={{ flex:1, accentColor:'#d8a6ff' }} />
                        <span style={{ fontSize:10, color:'#cdb4ff', width:18 }}>{v.oct}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', width:42 }}>LEVEL</span>
                        <input type="range" min={0} max={1} step={0.01} value={v.level} onChange={(e)=>setV('level', parseFloat(e.target.value))} style={{ flex:1, accentColor:'#d8a6ff' }} />
                        <span style={{ fontSize:10, color:'#cdb4ff', width:18 }}>{Math.round(v.level*100)}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', width:42 }}>DETUNE</span>
                        <input type="range" min={-50} max={50} step={1} value={v.detune} onChange={(e)=>setV('detune', parseInt(e.target.value))} style={{ flex:1, accentColor:'#d8a6ff' }} />
                        <span style={{ fontSize:10, color:'#cdb4ff', width:18 }}>{v.detune}</span>
                      </div>
                      <div onClick={()=>{ v.on=!v.on; forceOrb(x=>x+1); }} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginTop:2 }}>
                        <div style={{ width:30, height:16, borderRadius:9, background: v.on?'rgba(122,245,200,0.25)':'rgba(255,255,255,0.1)', border:`1px solid ${v.on?'#7af5c8':'rgba(255,255,255,0.3)'}`, position:'relative' }}>
                          <div style={{ position:'absolute', top:1.5, left: v.on?14:2, width:11, height:11, borderRadius:'50%', background: v.on?'#a6fff2':'rgba(255,255,255,0.5)', transition:'left 0.15s' }} />
                        </div>
                        <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{v.on?'voice ON':'muted'}</span>
                      </div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)' }}>UI ready · not yet audible</div>
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* RIGHT COLUMN — signal path + flavour (distributed) */}
            <div style={{ position:'absolute', right:'3%', top:64, bottom: (consoleUp ? dim.h*0.30 : dim.h*0.06) + 16, width:'26%', maxWidth:340, boxSizing:'border-box', overflow:'auto', zIndex:60, display:'flex', flexDirection:'column', justifyContent:'space-between', gap:18, opacity: focusShown?1:0, transform: focusShown?'translateX(0)':'translateX(30px)', transition:'opacity 0.42s ease, transform 0.48s cubic-bezier(0.34,0.01,0.2,1)', pointerEvents:'auto' }}>

              {/* SIGNAL PATH — effect-orbs on a thread of light; tap to edit (UI ready, not yet audible) */}
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:11 }}>
                  <span style={{ fontSize:11, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)' }}>SIGNAL PATH</span>
                  <span onClick={()=>{ fxRef.current[focused]=defaultFx(); setSelFx(null); forceOrb(x=>x+1); }}
                    style={{ fontSize:10, letterSpacing:'0.08em', color:'rgba(255,255,255,0.35)', cursor:'pointer' }}>reset</span>
                </div>
                <div style={{ position:'relative', display:'inline-flex', width:'fit-content', maxWidth:'100%', alignItems:'center', gap:8, marginBottom:13, flexWrap:'wrap' }}>
                  {/* thread of light behind the orbs */}
                  <div style={{ position:'absolute', left:6, right:6, top:17, height:1, background:'linear-gradient(90deg, rgba(216,166,255,0.05), rgba(216,166,255,0.45), rgba(216,166,255,0.05))', zIndex:0 }} />
                  {getFx(focused).map(fx => {
                    const sel = selFx === fx.id;
                    return (
                      <div key={fx.id} onClick={()=>setSelFx(sel?null:fx.id)} style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', opacity: fx.on?1:0.35 }}>
                        <div style={{ width:30, height:30, borderRadius:'50%',
                          background:`radial-gradient(circle, rgba(216,166,255,${fx.on?0.85:0.3}), rgba(138,61,245,0.28) 55%, transparent 78%)`,
                          boxShadow: fx.on?`0 0 ${sel?15:11}px ${sel?3:2}px rgba(216,166,255,${sel?0.7:0.45})`:'none',
                          border: sel?'2px solid #e0bfff':'2px solid transparent' }} />
                        <div style={{ fontSize:10.5, color: fx.on?'#e0bfff':'rgba(255,255,255,0.45)', whiteSpace:'nowrap' }}>{fx.type}{sel?' ✦':''}</div>
                      </div>
                    );
                  })}
                  <div onClick={()=>{ const xs=getFx(focused); const out=xs.findIndex(f=>f.id==='fx_out'); const ins=out<0?xs.length:out; xs.splice(ins,0,{ id:'fx_'+Date.now(), type:'Reverb', on:true, params:{ size:0.5, decay:0.5, mix:0.3 } }); forceOrb(x=>x+1); }}
                    style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer' }}>
                    <div style={{ width:26, height:26, borderRadius:'50%', border:'1px dashed rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.55)', fontSize:12 }}>+</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>add</div>
                  </div>
                </div>
                {(() => {
                  const xs = getFx(focused);
                  const fx = xs.find(x => x.id === selFx) || xs[0];
                  if (!fx) return null;
                  const PARAMS: Record<string, {k:string;label:string;min:number;max:number;step:number}[]> = {
                    Grain:  [ {k:'size',label:'SIZE',min:0,max:1,step:0.01}, {k:'spread',label:'SPREAD',min:0,max:1,step:0.01}, {k:'density',label:'DENSITY',min:0,max:1,step:0.01} ],
                    Filter: [ {k:'cutoff',label:'CUTOFF',min:0,max:1,step:0.01}, {k:'res',label:'RES',min:0,max:1,step:0.01}, {k:'type',label:'TYPE',min:0,max:2,step:1} ],
                    Reverb: [ {k:'size',label:'SIZE',min:0,max:1,step:0.01}, {k:'decay',label:'DECAY',min:0,max:1,step:0.01}, {k:'mix',label:'MIX',min:0,max:1,step:0.01} ],
                    Delay:  [ {k:'time',label:'TIME',min:0,max:1,step:0.01}, {k:'feedback',label:'FEEDBACK',min:0,max:1,step:0.01}, {k:'mix',label:'MIX',min:0,max:1,step:0.01} ],
                    Out:    [ {k:'level',label:'LEVEL',min:0,max:1,step:0.01} ],
                  };
                  const rows = PARAMS[fx.type] || [];
                  const setP = (k:string, val:number) => { fx.params[k]=val; forceOrb(x=>x+1); };
                  const fmt = (k:string, v:number) => k==='type' ? ['LP','HP','BP'][v]||String(v) : (v<=1 ? Math.round(v*100) : v);
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:10.5, color:'#e0bfff', letterSpacing:'0.08em' }}>{fx.type.toUpperCase()}</span>
                        {!fx.fixed && <span onClick={(e)=>{ e.stopPropagation(); const a=getFx(focused); const i=a.findIndex(f=>f.id===fx.id); if(i>=0){ a.splice(i,1); if(selFx===fx.id) setSelFx(null); forceOrb(x=>x+1);} }}
                          style={{ fontSize:10, color:'rgba(255,120,90,0.7)', cursor:'pointer' }}>remove</span>}
                      </div>
                      {rows.map(r => (
                        <div key={r.k} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', width:52 }}>{r.label}</span>
                          <input type="range" min={r.min} max={r.max} step={r.step} value={fx.params[r.k] ?? 0} onChange={(e)=>setP(r.k, r.step<1?parseFloat(e.target.value):parseInt(e.target.value))} style={{ flex:1, accentColor:'#d8a6ff' }} />
                          <span style={{ fontSize:10, color:'#cdb4ff', width:22 }}>{fmt(r.k, fx.params[r.k] ?? 0)}</span>
                        </div>
                      ))}
                      {!fx.fixed && (
                        <div onClick={()=>{ fx.on=!fx.on; forceOrb(x=>x+1); }} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginTop:2 }}>
                          <div style={{ width:30, height:16, borderRadius:9, background: fx.on?'rgba(122,245,200,0.25)':'rgba(255,255,255,0.1)', border:`1px solid ${fx.on?'#7af5c8':'rgba(255,255,255,0.3)'}`, position:'relative' }}>
                            <div style={{ position:'absolute', top:1.5, left: fx.on?14:2, width:11, height:11, borderRadius:'50%', background: fx.on?'#a6fff2':'rgba(255,255,255,0.5)', transition:'left 0.15s' }} />
                          </div>
                          <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{fx.on?'effect ON':'bypassed'}</span>
                        </div>
                      )}
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)' }}>UI ready · not yet audible</div>
                    </div>
                  );
                })()}
              </div>

              {/* FLAVOUR — density + amount (real) */}
              <div>
                <div style={{ fontSize:11, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)', marginBottom:10 }}>FLAVOUR</div>
                {/* flavour-orbs — per-orb tonal world (UI per-orb; engine palette still global) */}
                <div style={{ display:'flex', gap:13, alignItems:'flex-start', marginBottom:15, flexWrap:'wrap' }}>
                  {FLAVOURS.map(f => {
                    const cur = flavourRef.current[focused] ?? 'open';
                    const sel = cur === f.id;
                    return (
                      <div key={f.id} onClick={()=>{ flavourRef.current[focused]=f.id; microcosmOrbPalette(focused, f.id); forceOrb(x=>x+1); }}
                        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', opacity: sel?1:0.5 }}>
                        <div style={{ width:30, height:30, borderRadius:'50%',
                          background:`radial-gradient(circle, ${f.col}, ${f.col}44 55%, transparent 78%)`,
                          boxShadow: sel?`0 0 14px 3px ${f.col}aa`:`0 0 6px 1px ${f.col}55`,
                          border: sel?`2px solid ${f.col}`:'2px solid transparent' }} />
                        <div style={{ fontSize:10.5, color: sel?f.col:'rgba(255,255,255,0.5)', whiteSpace:'nowrap' }}>{f.name}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginBottom:14 }}>palette is global today · per-orb later</div>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>FLAVOUR AMOUNT</span>
                    <span style={{ fontSize:12.5, color:'#ffcf6b' }}>{Math.round((amountRef.current[focused] ?? 0)*100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.01} value={amountRef.current[focused] ?? 0}
                    onChange={(e)=>{ const a=parseFloat(e.target.value); amountRef.current[focused]=a; microcosmEngineAmount(focused, a); forceOrb(x=>x+1); }}
                    style={{ width:'100%', accentColor:'#ffcf6b' }} />
                </div>
                {/* TIMING — free-floating vs tempo-locked (per orb) */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>TIMING</span>
                    <div style={{ display:'flex', gap:6 }}>
                      {[['free','FREE'],['lock','LOCK']].map(([k,lbl])=>{
                        const on = (k==='lock') === !!lockRef.current[focused];
                        return <span key={k} onClick={()=>{ lockRef.current[focused]=(k==='lock'); applyLock(focused); forceOrb(x=>x+1); }}
                          style={{ fontSize:11, letterSpacing:'0.08em', padding:'4px 12px', borderRadius:12, cursor:'pointer',
                            border:`0.5px solid ${on?'#7af5c8':'rgba(255,255,255,0.18)'}`,
                            background: on?'rgba(122,245,200,0.15)':'transparent',
                            color: on?'#a6fff2':'rgba(255,255,255,0.5)' }}>{lbl}</span>;
                      })}
                    </div>
                  </div>
                  {lockRef.current[focused] && (
                    <div style={{ padding:'10px 0 4px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>GRID</span>
                        <div style={{ display:'flex', gap:5 }}>
                          {[[1,'1/4'],[2,'1/8'],[3,'1/8T'],[4,'1/16']].map(([v,lbl])=>{
                            const sel = (subdivRef.current[focused] ?? 2) === v;
                            return <span key={v as number} onClick={()=>{ subdivRef.current[focused]=v as number; applyLock(focused); forceOrb(x=>x+1); }}
                              style={{ fontSize:10.5, padding:'3px 9px', borderRadius:10, cursor:'pointer',
                                border:`0.5px solid ${sel?'#7af5c8':'rgba(255,255,255,0.15)'}`,
                                background: sel?'rgba(122,245,200,0.12)':'transparent',
                                color: sel?'#a6fff2':'rgba(255,255,255,0.5)' }}>{lbl}</span>;
                          })}
                        </div>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>FILL</span>
                        <span style={{ fontSize:11, color:'#a6fff2' }}>{Math.round((fillRef.current[focused] ?? 1)*100)}%</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.01} value={fillRef.current[focused] ?? 1}
                        onChange={(e)=>{ const f=parseFloat(e.target.value); fillRef.current[focused]=f; microcosmOrbFill(focused, f); forceOrb(x=>x+1); }}
                        style={{ width:'100%', accentColor:'#7af5c8', marginBottom:10 }} />
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>PATTERN · seed {seedRef.current[focused] ?? 1}</span>
                        <span onClick={()=>{ const ns=Math.floor(Math.random()*9999)+1; seedRef.current[focused]=ns; microcosmOrbSeed(focused, ns); forceOrb(x=>x+1); }}
                          style={{ fontSize:10.5, padding:'3px 12px', borderRadius:10, cursor:'pointer', border:'0.5px solid rgba(216,166,255,0.5)', color:'#d8a6ff' }}>re-roll ↻</span>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>DENSITY</span>
                    <span style={{ fontSize:12.5, color:'#d8a6ff' }}>{Math.round((densRef.current[focused] ?? 0.5)*100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.01} value={densRef.current[focused] ?? 0.5}
                    onChange={(e)=>{ const d=parseFloat(e.target.value); densRef.current[focused]=d; microcosmGrainDensity(focused, d); forceOrb(x=>x+1); }}
                    style={{ width:'100%', accentColor:'#d8a6ff' }} />
                </div>
                {/* ABSENCE — controlled chaos, centre-detented: left=flutter, centre=off, right=dropouts */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>ABSENCE</span>
                    <span style={{ fontSize:12.5, color:'#ffb060' }}>{(() => { const a = absRef.current[focused] ?? 0; if (Math.abs(a) < 0.02) return 'off'; return a < 0 ? `flutter ${Math.round(-a*100)}%` : `drop ${Math.round(a*100)}%`; })()}</span>
                  </div>
                  <input type="range" min={-1} max={1} step={0.02} value={absRef.current[focused] ?? 0}
                    onChange={(e)=>{ let a=parseFloat(e.target.value); if(Math.abs(a)<0.06) a=0; absRef.current[focused]=a; microcosmOrbAbsence(focused, a); forceOrb(x=>x+1); }}
                    style={{ width:'100%', accentColor:'#ffb060' }} />
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:3, fontSize:9.5, letterSpacing:'0.12em', color:'rgba(255,255,255,0.32)', fontFamily:'monospace' }}>
                    <span>FLUTTER</span><span>·</span><span>DROPOUTS</span>
                  </div>
                </div>
                {/* CHAOS — staged mayhem 0..1: disorder → pitch scatter → stutter/reverse */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>CHAOS</span>
                    <span style={{ fontSize:12.5, color:'#ff6090' }}>{(() => { const c = chaosRef.current[focused] ?? 0; if (c < 0.02) return 'off'; if (c < 0.33) return 'disorder'; if (c < 0.66) return 'scatter'; return 'breakdown'; })()}</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.01} value={chaosRef.current[focused] ?? 0}
                    onChange={(e)=>{ const c=parseFloat(e.target.value); chaosRef.current[focused]=c; microcosmOrbChaos(focused, c); forceOrb(x=>x+1); }}
                    style={{ width:'100%', accentColor:'#ff6090' }} />
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:3, fontSize:9.5, letterSpacing:'0.12em', color:'rgba(255,255,255,0.32)', fontFamily:'monospace' }}>
                    <span>DISORDER</span><span>SCATTER</span><span>BREAKDOWN</span>
                  </div>
                </div>
                {/* FREEZE — for SYNTH constellations: capture the live ring into a static
                    source (2/4/8s), lit when frozen, tap again to release back to live. */}
                {(() => {
                  const oc = constellations.find(c => c.orbIds.includes(focused));
                  if (!oc) return null;
                  const frozen = oc.sourceId.startsWith('src_frozen_');
                  const isSynthOrFrozen = oc.sourceId === 'default' || frozen;
                  if (!isSynthOrFrozen) return null;   // WAV constellations don't freeze
                  return (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <div onClick={()=>{ const live = constRef.current.find(x=>x.id===oc.id); const isFrozen = !!live && live.sourceId.startsWith('src_frozen_'); if(isFrozen){ unFreeze(oc.id); } else { doFreeze(oc.id, freezeSecs); } forceOrb(x=>x+1); }}
                          style={{ flex:1, padding:'11px 0', borderRadius:12, textAlign:'center', cursor:'pointer', border:`1px solid ${frozen?'#a6e3ff':'rgba(122,213,255,0.5)'}`, background: frozen?'rgba(122,213,255,0.22)':'rgba(122,213,255,0.08)', color:'#a6e3ff', fontSize:13, letterSpacing:'0.14em', boxShadow: frozen?'0 0 16px 2px rgba(122,213,255,0.4)':'none' }}>
                          {frozen ? '❄ FROZEN — release' : '❄ FREEZE'}
                        </div>
                        {!frozen && ([2,4,8] as const).map(sec => (
                          <div key={sec} onClick={()=>setFreezeSecs(sec)} style={{ width:34, padding:'11px 0', borderRadius:10, textAlign:'center', cursor:'pointer', border:`0.5px solid ${freezeSecs===sec?'#a6e3ff':'rgba(255,255,255,0.18)'}`, background: freezeSecs===sec?'rgba(122,213,255,0.16)':'transparent', color: freezeSecs===sec?'#a6e3ff':'rgba(255,255,255,0.5)', fontSize:12 }}>{sec}s</div>
                        ))}
                      </div>
                      <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.35)', textAlign:'center', marginTop:5, fontFamily:'monospace' }}>{frozen ? 'scan it below · release to go live' : 'capture the live synth to scan it'}</div>
                    </div>
                  );
                })()}
                {/* FAUVE — per-orb fragment sequencer. Source silenced, only fragments play.
                    PARKED for frozen synths: a held pure tone has no fragment variety, so it just
                    reconstructs a continuous drone. Shown only for real WAV samples for now. */}
                {(() => {
                  const oc = constellations.find(c => c.orbIds.includes(focused));
                  if (!oc || oc.sourceId === 'default' || oc.sourceId.startsWith('src_frozen_')) return null;
                  const on = !!fauveRef.current[focused];
                  return (
                    <div style={{ marginBottom:14 }}>
                      <div onClick={()=>{ const now=!on; fauveRef.current[focused]=now; if(now){ microcosmFauveOn(focused, oc.sourceId); microcosmFauveUpdatePitch(focused); } else microcosmFauveOff(focused); forceFauve(x=>x+1); }}
                        style={{ padding:'11px 0', borderRadius:12, textAlign:'center', cursor:'pointer', letterSpacing:'0.14em', fontSize:13,
                          border:`1px solid ${on?'#c77dff':'rgba(199,125,255,0.4)'}`, background: on?'rgba(199,125,255,0.18)':'rgba(199,125,255,0.05)', color:'#d9b3ff',
                          boxShadow: on?'0 0 18px 2px rgba(199,125,255,0.4)':'none' }}>
                        {on ? '◆ FAUVE — on' : '◆ FAUVE'}
                      </div>
                      {on && (
                        <div style={{ marginTop:12 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                            <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>DISORDER</span>
                            <span style={{ fontSize:12.5, color:'#d9b3ff' }}>{Math.round((fauveDisRef.current[focused] ?? 0)*100)}%</span>
                          </div>
                          <input type="range" min={0} max={1} step={0.01} value={fauveDisRef.current[focused] ?? 0}
                            onChange={(e)=>{ const d=parseFloat(e.target.value); fauveDisRef.current[focused]=d; microcosmFauveParam(focused,'disorder',d); forceFauve(x=>x+1); }}
                            style={{ width:'100%', accentColor:'#c77dff' }} />
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, marginTop:12 }}>
                            <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>REPEAT</span>
                            <span style={{ fontSize:12.5, color:'#d9b3ff' }}>{Math.round((fauveRepRef.current[focused] ?? 0)*100)}%</span>
                          </div>
                          <input type="range" min={0} max={1} step={0.01} value={fauveRepRef.current[focused] ?? 0}
                            onChange={(e)=>{ const r=parseFloat(e.target.value); fauveRepRef.current[focused]=r; microcosmFauveParam(focused,'repeat',r); forceFauve(x=>x+1); }}
                            style={{ width:'100%', accentColor:'#c77dff' }} />
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, marginTop:12 }}>
                            <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>REVERSE</span>
                            <span style={{ fontSize:12.5, color:'#d9b3ff' }}>{Math.round((fauveRevRef.current[focused] ?? 0)*100)}%</span>
                          </div>
                          <input type="range" min={0} max={1} step={0.01} value={fauveRevRef.current[focused] ?? 0}
                            onChange={(e)=>{ const v=parseFloat(e.target.value); fauveRevRef.current[focused]=v; microcosmFauveParam(focused,'reverse',v); forceFauve(x=>x+1); }}
                            style={{ width:'100%', accentColor:'#c77dff' }} />
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, marginTop:12 }}>
                            <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>GAPS</span>
                            <span style={{ fontSize:12.5, color:'#d9b3ff' }}>{Math.round((fauveGapRef.current[focused] ?? 0)*100)}%</span>
                          </div>
                          <input type="range" min={0} max={1} step={0.01} value={fauveGapRef.current[focused] ?? 0}
                            onChange={(e)=>{ const v=parseFloat(e.target.value); fauveGapRef.current[focused]=v; microcosmFauveParam(focused,'gaps',v); forceFauve(x=>x+1); }}
                            style={{ width:'100%', accentColor:'#c77dff' }} />
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* POSITION — only for orbs whose constellation uses a WAV source */}
                {(() => {
                  const oc = constellations.find(c => c.orbIds.includes(focused));
                  if (!oc || oc.sourceId === 'default') return null;
                  return (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:12.5, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>POSITION</span>
                        <span style={{ fontSize:12.5, color:'#ffce8a' }}>{Math.round((posRef.current[focused] ?? oc.position ?? 0)*100)}%</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.001} value={posRef.current[focused] ?? oc.position ?? 0}
                        onChange={(e)=>{ const v=parseFloat(e.target.value); posRef.current[focused]=v; microcosmOrbPosition(focused, v, 0.06); forceOrb(x=>x+1); }}
                        style={{ width:'100%', accentColor:'#ffce8a' }} />
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>
        );
      })()}

      <div onClick={()=>setCreateOpen(true)} title="add orb" style={{ position:'absolute', top: fh - 30, left:'50%', transform:'translateX(-50%)', width:18, height:18, borderRadius:'50%', cursor:'pointer', background:'radial-gradient(circle, #ffffff 0%, #e6d2ff 35%, rgba(216,166,255,0.5) 60%, transparent 75%)', boxShadow:'0 0 16px 5px rgba(216,166,255,0.9), 0 0 36px 12px rgba(216,166,255,0.5), 0 0 60px 20px rgba(216,166,255,0.25)', transition:'transform 0.25s, box-shadow 0.25s' }}
        onMouseEnter={(e)=>{ (e.currentTarget as HTMLElement).style.transform='translateX(-50%) scale(1.4)'; (e.currentTarget as HTMLElement).style.boxShadow='0 0 24px 8px rgba(216,166,255,1), 0 0 50px 18px rgba(216,166,255,0.7), 0 0 80px 28px rgba(216,166,255,0.35)'; }}
        onMouseLeave={(e)=>{ (e.currentTarget as HTMLElement).style.transform='translateX(-50%) scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow='0 0 16px 5px rgba(216,166,255,0.9), 0 0 36px 12px rgba(216,166,255,0.5), 0 0 60px 20px rgba(216,166,255,0.25)'; }} />
      {/* MIX DESK — slides up over the lower portion; orbs stay faint above */}
      {mixOpen && (
        <div style={{ position:'absolute', inset:0, zIndex:210 }}>
          {/* faint dim only over the desk area handled by panel; keep field visible above */}
          <div onClick={closeMix} style={{ position:'absolute', inset:0 }} />
          <div style={{ position:'absolute', left:0, right:0, bottom:0, height: mixerH,
            background:'linear-gradient(180deg, rgba(14,12,24,0.80), rgba(10,8,18,0.96))',
            backdropFilter:'blur(10px)', borderTop:'0.5px solid rgba(255,255,255,0.14)',
            borderRadius:'22px 22px 0 0',
            transform: mixShown ? 'translateY(0)' : 'translateY(100%)',
            transition:'transform 0.4s cubic-bezier(0.34,0.01,0.2,1)' }}
            onClick={(e)=>e.stopPropagation()}>
            <div style={{ position:'absolute', top:9, left:'50%', transform:'translateX(-50%)', width:40, height:4, borderRadius:3, background:'rgba(255,255,255,0.25)' }} />
            <div style={{ position:'absolute', top:20, left:26, fontSize:12.5, letterSpacing:'0.28em', color:'rgba(255,255,255,0.5)' }}>MIX DESK</div>
            <div onClick={closeMix} style={{ position:'absolute', top:14, right:22, width:28, height:28, borderRadius:'50%', border:'0.5px solid rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.6)', fontSize:14, cursor:'pointer' }}>⌄</div>
            <div style={{ position:'absolute', top:42, left:18, right:18, bottom:14, display:'flex', gap:11, justifyContent:'center' }}>
              {orbs.map(o => {
                const c = ORB_COLORS[(fieldOrbs.find(a=>a.id===o.id)?.colorKey) || 'tunnel'];
                const vol = volRef.current[o.id] ?? 0.7;
                const mut = !!muteRef.current[o.id];
                const db = vol <= 0 ? '-∞' : (20*Math.log10(vol)).toFixed(0);
                const exp = expandedChannel === o.id;
                const setVol = (nv:number)=>{ volRef.current[o.id]=nv; microcosmEngineLevel(o.id, muteRef.current[o.id]?0:nv); forceOrb(x=>x+1); };
                const toggleMute = ()=>{ const nm=!muteRef.current[o.id]; muteRef.current[o.id]=nm; microcosmEngineLevel(o.id, nm?0:(volRef.current[o.id]??0.7)); forceOrb(x=>x+1); };
                const pan = panRef.current[o.id] ?? 0;
                const fader = (
                  <div style={{ flex:1, display:'flex', alignItems:'center', minHeight:90 }}>
                    <input type="range" min={0} max={1} step={0.01} value={vol}
                      onChange={(e)=>setVol(parseFloat(e.target.value))}
                      style={{ writingMode:'vertical-lr' as any, direction:'rtl', width:8, height:'100%', accentColor:c.mid, cursor:'pointer' }} />
                  </div>
                );
                const muteBtn = (
                  <div onClick={toggleMute} style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11,
                    background: mut?'rgba(255,120,90,0.3)':'transparent', border:`1px solid ${mut?'rgba(255,120,90,0.7)':'rgba(255,120,90,0.4)'}`, color: mut?'#ff8c6e':'rgba(255,140,110,0.8)' }}>M</div>
                );
                const soloOn = !!soloSetRef.current[o.id];
                const soloBtn = (
                  <div onClick={()=>{ soloSetRef.current[o.id]=!soloSetRef.current[o.id]; reapplyLevels(); forceOrb(x=>x+1); }}
                    style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11,
                      background: soloOn?'rgba(122,245,200,0.3)':'transparent', border:`1px solid ${soloOn?'rgba(122,245,200,0.8)':'rgba(122,245,200,0.4)'}`, color: soloOn?'#a6fff2':'rgba(122,245,200,0.8)' }}>S</div>
                );
                // glowing pan knob (used in expanded view)
                const panKnob = (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <input type="range" min={-1} max={1} step={0.02} value={pan}
                      onChange={(e)=>{ const np=parseFloat(e.target.value); panRef.current[o.id]=np; microcosmEnginePan(o.id,np); forceOrb(x=>x+1); }}
                      onDoubleClick={()=>{ panRef.current[o.id]=0; microcosmEnginePan(o.id,0); forceOrb(x=>x+1); }}
                      style={{ width:80, accentColor:c.mid, cursor:'pointer' }} />
                    <div style={{ fontSize:10, color: Math.abs(pan)>0.02?c.core:'rgba(255,255,255,0.5)', letterSpacing:'0.05em' }}>PAN {pan===0?'C':(pan<0?'L':'R')}</div>
                  </div>
                );
                const eq = eqRef.current[o.id] || { lo:0, mid:0, hi:0 };
                const pushEQ = ()=>{ const e=eqRef.current[o.id]||{lo:0,mid:0,hi:0}; microcosmEngineEQ(o.id, e.lo, e.mid, e.hi); };
                const eqSlider = (band:'lo'|'mid'|'hi', label:string) => {
                  const val = (eqRef.current[o.id]?.[band]) ?? 0;   // -12..12 dB
                  return (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <input type="range" min={-12} max={12} step={0.5} value={val}
                        onChange={(e)=>{ const nv=parseFloat(e.target.value); const ce=eqRef.current[o.id]||{lo:0,mid:0,hi:0}; ce[band]=nv; eqRef.current[o.id]=ce; pushEQ(); forceOrb(x=>x+1); }}
                        onDoubleClick={()=>{ const ce=eqRef.current[o.id]||{lo:0,mid:0,hi:0}; ce[band]=0; eqRef.current[o.id]=ce; pushEQ(); forceOrb(x=>x+1); }}
                        style={{ writingMode:'vertical-lr' as any, direction:'rtl', width:7, height:64, accentColor:c.mid, cursor:'pointer' }} />
                      <div style={{ fontSize:10, color: Math.abs(val)>0.1?c.core:'rgba(255,255,255,0.5)' }}>{label}</div>
                      <div style={{ fontSize:6.5, color:'rgba(255,255,255,0.35)' }}>{val>0?'+':''}{val.toFixed(0)}</div>
                    </div>
                  );
                };
                const eqDials = (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ display:'flex', gap:10 }}>{eqSlider('lo','LO')}{eqSlider('mid','MID')}{eqSlider('hi','HI')}</div>
                    <div style={{ fontSize:6.5, color:'rgba(255,255,255,0.35)', letterSpacing:'0.18em' }}>EQ</div>
                  </div>
                );
                const resetBtn = (
                  <div onClick={()=>{ panRef.current[o.id]=0; microcosmEnginePan(o.id,0); volRef.current[o.id]=0.7; microcosmEngineLevel(o.id, muteRef.current[o.id]?0:0.7); eqRef.current[o.id]={lo:0,mid:0,hi:0}; microcosmEngineEQ(o.id,0,0,0); forceOrb(x=>x+1); }}
                    style={{ padding:'5px 12px', borderRadius:12, border:'0.5px solid rgba(255,255,255,0.25)', fontSize:11, letterSpacing:'0.12em', color:'rgba(255,255,255,0.65)', cursor:'pointer', whiteSpace:'nowrap' }}>↺ RESET</div>
                );

                if (exp) {
                  return (
                    <div key={o.id} style={{ flex:1.8, maxWidth:240, minWidth:160, display:'flex', flexDirection:'column', alignItems:'center', borderRadius:13, background:`linear-gradient(180deg, ${c.glow}33, rgba(255,255,255,0.02))`, border:`0.5px solid ${c.mid}`, padding:'10px 0 9px', position:'relative', transition:'flex 0.3s ease', overflow:'hidden' }}>
                      <div onClick={()=>setExpandedChannel(null)} style={{ position:'absolute', top:7, right:9, fontSize:13, color:c.core, cursor:'pointer', zIndex:2 }}>⤡</div>
                      <div style={{ width:24, height:24, borderRadius:'50%', background:`radial-gradient(circle, ${c.core}, ${c.glow}44 55%, transparent 78%)`, boxShadow:`0 0 12px 2px ${c.glow}66` }} />
                      <div style={{ fontSize:12, color:c.core, marginTop:4, letterSpacing:'0.06em' }}>{fieldOrbs.find(a=>a.id===o.id)?.label || o.id}</div>
                      <div style={{ flex:1, display:'flex', alignItems:'stretch', gap:14, marginTop:8, width:'100%', justifyContent:'center', minHeight:0 }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>{eqDials}</div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>{panKnob}</div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end' }}>
                          {fader}
                          <div style={{ fontSize:11.5, color:c.core, marginTop:4 }}>{db} dB</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, marginTop:6, alignItems:'center' }}>
                        {muteBtn}
                        {soloBtn}
                        {resetBtn}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={o.id} style={{ flex:1, maxWidth:140, minWidth:72, display:'flex', flexDirection:'column', alignItems:'center', borderRadius:13, background:`linear-gradient(180deg, ${c.glow}22, rgba(255,255,255,0.015))`, border:`0.5px solid ${c.mid}33`, padding:'10px 0 9px', position:'relative', transition:'flex 0.3s ease' }}>
                    <div onClick={()=>setExpandedChannel(o.id)} style={{ position:'absolute', top:7, right:8, fontSize:12.5, color:'rgba(255,255,255,0.35)', cursor:'pointer' }}>⤢</div>
                    <div style={{ width:26, height:26, borderRadius:'50%', background:`radial-gradient(circle, ${c.core}, ${c.glow}44 60%, transparent 78%)` }} />
                    <div style={{ fontSize:12, color:c.core, marginTop:5, letterSpacing:'0.06em' }}>{fieldOrbs.find(a=>a.id===o.id)?.label || o.id}</div>
                    {fader}
                    <div style={{ fontSize:11.5, color:c.core, marginTop:6 }}>{db} dB</div>
                    <div style={{ display:'flex', gap:7, marginTop:7 }}>{muteBtn}{soloBtn}</div>
                  </div>
                );
              })}
              <div style={{ width:1, background:'linear-gradient(180deg,transparent,rgba(255,255,255,0.15),transparent)', margin:'0 2px' }} />
              {/* MASTER */}
              <div style={{ flex:1, maxWidth:140, minWidth:72, display:'flex', flexDirection:'column', alignItems:'center', borderRadius:13, background:'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02))', border:'0.5px solid rgba(255,255,255,0.3)', padding:'10px 0 9px' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:'radial-gradient(circle,#fff,rgba(255,255,255,0.3) 55%,transparent 78%)' }} />
                <div style={{ fontSize:12, color:'#fff', marginTop:5, letterSpacing:'0.12em' }}>MASTER</div>
                <div style={{ flex:1, display:'flex', alignItems:'center', marginTop:10, minHeight:90 }}>
                  <input type="range" min={0} max={1} step={0.01} value={masterVol}
                    onChange={(e)=>{ const nv=parseFloat(e.target.value); setMasterVol(nv); microcosmMasterLevel(nv); }}
                    style={{ writingMode:'vertical-lr' as any, direction:'rtl', width:10, height:'100%', accentColor:'#ffffff', cursor:'pointer' }} />
                </div>
                <div style={{ fontSize:11.5, color:'#fff', marginTop:6 }}>{masterVol<=0?'-∞':(20*Math.log10(masterVol)).toFixed(0)} dB</div>
                <div style={{ fontSize:6.5, color:'rgba(255,255,255,0.4)', marginTop:9, letterSpacing:'0.1em' }}>MAIN OUT</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONSOLE HANDLE: raise/lower the bottom console — the sky takes the window when down (key: C) */}
      <div onClick={()=>setConsoleUp(v=>!v)} title={consoleUp ? 'lower the console (C)' : 'raise the console (C)'}
        style={{ position:'absolute', left:'50%', bottom: 6, transform:'translateX(-50%)', zIndex:250,
          width:52, height:20, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', border:'0.5px solid rgba(232,226,214,0.18)', background:'rgba(6,7,13,0.6)',
          color:'rgba(232,226,214,0.5)', fontSize:11, transition:'opacity 0.3s' }}>
        {consoleUp ? '▾' : '▴'}
      </div>
      {/* BOTTOM CONTROLS — two tiers: keyboard on top, FIELD/Flavour/SYSTEM beneath */}
      <div style={{ position:'absolute', left:0, right:0, bottom: mixOpen ? mixerH : 0, height: dim.h*0.30, display:'flex', flexDirection:'column', justifyContent:'center', gap:18, padding:'0 40px', boxSizing:'border-box', transition:'bottom 0.4s cubic-bezier(0.34,0.01,0.2,1), transform 0.55s cubic-bezier(0.34,0.01,0.2,1), opacity 0.4s ease', zIndex: mixOpen ? 180 : 'auto', transform: consoleUp ? 'translateY(0)' : 'translateY(110%)', opacity: consoleUp ? 1 : 0, pointerEvents: consoleUp ? 'auto' : 'none' }}>

        {/* TIER 1 — full-width keyboard */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          {/* SCALE-LOCK: minimal Haar control — one glowing token. Tap = toggle locked <-> free
              (chromatic). Major/minor is set by the song key, not here. */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
            <span
              onClick={()=>setScaleLock(v=>!v)}   // simple toggle: locked <-> free (chromatic). Major/minor stays as the song key set it.
              title="Tap: lock to the song key / free to chromatic"
              style={{ fontSize:13, letterSpacing:'0.14em', cursor:'pointer', userSelect:'none', transition:'all 0.25s ease',
                color: scaleLock?'#ffe066':'rgba(255,255,255,0.32)',
                textShadow: scaleLock?'0 0 12px rgba(255,210,80,0.55)':'none' }}>
              {scaleLock ? `${FLAT_NAMES[NOTES.indexOf(lockKey)]} ${scaleMode}` : 'free'}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4, maxWidth:'100%' }}>
            <div onClick={()=>{ const o=Math.max(-3,octave-1); setOctave(o); playAt(playNote, playSemi); }}
              style={{ fontSize:15, color:'rgba(255,255,255,0.4)', cursor:'pointer', userSelect:'none', padding:'0 6px' }}>◂</div>
            {(() => {
              const li = NOTES.indexOf(lockKey);
              const cells = [];
              const cIdx = NOTES.indexOf('C');
              for (let off = -12; off <= 12; off++) {
                let raw = li + off;
                let idx = ((raw % 12) + 12) % 12;
                const n = NOTES[idx];
                const sharp = n.includes('#');
                // absolute octave number: base octave 4 at register 0, locked root.
                // semitone position of this cell relative to a fixed C4 = (li - cIdx) + off + octave*12
                const semisFromC4 = (li - cIdx) + off + octave * 12;
                const octNum = 4 + Math.floor(semisFromC4 / 12);
                const noteLabel = n + octNum;
                const isLock = off === 0;
                const isPlay = (off === playSemi);   // off IS the semitone distance from root
                // SCALE-LOCK: when locked, show ONLY the scale notes (skip the rest), named with flats
                const degree = ((off % 12) + 12) % 12;
                const inScale = SCALE_SEMIS[scaleMode].includes(degree);
                if (scaleLock && !inScale) continue;                 // hide out-of-scale notes entirely
                const label = scaleLock ? (FLAT_NAMES[idx] + octNum) : noteLabel;   // flats+oct when locked
                const sz = isLock ? 34 : (scaleLock ? 26 : (sharp ? 17 : 26));   // all scale notes same size when locked
                cells.push(
                  <div key={off} onClick={()=>tapNote(n, off)} title={noteLabel}
                    style={{ width:sz, height:sz, borderRadius:'50%', cursor:'pointer', flexShrink:0, transition:'all 0.3s ease',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize: isLock?12:(scaleLock?10:(sharp?8:10)), fontWeight: (isLock||isPlay)?700:500,
                      boxShadow: isLock ? '0 0 12px 1px rgba(255,210,80,0.45)' : 'none',
                      background: isLock
                        ? 'radial-gradient(circle, #ffe066 0%, rgba(224,170,40,0.6) 52%, transparent 78%)'
                        : isPlay
                          ? 'radial-gradient(circle, #fff 0%, rgba(170,196,255,0.7) 48%, transparent 76%)'
                          : (sharp && !scaleLock)
                            ? 'radial-gradient(circle, rgba(120,130,160,0.5) 0%, rgba(60,68,92,0.22) 55%, transparent 80%)'
                            : 'radial-gradient(circle, rgba(234,240,255,0.42) 0%, rgba(170,192,232,0.14) 55%, transparent 80%)',
                      color: isLock?'#2a2008':isPlay?'#1a2030':(scaleLock?'#e8eeff':(sharp?'rgba(215,222,238,0.6)':'#e8eeff')) }}>
                    {scaleLock ? label : ((isLock||isPlay||!sharp)? noteLabel : '')}
                  </div>
                );
              }
              return cells;
            })()}
            <div onClick={()=>{ const o=Math.min(3,octave+1); setOctave(o); playAt(playNote, playSemi); }}
              style={{ fontSize:15, color:'rgba(255,255,255,0.4)', cursor:'pointer', userSelect:'none', padding:'0 6px' }}>▸</div>
          </div>
        </div>

        {/* TIER 2 — FIELD (left) · FLAVOUR (centre) · SYSTEM (right) — hidden while mixing */}
        {!mixOpen && (
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:20 }}>

          {/* FIELD */}
          <div className="haar-section" style={{ display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
            <div className="haar-sectionlbl" style={zlabel}>FIELD</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:30 }}>
              <div className="haar-hover" onClick={()=>setTapeOpen(o=>!o)} title="tape character"
                style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ width:52, height:52, borderRadius:'50%', border:`1px solid ${tapeActive?'#e8b070':'rgba(232,176,112,0.5)'}`, background: `rgba(232,176,112,${0.06 + (tapeActive?0.16:0)})`, boxShadow: tapeActive?'0 0 24px 5px rgba(232,176,112,0.6), inset 0 0 14px rgba(232,176,112,0.2)':'0 0 18px 3px rgba(232,176,112,0.4), inset 0 0 14px rgba(232,176,112,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="24" height="24" viewBox="0 0 20 20"><g stroke="#f0d0a0" strokeWidth="1.2" fill="none" opacity="0.9"><circle cx="6.5" cy="10" r="3.2"/><circle cx="13.5" cy="10" r="3.2"/><line x1="6.5" y1="13.2" x2="13.5" y2="13.2"/></g></svg>
                </div>
                <div className="haar-lbl" style={{ fontSize:12.5, color:'#f0d0a0', marginTop:8 }}>Tape</div>
              </div>
              <div className="haar-hover" onClick={doSwell} title="swell — one-shot gust" style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ width:52, height:52, borderRadius:'50%', border:`1px solid ${swelling?'#ffce8a':'rgba(255,214,166,0.5)'}`, background: swelling?'rgba(255,214,166,0.28)':'rgba(255,214,166,0.06)', boxShadow: swelling?'0 0 30px 8px rgba(255,206,138,0.7), inset 0 0 14px rgba(255,214,166,0.3)':'0 0 18px 3px rgba(255,214,166,0.4), inset 0 0 14px rgba(255,214,166,0.15)', display:'flex', alignItems:'center', justifyContent:'center', transition:'box-shadow 0.2s, background 0.2s' }}>
                  <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="#ffe6c4" strokeWidth="1.4" strokeLinecap="round"><path d="M3 12 Q10 3 17 12"/><path d="M5 15 Q10 9 15 15" opacity="0.6"/></svg>
                </div>
                <div className="haar-lbl" style={{ fontSize:12.5, color:'#ffdcb0', marginTop:8 }}>Swell</div>
              </div>
              <div className="haar-hover" onClick={()=>setControlOpen(true)} title="control — hardware mapping"
                style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ width:52, height:52, borderRadius:'50%',
                  border:`1px solid ${(midiDevices && midiDevices.inputs.length) ? '#7af5c8' : 'rgba(122,245,200,0.35)'}`,
                  background:`rgba(122,245,200,${(midiDevices && midiDevices.inputs.length) ? 0.14 : 0.05})`,
                  boxShadow:(midiDevices && midiDevices.inputs.length)
                    ? '0 0 24px 5px rgba(122,245,200,0.55), inset 0 0 14px rgba(122,245,200,0.2)'
                    : '0 0 14px 2px rgba(122,245,200,0.25), inset 0 0 12px rgba(122,245,200,0.1)',
                  display:'flex', alignItems:'center', justifyContent:'center', transition:'box-shadow 0.3s, background 0.3s' }}>
                  <svg width="24" height="24" viewBox="0 0 20 20"><g stroke="#a6fff2" strokeWidth="1.2" fill="none" opacity="0.9">
                    <circle cx="10" cy="10" r="7"/>
                    <circle cx="10" cy="6.2" r="0.9" fill="#a6fff2"/>
                    <circle cx="6.4" cy="9" r="0.9" fill="#a6fff2"/>
                    <circle cx="13.6" cy="9" r="0.9" fill="#a6fff2"/>
                    <circle cx="7.4" cy="13" r="0.9" fill="#a6fff2"/>
                    <circle cx="12.6" cy="13" r="0.9" fill="#a6fff2"/>
                  </g></svg>
                </div>
                <div className="haar-lbl" style={{ fontSize:12.5, color:'#a6fff2', marginTop:8 }}>Control</div>
              </div>
              <div className="haar-hover" style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ position:'relative', width:62, height:62 }}>
                  <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:`radial-gradient(circle, rgba(216,166,255,${0.4+life*0.5}) 0%, rgba(138,61,245,${0.15+life*0.3}) 50%, transparent 72%)`, filter:'blur(2px)' }} />
                  <div style={{ position:'absolute', inset:16, borderRadius:'50%', background:'#fff', opacity:0.9, filter:'blur(1px)' }} />
                </div>
                <div className="haar-lbl" style={{ fontSize:12.5, color:'#e0c4ff', marginTop:4 }}>Life · {Math.round(life*100)}%</div>
              </div>
            </div>
          </div>

          {/* UNIVERSES — absolutely centred under middle C */}
          <div className="haar-section" style={{ position:'absolute', left:'50%', bottom:0, transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div className="haar-sectionlbl" style={{ ...zlabel, alignSelf:'center' }}>UNIVERSES</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:30 }}>
              <div onClick={()=>setSongMenu('save')} className="haar-hover" style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ width:52, height:52, borderRadius:'50%', border:'1px solid rgba(122,245,200,0.5)', background:'rgba(122,245,200,0.06)', boxShadow:'0 0 18px 3px rgba(122,245,200,0.4), inset 0 0 14px rgba(122,245,200,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="22" height="22" viewBox="0 0 20 20"><g stroke="#7af5c8" strokeWidth="1.3" fill="none" opacity="0.9"><path d="M4 4h9l3 3v9H4z"/><path d="M7 4v4h6V4M7 16v-5h6v5" /></g></svg>
                </div>
                <div className="haar-lbl" style={{ fontSize:12.5, color:'#a6fff2', marginTop:8 }}>Save</div>
              </div>
              <div onClick={()=>setSongMenu('open')} className="haar-hover" style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ width:52, height:52, borderRadius:'50%', border:'1px solid rgba(216,166,255,0.5)', background:'rgba(216,166,255,0.06)', boxShadow:'0 0 18px 3px rgba(216,166,255,0.4), inset 0 0 14px rgba(216,166,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="22" height="22" viewBox="0 0 20 20"><g stroke="#d8a6ff" strokeWidth="1.3" fill="none" opacity="0.9"><path d="M3 5h5l2 2h7v9H3z"/></g></svg>
                </div>
                <div className="haar-lbl" style={{ fontSize:12.5, color:'#e0bfff', marginTop:8 }}>Open</div>
              </div>
            </div>
          </div>
          {/* SYSTEM */}
          <div className="haar-section" style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
            <div className="haar-sectionlbl" style={{ ...zlabel, alignSelf:'flex-end' }}>SYSTEM</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:26 }}>
              {[
                { k:'Source', col:'rgba(255,216,107,0.5)', bg:'rgba(255,216,107,0.06)', dot:'#ffd86b' },
                { k:'Chords', col:'rgba(180,200,230,0.5)', bg:'rgba(180,200,230,0.05)', dot:'#8aa0d0' },
                { k:'Rec',    col:'rgba(224,80,58,0.5)',   bg:'rgba(224,80,58,0.06)',   dot:'#ff7a5a' },
                { k:'Mix',    col:'rgba(170,196,255,0.5)', bg:'rgba(170,196,255,0.06)', dot:'#aac4ff' },
              ].map(u => (
                <div key={u.k} onClick={()=>{ if(u.k==='Rec') openSampler(); if(u.k==='Mix') openMix(); if(u.k==='Chords'){ setProgPickOct(octave + 4); setChordsOpen(true); } }} className="haar-hover" style={{ textAlign:'center', cursor:'pointer' }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', border:`1px solid ${u.col}`, background:u.bg, boxShadow:`0 0 16px 3px ${u.dot}55, inset 0 0 12px ${u.dot}22`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:u.dot }} />
                  </div>
                  <div className="haar-lbl" style={{ fontSize:11.5, color:'rgba(255,255,255,0.6)', marginTop:8 }}>{u.k}</div>
                </div>
              ))}
              <div style={{ width:1, height:44, background:'rgba(255,255,255,0.1)' }} />
              <div className="haar-hover" style={{ textAlign:'center' }}>
                <div
                  onWheel={(e)=>{ setBpm(b=>Math.max(40, Math.min(200, b - Math.sign(e.deltaY)))); }}
                  onPointerDown={(e)=>{ const startY=e.clientY; const startB=bpm; const el=e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId); const mv=(ev:PointerEvent)=>{ setBpm(Math.max(40, Math.min(200, Math.round(startB + (startY-ev.clientY)/3)))); }; const up=()=>{ window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); }; window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); }}
                  onDoubleClick={()=>setBpmEditing(true)}
                  title="drag up/down or scroll · double-click to type"
                  style={{ width:52, height:52, borderRadius:'50%', border:'2px solid rgba(122,245,200,0.4)', background:'radial-gradient(circle, rgba(122,245,200,0.45) 0%, transparent 70%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'ns-resize', touchAction:'none' }}>
                  {bpmEditing ? (
                    <input autoFocus type="number" defaultValue={bpm}
                      onPointerDown={(e)=>e.stopPropagation()}
                      onBlur={(e)=>{ const v=parseInt(e.target.value); if(!isNaN(v)) setBpm(Math.max(40,Math.min(200,v))); setBpmEditing(false); }}
                      onKeyDown={(e)=>{ if(e.key==='Enter'){ const v=parseInt((e.target as HTMLInputElement).value); if(!isNaN(v)) setBpm(Math.max(40,Math.min(200,v))); setBpmEditing(false); } if(e.key==='Escape') setBpmEditing(false); }}
                      style={{ width:38, textAlign:'center', fontSize:14, fontWeight:700, background:'transparent', border:'none', color:'#fff', outline:'none' }} />
                  ) : (
                    <div style={{ fontSize:14, fontWeight:700 }}>{bpm}</div>
                  )}
                  <div style={{ fontSize:10, color:'#9affc8' }}>BPM</div>
                </div>
                <div className="haar-lbl" style={{ fontSize:11.5, color:'rgba(255,255,255,0.5)', marginTop:8 }}>Tempo</div>
              </div>
              {/* METRONOME toggle — warm click, tight to the grid */}
              <div className="haar-hover" style={{ textAlign:'center' }}>
                <div
                  onWheel={(e)=>{ const v=Math.max(0,Math.min(1, metroLevel - Math.sign(e.deltaY)*0.05)); setMetroLevel(v); microcosmMetroLevel(v); }}
                  onPointerDown={(e)=>{ const startY=e.clientY; const startV=metroLevel; let moved=false; const el=e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId); const mv=(ev:PointerEvent)=>{ if(Math.abs(ev.clientY-startY)>3) moved=true; const v=Math.max(0,Math.min(1, startV + (startY-ev.clientY)/160)); setMetroLevel(v); microcosmMetroLevel(v); }; const up=async()=>{ if(!moved){ await ensureStarted(); const n=!metroOn; setMetroOn(n); microcosmMetroLevel(metroLevel); } window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); }; window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); }}
                  title="tap: on/off · drag up/down: volume"
                  style={{ width:52, height:52, borderRadius:'50%', border:`2px solid ${metroOn?'#7af5c8':'rgba(122,245,200,0.3)'}`, background: metroOn?`radial-gradient(circle, rgba(122,245,200,${0.2+metroLevel*0.35}) 0%, transparent 70%)`:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'ns-resize', touchAction:'none', boxShadow: metroOn?`0 0 20px 3px rgba(122,245,200,${0.25+metroLevel*0.3})`:'none' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={metroOn?'#7af5c8':'rgba(122,245,200,0.5)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 21h8l-2-16h-4z"/><line x1="12" y1="5" x2="14" y2="14"/>
                  </svg>
                </div>
                <div className="haar-lbl" style={{ fontSize:11.5, color:'rgba(255,255,255,0.5)', marginTop:8 }}>{metroOn?`Click · ${Math.round(metroLevel*100)}%`:'Click'}</div>
              </div>
              <div className="haar-hover" style={{ textAlign:'center' }}>
                <div onClick={()=>{ if(state==='playing') doStop(); else doStart(); }}
                  title="Start / Stop  (spacebar)"
                  style={{ width:56, height:56, borderRadius:'50%', cursor:'pointer',
                    border:`3px solid ${state==='playing'?'rgba(122,245,200,0.6)':'rgba(255,255,255,0.32)'}`,
                    background: state==='playing' ? 'radial-gradient(circle, rgba(122,245,200,0.5) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {state==='playing'
                    ? <div style={{ width:14, height:14, background:'#a6fff2', borderRadius:2 }} />  /* stop square */
                    : <div style={{ width:0, height:0, borderLeft:'15px solid #fff', borderTop:'9px solid transparent', borderBottom:'9px solid transparent', marginLeft:4 }} /> /* play triangle */
                  }
                </div>
                <div className="haar-lbl" style={{ fontSize:11.5, color:'rgba(255,255,255,0.55)', marginTop:8, letterSpacing:'0.05em' }}>{state==='playing' ? 'Stop' : 'Start'}</div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      {/* ORB CREATION — full-screen source x engine */}
      {createOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'radial-gradient(ellipse at 50% 32%, #0c1018 0%, #06070d 60%, #030409 100%)', display:'flex', flexDirection:'column', fontFamily:'Rajdhani, sans-serif' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'34px 56px 0' }}>
            <span style={{ fontSize:15, letterSpacing:'0.4em', color:'#d8a6ff', fontFamily:'monospace', fontWeight:600 }}>H A A R</span>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              {/* STUDIO: instant preview (snappy building) · LIVE: preview slowly blooms in to ~90% */}
              <div onClick={()=>setLiveMode(v=>!v)} title="Studio: instant preview · Live: preview blooms in gently"
                style={{ padding:'7px 16px', borderRadius:20, cursor:'pointer', fontFamily:'monospace', fontSize:11, letterSpacing:'0.18em',
                  border:`1px solid ${liveMode?'#ffce8a':'rgba(255,255,255,0.2)'}`,
                  background: liveMode?'rgba(255,206,138,0.14)':'rgba(255,255,255,0.03)',
                  color: liveMode?'#ffce8a':'rgba(255,255,255,0.5)',
                  boxShadow: liveMode?'0 0 14px 1px rgba(255,206,138,0.35)':'none' }}>
                {liveMode ? '● LIVE' : '○ STUDIO'}
              </div>
              <div onClick={cancelCreate} style={{ width:40, height:40, borderRadius:'50%', border:'0.5px solid rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(255,255,255,0.6)', fontSize:18 }}>×</div>
            </div>
          </div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-start', padding:'32px 56px 48px', maxWidth:1100, width:'100%', margin:'0 auto', boxSizing:'border-box', overflowY:'auto', minHeight:0 }}>
            {/* SONG KEY — three glowing-ring dials (note / octave / scale). Scrub up/down. */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'center', gap:40, marginBottom:34 }}>
              {[
                { cap:'NOTE',   key:'note',   c:'255,210,80',  val: FLAT_NAMES[NOTES.indexOf(lockKey)],
                  step:(d:number)=>{ setLockKey(prev => NOTES[((NOTES.indexOf(prev)+d)%12+12)%12]); setScaleLock(true); } },
                { cap:'OCTAVE', key:'octave', c:'170,196,255', val: String(octave+4),
                  step:(d:number)=>{ setOctave(prev => Math.max(-2, Math.min(2, prev+d))); } },
                { cap:'SCALE',  key:'scale',  c:'216,166,255', val: scaleMode==='major'?'maj':'min',
                  step:(d:number)=>{ setScaleMode(m=>m==='major'?'minor':'major'); setScaleLock(true); } },
              ].map(dial => {
                const isSel = selectedDial === dial.key;
                return (
                <div key={dial.cap} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
                  <div onPointerDown={(e)=>{ setSelectedDial(dial.key as any); keyScrub(e, dial.step); }}
                    style={{ position:'relative', width:88, height:88, borderRadius:'50%', cursor:'ns-resize', touchAction:'none',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      border:`1.5px solid rgba(${dial.c},${isSel?0.95:0.55})`,
                      boxShadow:`0 0 ${isSel?34:22}px ${isSel?3:1}px rgba(${dial.c},${isSel?0.5:0.28}), inset 0 0 18px 0 rgba(${dial.c},0.10)`,
                      transition:'box-shadow 0.25s ease, border-color 0.25s ease' }}>
                    {/* glowing value at the centre */}
                    <span style={{ fontSize: dial.cap==='SCALE'?18:22, fontWeight:600, letterSpacing:'0.02em',
                      color:`rgb(${dial.c})`, textShadow:`0 0 16px rgba(${dial.c},0.9), 0 0 6px rgba(${dial.c},0.6)` }}>{dial.val}</span>
                  </div>
                  <span style={{ fontSize:9, letterSpacing:'0.22em', color:'rgba(255,255,255,0.32)', fontFamily:'monospace' }}>{dial.cap}</span>
                </div>
              );})}
            </div>
            {/* CONSTELLATION — target an existing one, or create a new one */}
            <div style={{ fontSize:13, letterSpacing:'0.34em', color:'rgba(255,255,255,0.4)', marginBottom:18, fontFamily:'monospace', textAlign:'center' }}>{currentSongName ? `CONSTELLATIONS · ${currentSongName.toUpperCase()}` : 'CONSTELLATION'}</div>
            <div style={{ display:'flex', gap:14, marginBottom:20, justifyContent:'center', flexWrap:'wrap' }}>
              {constellations.filter(c => !(c.id===DEFAULT_CONST_ID && c.orbIds.length===0)).map(c => {
                const sel = createConstTarget===c.id;
                if (editingConstId === c.id) {
                  return <input key={c.id} autoFocus defaultValue={c.name}
                    onBlur={(e)=>{ const v=e.target.value.trim(); if(v) setConstellations(prev=>prev.map(x=>x.id===c.id?{...x,name:v}:x)); setEditingConstId(null); }}
                    onKeyDown={(e)=>{ if(e.key==='Enter'){ const v=(e.target as HTMLInputElement).value.trim(); if(v) setConstellations(prev=>prev.map(x=>x.id===c.id?{...x,name:v}:x)); setEditingConstId(null); } if(e.key==='Escape') setEditingConstId(null); }}
                    style={{ padding:'12px 18px', borderRadius:14, border:'1px solid #d8a6ff', background:'rgba(216,166,255,0.12)', color:'#e0bfff', fontSize:16, outline:'none', fontFamily:'Rajdhani, sans-serif', width:150, textAlign:'center' }} />;
                }
                return (() => {
                  // distinct tint per constellation, computed directly from its position among the
                  // non-default constellations so each gets its OWN colour (cello/bird/fire differ).
                  const nonDef = constellations.filter(x => x.id !== DEFAULT_CONST_ID);
                  const ci = nonDef.findIndex(x => x.id === c.id);
                  const ct = c.id === DEFAULT_CONST_ID ? '#c9a6ff' : CONST_TINTS[((ci % CONST_TINTS.length)+CONST_TINTS.length)%CONST_TINTS.length];
                  const rgb = [parseInt(ct.slice(1,3),16), parseInt(ct.slice(3,5),16), parseInt(ct.slice(5,7),16)];
                  const rgba = (a:number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
                  return <div key={c.id} onClick={()=>{ setCreateConstTarget(c.id); setCreateSrc(c.sourceId==='default'?'synth':'sample'); }} onDoubleClick={()=>setEditingConstId(c.id)} title="double-click to rename"
                    style={{ position:'relative', overflow:'visible', padding:'20px 38px', borderRadius:18, cursor:'pointer', transition:'all 0.3s ease', transform: sel?'scale(1.06)':'scale(1)',
                      border:`1.5px solid ${sel?rgba(0.95):rgba(0.5)}`, background:rgba(sel?0.2:0.1),
                      boxShadow: sel?`0 0 46px 6px ${rgba(0.7)}, inset 0 0 24px ${rgba(0.25)}`:`0 0 26px 3px ${rgba(0.45)}, inset 0 0 16px ${rgba(0.15)}` }}>
                    <div style={{ position:'absolute', left:'50%', top:'50%', width:'85%', height:'170%', transform:'translate(-50%,-50%)', borderRadius:'50%', background:`radial-gradient(circle, ${rgba(sel?1:0.8)} 0%, ${rgba(0.35)} 42%, transparent 72%)`, filter:'blur(18px)', pointerEvents:'none' }} />
                    <div style={{ position:'relative', display:'flex', alignItems:'center', gap:13 }}>
                      <span style={{ fontSize:23, fontWeight:500, letterSpacing:'0.05em', color:'#fff', textShadow:`0 0 16px ${rgba(sel?1:0.8)}, 0 0 6px ${rgba(0.9)}` }}>{c.name}</span>
                      <span style={{ fontSize:14, fontFamily:'monospace', color:rgba(0.9), textShadow:`0 0 8px ${rgba(0.7)}` }}>{c.orbIds.length}</span>
                    </div>
                  </div>;
                })();
              })}
            </div>
            {/* the name field IS the create-new-constellation entry: typing here targets a new one */}
            <div style={{ display:'flex', justifyContent:'center', marginBottom:28 }}>
              <input value={createConstName}
                onChange={e=>{ setCreateConstName(e.target.value); if(e.target.value && createConstTarget!=='__new__') setCreateConstTarget('__new__'); }}
                onFocus={()=>setCreateConstTarget('__new__')}
                placeholder="create constellation"
                style={{ padding:'13px 22px', borderRadius:12, border:`0.5px solid ${createConstTarget==='__new__'?'rgba(122,245,200,0.55)':'rgba(255,255,255,0.14)'}`, background: createConstTarget==='__new__'?'rgba(122,245,200,0.05)':'rgba(255,255,255,0.02)', color:'#e0f5ec', fontSize:16, textAlign:'center', outline:'none', fontFamily:'Rajdhani, sans-serif', width:340, transition:'all 0.25s ease', boxShadow: createConstTarget==='__new__'?'0 0 18px 1px rgba(122,245,200,0.2)':'none' }} />
            </div>
            <div style={{ fontSize:13, letterSpacing:'0.34em', color:'rgba(255,255,255,0.4)', marginBottom:24, fontFamily:'monospace', textAlign:'center' }}>{(() => { if (createConstTarget==='__new__') return 'SOURCE'; const c = constellations.find(x=>x.id===createConstTarget); const wav = c && sourceBytesRef.current[c.sourceId]?.name; return `SOURCE · ${c?.name || ''}${wav ? ' · '+wav : ''}`; })()}</div>
            <div style={{ display:'flex', gap:24, marginBottom: (createConstTarget==='__new__' && createSrc==='sample') ? 24 : 72, justifyContent:'center' }}>
              {(['synth','sample','livein'] as const).map(src => {
                const lbl = src==='synth'?'Synth':src==='sample'?'Wave':'Live in';
                const sel = createSrc===src;
                const soon = false;                        // Live-in is REAL now (SOURCES slice)
                const isNew = createConstTarget==='__new__';
                const disabled = soon || !isNew;           // source is only choosable for a NEW constellation
                return <div key={src} onClick={async ()=>{ if(disabled) return; setCreateSrc(src); if (src==='livein') { await ensureStarted(); microcosmSynthOff(); const ok = await microcosmInputOn(); if (ok) { microcosmLiveArm(true); setInputOn(true); } } else if (src==='synth') { microcosmSynthOn(); } }} style={{ padding:'11px 30px', borderRadius:22, cursor: disabled?'default':'pointer', border: sel?'1px solid #c9a6ff':'0.5px solid rgba(255,255,255,0.14)', background: sel?'rgba(201,166,255,0.1)':'rgba(255,255,255,0.02)', color: sel?'#c9a6ff':(disabled?'rgba(255,255,255,0.28)':'rgba(255,255,255,0.6)'), fontSize:15, letterSpacing:'0.05em', boxShadow: sel?'0 0 16px 1px rgba(201,166,255,0.3)':'none', transition:'all 0.25s ease' }}>{lbl}{soon?'  ·  soon':''}</div>;
              })}
            </div>
            {createConstTarget==='__new__' && createSrc==='sample' && (
              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, marginBottom:56 }}>
                <label style={{ padding:'12px 22px', borderRadius:12, border:'0.5px solid rgba(216,166,255,0.4)', background:'rgba(216,166,255,0.06)', color:'#e0bfff', fontSize:15, cursor:'pointer', letterSpacing:'0.04em' }}>
                  {pendingWav ? 'Change WAV' : 'Choose WAV'}
                  <input type="file" accept="audio/*" style={{ display:'none' }} onChange={async e=>{ const f=e.target.files?.[0]; if(!f) return; setPendingWav(f); await ensureStarted(); const sid=`src_pending`; const res=await microcosmLoadSource(sid, f); (window as any).__pendingSrc={ id:sid, tune:tuningOffsetFor(res.rootHz) }; const ab=await f.arrayBuffer(); let bin=''; const bytes=new Uint8Array(ab); for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); sourceBytesRef.current['src_pending']={ name:f.name, b64:btoa(bin) }; }} />
                </label>
                {pendingWav && <span style={{ color:'rgba(255,255,255,0.55)', fontSize:14 }}>{pendingWav.name}</span>}
              </div>
            )}
            <div style={{ fontSize:13, letterSpacing:'0.34em', color:'rgba(255,255,255,0.4)', marginBottom:30, fontFamily:'monospace' }}>ENGINE — tap to select</div>
            <div style={{ display:'flex', gap:40, flexWrap:'wrap', rowGap:40 }}>
              {(() => { const _sc = createConstTarget !== '__new__' ? constellations.find(c=>c.id===createConstTarget) : null; (window as any).__assignedEngines = _sc ? new Set(_sc.orbIds.map(oid => fieldOrbs.find(o=>o.id===oid)?.engineType).filter(Boolean)) : new Set(); return null; })()}
              {ALL_ORBS.map(e => {
                const queued = createList.filter(x=>x===e.engineType).length;
                const sel = queued>0 || createEngine===e.engineType;
                const alreadyHere = ((window as any).__assignedEngines as Set<string>)?.has(e.engineType);
                const col = ORB_COLORS[e.colorKey] || ORB_COLORS['tunnel'];
                return (
                  <div key={e.engineType} onClick={()=>toggleEngineInList(e.engineType)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, width:104, cursor:'pointer', opacity: sel?1:0.82, transition:'opacity 0.2s, transform 0.2s', transform: sel?'scale(1.08)':'scale(1)', position:'relative' }}>
                    {queued>0 && <div onClick={(ev)=>{ ev.stopPropagation(); setCreateList(prev=>{ const i=prev.lastIndexOf(e.engineType); if(i>=0){ const n=[...prev]; n.splice(i,1); if(n.length===0){ stopPreview(); setCreateEngine(null); } return n; } return prev; }); }} title="tap badge to remove one" style={{ position:'absolute', top:-4, right:18, zIndex:2, minWidth:22, height:22, padding:'0 6px', borderRadius:11, background:'#7af5c8', color:'#04140f', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center' }}>{queued}</div>}
                    <div style={{ position:'relative' }}>
                      <div style={{ width: sel?66:58, height: sel?66:58, borderRadius:'50%', background:`radial-gradient(circle, ${col.core}, ${col.mid}55 52%, transparent 76%)`, boxShadow: sel?`0 0 30px 6px ${col.mid}99`:(alreadyHere?`0 0 22px 5px ${col.mid}88`:`0 0 12px 2px ${col.mid}33`), border: sel?`2px solid ${col.core}`:(alreadyHere?`2px solid ${col.core}`:'2px solid transparent') }} />
                      {alreadyHere && !sel && <div style={{ position:'absolute', top:-6, right:-2, width:10, height:10, borderRadius:'50%', background:'#7af5c8', boxShadow:'0 0 8px 2px rgba(122,245,200,0.8)' }} />}
                    </div>
                    <div style={{ fontSize:15, letterSpacing:'0.06em', color: sel?col.core:(alreadyHere?col.core:'rgba(255,255,255,0.82)') }}>{e.label}{sel?' ✦':''}</div>
                    {alreadyHere && !sel && <div style={{ fontSize:10, letterSpacing:'0.2em', color:'#7af5c8', fontFamily:'monospace', marginTop:-4, fontWeight:600 }}>● LIVE</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 56px 44px', maxWidth:1100, width:'100%', margin:'0 auto', boxSizing:'border-box' }}>
            <div onClick={cancelCreate} style={{ padding:'15px 40px', borderRadius:28, cursor:'pointer', border:'1px solid rgba(255,255,255,0.2)', background:'transparent', color:'rgba(255,255,255,0.55)', fontSize:15, letterSpacing:'0.12em' }}>← BACK</div>
            <span style={{ fontSize:12, letterSpacing:'0.06em', color:'rgba(255,255,255,0.25)', fontFamily:'monospace' }}>source stays selected · add as many as you like</span>
            {(() => { const n = createList.length || (createEngine?1:0); const on = n>0; return (
            <div onClick={()=>doCreateOrb()} style={{ padding:'15px 52px', borderRadius:28, cursor: on?'pointer':'default', border:`1px solid ${on?'#7af5c8':'rgba(255,255,255,0.15)'}`, background: on?'rgba(122,245,200,0.14)':'transparent', color: on?'#a6fff2':'rgba(255,255,255,0.3)', fontSize:16, letterSpacing:'0.16em' }}>{n>1?`ADD ${n} ORBS`:'ADD ORB'}</div>
            ); })()}
          </div>
        </div>
      )}
      {/* SAVE / OPEN song dialogs */}
      {songMenu && (
        <div onClick={()=>setSongMenu(null)} style={{ position:'fixed', inset:0, zIndex:320, background:'rgba(4,5,10,0.7)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani, sans-serif' }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ width:440, maxWidth:'90vw', background:'rgba(14,16,26,0.97)', border:'0.5px solid rgba(255,255,255,0.14)', borderRadius:18, padding:'28px 30px' }}>
            {songMenu==='save' ? (
              <>
                <div style={{ fontSize:12, letterSpacing:'0.2em', color:'#7af5c8', fontFamily:'monospace', marginBottom:20 }}>SAVE UNIVERSE</div>
                <input autoFocus value={songName} onChange={(e)=>setSongName(e.target.value)} placeholder="name this universe"
                  onKeyDown={(e)=>{ if(e.key==='Enter' && songName.trim()) saveSong(songName.trim()); }}
                  style={{ width:'100%', boxSizing:'border-box', padding:'13px 16px', borderRadius:10, background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.2)', color:'#fff', fontSize:16, outline:'none', marginBottom:22 }} />
                <div style={{ display:'flex', justifyContent:'flex-end', gap:16 }}>
                  <span onClick={()=>setSongMenu(null)} style={{ fontSize:14, color:'rgba(255,255,255,0.4)', cursor:'pointer', padding:'8px 0' }}>cancel</span>
                  <span onClick={()=>{ if(songName.trim()) saveSong(songName.trim()); }} style={{ fontSize:14, letterSpacing:'0.08em', color: songName.trim()?'#a6fff2':'rgba(255,255,255,0.3)', cursor: songName.trim()?'pointer':'default', border:`1px solid ${songName.trim()?'#7af5c8':'rgba(255,255,255,0.15)'}`, borderRadius:20, padding:'8px 24px' }}>SAVE</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:12, letterSpacing:'0.2em', color:'#d8a6ff', fontFamily:'monospace', marginBottom:20 }}>OPEN UNIVERSE</div>
                {listSongs().length===0 ? (
                  <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)', padding:'10px 0 20px' }}>no saved universes yet</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:'46vh', overflowY:'auto', marginBottom:18 }}>
                    {listSongs().sort((a,b)=>b.ts-a.ts).map(sg => (
                      <div key={sg.name} onClick={()=>loadSong(sg.name)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 16px', borderRadius:10, cursor:'pointer', background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize:16, color:'#e0bfff' }}>{sg.name}</span>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{new Date(sg.ts).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <span onClick={()=>setSongMenu(null)} style={{ fontSize:14, color:'rgba(255,255,255,0.4)', cursor:'pointer', padding:'8px 0' }}>close</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* CHORDS — progression editor (bottom pop-up). Build a sequence of interval steps + bars; play loops it. */}
      {chordsOpen && (
        <div style={{ position:'fixed', left:0, right:0, bottom:0, zIndex:320, display:'flex', justifyContent:'center', fontFamily:'Rajdhani, sans-serif', pointerEvents:'none' }}>
          <div style={{ width:'100%', maxWidth:'none', background:'rgba(10,12,20,0.94)', backdropFilter:'blur(10px)', borderTop:'0.5px solid rgba(255,255,255,0.14)', borderRadius:'18px 18px 0 0', padding:'12px 56px 14px', pointerEvents:'auto', boxShadow:'0 -20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <span style={{ fontSize:12, letterSpacing:'0.24em', color:'#8aa0d0', fontFamily:'monospace' }}>CHORDS — PROGRESSION</span>
              <span onClick={()=>setChordsOpen(false)} style={{ cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:18 }}>×</span>
            </div>

            {/* current sequence */}
            <div style={{ display:'flex', alignItems:'center', gap:40, flexWrap:'nowrap' }}>
            <div style={{ flex:'0 1 auto' }}>
            <div style={{ fontSize:10, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)', marginBottom:12, fontFamily:'monospace' }}>SEQUENCE</div>
            {prog.length===0 ? (
              <div style={{ fontSize:14, color:'rgba(255,255,255,0.35)', marginBottom:22 }}>empty — add steps below</div>
            ) : (
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:24 }}>
                {prog.map((st, idx) => {
                  const lbl = (scaleLock ? FLAT_NAMES[NOTES.indexOf(st.note)] : st.note) + st.oct;   // flats when locked (Ab3 not G#3), matching the picker/key
                  const active = progRunning && progStepIdx===idx;
                  return (
                    <div key={idx}
                      onPointerDown={(e)=>{ const t=e.target as HTMLElement; if(t.tagName==='SPAN' && t.textContent && ['−','+','remove'].includes(t.textContent)) return; e.preventDefault(); setDragIdx(idx); }}
                      onPointerEnter={()=>{ if(dragIdx!==null && dragIdx!==idx){ setProg(pr=>{ const a=[...pr]; const [m]=a.splice(dragIdx,1); a.splice(idx,0,m); return a; }); setDragIdx(idx); } }}
                      onPointerUp={()=>setDragIdx(null)}
                      style={{ position:'relative', overflow:'hidden', userSelect:'none', touchAction:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'12px 14px', borderRadius:12, cursor: dragIdx===idx?'grabbing':'grab', border:`1px solid ${dragIdx===idx?'#d8a6ff':(active?'#a6c4ff':'rgba(255,255,255,0.15)')}`, background: dragIdx===idx?'rgba(216,166,255,0.14)':(active?'rgba(140,160,210,0.12)':'rgba(255,255,255,0.03)'), opacity: dragIdx===idx?0.85:1, transition:'border 0.15s, background 0.15s' }}>
                      {active && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${progProgress*100}%`, background:'linear-gradient(90deg, rgba(166,196,255,0.4), rgba(166,196,255,0.7))', pointerEvents:'none', transition:`width ${progStepDur}ms linear` }} />}
                      <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                        <span onClick={()=>setProg(p=>p.map((x,i)=>{ if(i!==idx) return x; let ni=NOTES.indexOf(x.note)-1, oc=x.oct; if(ni<0){ni=11;oc-=1;} return {...x, note:NOTES[ni], oct:Math.max(1,oc)}; }))} style={{ cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:16 }}>−</span>
                        <span style={{ fontSize:16, color: active?'#cfe0ff':'#e0e6ff', minWidth:38, textAlign:'center' }}>{lbl}</span>
                        <span onClick={()=>setProg(p=>p.map((x,i)=>{ if(i!==idx) return x; let ni=NOTES.indexOf(x.note)+1, oc=x.oct; if(ni>11){ni=0;oc+=1;} return {...x, note:NOTES[ni], oct:Math.min(6,oc)}; }))} style={{ cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:16 }}>+</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span onClick={()=>setProg(p=>p.map((x,i)=>i===idx?{...x,bars:Math.max(1,x.bars-1)}:x))} style={{ cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:15 }}>−</span>
                        <span style={{ fontSize:13, color:'rgba(255,255,255,0.7)', minWidth:42, textAlign:'center' }}>{st.bars} bar{st.bars>1?'s':''}</span>
                        <span onClick={()=>setProg(p=>p.map((x,i)=>i===idx?{...x,bars:x.bars+1}:x))} style={{ cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:15 }}>+</span>
                      </div>
                      <span onClick={()=>setProg(p=>p.filter((_,i)=>i!==idx))} style={{ cursor:'pointer', fontSize:10, color:'rgba(255,120,90,0.7)' }}>remove</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* add a step — pick a NOTE (chromatic) at the chosen OCTAVE, like the conductor keyboard */}
            </div>
            <div style={{ flex:'1 1 auto', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:12 }}>
              <span style={{ fontSize:10, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)', fontFamily:'monospace' }}>ADD STEP</span>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span onClick={()=>setProgPickOct(o=>Math.max(2,o-1))} style={{ cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:15, userSelect:'none' }}>◂</span>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.65)', minWidth:54, textAlign:'center' }}>oct {progPickOct}</span>
                <span onClick={()=>setProgPickOct(o=>Math.min(6,o+1))} style={{ cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:15, userSelect:'none' }}>▸</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:28 }}>
              {(scaleLock
                  // SCALE-LOCK: the scale IN ORDER from the root (Bb minor -> Bb C Db Eb F Gb Ab), tone 1 = root
                  ? SCALE_SEMIS[scaleMode].map(deg => (NOTES.indexOf(lockKey) + deg) % 12)
                  // free: all 12 chromatic from C
                  : NOTES.map((_, i) => i)
                ).map((idx, pos) => {
                  const n = NOTES[idx];
                  const sharp = n.includes('#');
                  const label = scaleLock ? FLAT_NAMES[idx] : n;
                  return (
                    <div key={pos} onClick={()=>setProg(p=>[...p,{note:n, oct:progPickOct, bars:4}])}
                      style={{ minWidth: (scaleLock||!sharp)?38:34, textAlign:'center', padding:'10px 10px', borderRadius:18, cursor:'pointer',
                        border:`0.5px solid ${(scaleLock||!sharp)?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)'}`,
                        background: (scaleLock||!sharp)?'rgba(255,255,255,0.05)':'rgba(255,255,255,0.02)',
                        fontSize:14, color: (scaleLock||!sharp)?'rgba(255,255,255,0.85)':'rgba(255,255,255,0.55)' }}>
                      {label}{progPickOct}
                    </div>
                  );
                })}
            </div>
            {/* transport — Engage starts chord movement, Release stops it (drone continues via master) */}
            <div style={{ display:'flex', justifyContent:'center', gap:14 }}>
              <div onClick={()=>{ if(prog.length && !progRunning) runProg(); }}
                style={{ padding:'13px 40px', borderRadius:26, cursor: (prog.length && !progRunning)?'pointer':'default',
                  border:`1px solid ${progRunning?'#7af5c8':(prog.length?'rgba(122,245,200,0.7)':'rgba(255,255,255,0.15)')}`,
                  background: progRunning?'rgba(122,245,200,0.22)':(prog.length?'rgba(122,245,200,0.1)':'transparent'),
                  color: progRunning?'#a6fff2':(prog.length?'#a6fff2':'rgba(255,255,255,0.3)'), fontSize:15, letterSpacing:'0.14em',
                  boxShadow: progRunning?'0 0 18px 2px rgba(122,245,200,0.4)':'none' }}>ENGAGE</div>
              <div onClick={()=>{ if(progRunning) stopProg(); setChordsOpen(false); }}
                style={{ padding:'13px 40px', borderRadius:26, cursor: progRunning?'pointer':'default',
                  border:`1px solid ${progRunning?'rgba(255,140,110,0.7)':'rgba(255,255,255,0.12)'}`,
                  background: progRunning?'rgba(255,140,110,0.12)':'transparent',
                  color: progRunning?'#ff8c6e':'rgba(255,255,255,0.25)', fontSize:15, letterSpacing:'0.14em' }}>RELEASE</div>
            </div>
            </div>
            </div>
          </div>
        </div>
      )}
      {/* TAPE — expands upward from the Tape button (FIELD row, bottom-left) */}
      {tapeOpen && (() => {
        // ONE TAPE PANEL, CONTEXT-AWARE: cosmos/single-field -> MASTER; inside a constellation -> its reel.
        const liveC = constellations.filter(c=>c.orbIds.length>0);
        const reelIdx = forwardConst && forwardConst !== DEFAULT_CONST_ID ? liveC.findIndex(c=>c.id===forwardConst) : -1;
        const reelSlot = reelIdx >= 0 ? Math.min(8, reelIdx + 1) : 0;
        const isReel = reelSlot > 0;
        const reelName = isReel ? (liveC[reelIdx]?.name ?? '') : '';
        const reelTint = isReel ? CONST_TINTS[reelIdx % CONST_TINTS.length] : '#e8b070';
        const reelBal = isReel ? (constTapeBalRef.current[forwardConst!] ?? { wow:0, sat:0, roll:0, hiss:0 }) : null;
        return (
        <div style={{ position:'fixed', left:40, bottom:132, zIndex:340, width:288,
          background:'linear-gradient(180deg, rgba(20,16,12,0.97), rgba(12,10,9,0.97))',
          backdropFilter:'blur(16px)', border:'1px solid rgba(232,176,112,0.28)', borderRadius:14,
          padding:'18px 20px 20px', fontFamily:'Rajdhani, sans-serif',
          boxShadow:'0 8px 44px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(232,176,112,0.1), inset 0 1px 0 rgba(232,176,112,0.08)',
          animation:'tapeRise 0.18s ease-out' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
            <span style={{ fontSize:10.5, letterSpacing:'0.32em', color:reelTint, fontFamily:'"Space Mono", monospace', fontWeight:400 }}>{isReel ? `TAPE · ${reelName.toUpperCase()}` : 'TAPE · MASTER'}</span>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              {!isReel && <span onClick={()=>{ const m=!tapeMuted; setTapeMuted(m); microcosmTapeMute(m); }}
                style={{ cursor:'pointer', fontSize:9.5, letterSpacing:'0.18em', fontFamily:'"Space Mono", monospace', padding:'3px 8px', borderRadius:5, border:`1px solid ${tapeMuted?'rgba(212,96,80,0.7)':'rgba(122,245,200,0.7)'}`, color: tapeMuted?'#d46050':'#7af5c8', background: tapeMuted?'rgba(212,96,80,0.12)':'rgba(122,245,200,0.12)' }}>{tapeMuted?'OFF':'ON'}</span>}
              <span onClick={()=>setTapeOpen(false)} style={{ cursor:'pointer', color:'rgba(232,226,214,0.35)', fontSize:15, lineHeight:1, padding:'2px 4px' }}>×</span>
            </div>
          </div>
          {/* MASTER (master tier only) */}
          {!isReel && <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7, alignItems:'baseline' }}>
              <span style={{ fontSize:11, letterSpacing:'0.16em', color:'#E8E2D6', fontFamily:'"Space Mono", monospace' }}>MASTER</span>
              <span style={{ fontSize:12, color:'#e8b070', fontFamily:'"Space Mono", monospace' }}>{Math.round(tapeMaster*100)}</span>
            </div>
            <input type="range" min={0} max={1} step={0.01} value={tapeMaster}
              onChange={(e)=>{ const v=parseFloat(e.target.value); setTapeMaster(v); microcosmTape(v); }}
              style={{ width:'100%', height:3, accentColor:'#E8E2D6', cursor:'pointer' }} />
          </div>}
          <div style={{ height:1, background:'rgba(232,176,112,0.14)', margin:'0 -20px 16px' }} />
          {/* INGREDIENTS */}
          {([['hiss','HISS'],['sat','SATURATION'],['wow','WOW · FLUTTER'],['roll','ROLLOFF']] as const).map(([k,lbl],idx)=>(
            <div key={k} style={{ marginBottom: idx===3?0:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, alignItems:'baseline' }}>
                <span style={{ fontSize:10.5, letterSpacing:'0.14em', color:'rgba(232,226,214,0.55)', fontFamily:'Rajdhani, sans-serif', fontWeight:500 }}>{lbl}</span>
                <span style={{ fontSize:11, color:'rgba(232,176,112,0.85)', fontFamily:'"Space Mono", monospace' }}>{Math.round((isReel ? (reelBal as any)[k] : (tapeBal as any)[k])*100)}</span>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={isReel ? (reelBal as any)[k] : (tapeBal as any)[k]}
                onChange={(e)=>{ const v=parseFloat(e.target.value);
                  if (isReel) { const cur = constTapeBalRef.current[forwardConst!] ?? { wow:0, sat:0, roll:0, hiss:0 }; (cur as any)[k]=v; constTapeBalRef.current[forwardConst!]=cur; microcosmConstTapeBalance(reelSlot, k, v); forceOrb(x=>x+1); }
                  else { setTapeBal(b=>({...b,[k]:v})); microcosmTapeBalance(k, v); } }}
                style={{ width:'100%', height:3, accentColor:'#e8b070', cursor:'pointer' }} />
            </div>
          ))}
        </div>
      );
      })()}

      {/* CONTROL — full-screen hardware mapping page (instrument-grade) */}
      {controlOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:310, background:'radial-gradient(ellipse at 50% 32%, #0c1018 0%, #06070d 60%, #030409 100%)', display:'flex', flexDirection:'column', fontFamily:'Rajdhani, sans-serif' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'34px 56px 0' }}>
            <span style={{ fontSize:15, letterSpacing:'0.4em', color:'#d8a6ff', fontFamily:'monospace', fontWeight:600 }}>H A A R</span>
            <div onClick={()=>{ cancelLearn(); setLearning(null); setControlOpen(false); }} style={{ width:40, height:40, borderRadius:'50%', border:'0.5px solid rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(255,255,255,0.6)', fontSize:18 }}>×</div>
          </div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-start', padding:'28px 56px 48px', maxWidth:980, width:'100%', margin:'0 auto', boxSizing:'border-box', overflowY:'auto', minHeight:0 }}>
            {/* DEVICE HEADLINE */}
            <div style={{ textAlign:'center', marginBottom:36 }}>
              <div style={{ fontSize:11, letterSpacing:'0.35em', color:'rgba(232,226,214,0.4)', fontFamily:'"Space Mono", monospace', marginBottom:10 }}>CONTROL</div>
              <div style={{ fontSize:26, letterSpacing:'0.12em', color:'#E8E2D6', fontWeight:500 }}>
                {midiDevices && midiDevices.inputs.length ? midiDevices.inputs[0].toUpperCase() : 'NO DEVICE'}
              </div>
              <div style={{ fontSize:12, letterSpacing:'0.25em', fontFamily:'"Space Mono", monospace', marginTop:6,
                color: midiDevices && midiDevices.inputs.length ? '#7af5c8' : 'rgba(232,226,214,0.35)' }}>
                {midiDevices && midiDevices.inputs.length
                  ? ('● CONNECTED' + (midiDevices.outputs.length ? ' · IN / OUT' : ' · IN ONLY') + ' · LAYER ' + hwLayer.toUpperCase())
                  : '○ CONNECT A CONTROLLER'}
              </div>
            </div>
            {/* shared chip helpers rendered inline */}
            {(() => {
              const mono = '"Space Mono", monospace';
              const chip = (txt:string, color:string, onClick?:()=>void, solid?:boolean) => (
                <span key={txt+color} onClick={onClick}
                  style={{ fontFamily:mono, fontSize:11, letterSpacing:'0.06em', cursor:onClick?'pointer':'default',
                    color: solid ? '#04050a' : color, background: solid ? color : 'transparent',
                    border:`1px solid ${solid ? color : color.replace(')', ',0.45)').replace('rgb','rgba')}`,
                    borderRadius:20, padding:'5px 13px', boxShadow: solid ? `0 0 16px 2px ${color}55` : 'none',
                    animation: solid ? 'haarPulse 1.1s ease-in-out infinite' : 'none' }}>{txt}</span>
              );
              const bindingsFor = (aid:string) => getBindings().filter(b => b.actionId === aid);
              const srcLabel = (b:Binding) => b.source.kind==='cc' ? `CC${(b.source as any).cc}` : b.source.kind==='note' ? `PAD ${(b.source as any).note}` : b.source.kind===('gridmatrix' as any) ? `GRID ${(b.source as any).cols}×${(b.source as any).rows}` : `KEYS ${(b.source as any).low}–${(b.source as any).high}`;
              const learnChip = (aid:any, kind:any, perColumn:boolean) => {
                const bound = bindingsFor(aid);
                const isL = learning === aid;
                return chip(
                  isL ? (kind==='noterange' ? 'LOW … HIGH' : kind===('gridmatrix' as any) ? 'TOP-LEFT … BOTTOM-RIGHT' : 'MOVE IT…') : (perColumn ? `+ LEARN COL ${bound.length+1}` : bound.length ? 'RELEARN' : '+ LEARN'),
                  '#ffce8a',
                  () => {
                    if (isL) { cancelLearn(); setLearning(null); return; }
                    armLearn(aid, kind, perColumn ? bound.length : undefined, () => { setLearning(null); setBindTick(t=>t+1); });
                    setLearning(aid);
                  },
                  isL,
                );
              };
              const boundChips = (aid:string, showCol:boolean) => bindingsFor(aid).map(b =>
                chip(srcLabel(b) + (showCol && typeof b.param==='number' ? ` → COL ${(b.param as number)+1}` : '') + ((b.layer ?? 'base') === 'orb' ? ' · ORB' : '') + '  ×',
                  (b.layer ?? 'base') === 'orb' ? '#d46090' : '#7af5c8',
                  () => { removeBinding(b.id); setBindTick(t=>t+1); }));
              const zone = (label:string, color:string, rows:{name:string; right:React.ReactNode}[]) => (
                <div style={{ border:`1px solid ${color}38`, borderRadius:14, padding:'20px 26px', marginBottom:18 }}>
                  <div style={{ fontSize:11, letterSpacing:'0.3em', color:`${color}c8`, fontFamily:mono, marginBottom:16 }}>{label}</div>
                  {rows.map(r => (
                    <div key={r.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, gap:16, flexWrap:'wrap' }}>
                      <span style={{ fontSize:15.5, color:'rgba(232,226,214,0.85)' }}>{r.name}</span>
                      <span style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>{r.right}</span>
                    </div>
                  ))}
                </div>
              );
              const liveConsts = constellations.filter(c => c.orbIds.length > 0);
              return (<>
                <style>{`@keyframes haarPulse { 0%,100%{opacity:1} 50%{opacity:0.55} }`}</style>
                {zone('CONDUCTOR', '#d8a6ff', [
                  { name:'Keys → conductor', right: <>{boundChips('conductor.note', false)}{learnChip('conductor.note','noterange',false)}</> },
                  { name:'Octave up', right: <>{boundChips('conductor.octaveUp' as any, false)}{learnChip('conductor.octaveUp' as any,'trigger',false)}</> },
                  { name:'Octave down', right: <>{boundChips('conductor.octaveDown' as any, false)}{learnChip('conductor.octaveDown' as any,'trigger',false)}</> },
                ])}
                {zone('CONSTELLATIONS', '#7af5c8', [
                  { name:'Columns now', right: <span style={{ display:'flex', gap:10 }}>{liveConsts.map((c,i)=>(
                      <span key={c.id} style={{ fontFamily:mono, fontSize:10.5, color:CONST_TINTS[i % CONST_TINTS.length], letterSpacing:'0.08em' }}>{(i+1)+' · '+c.name.toUpperCase()}</span>))}</span> },
                  { name:'Pad matrix', right: <>{boundChips('grid.matrix' as any, false)}{learnChip('grid.matrix' as any,'gridmatrix' as any,false)}</> },
                  { name:'Mute', right: <>{boundChips('const.mute', true)}{learnChip('const.mute','trigger',true)}</> },
                  { name:'Level', right: <>{boundChips('const.level', true)}{learnChip('const.level','continuous',true)}</> },
                  { name:'Master level', right: <>{boundChips('master.level', false)}{learnChip('master.level','continuous',false)}</> },
                ])}
                {zone('ORB · FOCUSED', '#d46090', [
                  { name:'Following', right: <span style={{ fontFamily:mono, fontSize:11, color:'#d46090', letterSpacing:'0.08em' }}>{(focused ?? selected) ? (focused ?? selected).toUpperCase() : 'NO ORB SELECTED'}</span> },
                  { name:'Spread X', right: <>{boundChips('orb.x', false)}{learnChip('orb.x','continuous',false)}</> },
                  { name:'Pitch spread Y', right: <>{boundChips('orb.y', false)}{learnChip('orb.y','continuous',false)}</> },
                  { name:'Density', right: <>{boundChips('orb.density', false)}{learnChip('orb.density','continuous',false)}</> },
                  { name:'Pan', right: <>{boundChips('orb.pan' as any, false)}{learnChip('orb.pan' as any,'continuous',false)}</> },
                  { name:'Flavour · next', right: <>{boundChips('flavour.cycle' as any, false)}{learnChip('flavour.cycle' as any,'trigger',false)}</> },
                  { name:'Flavour · amount', right: <>{boundChips('flavour.amount' as any, false)}{learnChip('flavour.amount' as any,'continuous',false)}</> },
                  { name:'Fauve on / off', right: <>{boundChips('fauve.toggle' as any, false)}{learnChip('fauve.toggle' as any,'trigger',false)}</> },
                  { name:'Fauve · disorder', right: <>{boundChips('fauve.disorder', false)}{learnChip('fauve.disorder','continuous',false)}</> },
                  { name:'Fauve · repeat', right: <>{boundChips('fauve.repeat', false)}{learnChip('fauve.repeat','continuous',false)}</> },
                  { name:'Fauve · reverse', right: <>{boundChips('fauve.reverse', false)}{learnChip('fauve.reverse','continuous',false)}</> },
                  { name:'Fauve · gaps', right: <>{boundChips('fauve.gaps', false)}{learnChip('fauve.gaps','continuous',false)}</> },
                ])}
                {zone('TRANSPORT', '#ffce8a', [
                  { name:'Play / pause', right: <>{boundChips('transport.playpause' as any, false)}{learnChip('transport.playpause' as any,'trigger',false)}</> },
                  { name:'Chords engage', right: <>{boundChips('chords.engage', false)}{learnChip('chords.engage','trigger',false)}</> },
                  { name:'Chords release', right: <>{boundChips('chords.release', false)}{learnChip('chords.release','trigger',false)}</> },
                  { name:'Scale-lock toggle', right: <>{boundChips('scale.toggle', false)}{learnChip('scale.toggle','trigger',false)}</> },
                  { name:'Master stop', right: <>{boundChips('master.stop', false)}{learnChip('master.stop','trigger',false)}</> },
                  { name:'Console up / down', right: <>{boundChips('view.console' as any, false)}{learnChip('view.console' as any,'trigger',false)}</> },
                  { name:'Layer key (base ↔ orb)', right: <>{boundChips('layer.toggle' as any, false)}{learnChip('layer.toggle' as any,'trigger',false)}</> },
                ])}
                {/* PROFILE row */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'6px 2px 18px' }}>
                  <span style={{ fontFamily:mono, fontSize:11, letterSpacing:'0.2em', color:'rgba(232,226,214,0.4)' }}>PROFILE</span>
                  <span style={{ display:'flex', gap:10 }}>
                    {chip('EXPORT', '#7af5c8', () => { navigator.clipboard.writeText(JSON.stringify(getBindings(), null, 2)); })}
                    {chip('RESET', '#d46050', () => { if (confirm('Remove ALL bindings?')) { replaceAll([]); setBindTick(t=>t+1); } })}
                  </span>
                </div>
              </>);
            })()}
          </div>
        </div>
      )}


    </main>
  );
}
