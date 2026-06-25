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
const CENTRE = { fx: 0.50, fy: 0.44, size: 210 };
const SATELLITES = [
  { fx: 0.20, fy: 0.30, size: 118 },
  { fx: 0.80, fy: 0.26, size: 118 },
  { fx: 0.74, fy: 0.66, size: 118 },
];
const FIELD_H = 0.70;
const NOTES = ['G','A','B','C','D','E','F'];

type XY = { x: number; y: number };
const defaultXY = (): Record<string, XY> =>
  Object.fromEntries(ORBS.map(o => [o.id, { x: 0.5, y: 0.5 }]));

export default function FieldPage() {
  const [selected, setSelected] = useState<string>('bubbles');
  const [dim, setDim] = useState({ w: 1440, h: 900 });
  const [state, setState] = useState<'idle'|'playing'|'stopped'>('idle');
  const [muted, setMuted] = useState(false);
  const [xyMap, setXyMap] = useState<Record<string, XY>>(defaultXY);
  const [key, setKey] = useState('C');
  const [life, setLife] = useState(0.32);
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

  async function ensureStarted() {
    if (started.current) return;
    started.current = true;
    await startAudio(); await microcosmStart();
    setState('playing'); switchEngine(selected);
  }
  function switchEngine(id: string) {
    if (!started.current) return;
    if (activeEngine.current && activeEngine.current !== id) microcosmEngineActive(activeEngine.current, false);
    microcosmEngineActive(id, true);
    microcosmEngineLevel(id, mutedRef.current ? 0 : 1);
    activeEngine.current = id;
    const v = xyRef.current[id] ?? { x:0.5, y:0.5 };
    microcosmGrainSpread(v.x); microcosmPitchSpread(v.y);
  }
  async function handleSelect(id: string) {
    setSelected(id); await ensureStarted();
    if (state === 'stopped') return; switchEngine(id);
  }
  function handleXY(nx: number, ny: number) {
    const id = selected;
    const next = { ...xyRef.current, [id]: { x:nx, y:ny } };
    xyRef.current = next; setXyMap(next);
    if (activeEngine.current === id) { microcosmGrainSpread(nx); microcosmPitchSpread(ny); }
  }
  async function doStart() {
    if (!started.current) { await ensureStarted(); return; }
    await microcosmStart(); activeEngine.current=''; switchEngine(selected); setState('playing');
  }
  function doStop() { microcosmStopEngine(); activeEngine.current=''; setState('stopped'); }
  function toggleMute() {
    const m = !mutedRef.current; mutedRef.current=m; setMuted(m);
    if (activeEngine.current) microcosmEngineLevel(activeEngine.current, m?0:1);
  }

  const others = ORBS.filter(o => o.id !== selected);
  const slotFor = (id: string) => id === selected ? CENTRE
    : (SATELLITES[others.findIndex(o => o.id === id)] ?? SATELLITES[SATELLITES.length-1]);
  const fh = dim.h * FIELD_H;
  const zlabel: React.CSSProperties = { fontSize:9, fontWeight:500, letterSpacing:'0.25em', color:'rgba(255,255,255,0.3)', marginBottom:14 };

  return (
    <main style={{ position:'fixed', inset:0, overflow:'hidden', touchAction:'none', background:'radial-gradient(ellipse at 50% 28%, #10131f 0%, #070810 66%, #04050a 100%)', fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', color:'#fff' }}>
      <div style={{ position:'absolute', inset:0, opacity:0.6, pointerEvents:'none', backgroundImage:'radial-gradient(1px 1px at 20% 14%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 88% 9%, rgba(255,255,255,0.45), transparent), radial-gradient(1px 1px at 94% 42%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 8% 46%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 50% 8%, rgba(255,255,255,0.3), transparent)' }} />
      <div style={{ position:'absolute', top:24, left:32, fontSize:21, letterSpacing:'0.6em', fontWeight:500 }}>H A A R</div>
      <div style={{ position:'absolute', top:28, right:32, fontSize:11, fontWeight:500, color:'rgba(255,255,255,0.55)' }}>
        {state==='playing' ? `${muted?'muted':'playing'} · ${selected}` : state==='stopped' ? 'stopped' : `field · ${ORBS.length} active`}
      </div>

      {ORBS.map((o) => {
        const slot = slotFor(o.id);
        return (
          <Orb key={o.id} id={o.id} label={o.label} colorKey={o.colorKey}
            x={slot.fx * dim.w} y={slot.fy * fh} size={slot.size} volume={0.7}
            selected={selected===o.id} xy={xyMap[o.id]} onSelect={handleSelect} onXY={handleXY} />
        );
      })}

      <div style={{ position:'absolute', top: fh - 12, left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'center', gap:8, opacity:0.4, cursor:'pointer' }}>
        <div style={{ width:24, height:24, borderRadius:'50%', border:'0.5px dashed rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:200 }}>+</div>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>add machine</span>
      </div>

      {/* CONTROLS — bottom 30%, full width, three zones */}
      <div style={{ position:'absolute', left:0, right:0, bottom:0, height: dim.h*0.30,
        display:'grid', gridTemplateColumns:'1fr 1.1fr 1fr', alignItems:'center', padding:'0 70px', boxSizing:'border-box' }}>

        {/* LEFT ZONE — gestures */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
          <div style={zlabel}>FIELD</div>
          <div style={{ display:'flex', alignItems:'center', gap:42 }}>
            <div style={{ textAlign:'center', cursor:'pointer' }}>
              <div style={{ width:58, height:58, borderRadius:'50%', border:'1px solid rgba(174,240,255,0.5)', background:'rgba(174,240,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="26" height="26" viewBox="0 0 20 20"><g stroke="#cdf5ff" strokeWidth="1.3" opacity="0.85"><line x1="10" y1="2" x2="10" y2="18"/><line x1="3" y1="6" x2="17" y2="14"/><line x1="3" y1="14" x2="17" y2="6"/></g></svg>
              </div>
              <div style={{ fontSize:11, color:'#bfe8f5', marginTop:9, opacity:0.85 }}>Freeze</div>
            </div>
            <div style={{ textAlign:'center', cursor:'pointer' }}>
              <div style={{ width:58, height:58, borderRadius:'50%', border:'1px solid rgba(255,214,166,0.5)', background:'rgba(255,214,166,0.06)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="26" height="26" viewBox="0 0 20 20"><g fill="#ffe6c4"><circle cx="7" cy="6" r="1.7"/><circle cx="13" cy="7" r="1.7"/><circle cx="8" cy="13" r="1.7"/><circle cx="13" cy="13" r="1.7"/><circle cx="10" cy="10" r="1.7"/></g></svg>
              </div>
              <div style={{ fontSize:11, color:'#ffdcb0', marginTop:9, opacity:0.85 }}>Perturb</div>
            </div>
            <div style={{ textAlign:'center', cursor:'pointer' }}>
              <div style={{ position:'relative', width:70, height:70 }}>
                <div style={{ position:'absolute', inset:0, borderRadius:'50%', background:`radial-gradient(circle, rgba(216,166,255,${0.4+life*0.5}) 0%, rgba(138,61,245,${0.15+life*0.3}) 50%, transparent 72%)`, filter:'blur(2px)' }} />
                <div style={{ position:'absolute', inset:18, borderRadius:'50%', background:'#fff', opacity:0.9, filter:'blur(1px)' }} />
              </div>
              <div style={{ fontSize:11, color:'#e0c4ff', marginTop:5 }}>Life · {Math.round(life*100)}%</div>
            </div>
          </div>
        </div>

        {/* CENTRE ZONE — KEY */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={zlabel}>KEY</div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)', cursor:'pointer' }}>◂</div>
            {NOTES.map(n => {
              const on = n===key;
              return (
                <div key={n} onClick={()=>setKey(n)} style={{ width:on?44:38, height:on?44:38, borderRadius:'50%', cursor:'pointer',
                  background: on ? 'radial-gradient(circle, #fff 0%, rgba(170,196,255,0.7) 48%, transparent 75%)' : 'radial-gradient(circle, rgba(234,240,255,0.5) 0%, rgba(170,192,232,0.18) 55%, transparent 78%)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:14, fontWeight: on?700:500, color: on?'#1a2030':'#e8eeff' }}>{n}</div>
              );
            })}
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)', cursor:'pointer' }}>▸</div>
          </div>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginTop:10 }}>whole-machine key · tap a note</div>
        </div>

        {/* RIGHT ZONE — utilities + tempo + master */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
          <div style={{ ...zlabel, alignSelf:'flex-end' }}>SYSTEM</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:34 }}>
            {[
              { k:'Source', col:'rgba(255,216,107,0.5)', bg:'rgba(255,216,107,0.06)', dot:'#ffd86b' },
              { k:'Scenes', col:'rgba(180,200,230,0.5)', bg:'rgba(180,200,230,0.05)', dot:'#8aa0d0' },
              { k:'Rec',    col:'rgba(224,80,58,0.5)',   bg:'rgba(224,80,58,0.06)',   dot:'#ff7a5a' },
            ].map(u => (
              <div key={u.k} style={{ textAlign:'center', cursor:'pointer' }}>
                <div style={{ width:48, height:48, borderRadius:'50%', border:`1px solid ${u.col}`, background:u.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:u.dot }} />
                </div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:9 }}>{u.k}</div>
              </div>
            ))}
            <div style={{ width:1, height:48, background:'rgba(255,255,255,0.1)' }} />
            <div style={{ textAlign:'center' }}>
              <div style={{ width:58, height:58, borderRadius:'50%', border:'2px solid rgba(122,245,200,0.4)', background:'radial-gradient(circle, rgba(122,245,200,0.45) 0%, transparent 70%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <div style={{ fontSize:15, fontWeight:700 }}>92</div>
                <div style={{ fontSize:7, color:'#9affc8' }}>BPM</div>
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:9 }}>Tempo</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div onClick={()=>{ if(state==='stopped') doStart(); else toggleMute(); }}
                style={{ width:62, height:62, borderRadius:'50%', cursor:'pointer',
                  border:`3px solid ${muted?'rgba(224,80,58,0.6)':'rgba(255,255,255,0.32)'}`,
                  background:'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 70%)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ width:16, height:16, borderRadius:'50%', background: muted?'#e0503a':'#fff' }} />
              </div>
              <div style={{ display:'flex', gap:9, justifyContent:'center', marginTop:9 }}>
                <span onClick={doStart} style={{ fontSize:9, color:'rgba(255,255,255,0.55)', cursor:'pointer' }}>start</span>
                <span onClick={doStop} style={{ fontSize:9, color:'rgba(255,255,255,0.55)', cursor:'pointer' }}>stop</span>
                <span onClick={toggleMute} style={{ fontSize:9, color: muted?'#ff7a5a':'rgba(255,255,255,0.55)', cursor:'pointer' }}>{muted?'unmute':'mute'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
