'use client';
// THE ARRANGE ROOM - canvas, track headers, inspector, footer. Layout only (docs/ARRANGE.md).
// The transport floats above it; the song state and every verb come in as props.
import React, { useEffect, useRef, useState } from 'react';

export type ArrBlock = { id: string; startBar: number; lenBars: number; name: string; file: string; srcBars?: number; offset?: number; perf?: string; instrument?: string };
export type ArrTrack = { id: string; name: string; blocks: ArrBlock[] };
export type ArrangeRoomProps = {
  tracks: ArrTrack[]; playhead: number; zoom: number; scroll: number;
  selTrack: number; selBlock: string | null;
  rec: 'idle' | 'armed' | 'rolling'; recStartBar: number;
  onSelectTrack: (i: number) => void; onSelectBlock: (id: string | null) => void; onDeleteBlock: (id: string) => void;
  onSetHead: (bar: number) => void; onZoom: (d: number) => void; onScroll: (d: number) => void;
  onNew: () => void; onClose: () => void;
  loopA: number | null; loopBars: number; loopOn: boolean; onSetLoop: (a: number, b: number) => void;
};

const FOG = '#9fb4c8', RED = '#ff5a5a', HEAD_W = 120, ROW_H = 68, BARS = 64;
const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)' };
const verb = (on = true, danger = false): React.CSSProperties => ({ border: `0.5px solid ${danger ? 'rgba(255,90,90,0.6)' : 'rgba(255,255,255,0.3)'}`, borderRadius: 6, padding: '5px 9px', fontSize: 11, letterSpacing: '0.08em', color: danger ? RED : (on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)'), cursor: on ? 'pointer' : 'default', marginBottom: 6 });

export default function ArrangeRoom(p: ArrangeRoomProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && p.selBlock && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); p.onDeleteBlock(p.selBlock); }
      if (e.key === 'Escape') p.onSelectBlock(null);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [p.selBlock]);

  const sel = p.selBlock ? p.tracks.flatMap(t => t.blocks).find(b => b.id === p.selBlock) : null;
  const x = (bar: number) => (bar - p.scroll) * p.zoom;
  const rulerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const barAt = (clientX: number) => { const r = rulerRef.current?.getBoundingClientRect(); return r ? Math.max(0, Math.floor((clientX - r.left) / p.zoom + p.scroll)) : 0; };
  const onRulerDown = (e: React.PointerEvent) => { const a = barAt(e.clientX); setDrag({ a, b: a }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onRulerMove = (e: React.PointerEvent) => { if (drag) setDrag({ a: drag.a, b: barAt(e.clientX) }); };
  const onRulerUp = () => { if (!drag) return; const lo = Math.min(drag.a, drag.b), hi = Math.max(drag.a, drag.b); setDrag(null); if (hi > lo) p.onSetLoop(lo, hi + 1); else p.onSetHead(lo); };
  const loopBand = drag ? { a: Math.min(drag.a, drag.b), b: Math.max(drag.a, drag.b) + 1, live: true } : (p.loopA != null ? { a: p.loopA, b: p.loopA + p.loopBars, live: p.loopOn } : null);
  const band = (top: number, bottom: number) => loopBand ? <div style={{ position: 'absolute', left: x(loopBand.a), width: (loopBand.b - loopBand.a) * p.zoom, top, bottom, background: loopBand.live ? 'rgba(122,245,200,0.09)' : 'rgba(122,245,200,0.035)', borderLeft: '1px solid rgba(122,245,200,0.5)', borderRight: '1px solid rgba(122,245,200,0.5)', pointerEvents: 'none' }} /> : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: '#07080c', display: 'flex', flexDirection: 'column', fontFamily: 'Space Mono, monospace', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '14px 28px', borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>
        <span style={{ fontSize: 15, letterSpacing: '0.34em', color: FOG }}>ARRANGE</span>
        <span onClick={p.onNew} style={{ ...verb(), marginBottom: 0 }}>NEW SONG</span>
        <div style={{ flex: 1 }} />
        <div onClick={p.onClose} title="back to the instrument" style={{ width: 36, height: 36, borderRadius: '50%', border: '0.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15 }}>×</div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `${HEAD_W}px minmax(0,1fr) 220px`, minHeight: 0 }}>
        <div style={{ borderRight: '0.5px solid rgba(255,255,255,0.1)', overflowY: 'auto' }}>
          <div style={{ height: 26, borderBottom: '0.5px solid rgba(255,255,255,0.08)' }} />
          {p.tracks.map((t, i) => {
            const on = i === p.selTrack, empty = t.blocks.length === 0;
            return (
              <div key={t.id} onClick={() => p.onSelectTrack(i)} title="record target" style={{ height: ROW_H, boxSizing: 'border-box', padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', background: on ? 'rgba(255,90,90,0.12)' : 'transparent', borderLeft: on ? `2px solid ${RED}` : '2px solid transparent' }}>
                <div style={{ fontSize: 12, letterSpacing: '0.12em', color: on ? RED : (empty ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.8)') }}>{i + 1} {t.name.replace(/^TRACK \d+$/, '')}{on ? ' ●' : ''}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>{t.blocks.length ? t.blocks.length + ' block' + (t.blocks.length === 1 ? '' : 's') : ''}</div>
              </div>
            );
          })}
        </div>

        <div style={{ position: 'relative', overflow: 'hidden' }} onClick={() => p.onSelectBlock(null)}>
          <div ref={rulerRef} onPointerDown={onRulerDown} onPointerMove={onRulerMove} onPointerUp={onRulerUp} onClick={(e) => e.stopPropagation()} title="click: place the head · drag: set the loop range" style={{ height: 26, borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'relative', cursor: 'col-resize', userSelect: 'none' }}>
            {band(0, 0)}
            {Array.from({ length: BARS }, (_, i) => i).map(bn => (
              <span key={bn} style={{ position: 'absolute', left: x(bn), top: 6, fontSize: 9, padding: '0 4px', pointerEvents: 'none', color: bn % 4 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)' }}>{bn % 4 === 0 ? bn + 1 : '·'}</span>
            ))}
          </div>
          {p.tracks.map((t, ti) => (
            <div key={t.id} style={{ height: ROW_H, boxSizing: 'border-box', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'relative', background: ti === p.selTrack ? 'rgba(255,90,90,0.03)' : 'transparent' }}>
              {Array.from({ length: BARS }, (_, i) => i).map(bn => <div key={bn} style={{ position: 'absolute', left: x(bn), top: 0, bottom: 0, width: 0.5, background: bn % 4 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)' }} />)}
              {t.blocks.map(b => {
                const on = b.id === p.selBlock, performed = !!b.perf, rep = b.srcBars && b.lenBars > b.srcBars ? Math.round(b.lenBars / b.srcBars) : 0;
                return (
                  <div key={b.id} onClick={(e) => { e.stopPropagation(); p.onSelectBlock(b.id); }} title={b.name}
                    style={{ position: 'absolute', left: x(b.startBar), width: b.lenBars * p.zoom - 2, top: 8, height: ROW_H - 16, boxSizing: 'border-box', borderRadius: 6, cursor: 'pointer', overflow: 'hidden', padding: '6px 8px', fontSize: 10, letterSpacing: '0.08em',
                      background: performed ? (on ? 'rgba(159,180,200,0.42)' : 'rgba(159,180,200,0.18)') : (on ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)'),
                      border: on ? `1.5px solid ${FOG}` : `0.5px solid ${performed ? 'rgba(159,180,200,0.6)' : 'rgba(255,255,255,0.3)'}`, color: '#fff' }}>
                    {b.name}{rep ? <span style={{ color: 'rgba(255,255,255,0.5)' }}> ×{rep}</span> : null}
                  </div>
                );
              })}
              {ti === p.selTrack && p.rec === 'rolling' && (
                <div style={{ position: 'absolute', left: x(p.recStartBar), width: Math.max(4, (p.playhead - p.recStartBar) * p.zoom), top: 8, height: ROW_H - 16, boxSizing: 'border-box', borderRadius: 6, border: `1px dashed ${RED}`, background: 'rgba(255,90,90,0.08)', padding: '6px 8px', fontSize: 10, color: RED }}>REC</div>
              )}
            </div>
          ))}
          {band(26, 0)}
          <div style={{ position: 'absolute', left: x(p.playhead), top: 0, bottom: 0, width: 1.5, background: p.rec === 'rolling' ? RED : FOG, pointerEvents: 'none' }} />
        </div>

        <div style={{ borderLeft: '0.5px solid rgba(255,255,255,0.1)', padding: 16, fontSize: 11 }}>
          {sel ? (
            <>
              <div style={{ fontSize: 13, letterSpacing: '0.12em', marginBottom: 12 }}>{sel.name}</div>
              <div style={lbl}>START</div><div style={{ marginBottom: 8 }}>bar {sel.startBar + 1}</div>
              <div style={lbl}>LENGTH</div><div style={{ marginBottom: 8 }}>{sel.lenBars} bars{sel.srcBars && sel.srcBars !== sel.lenBars ? ' · source ' + sel.srcBars : ''}</div>
              <div style={lbl}>BODY</div><div style={{ marginBottom: 8 }}>{sel.perf ? 'render + performance' : 'audio only'}</div>
              {sel.instrument && <><div style={lbl}>INSTRUMENT</div><div style={{ marginBottom: 14, wordBreak: 'break-all', color: 'rgba(255,255,255,0.7)' }}>{sel.instrument.replace(/\.json$/, '')}</div></>}
              <div style={verb(false)}>OPEN IN BENCH</div>
              <div style={verb(false)}>PERFORMANCE</div>
              <div style={verb(false)}>RE-RENDER</div>
              <div onClick={() => p.onDeleteBlock(sel.id)} style={verb(true, true)}>DELETE</div>
            </>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.3)', lineHeight: 1.8 }}>tap a track to make it the record target<br />tap a block to see it here<br />tap the ruler to place the head</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '10px 28px', borderTop: '0.5px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
        <span><span onClick={() => p.onZoom(-4)} style={{ cursor: 'pointer', padding: '0 8px' }}>−</span>zoom<span onClick={() => p.onZoom(4)} style={{ cursor: 'pointer', padding: '0 8px' }}>+</span></span>
        <span><span onClick={() => p.onScroll(-4)} style={{ cursor: 'pointer', padding: '0 8px' }}>◀</span>scroll<span onClick={() => p.onScroll(4)} style={{ cursor: 'pointer', padding: '0 8px' }}>▶</span></span>
        <span>snap: bar</span>
        <div style={{ flex: 1 }} />
        <span>arrange · <span style={{ color: 'rgba(255,255,255,0.25)' }}>mix</span></span>
      </div>
    </div>
  );
}
