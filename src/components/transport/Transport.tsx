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
  sky?: string; onCycleSky?: () => void;
  compact?: boolean;                                  // in Build: a capsule - position, play, REC, target - opens on hover               // Build's weather - tap to change it, however inspired you are
  onToStart: () => void; onStop: () => void; onPlay: () => void; onRec: () => void;
  onCycleTarget: () => void;
  onToggleClick?: () => void; onToggleLoop?: () => void; onCycleLoopBars?: () => void;
  onRename?: (name: string) => void;
};

const FOG = '#9fb4c8', GREEN = '#7af5c8', RED = '#ff5a5a';
const cell: React.CSSProperties = { padding: '8px 14px', borderRight: '1px solid rgba(42,20,51,0.12)', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' };
const pill = (on: boolean, dim = false): React.CSSProperties => ({ border: `1px solid ${on ? '#2a1433' : 'rgba(42,20,51,0.28)'}`, background: on ? '#2a1433' : 'transparent', color: on ? '#fff' : (dim ? 'rgba(42,20,51,0.35)' : 'rgba(42,20,51,0.75)'), borderRadius: 14, padding: '4px 11px', fontSize: 11, letterSpacing: '0.1em', cursor: dim ? 'default' : 'pointer' });
const btn: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(42,20,51,0.3)', background: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, color: '#2a1433', userSelect: 'none' };

export default function Transport(p: TransportProps) {
  const [pos, setPos] = useState<{ x: number; y: number; docked: boolean }>(() => {
    try { const j = localStorage.getItem('haar_transport_pos'); if (j) { const q = JSON.parse(j); if (q.docked || (q.x < window.innerWidth - 120 && q.y < window.innerHeight - 60 && q.x >= 0 && q.y >= 0)) return q; } } catch {}
    return { x: 24, y: 24, docked: false };   // off-screen or unknown: come home
  });
  const [hidden, setHidden] = useState(false);
  const [folded, setFolded] = useState(false);
  const [open, setOpen] = useState(false);
  const closeT = useRef(0);
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
    <span style={{ color: 'rgba(42,20,51,0.5)', fontSize: 10, letterSpacing: '0.2em' }}>SONG</span>
    {editing ? <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)} onBlur={() => { setEditing(false); if (nameDraft.trim() && p.onRename) p.onRename(nameDraft.trim()); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }} style={{ background: 'transparent', border: 'none', borderBottom: `1px solid ${FOG}`, color: '#fff', fontFamily: 'inherit', fontSize: 12, width: 110, outline: 'none' }} />
      : <span style={{ color: '#2a1433', fontWeight: 500 }}>{p.songName}</span>}
  </div>;
  const position = <div style={{ ...cell, fontSize: 19, color: p.rec === 'rolling' ? RED : '#2a1433', minWidth: 84, justifyContent: 'center' }}>{posText}</div>;
  const tempo = <div style={cell}><span style={{ color: '#2a1433', fontSize: 14 }}>{p.bpm}</span><span style={{ color: 'rgba(42,20,51,0.5)', fontSize: 10, letterSpacing: '0.2em' }}>BPM</span></div>;
  const toggles = <div style={cell}>
    <span onClick={p.onToggleClick} style={pill(!!p.click, !p.onToggleClick)}>CLICK</span>
    <span onClick={p.onToggleLoop} style={pill(!!p.loop, !p.onToggleLoop)}>LOOP</span>
    <span onClick={p.onCycleLoopBars} title="loop length in bars - tap to cycle" style={{ ...pill(!!p.loop, !p.onCycleLoopBars), minWidth: 18, textAlign: 'center' }}>{p.loopBars ?? 4}</span>
    {p.onCycleSky && <span onClick={p.onCycleSky} title="the sky over Build - tap to change the weather" style={{ ...pill(false), }}>sky · {p.sky}</span>}
  </div>;
  const buttons = <div style={{ ...cell, gap: 10 }}>
    <div onClick={p.onToStart} title="to start" style={btn}>⏮</div>
    <div onClick={p.onStop} title="stop" style={btn}>■</div>
    <div onClick={p.onPlay} title="play" style={{ ...btn, background: p.playing ? '#2a1433' : 'rgba(255,255,255,0.35)', color: p.playing ? '#fff' : '#2a1433', borderColor: '#2a1433' }}>▶</div>
    <div onClick={p.onRec} title="REC: arms on the next bar. REC again: stops on the next bar." style={{ ...btn, border: `2px solid ${p.rec === 'idle' ? 'rgba(255,90,90,0.7)' : RED}`, background: recBg, color: RED, animation: p.rec === 'armed' ? 'haarPulse 0.7s ease-in-out infinite' : 'none', fontSize: 11, fontWeight: 700 }}>{p.rec === 'rolling' ? p.recBar : '●'}</div>
  </div>;
  const target = <div onClick={p.onCycleTarget} title="record target - click to cycle tracks" style={{ ...cell, cursor: 'pointer' }}><span style={{ color: 'rgba(42,20,51,0.5)', fontSize: 10, letterSpacing: '0.2em' }}>TO</span><span style={{ color: p.rec === 'idle' ? '#2a1433' : RED, fontWeight: 500 }}>{p.target}</span></div>;
  const loud = /^(printed|exported)/.test(p.status);   // a file landed on disk: say it in full voice
  const status = <div style={{ ...cell, borderRight: 'none', color: loud ? '#2a1433' : p.rec === 'idle' ? 'rgba(42,20,51,0.55)' : RED, fontSize: loud ? 12.5 : 11, fontWeight: loud ? 700 : 400, minWidth: 150 }}>{p.status}</div>;

  const frame: React.CSSProperties = pos.docked
    ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1000, justifyContent: 'center', borderRadius: 0, borderTop: '1px solid rgba(255,255,255,0.6)' }
    : { position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000, borderRadius: 30, border: '1px solid rgba(255,255,255,0.6)' };

  const capsule = p.compact && !open;
  return (
    <div onPointerEnter={() => { window.clearTimeout(closeT.current); setOpen(true); }} onPointerLeave={() => { closeT.current = window.setTimeout(() => setOpen(false), 900); }}
      style={{ ...frame, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, rgba(255,255,255,0.46), rgba(255,255,255,0.26))', backdropFilter: 'blur(22px) saturate(1.2)', WebkitBackdropFilter: 'blur(22px) saturate(1.2)', fontFamily: '-apple-system, "Helvetica Neue", Inter, sans-serif', fontSize: 12, color: '#2a1433', boxShadow: '0 20px 50px rgba(42,20,51,0.25), inset 0 1px 0 rgba(255,255,255,0.6)' }}>
      {capsule ? (
        <div style={{ display: 'flex', alignItems: 'center' }}>{grip}{position}{buttons}{target}</div>
      ) : folded ? (
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
