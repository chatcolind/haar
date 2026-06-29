'use client';

import { useState, useEffect, useRef } from 'react';
import Orb, { ORB_COLORS } from '../../components/field/Orb';
import {
  startAudio, microcosmStart, microcosmStopEngine,
  microcosmEngineActive, microcosmEngineLevel, microcosmMasterLevel, microcosmEnginePan, microcosmEngineEQ,
  microcosmGrainSpread, microcosmPitchSpread, microcosmSourceFreq,
  microcosmGrainDensity, microcosmArmedPalette, microcosmEngineAmount,
} from '../../audio/engine';

type OrbDef = { id: string; label: string; colorKey: any };
const ALL_ORBS: OrbDef[] = [
  // TEST BHAIRAV: Bhairav-capable engines first (mosaic/shimmer/warp/glitch use tiers)
  { id: 'mosaic',  label: 'Mosaic',  colorKey: 'tunnel'  },
  { id: 'shimmer', label: 'Shimmer', colorKey: 'shimmer' },
  { id: 'warp',    label: 'Warp',    colorKey: 'warp'    },
  { id: 'glitch',  label: 'Glitch',  colorKey: 'glitch'  },
  { id: 'bubbles', label: 'Bubbles', colorKey: 'bubbles' },
  { id: 'tunnel',  label: 'Tunnel',  colorKey: 'tunnel'  },
  { id: 'strum',   label: 'Strum',   colorKey: 'strum'   },
  { id: 'haze',    label: 'Haze',    colorKey: 'haze'    },
  { id: 'swarm',   label: 'Swarm',   colorKey: 'swarm'   },
  { id: 'reverse', label: 'Reverse', colorKey: 'shimmer' },
];

