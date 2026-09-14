'use client';
// THE TRANSPORT - Haar's floating panel (Cubase's F2, done right: one row or two, docks, follows you).
// Layout only. Everything it shows comes in as props; everything it does goes out as callbacks.
// It floats over CREATE, ARRANGE and the sampler alike - one transport, one clock, one record head.
import React, { useEffect, useRef, useState } from 'react';

export type TransportProps = {
  songName: string;
  posBar: number;                  // fractional bar, 0-based
  bpm: number;
  playing: boolean;
  rec: 'idle' | 'armed' | 'rolling';
  recBar: number;
  target: string;                  // record-target track label, e.g. "2 bass"
  status: string;
  click?: boolean; loop?: boolean; loopBars?: number;
  onToStart: () => void; onStop: () => void; onPlay: () => void; onRec: () => void;
  onCycleTarget: () => void;
  onToggleClick?: () => void; onToggleLoop?: () => void; onCycleLoopBars?: () => void;
  onRename?: (name: string) => void;
};

const FOG = '#9fb4c8', GREEN = '#7af5c8', RED = '#ff5a5a';
const cell: React.CSSProperties = { padding: '7px 12px', borderRight: '0.5px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' };
const pill = (on: boolean, dim = false): React.CSSProperties => ({ border: `0.5px solid ${on ? GREEN : 'rgba(255,255,255,0.3)'}`, color: on ? GREEN : (dim ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)'), borderRadius: 6, padding: '2px 8px', fontSize: 11, letterSpacing: '0.08em', cursor: dim ? 'default' : 'pointer' });
const btn: React.CSSProperties = { width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.8)', userSelect: 'none' };

export default function Transport(p: TransportProps) {
  const [pos, setPos] = useState<{ x: number; y: number; docked: boolean }>(() => {
    try { const j = localStorage.getItem('haar_transport_pos'); if (j) return JSON.parse(j); } catch {}
    return { x: 24, y: 24, docked: false };
  });
  const [hidden, setHidden] = useState(false);
  const [folded, setFolded] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(p.songName);

  useEffect(() => { try { localStorage.setItem('haar_transport_pos', JSON.stringify(pos)); } catch {} }, [pos]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); setHidden(h => !h); } };
    const onResize = () => setFolded(window.innerWidth < 1180);
    window.addEventListener('keydown', onKey); window.addEventListener('resize', onResize); onResize();
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, []);

  const onGripDown = (e: React.PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: Math.max(0, e.clientX - drag.current.dx), y: Math.max(0, e.clientY - drag.current.dy), docked: false });
  };
  const onGripUp = (e: React.PointerEvent) => {
    if (!drag.current) return; drag.current = null;
    if (e.clientY > window.innerHeight - 70) setPos(q => ({ ...q, docked: true }));     // dropped at the bottom edge: dock
  };

  if (hidden) return null;
  const bar = Math.floor(p.posBar) + 1, beat = Math.floor((p.posBar - Math.floor(p.posBar)) * 4) + 1;
  const posText = String(bar).padStart(3, '0') + '.' + beat;
  const recBg = p.rec === 'rolling' ? 'rgba(255,90,90,0.6)' : p.rec === 'armed' ? 'rgba(255,90,90,0.18)' : 'transparent';

  const grip = <div onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} title="drag - drop at the bottom edge to dock" style={{ ...cell, padding: '7px 8px', cursor: 'grab', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>⋮⋮</div>;
  const song = <div style={cell} onDoubleClick={() => { setNameDraft(p.songName); setEditing(true); }} title="double-click to rename">
    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.2em' }}>SONG</span>
    {editing ? <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={() => { setEditing(false); if (nameDraft.trim() && p.onRename) p.onRename(nameDraft.trim()); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }} style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${FOG}`, color: '#fff', fontFamily: 'inherit', fontSize: 12, width: 110, outline: 'none' }} />
      : <span style={{ color: '#fff' }}>{p.songName}</span>}
  </div>;
  const position = <div style={{ ...cell, fontSize: 19, color: p.rec === 'rolling' ? RED : '#fff', minWidth: 74, justifyContent: 'center' }}>{posText}</div>;
  const tempo = <div style={cell}><span style={{ color: GREEN }}>{p.bpm}</span><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.2em' }}>BPM</span></div>;
  const toggles = <div style={cell}>
    <span onClick={p.onToggleClick} style={pill(!!p.click, !p.onToggleClick)}>CLICK</span>
    <span onClick={p.onToggleLoop} style={pill(!!p.loop, !p.onToggleLoop)}>LOOP</span>
    <span onClick={p.onCycleLoopBars} title="loop length in bars - tap to cycle" style={{ ...pill(!!p.loop, !p.onCycleLoopBars), minWidth: 18, textAlign: 'center' }}>{p.loopBars ?? 4}</span>
  </div>;
  const buttons = <div style={{ ...cell, gap: 10 }}>
    <div onClick={p.onToStart} title="to start" style={btn}>⏮</div>
    <div onClick={p.onStop} title="stop" style={btn}>■</div>
    <div onClick={p.onPlay} title="play" style={{ ...btn, borderColor: p.playing ? GREEN : 'rgba(122,245,200,0.6)', color: GREEN, background: p.playing ? 'rgba(122,245,200,0.18)' : 'transparent' }}>▶</div>
    <div onClick={p.onRec} title="REC: arms on the next bar. REC again: stops on the next bar." style={{ ...btn, border: `2px solid ${p.rec === 'idle' ? 'rgba(255,90,90,0.7)' : RED}`, background: recBg, color: RED, animation: p.rec === 'armed' ? 'haarPulse 0.7s ease-in-out infinite' : 'none', fontSize: 11, fontWeight: 700 }}>{p.rec === 'rolling' ? p.recBar : '●'}</div>
  </div>;
  const target = <div onClick={p.onCycleTarget} title="record target - click to cycle tracks" style={{ ...cell, cursor: 'pointer' }}><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.2em' }}>TO</span><span style={{ color: p.rec === 'idle' ? '#fff' : RED }}>{p.target}</span></div>;
  const status = <div style={{ ...cell, borderRight: 'none', color: p.rec === 'idle' ? 'rgba(255,255,255,0.45)' : RED, fontSize: 11, minWidth: 150 }}>{p.status}</div>;

  const frame: React.CSSProperties = pos.docked
    ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1000, justifyContent: 'center', borderRadius: 0, borderTop: '0.5px solid rgba(159,180,200,0.35)' }
    : { position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000, borderRadius: 10, border: '0.5px solid rgba(159,180,200,0.35)' };

  return (
    <div style={{ ...frame, display: 'flex', flexDirection: 'column', background: 'rgba(7,8,12,0.94)', backdropFilter: 'blur(10px)', fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#fff', boxShadow: '0 8px 28px rgba(0,0,0,0.5)' }}>
      {folded ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>{grip}{position}{buttons}{target}</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>{song}{tempo}{toggles}{status}</div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center' }}>{grip}{song}{position}{tempo}{toggles}{buttons}{target}{status}</div>
      )}
    </div>
  );
}
