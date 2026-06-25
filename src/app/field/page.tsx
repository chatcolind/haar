'use client';

import { useState, useEffect, useRef } from 'react';
import Orb from '../../components/field/Orb';
import {
  startAudio, microcosmStart, microcosmStopEngine,
  microcosmEngineActive, microcosmEngineLevel,
  microcosmGrainSpread, microcosmPitchSpread,
} from '../../audio/engine';

type OrbDef = { id: string; label: string; colorKey: any };
const ORBS: OrbDef[] = [
  { id: 'bubbles', label: 'Bubbles', colorKey: 'bubbles' },
  { id: 'tunnel',  label: 'Tunnel',  colorKey: 'tunnel'  },
  { id: 'shimmer', label: 'Shimmer', colorKey: 'shimmer' },
  { id: 'strum',   label: 'Strum',   colorKey: 'strum'   },
];
const CENTRE = { fx: 0.50, fy: 0.46, size: 250 };
const SATELLITES = [
  { fx: 0.20, fy: 0.30, size: 132 },
  { fx: 0.80, fy: 0.28, size: 132 },
  { fx: 0.76, fy: 0.70, size: 132 },
];

type XY = { x: number; y: number };
const defaultXY = (): Record<string, XY> =>
  Object.fromEntries(ORBS.map(o => [o.id, { x: 0.5, y: 0.5 }]));

export default function FieldPage() {
  const [selected, setSelected] = useState<string>('bubbles');
  const [dim, setDim] = useState({ w: 1440, h: 900 });
  const [state, setState] = useState<'idle'|'playing'|'stopped'>('idle');
  const [muted, setMuted] = useState(false);
  const [xyMap, setXyMap] = useState<Record<string, XY>>(defaultXY);
  const started = useRef(false);
  const activeEngine = useRef<string>('');
  const mutedRef = useRef(false);
  const xyRef = useRef<Record<string, XY>>(defaultXY());

  useEffect(() => {
    const update = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  function applyXY(id: string) {
    const v = xyRef.current[id] ?? { x: 0.5, y: 0.5 };
    microcosmGrainSpread(v.x);
    microcosmPitchSpread(v.y);
  }

  async function ensureStarted() {
    if (started.current) return;
    started.current = true;
    await startAudio();
    await microcosmStart();
    setState('playing');
    switchEngine(selected);
  }
  function switchEngine(id: string) {
    if (!started.current) return;
    if (activeEngine.current && activeEngine.current !== id) microcosmEngineActive(activeEngine.current, false);
    microcosmEngineActive(id, true);
    microcosmEngineLevel(id, mutedRef.current ? 0 : 1);
    activeEngine.current = id;
    applyXY(id); // recall THIS orb's own XY
  }
  async function handleSelect(id: string) {
    setSelected(id);
    await ensureStarted();
    if (state === 'stopped') return;
    switchEngine(id);
  }
  function handleXY(nx: number, ny: number) {
    const id = selected;
    const next = { ...xyRef.current, [id]: { x: nx, y: ny } };
    xyRef.current = next;
    setXyMap(next);
    if (activeEngine.current === id) {
      microcosmGrainSpread(nx);
      microcosmPitchSpread(ny);
    }
  }
  async function doStart() {
    if (!started.current) { await ensureStarted(); return; }
    await microcosmStart();
    activeEngine.current = '';
    switchEngine(selected);
    setState('playing');
  }
  function doStop() {
    microcosmStopEngine();
    activeEngine.current = '';
    setState('stopped');
  }
  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (activeEngine.current) microcosmEngineLevel(activeEngine.current, m ? 0 : 1);
  }

  const others = ORBS.filter(o => o.id !== selected);
  const slotFor = (id: string) => id === selected ? CENTRE
    : (SATELLITES[others.findIndex(o => o.id === id)] ?? SATELLITES[SATELLITES.length-1]);

  const btn: React.CSSProperties = { background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.2)', color:'#fff', borderRadius:20, padding:'8px 18px', fontSize:12, fontWeight:500, cursor:'pointer', letterSpacing:'0.05em' };

  return (
    <main style={{ position:'fixed', inset:0, overflow:'hidden', touchAction:'none', background:'radial-gradient(ellipse at 50% 32%, #10131f 0%, #070810 66%, #04050a 100%)', fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', color:'#fff' }}>
      <div style={{ position:'absolute', inset:0, opacity:0.6, pointerEvents:'none', backgroundImage:'radial-gradient(1px 1px at 20% 14%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 88% 9%, rgba(255,255,255,0.45), transparent), radial-gradient(1px 1px at 94% 42%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 8% 46%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 50% 8%, rgba(255,255,255,0.3), transparent)' }} />
      <div style={{ position:'absolute', top:26, left:34, fontSize:22, letterSpacing:'0.6em', fontWeight:500 }}>H A A R</div>
      <div style={{ position:'absolute', top:30, right:34, fontSize:11, fontWeight:500, color:'rgba(255,255,255,0.55)' }}>
        {state==='playing' ? `${muted?'muted':'playing'} · ${selected}` : state==='stopped' ? 'stopped' : 'field · click an orb'}
      </div>

      {ORBS.map((o) => {
        const slot = slotFor(o.id);
        return (
          <Orb key={o.id} id={o.id} label={o.label} colorKey={o.colorKey}
            x={slot.fx * dim.w} y={slot.fy * dim.h} size={slot.size} volume={0.7}
            selected={selected===o.id} xy={xyMap[o.id]} onSelect={handleSelect} onXY={handleXY} />
        );
      })}

      <div style={{ position:'absolute', bottom:34, left:'50%', transform:'translateX(-50%)', display:'flex', gap:12 }}>
        <button style={btn} onClick={(e)=>{e.stopPropagation(); doStart();}}>▶ Start</button>
        <button style={btn} onClick={(e)=>{e.stopPropagation(); doStop();}}>■ Stop</button>
        <button style={{...btn, opacity: muted?1:0.7, background: muted?'rgba(224,80,58,0.25)':btn.background}} onClick={toggleMute}>{muted?'Unmute':'Mute'}</button>
      </div>
    </main>
  );
}