const FIELD_H = 0.70;
const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
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
function satelliteSlots(count: number, W: number, H: number, centreSize: number) {
  const n = count - 1;
  if (n <= 0) return [];

  // deterministic PRNG so positions are stable per count (no jitter each render)
  let seed = 1000 + n * 97;
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
  const [count, setCount] = useState(4);
  const [selected, setSelected] = useState<string>('mosaic'); // TEST BHAIRAV
  const [focused, setFocused] = useState<string | null>(null); // orb in focused (controls-beside) view
  const [focusShown, setFocusShown] = useState(false); // drives the in/out transition (lags focused)
  const [mixOpen, setMixOpen] = useState(false);   // mix desk visible
  const [mixShown, setMixShown] = useState(false); // drives the desk slide transition
  const [masterVol, setMasterVol] = useState(0.85);  // master fader
  const lastOrbTap = useRef<{ id:string; t:number }>({ id:'', t:0 });
  const [dim, setDim] = useState({ w: 1440, h: 900 });
  const [state, setState] = useState<'idle'|'playing'|'stopped'>('idle');
  const [muted, setMuted] = useState(false);
  const [xyMap, setXyMap] = useState<Record<string, XY>>(defaultXY);
  const [lockKey, setLockKey] = useState('C');   // the LOCKED root (yellow), double-click to set
  const [playNote, setPlayNote] = useState('C'); // current note being played (white)
  const [playSemi, setPlaySemi] = useState(0); // semitones from locked root      // octave offset of the played note from lock
  const [octave, setOctave] = useState(0);        // whole-keyboard register shift
  const lastTap = useRef<{ key:string; t:number }>({ key:'', t:0 });
  const [palette, setPalette] = useState('open');     // armed flavour palette (global)
  const [pickerOpen, setPickerOpen] = useState(false);  // flavour picker visible
  const [life, setLife] = useState(0.32);
  const [solo, setSolo] = useState(false);      // TEST SOLO
  const soloRef = useRef(false);                // TEST SOLO
  const [density, setDensity] = useState(0.5);  // TEST DENSITY
  const amountRef = useRef<Record<string, number>>({}); // per-orb flavour amount (default 0)
  const volRef = useRef<Record<string, number>>({});   // per-orb volume (default 0.7)
  const densRef = useRef<Record<string, number>>({});  // per-orb density (default 0.5)
  const muteRef = useRef<Record<string, boolean>>({});  // per-channel mute (mixer)
  const soloSetRef = useRef<Record<string, boolean>>({}); // per-channel solo (mixer)

  // ── ORB-BACK voice state (UI ready; engine wiring = multi-voice source layer, later) ──
  type VoiceDef = { id: string; type: string; on: boolean; oct: number; level: number; detune: number };
  const voicesRef = useRef<Record<string, VoiceDef[]>>({});   // per-orb voice list
  const [selVoice, setSelVoice] = useState<string | null>(null); // selected voice id (this orb)
  function getVoices(orbId: string): VoiceDef[] {
    if (!voicesRef.current[orbId]) {
      voicesRef.current[orbId] = [
        { id:'v_tri',   type:'Tri',   on:true,  oct:0, level:0.75, detune:0 },
        { id:'v_sine',  type:'Sine',  on:true,  oct:0, level:0.7,  detune:0 },
        { id:'v_noise', type:'Noise', on:false, oct:0, level:0.5,  detune:0 },
      ];
    }
    return voicesRef.current[orbId];
  }
  const panRef = useRef<Record<string, number>>({});    // per-channel pan (-1..1, 0=centre)
  const eqRef = useRef<Record<string, {lo:number;mid:number;hi:number}>>({}); // per-channel EQ dB (-12..12, 0=flat)
  const [expandedChannel, setExpandedChannel] = useState<string|null>(null); // mixer channel expanded sideways
  const [, forceOrb] = useState(0); // re-render after per-orb ref writes
  const [, forceAmt] = useState(0);
  const started = useRef(false);
  const mutedRef = useRef(false);
  const xyRef = useRef<Record<string, XY>>(defaultXY());

  const orbs = ALL_ORBS.slice(0, count);

  useEffect(() => {
    const update = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // RACK: activate ALL visible orbs' engines (present = playing)
  // per-orb level = the orb's OWN volume (the mixer fader is the single source of truth).
  // selection no longer changes volume; mute/solo still gate it.
  function reapplyLevels(){ ALL_ORBS.forEach(o => { if (orbs.some(v=>v.id===o.id)) microcosmEngineLevel(o.id, orbLevel(o.id)); }); }
  function orbLevel(id: string): number {
    if (mutedRef.current) return 0;
    if (muteRef.current[id]) return 0;                    // per-channel mute (mixer)
    const anySolo = Object.values(soloSetRef.current).some(Boolean);
    if (anySolo && !soloSetRef.current[id]) return 0;     // solo: non-soloed channels silent
    return volRef.current[id] ?? 0.7;                     // the fader value
  }
  function activateRack() {
    if (!started.current) return;
    ALL_ORBS.forEach(o => {
      const on = orbs.some(v => v.id === o.id);
      microcosmEngineActive(o.id, on);
      if (on) microcosmEngineLevel(o.id, orbLevel(o.id));
    });
    const v = xyRef.current[selected] ?? { x:0.5, y:0.5 };
    microcosmGrainSpread(v.x); microcosmPitchSpread(v.y);
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
  function playAt(note: string, semis: number) {
    const rootHz = NOTE_BASE[lockKey] ?? 261.63;
    const hz = rootHz * Math.pow(2, (semis / 12) + octave);
    microcosmSourceFreq(hz);
    setPlayNote(note); setPlaySemi(semis);
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
    await startAudio(); await microcosmStart();
    // tune the source to the locked root so audio matches the yellow label from note one
    const rootHz = NOTE_BASE[lockKey] ?? 261.63;
    microcosmSourceFreq(rootHz * Math.pow(2, octave));
    setPlayNote(lockKey); setPlaySemi(0);
    setState('playing'); activateRack();
  }
  function enterFocus(id: string) { setSelected(id); setFocused(id); requestAnimationFrame(()=>setFocusShown(true)); }
  function exitFocus() { setFocusShown(false); setTimeout(()=>setFocused(null), 920); }
  function openMix() { setMixOpen(true); requestAnimationFrame(()=>setMixShown(true)); }
  function closeMix() { setMixShown(false); setTimeout(()=>setMixOpen(false), 420); }
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
    ALL_ORBS.forEach(o => {
      if (orbs.some(v => v.id === o.id)) microcosmEngineLevel(o.id, orbLevel(o.id));
    });
    const v = xyRef.current[id] ?? { x:0.5, y:0.5 };
    microcosmGrainSpread(v.x); microcosmPitchSpread(v.y);
  }
  function handleXY(nx: number, ny: number) {
    const id = selected;
    const next = { ...xyRef.current, [id]: { x:nx, y:ny } };
    xyRef.current = next; setXyMap(next);
    microcosmGrainSpread(nx); microcosmPitchSpread(ny);
  }
  async function doStart() {
    if (!started.current) { await ensureStarted(); return; }
    await microcosmStart(); activateRack(); setState('playing');
  }
  function doStop() { microcosmStopEngine(); setState('stopped'); }
  function toggleMute() {
    const m = !mutedRef.current; mutedRef.current=m; setMuted(m);
    activateRack();
  }

  // ── LAYOUT MODEL ──────────────────────────────────────────────
  // The screen has two territories: TOP (field-or-focus) and BOTTOM (mixer, when open).
  // Opening the mixer shrinks the TOP; the field re-lays-out into the smaller height.
  const MIXER_H = 0.40;                    // mixer occupies 40% of screen when open
  const topFrac = mixOpen ? (1 - MIXER_H) : FIELD_H;  // top territory as fraction of screen
  const fh = dim.h * topFrac;              // field height drives ALL orb positions (auto re-layout)
  const mixerH = dim.h * MIXER_H;          // mixer territory height
  const bottomBarH = dim.h * 0.30;         // the keyboard/field/system bar height (field state)
  // ──────────────────────────────────────────────────────────────
  const sats = satelliteSlots(count, dim.w, fh, CENTRE.size);
  const others = orbs.filter(o => o.id !== selected);
  const centrePos = { x: CENTRE.fx * dim.w, y: CENTRE.fy * fh, size: CENTRE.size };
  const slotFor = (id: string) => {
    if (id === selected) return centrePos;
    const idx = others.findIndex(o => o.id === id);
    return sats[idx] ?? centrePos;
  };
  const zlabel: React.CSSProperties = { fontSize:9, fontWeight:500, letterSpacing:'0.25em', color:'rgba(255,255,255,0.3)', marginBottom:14 };

  return (
    <main style={{ position:'fixed', inset:0, overflow:'hidden', touchAction:'none', background:'radial-gradient(ellipse at 50% 28%, #10131f 0%, #070810 66%, #04050a 100%)', fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', color:'#fff' }}>
      <div style={{ position:'absolute', inset:0, opacity:0.6, pointerEvents:'none', backgroundImage:'radial-gradient(1px 1px at 20% 14%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 88% 9%, rgba(255,255,255,0.45), transparent), radial-gradient(1px 1px at 94% 42%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 8% 46%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 50% 8%, rgba(255,255,255,0.3), transparent)' }} />
      <div style={{ position:'absolute', top:24, left:32, fontSize:21, letterSpacing:'0.6em', fontWeight:500 }}>H A A R</div>
      <div style={{ position:'absolute', top:28, right:32, fontSize:11, fontWeight:500, color:'rgba(255,255,255,0.55)' }}>
        {state==='playing' ? `${muted?'muted':'playing'} · ${count} active` : state==='stopped' ? 'stopped' : `field · ${count} active`}
      </div>


      {/* TEST SOLO: hear only selected orb (temporary, removable) */}
      <div onClick={()=>{ const v=!soloRef.current; soloRef.current=v; setSolo(v); activateRack(); }}
        style={{ position:'absolute', top:108, left:'50%', transform:'translateX(-50%)', zIndex:100, padding:'7px 16px', fontSize:11, cursor:'pointer', userSelect:'none', borderRadius:18,
          background: solo ? 'rgba(122,245,200,0.25)' : 'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.2)',
          color: solo ? '#fff' : 'rgba(255,255,255,0.5)' }}>
        {solo ? 'SOLO on · only selected' : 'Solo off · all play'}
      </div>


      {/* TEST: orb count stepper (top-left, clear of orbs, above field) */}
      <div style={{ position:'absolute', top:62, left:32, zIndex:100, display:'flex', alignItems:'center', gap:14, background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:20, padding:'7px 16px' }}>
        <span onClick={()=>setCount(c=>Math.max(1,c-1))} style={{ cursor:'pointer', fontSize:18, color:'#fff', userSelect:'none' }}>−</span>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.7)', minWidth:54, textAlign:'center' }}>{count} orbs</span>
        <span onClick={()=>setCount(c=>Math.min(10,c+1))} style={{ cursor:'pointer', fontSize:18, color:'#fff', userSelect:'none' }}>+</span>
      </div>

      {orbs.map((o) => {
        if (focused === o.id) return null;   // hide the focused orb in the field — it lives in the back
        const slot = slotFor(o.id);
        return (
          <Orb key={o.id} id={o.id} label={o.label} colorKey={o.colorKey}
            x={slot.x} y={slot.y} size={slot.size} volume={0.7}
            selected={selected===o.id} xy={xyMap[o.id]} onSelect={handleSelect} onXY={handleXY} />
        );
      })}

      {/* FOCUSED VIEW — orb left (alive), controls right on glass, universe faint behind */}
      {focused && (() => {
        const fo = ALL_ORBS.find(o => o.id === focused);
        const fc = '#d8a6ff';  // breadcrumb tint (Orb resolves its own colour)
        return (
          <div style={{ position:'absolute', inset:0, zIndex:150, pointerEvents:'none' }}>
            {/* dim scrim — visual only, stops above the keyboard so it stays playable */}
            <div style={{ position:'absolute', left:0, right:0, top:0, bottom: dim.h*0.30, background:'rgba(6,4,12,0.82)', backdropFilter:'blur(5px)', opacity: focusShown?1:0, transition:'opacity 0.42s ease' }} />

            {/* breadcrumb + close */}
            <div style={{ position:'absolute', top:18, left:24, zIndex:3, display:'flex', alignItems:'center', gap:9, opacity: focusShown?1:0, transition:'opacity 0.42s ease', pointerEvents:'auto' }}>
              <span onClick={exitFocus} style={{ fontSize:11, letterSpacing:'0.1em', color:'rgba(255,255,255,0.45)', cursor:'pointer' }}>FIELD</span>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>›</span>
              <span style={{ fontSize:11, letterSpacing:'0.1em', color:fc }}>{(fo?.label || focused).toUpperCase()}</span>
            </div>
            <div onClick={exitFocus} style={{ position:'absolute', top:14, right:22, zIndex:3, width:30, height:30, borderRadius:'50%', border:'0.5px solid rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.6)', fontSize:15, cursor:'pointer', opacity: focusShown?1:0, transition:'opacity 0.42s ease', pointerEvents:'auto' }}>×</div>

            {/* THE ORB — CENTRED, large, alive + XY-playable. x,y = CENTRE in px. */}
            <Orb id={focused} label={fo?.label || focused} colorKey={fo?.colorKey || 'mosaic'}
              x={focusShown ? dim.w*0.50 : centrePos.x}
              y={focusShown ? fh*0.42 : centrePos.y}
              size={focusShown ? 240 : centrePos.size}
              volume={0.7}
              selected={true} xy={xyMap[focused]} onSelect={()=>{}} onXY={handleXY} hideLabel />
            <div style={{ position:'absolute', left:0, right:0, top:fh*0.42 + 150, textAlign:'center', fontSize:14, letterSpacing:'0.16em', color:'#f4ecff', zIndex:3 }}>{(fo?.label || focused).toUpperCase()}</div>
            <div style={{ position:'absolute', left:0, right:0, top:fh*0.42 + 174, textAlign:'center', fontSize:8.5, letterSpacing:'0.12em', color:'rgba(255,255,255,0.4)', zIndex:3 }}>still live · drag to play XY</div>

            {/* LEFT COLUMN — level + voices (distributed) */}
            <div style={{ position:'absolute', left:'3%', top:64, bottom: dim.h*0.30 + 16, width:'26%', maxWidth:340, boxSizing:'border-box', overflow:'auto', zIndex:2, display:'flex', flexDirection:'column', justifyContent:'space-between', gap:18, opacity: focusShown?1:0, transform: focusShown?'translateX(0)':'translateX(-30px)', transition:'opacity 0.42s ease, transform 0.48s cubic-bezier(0.34,0.01,0.2,1)', pointerEvents:'auto' }}>

              {/* LEVEL */}
              <div>
                <div style={{ fontSize:8, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)', marginBottom:9 }}>LEVEL</div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
                  <span style={{ fontSize:10, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>VOLUME</span>
                  <span style={{ fontSize:10, color:'#d8a6ff' }}>{Math.round((volRef.current[focused] ?? 0.7)*100)}%</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <div onClick={()=>{ muteRef.current[focused]=!muteRef.current[focused]; reapplyLevels(); forceOrb(x=>x+1); }}
                    style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8,
                      background: muteRef.current[focused]?'rgba(255,120,90,0.3)':'transparent', border:`1px solid ${muteRef.current[focused]?'rgba(255,120,90,0.8)':'rgba(255,120,90,0.45)'}`, color: muteRef.current[focused]?'#ff8c6e':'rgba(255,140,110,0.85)' }}>M</div>
                  <div onClick={()=>{ soloSetRef.current[focused]=!soloSetRef.current[focused]; reapplyLevels(); forceOrb(x=>x+1); }}
                    style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8,
                      background: soloSetRef.current[focused]?'rgba(122,245,200,0.3)':'transparent', border:`1px solid ${soloSetRef.current[focused]?'rgba(122,245,200,0.8)':'rgba(122,245,200,0.45)'}`, color: soloSetRef.current[focused]?'#a6fff2':'rgba(122,245,200,0.85)' }}>S</div>
                  <input type="range" min={0} max={1} step={0.01} value={volRef.current[focused] ?? 0.7}
                    onChange={(e)=>{ const v=parseFloat(e.target.value); volRef.current[focused]=v; microcosmEngineLevel(focused, orbLevel(focused)); forceOrb(x=>x+1); }}
                    style={{ flex:1, accentColor:'#d8a6ff' }} />
                </div>
              </div>

              {/* VOICES — orbs + selected voice's sliders (UI ready; engine later) */}
              <div>
                <div style={{ fontSize:8, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)', marginBottom:11 }}>VOICES</div>
                <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:13, flexWrap:'wrap' }}>
                  {getVoices(focused).map(v => {
                    const sel = selVoice === v.id;
                    return (
                      <div key={v.id} onClick={()=>setSelVoice(sel?null:v.id)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', opacity: v.on?1:0.4 }}>
                        <div style={{ width:34, height:34, borderRadius:'50%',
                          background:`radial-gradient(circle, rgba(216,166,255,${v.on?0.9:0.4}), rgba(138,61,245,0.3) 55%, transparent 78%)`,
                          boxShadow: v.on?`0 0 ${sel?16:12}px ${sel?3:2}px rgba(216,166,255,${sel?0.7:0.5})`:'none',
                          border: sel?'2px solid #e0bfff':'2px solid transparent' }} />
                        <div style={{ fontSize:8, color: v.on?'#e0bfff':'rgba(255,255,255,0.5)' }}>{v.type}{sel?' ✦':''}</div>
                      </div>
                    );
                  })}
                  <div onClick={()=>{ const vs=getVoices(focused); vs.push({ id:'v_'+Date.now(), type:'Sine', on:true, oct:0, level:0.7, detune:0 }); forceOrb(x=>x+1); }}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer' }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', border:'1px dashed rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.55)', fontSize:13 }}>+</div>
                    <div style={{ fontSize:7, color:'rgba(255,255,255,0.4)' }}>add</div>
                  </div>
                </div>
                {(() => {
                  const v = getVoices(focused).find(x => x.id === selVoice);
                  if (!v) return <div style={{ fontSize:8, color:'rgba(255,255,255,0.3)' }}>tap a voice to edit</div>;
                  const setV = (k: 'oct'|'level'|'detune', val: number) => { (v as any)[k] = val; forceOrb(x=>x+1); };
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ fontSize:7.5, color:'#e0bfff', letterSpacing:'0.08em' }}>{v.type.toUpperCase()}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:7, color:'rgba(255,255,255,0.45)', width:42 }}>OCTAVE</span>
                        <input type="range" min={-2} max={2} step={1} value={v.oct} onChange={(e)=>setV('oct', parseInt(e.target.value))} style={{ flex:1, accentColor:'#d8a6ff' }} />
                        <span style={{ fontSize:7, color:'#cdb4ff', width:18 }}>{v.oct}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:7, color:'rgba(255,255,255,0.45)', width:42 }}>LEVEL</span>
                        <input type="range" min={0} max={1} step={0.01} value={v.level} onChange={(e)=>setV('level', parseFloat(e.target.value))} style={{ flex:1, accentColor:'#d8a6ff' }} />
                        <span style={{ fontSize:7, color:'#cdb4ff', width:18 }}>{Math.round(v.level*100)}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:7, color:'rgba(255,255,255,0.45)', width:42 }}>DETUNE</span>
                        <input type="range" min={-50} max={50} step={1} value={v.detune} onChange={(e)=>setV('detune', parseInt(e.target.value))} style={{ flex:1, accentColor:'#d8a6ff' }} />
                        <span style={{ fontSize:7, color:'#cdb4ff', width:18 }}>{v.detune}</span>
                      </div>
                      <div onClick={()=>{ v.on=!v.on; forceOrb(x=>x+1); }} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginTop:2 }}>
                        <div style={{ width:30, height:16, borderRadius:9, background: v.on?'rgba(122,245,200,0.25)':'rgba(255,255,255,0.1)', border:`1px solid ${v.on?'#7af5c8':'rgba(255,255,255,0.3)'}`, position:'relative' }}>
                          <div style={{ position:'absolute', top:1.5, left: v.on?14:2, width:11, height:11, borderRadius:'50%', background: v.on?'#a6fff2':'rgba(255,255,255,0.5)', transition:'left 0.15s' }} />
                        </div>
                        <span style={{ fontSize:7, color:'rgba(255,255,255,0.5)' }}>{v.on?'voice ON':'muted'}</span>
                      </div>
                      <div style={{ fontSize:7, color:'rgba(255,255,255,0.25)' }}>UI ready · not yet audible</div>
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* RIGHT COLUMN — signal path + flavour (distributed) */}
            <div style={{ position:'absolute', right:'3%', top:64, bottom: dim.h*0.30 + 16, width:'26%', maxWidth:340, boxSizing:'border-box', overflow:'auto', zIndex:2, display:'flex', flexDirection:'column', justifyContent:'space-between', gap:18, opacity: focusShown?1:0, transform: focusShown?'translateX(0)':'translateX(30px)', transition:'opacity 0.42s ease, transform 0.48s cubic-bezier(0.34,0.01,0.2,1)', pointerEvents:'auto' }}>

              {/* SIGNAL PATH (stub — wired later) */}
              <div>
                <div style={{ fontSize:8, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)', marginBottom:10 }}>SIGNAL PATH</div>
                <div style={{ fontSize:8, color:'rgba(255,255,255,0.3)' }}>signal path coming next</div>
              </div>

              {/* FLAVOUR — density + amount (real) */}
              <div>
                <div style={{ fontSize:8, letterSpacing:'0.2em', color:'rgba(255,255,255,0.4)', marginBottom:10 }}>FLAVOUR</div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:10, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>DENSITY</span>
                    <span style={{ fontSize:10, color:'#d8a6ff' }}>{Math.round((densRef.current[focused] ?? 0.5)*100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.01} value={densRef.current[focused] ?? 0.5}
                    onChange={(e)=>{ const d=parseFloat(e.target.value); densRef.current[focused]=d; microcosmGrainDensity(d); forceOrb(x=>x+1); }}
                    style={{ width:'100%', accentColor:'#d8a6ff' }} />
                </div>
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:10, letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)' }}>FLAVOUR AMOUNT</span>
                    <span style={{ fontSize:10, color:'#ffcf6b' }}>{Math.round((amountRef.current[focused] ?? 0)*100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.01} value={amountRef.current[focused] ?? 0}
                    onChange={(e)=>{ const a=parseFloat(e.target.value); amountRef.current[focused]=a; microcosmEngineAmount(focused, a); forceOrb(x=>x+1); }}
                    style={{ width:'100%', accentColor:'#ffcf6b' }} />
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      <div style={{ position:'absolute', top: fh - 12, left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'center', gap:8, opacity:0.4, cursor:'pointer' }}>
        <div style={{ width:24, height:24, borderRadius:'50%', border:'0.5px dashed rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:200 }}>+</div>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>add machine</span>
      </div>

      {/* MIX DESK — slides up over the lower portion; orbs stay faint above */}
      {mixOpen && (
        <div style={{ position:'absolute', inset:0, zIndex:170 }}>
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
            <div style={{ position:'absolute', top:20, left:26, fontSize:10, letterSpacing:'0.28em', color:'rgba(255,255,255,0.5)' }}>MIX DESK</div>
            <div onClick={closeMix} style={{ position:'absolute', top:14, right:22, width:28, height:28, borderRadius:'50%', border:'0.5px solid rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.6)', fontSize:14, cursor:'pointer' }}>⌄</div>
            <div style={{ position:'absolute', top:42, left:18, right:18, bottom:14, display:'flex', gap:11, justifyContent:'center' }}>
              {orbs.map(o => {
                const c = ORB_COLORS[(ALL_ORBS.find(a=>a.id===o.id)?.colorKey) || 'tunnel'];
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
                  <div onClick={toggleMute} style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8,
                    background: mut?'rgba(255,120,90,0.3)':'transparent', border:`1px solid ${mut?'rgba(255,120,90,0.7)':'rgba(255,120,90,0.4)'}`, color: mut?'#ff8c6e':'rgba(255,140,110,0.8)' }}>M</div>
                );
                const soloOn = !!soloSetRef.current[o.id];
                const soloBtn = (
                  <div onClick={()=>{ soloSetRef.current[o.id]=!soloSetRef.current[o.id]; reapplyLevels(); forceOrb(x=>x+1); }}
                    style={{ width:24, height:24, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8,
                      background: soloOn?'rgba(122,245,200,0.3)':'transparent', border:`1px solid ${soloOn?'rgba(122,245,200,0.8)':'rgba(122,245,200,0.4)'}`, color: soloOn?'#a6fff2':'rgba(122,245,200,0.8)' }}>S</div>
                );
                // glowing pan knob (used in expanded view)
                const panKnob = (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <input type="range" min={-1} max={1} step={0.02} value={pan}
                      onChange={(e)=>{ const np=parseFloat(e.target.value); panRef.current[o.id]=np; microcosmEnginePan(o.id,np); forceOrb(x=>x+1); }}
                      onDoubleClick={()=>{ panRef.current[o.id]=0; microcosmEnginePan(o.id,0); forceOrb(x=>x+1); }}
                      style={{ width:80, accentColor:c.mid, cursor:'pointer' }} />
                    <div style={{ fontSize:7, color: Math.abs(pan)>0.02?c.core:'rgba(255,255,255,0.5)', letterSpacing:'0.05em' }}>PAN {pan===0?'C':(pan<0?'L':'R')}</div>
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
                      <div style={{ fontSize:7, color: Math.abs(val)>0.1?c.core:'rgba(255,255,255,0.5)' }}>{label}</div>
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
                    style={{ padding:'5px 12px', borderRadius:12, border:'0.5px solid rgba(255,255,255,0.25)', fontSize:8, letterSpacing:'0.12em', color:'rgba(255,255,255,0.65)', cursor:'pointer', whiteSpace:'nowrap' }}>↺ RESET</div>
                );

                if (exp) {
                  return (
                    <div key={o.id} style={{ flex:1.8, maxWidth:240, minWidth:160, display:'flex', flexDirection:'column', alignItems:'center', borderRadius:13, background:`linear-gradient(180deg, ${c.glow}33, rgba(255,255,255,0.02))`, border:`0.5px solid ${c.mid}`, padding:'10px 0 9px', position:'relative', transition:'flex 0.3s ease', overflow:'hidden' }}>
                      <div onClick={()=>setExpandedChannel(null)} style={{ position:'absolute', top:7, right:9, fontSize:11, color:c.core, cursor:'pointer', zIndex:2 }}>⤡</div>
                      <div style={{ width:24, height:24, borderRadius:'50%', background:`radial-gradient(circle, ${c.core}, ${c.glow}44 55%, transparent 78%)`, boxShadow:`0 0 12px 2px ${c.glow}66` }} />
                      <div style={{ fontSize:9.5, color:c.core, marginTop:4, letterSpacing:'0.06em' }}>{ALL_ORBS.find(a=>a.id===o.id)?.label || o.id}</div>
                      <div style={{ flex:1, display:'flex', alignItems:'stretch', gap:14, marginTop:8, width:'100%', justifyContent:'center', minHeight:0 }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>{eqDials}</div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>{panKnob}</div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end' }}>
                          {fader}
                          <div style={{ fontSize:9, color:c.core, marginTop:4 }}>{db} dB</div>
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
                    <div onClick={()=>setExpandedChannel(o.id)} style={{ position:'absolute', top:7, right:8, fontSize:10, color:'rgba(255,255,255,0.35)', cursor:'pointer' }}>⤢</div>
                    <div style={{ width:26, height:26, borderRadius:'50%', background:`radial-gradient(circle, ${c.core}, ${c.glow}44 60%, transparent 78%)` }} />
                    <div style={{ fontSize:9.5, color:c.core, marginTop:5, letterSpacing:'0.06em' }}>{ALL_ORBS.find(a=>a.id===o.id)?.label || o.id}</div>
                    {fader}
                    <div style={{ fontSize:9, color:c.core, marginTop:6 }}>{db} dB</div>
                    <div style={{ display:'flex', gap:7, marginTop:7 }}>{muteBtn}{soloBtn}</div>
                  </div>
                );
              })}
              <div style={{ width:1, background:'linear-gradient(180deg,transparent,rgba(255,255,255,0.15),transparent)', margin:'0 2px' }} />
              {/* MASTER */}
              <div style={{ flex:1, maxWidth:140, minWidth:72, display:'flex', flexDirection:'column', alignItems:'center', borderRadius:13, background:'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02))', border:'0.5px solid rgba(255,255,255,0.3)', padding:'10px 0 9px' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:'radial-gradient(circle,#fff,rgba(255,255,255,0.3) 55%,transparent 78%)' }} />
                <div style={{ fontSize:9.5, color:'#fff', marginTop:5, letterSpacing:'0.12em' }}>MASTER</div>
                <div style={{ flex:1, display:'flex', alignItems:'center', marginTop:10, minHeight:90 }}>
                  <input type="range" min={0} max={1} step={0.01} value={masterVol}
                    onChange={(e)=>{ const nv=parseFloat(e.target.value); setMasterVol(nv); microcosmMasterLevel(nv); }}
                    style={{ writingMode:'vertical-lr' as any, direction:'rtl', width:10, height:'100%', accentColor:'#ffffff', cursor:'pointer' }} />
                </div>
                <div style={{ fontSize:9, color:'#fff', marginTop:6 }}>{masterVol<=0?'-∞':(20*Math.log10(masterVol)).toFixed(0)} dB</div>
                <div style={{ fontSize:6.5, color:'rgba(255,255,255,0.4)', marginTop:9, letterSpacing:'0.1em' }}>MAIN OUT</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM CONTROLS — two tiers: keyboard on top, FIELD/Flavour/SYSTEM beneath */}
      <div style={{ position:'absolute', left:0, right:0, bottom: mixOpen ? mixerH : 0, height: dim.h*0.30, display:'flex', flexDirection:'column', justifyContent:'center', gap:18, padding:'0 40px', boxSizing:'border-box', transition:'bottom 0.4s cubic-bezier(0.34,0.01,0.2,1)', zIndex: mixOpen ? 180 : 'auto' }}>

        {/* TIER 1 — full-width keyboard */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ ...zlabel, marginBottom:10 }}>KEY · double-tap to lock root · tap to play</div>
          <div style={{ display:'flex', alignItems:'center', gap:4, maxWidth:'100%' }}>
            <div onClick={()=>{ const o=Math.max(-3,octave-1); setOctave(o); playAt(playNote, playSemi); }}
              style={{ fontSize:15, color:'rgba(255,255,255,0.4)', cursor:'pointer', userSelect:'none', padding:'0 6px' }}>◂</div>
            {(() => {
              const li = NOTES.indexOf(lockKey);
              const cells = [];
              for (let off = -12; off <= 12; off++) {
                let idx = li + off;
                idx = ((idx % 12) + 12) % 12;
                const n = NOTES[idx];
                const sharp = n.includes('#');
                const isLock = off === 0;
                const isPlay = (off === playSemi);   // off IS the semitone distance from root
                const sz = isLock ? 34 : sharp ? 17 : 26;
                cells.push(
                  <div key={off} onClick={()=>tapNote(n, off)} title={n}
                    style={{ width:sz, height:sz, borderRadius:'50%', cursor:'pointer', flexShrink:0,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize: isLock?12:sharp?8:10, fontWeight: (isLock||isPlay)?700:500,
                      boxShadow: isLock ? '0 0 12px 1px rgba(255,210,80,0.45)' : 'none',
                      background: isLock
                        ? 'radial-gradient(circle, #ffe066 0%, rgba(224,170,40,0.6) 52%, transparent 78%)'
                        : isPlay
                          ? 'radial-gradient(circle, #fff 0%, rgba(170,196,255,0.7) 48%, transparent 76%)'
                          : sharp
                            ? 'radial-gradient(circle, rgba(120,130,160,0.5) 0%, rgba(60,68,92,0.22) 55%, transparent 80%)'
                            : 'radial-gradient(circle, rgba(234,240,255,0.42) 0%, rgba(170,192,232,0.14) 55%, transparent 80%)',
                      color: isLock?'#2a2008':isPlay?'#1a2030':sharp?'rgba(215,222,238,0.6)':'#e8eeff' }}>
                    {(isLock||isPlay||!sharp) ? n : ''}
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
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
            <div style={zlabel}>FIELD</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:30 }}>
              <div style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ width:52, height:52, borderRadius:'50%', border:'1px solid rgba(174,240,255,0.5)', background:'rgba(174,240,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="24" height="24" viewBox="0 0 20 20"><g stroke="#cdf5ff" strokeWidth="1.3" opacity="0.85"><line x1="10" y1="2" x2="10" y2="18"/><line x1="3" y1="6" x2="17" y2="14"/><line x1="3" y1="14" x2="17" y2="6"/></g></svg>
                </div>
                <div style={{ fontSize:10, color:'#bfe8f5', marginTop:8, opacity:0.85 }}>Freeze</div>
              </div>
              <div style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ width:52, height:52, borderRadius:'50%', border:'1px solid rgba(255,214,166,0.5)', background:'rgba(255,214,166,0.06)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="24" height="24" viewBox="0 0 20 20"><g fill="#ffe6c4"><circle cx="7" cy="6" r="1.7"/><circle cx="13" cy="7" r="1.7"/><circle cx="8" cy="13" r="1.7"/><circle cx="13" cy="13" r="1.7"/><circle cx="10" cy="10" r="1.7"/></g></svg>
                </div>
                <div style={{ fontSize:10, color:'#ffdcb0', marginTop:8, opacity:0.85 }}>Perturb</div>
              </div>
              <div style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ position:'relative', width:62, height:62 }}>
                  <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:`radial-gradient(circle, rgba(216,166,255,${0.4+life*0.5}) 0%, rgba(138,61,245,${0.15+life*0.3}) 50%, transparent 72%)`, filter:'blur(2px)' }} />
                  <div style={{ position:'absolute', inset:16, borderRadius:'50%', background:'#fff', opacity:0.9, filter:'blur(1px)' }} />
                </div>
                <div style={{ fontSize:10, color:'#e0c4ff', marginTop:4 }}>Life · {Math.round(life*100)}%</div>
              </div>
            </div>
          </div>

          {/* FLAVOUR chip (centre) */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingBottom:6 }}>
            <div onClick={()=>setPickerOpen(true)}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 18px', cursor:'pointer',
                border:`0.5px solid ${palette==='open'?'rgba(255,255,255,0.22)':flavourOf(palette).col+'77'}`,
                borderRadius:20, background: palette==='open'?'rgba(255,255,255,0.04)':flavourOf(palette).col+'12' }}>
              {palette!=='open' && <div style={{ width:7, height:7, borderRadius:'50%', background:flavourOf(palette).col }} />}
              <span style={{ fontSize:11, letterSpacing:'0.04em', color: palette==='open'?'rgba(255,255,255,0.7)':flavourOf(palette).col }}>
                {palette==='open' ? 'Flavour' : `Flavour · ${flavourOf(palette).name}`}
              </span>
              <span style={{ fontSize:9, color:'rgba(255,255,255,0.35)' }}>▾</span>
            </div>
          </div>

          {/* SYSTEM */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
            <div style={{ ...zlabel, alignSelf:'flex-end' }}>SYSTEM</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:26 }}>
              {[
                { k:'Source', col:'rgba(255,216,107,0.5)', bg:'rgba(255,216,107,0.06)', dot:'#ffd86b' },
                { k:'Scenes', col:'rgba(180,200,230,0.5)', bg:'rgba(180,200,230,0.05)', dot:'#8aa0d0' },
                { k:'Rec',    col:'rgba(224,80,58,0.5)',   bg:'rgba(224,80,58,0.06)',   dot:'#ff7a5a' },
                { k:'Mix',    col:'rgba(170,196,255,0.5)', bg:'rgba(170,196,255,0.06)', dot:'#aac4ff' },
              ].map(u => (
                <div key={u.k} onClick={()=>{ if(u.k==='Mix') openMix(); }} style={{ textAlign:'center', cursor:'pointer' }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', border:`1px solid ${u.col}`, background:u.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background:u.dot }} />
                  </div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.6)', marginTop:8 }}>{u.k}</div>
                </div>
              ))}
              <div style={{ width:1, height:44, background:'rgba(255,255,255,0.1)' }} />
              <div style={{ textAlign:'center' }}>
                <div style={{ width:52, height:52, borderRadius:'50%', border:'2px solid rgba(122,245,200,0.4)', background:'radial-gradient(circle, rgba(122,245,200,0.45) 0%, transparent 70%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>92</div>
                  <div style={{ fontSize:7, color:'#9affc8' }}>BPM</div>
                </div>
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', marginTop:8 }}>Tempo</div>
              </div>
              <div style={{ textAlign:'center' }}>
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
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', marginTop:8, letterSpacing:'0.05em' }}>{state==='playing' ? 'Stop' : 'Start'}</div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      {/* FLAVOUR PICKER — blooms up from the chip */}
      {pickerOpen && (
        <div onClick={()=>setPickerOpen(false)}
          style={{ position:'absolute', inset:0, zIndex:200, background:'rgba(2,3,8,0.55)', backdropFilter:'blur(4px)',
            display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:'32vh' }}>
          <div onClick={(e)=>e.stopPropagation()}
            style={{ background:'rgba(14,16,26,0.94)', border:'0.5px solid rgba(255,255,255,0.16)', borderRadius:22,
              padding:'24px 30px', backdropFilter:'blur(10px)' }}>
            <div style={{ fontSize:10, letterSpacing:'0.26em', color:'rgba(255,255,255,0.35)', marginBottom:22, textAlign:'center' }}>FLAVOUR — THE FIELD'S TONAL WORLD</div>
            <div style={{ display:'flex', gap:26 }}>
              {FLAVOURS.map(f => {
                const sel = f.id===palette;
                return (
                  <div key={f.id} onClick={()=>{ setPalette(f.id); microcosmArmedPalette(f.id); setTimeout(()=>setPickerOpen(false),200); }}
                    style={{ width:100, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:10, textAlign:'center' }}>
                    <div style={{ width:60, height:60, borderRadius:'50%',
                      background:`radial-gradient(circle, ${f.col} 0%, ${f.col}66 50%, transparent 74%)`,
                      boxShadow: sel ? `0 0 0 2px rgba(255,255,255,0.45)` : 'none', transition:'transform 0.18s' }} />
                    <div style={{ fontSize:12, color: sel?'#fff':'rgba(255,255,255,0.8)' }}>{f.name}</div>
                    <div style={{ fontSize:8.5, color:'rgba(255,255,255,0.4)', lineHeight:1.3 }}>{f.desc}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginTop:20, textAlign:'center' }}>arms the palette · turn an orb's amount up to hear it</div>
          </div>
        </div>
      )}
    </main>
  );
}
