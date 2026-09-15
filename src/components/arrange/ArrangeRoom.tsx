'use client';
// THE ARRANGE ROOM - canvas, track headers, inspector, footer. Layout only (docs/ARRANGE.md).
// The transport floats above it; the song state and every verb come in as props.
import React, { useEffect, useRef, useState } from 'react';

export type ArrBlock = { id: string; startBar: number; lenBars: number; name: string; file: string; srcBars?: number; offset?: number; perf?: string; instrument?: string };
export type ArrTrack = { id: string; name: string; blocks: ArrBlock[] };
export type ArrangeRoomProps = {
  tracks: ArrTrack[]; playhead: number; zoom: number; scroll: number;
  peaksFor?: (id: string) => Float32Array | null; peaksTick?: number;   // the wave inside every slab
  selTrack: number; selBlock: string | null;
  rec: 'idle' | 'armed' | 'rolling'; recStartBar: number;
  onSelectTrack: (i: number) => void; onSelectBlock: (id: string | null) => void; onDeleteBlock: (id: string) => void;
  onSetHead: (bar: number) => void; onZoom: (d: number) => void; onScroll: (d: number) => void;
  onNew: () => void; onClose: () => void;
  loopA: number | null; loopBars: number; loopOn: boolean; onSetLoop: (a: number, b: number) => void;
  onBlockChange: (id: string, patch: { startBar?: number; lenBars?: number; gain?: number; fadeIn?: number; fadeOut?: number; name?: string }, track?: number) => void;
  onNormalise?: (id: string) => void;
  onTrackChange?: (i: number, patch: { mute?: boolean; solo?: boolean; name?: string; level?: number; pan?: number; eq?: { lo: number; mid: number; hi: number }; sends?: { rev: number; dly: number } }) => void;
  onOpenInstrument?: (id: string) => void;
  onSaveSong?: () => void; onOpenSong?: () => void;
  meters?: () => { bands: number[][]; master: number[] } | null;
  master?: number; limiter?: boolean; fx?: any; onMaster?: (db: number) => void; onLimiter?: (on: boolean) => void; onFx?: (fx: any) => void;
  songName?: string;
  onCopyBlock: (id: string, startBar: number, track: number) => void;
  onUndo: () => void;
  onSplitBlock: (id: string, atBar: number) => void;
  onClearTrack: (i: number) => void;
};

const FOG = '#9fb4c8', RED = '#ff5a5a', HEAD_W = 120, ROW_H = 68, BARS = 64;
const INK = '#fff', INK2 = 'rgba(255,255,255,0.8)', INK3 = 'rgba(255,255,255,0.5)';   // white on the sky, with a shadow - as the reel
const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: '0.2em', color: INK3 };
const verb = (on = true, danger = false): React.CSSProperties => ({ border: `0.5px solid ${danger ? 'rgba(255,90,90,0.6)' : 'rgba(255,255,255,0.3)'}`, borderRadius: 6, padding: '5px 9px', fontSize: 11, letterSpacing: '0.08em', color: danger ? RED : (on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)'), cursor: on ? 'pointer' : 'default', marginBottom: 6 });

export default function ArrangeRoom(p: ArrangeRoomProps) {
  const [tool, setTool] = useState<'select' | 'cut' | 'erase'>('select');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLInputElement)) { if (e.key === '1') setTool('select'); if (e.key === '3') setTool('cut'); if (e.key === '5') setTool('erase'); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && p.selBlock && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); p.onDeleteBlock(p.selBlock); }
      if (e.key === 'Escape') p.onSelectBlock(null);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); p.onUndo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [p.selBlock]);

  const sel = p.selBlock ? p.tracks.flatMap(t => t.blocks).find(b => b.id === p.selBlock) : null;
  const x = (bar: number) => (bar - p.scroll) * p.zoom;
  const rulerRef = useRef<HTMLDivElement>(null);
  const barAt = (clientX: number) => { const r = rulerRef.current?.getBoundingClientRect(); return r ? Math.max(0, Math.floor((clientX - r.left) / p.zoom + p.scroll)) : 0; };
  // RULER: near the start edge moves the start, near the end edge moves the end, inside the band moves the range, outside draws a new one. A click places the head.
  const rdRef = useRef<{ mode: 'new' | 'left' | 'right' | 'move'; x0: number; a0: number; b0: number; a: number; b: number; moved: boolean } | null>(null);
  const [rd, setRd] = useState<{ a: number; b: number } | null>(null);
  const onRulerDown = (e: React.PointerEvent) => {
    const bar = barAt(e.clientX);
    let mode: 'new' | 'left' | 'right' | 'move' = 'new', a0 = bar, b0 = bar + 1;
    if (p.loopA != null) {
      const A = p.loopA, B = p.loopA + p.loopBars;
      if (Math.abs(e.clientX - (rulerRef.current!.getBoundingClientRect().left + x(A))) < 9) mode = 'left';
      else if (Math.abs(e.clientX - (rulerRef.current!.getBoundingClientRect().left + x(B))) < 9) mode = 'right';
      else if (bar >= A && bar < B) mode = 'move';
      if (mode !== 'new') { a0 = A; b0 = B; }
    }
    rdRef.current = { mode, x0: e.clientX, a0, b0, a: a0, b: b0, moved: false };
    setRd(mode === 'new' ? null : { a: a0, b: b0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onRulerMove = (e: React.PointerEvent) => {
    const r = rdRef.current; if (!r) return;
    const d = Math.round((e.clientX - r.x0) / p.zoom);
    let a = r.a0, b = r.b0;
    if (r.mode === 'new') { const bar = barAt(e.clientX); a = Math.min(r.a0, bar); b = Math.max(r.a0, bar) + 1; }
    else if (r.mode === 'left') a = Math.max(0, Math.min(r.b0 - 1, r.a0 + d));
    else if (r.mode === 'right') b = Math.max(r.a0 + 1, r.b0 + d);
    else { a = Math.max(0, r.a0 + d); b = a + (r.b0 - r.a0); }
    const moved = r.moved || d !== 0;
    if (a !== r.a || b !== r.b || moved !== r.moved) { rdRef.current = { ...r, a, b, moved }; setRd({ a, b }); }
  };
  const onRulerUp = (e: React.PointerEvent) => {
    const r = rdRef.current; if (!r) return; rdRef.current = null; setRd(null);
    if (!r.moved) { p.onSetHead(barAt(e.clientX)); return; }
    p.onSetLoop(r.a, r.b);
  };
  // BLOCK GESTURES: drag = move (snapped to bar, across tracks too) · right edge = extend or trim · alt-drag = copy.
  // The live gesture lives in a ref (no stale closure on release); state only carries the ghost for drawing.
  type Gest = { id: string; mode: 'move' | 'resize'; copy: boolean; x0: number; y0: number; startBar: number; lenBars: number; track: number; dBar: number; dTrack: number; moved: boolean };
  const gestRef = useRef<Gest | null>(null);
  const [gest, setGest] = useState<Gest | null>(null);
  const [mixView, setMixView] = useState(false);          // the desk, in place of the lanes
  const onTileDown = (e: React.PointerEvent, b: ArrBlock, ti: number) => {
    e.stopPropagation();
    if (tool === 'erase') { p.onDeleteBlock(b.id); return; }
    if (tool === 'cut') { const at = barAt(e.clientX); if (at > b.startBar && at < b.startBar + b.lenBars) p.onSplitBlock(b.id, at); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const g: Gest = { id: b.id, mode: e.clientX > rect.right - 12 ? 'resize' : 'move', copy: e.altKey, x0: e.clientX, y0: e.clientY, startBar: b.startBar, lenBars: b.lenBars, track: ti, dBar: 0, dTrack: 0, moved: false };
    gestRef.current = g; setGest(g);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onTileMove = (e: React.PointerEvent) => {
    const g = gestRef.current; if (!g) return;
    const dBar = Math.round((e.clientX - g.x0) / p.zoom);
    const dTrack = g.mode === 'move' ? Math.round((e.clientY - g.y0) / ROW_H) : 0;
    const moved = g.moved || dBar !== 0 || dTrack !== 0;
    if (dBar !== g.dBar || dTrack !== g.dTrack || moved !== g.moved) { const ng = { ...g, dBar, dTrack, moved }; gestRef.current = ng; setGest(ng); }
  };
  const onTileUp = (e: React.PointerEvent) => {
    const g = gestRef.current; if (!g) return;
    gestRef.current = null; setGest(null);
    const dBar = Math.round((e.clientX - g.x0) / p.zoom);
    const dTrack = g.mode === 'move' ? Math.round((e.clientY - g.y0) / ROW_H) : 0;
    if (!g.moved && dBar === 0 && dTrack === 0) { p.onSelectBlock(g.id); return; }
    if (g.mode === 'resize') { if (dBar !== 0) p.onBlockChange(g.id, { lenBars: Math.max(1, g.lenBars + dBar) }); return; }
    const startBar = Math.max(0, g.startBar + dBar);
    const track = Math.max(0, Math.min(p.tracks.length - 1, g.track + dTrack));
    if (g.copy) p.onCopyBlock(g.id, startBar, track); else if (dBar !== 0 || dTrack !== 0) p.onBlockChange(g.id, { startBar }, track);
  };
  const ghost = gest && gest.moved ? (gest.mode === 'resize'
    ? { track: gest.track, startBar: gest.startBar, lenBars: Math.max(1, gest.lenBars + gest.dBar), copy: false }
    : { track: Math.max(0, Math.min(p.tracks.length - 1, gest.track + gest.dTrack)), startBar: Math.max(0, gest.startBar + gest.dBar), lenBars: gest.lenBars, copy: gest.copy }) : null;
  const loopBand = rd ? { a: rd.a, b: rd.b, live: true } : (p.loopA != null ? { a: p.loopA, b: p.loopA + p.loopBars, live: p.loopOn } : null);
  const band = (top: number, bottom: number) => loopBand ? <div style={{ position: 'absolute', left: x(loopBand.a), width: (loopBand.b - loopBand.a) * p.zoom, top, bottom, background: loopBand.live ? 'rgba(122,245,200,0.09)' : 'rgba(122,245,200,0.035)', borderLeft: '2px solid rgba(122,245,200,0.7)', borderRight: '2px solid rgba(122,245,200,0.7)', pointerEvents: 'none' }} /> : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'transparent', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, "Helvetica Neue", Inter, sans-serif', color: INK, textShadow: '0 1px 12px rgba(30,10,40,0.7)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.5)', background: 'transparent' }}>
        <span style={{ fontSize: 15, letterSpacing: '0.34em', color: INK2, marginRight: 26 }}>ARRANGE{p.songName ? <span style={{ letterSpacing: '0.08em', color: INK, marginLeft: 14 }}>· {p.songName}</span> : null}</span>
        <span onClick={p.onNew} style={{ ...verb(), marginBottom: 0, borderColor: 'rgba(255,255,255,0.45)', color: INK }}>NEW SONG</span>
        <span onClick={() => p.onUndo?.()} title="undo the last change  (Cmd+Z)" style={{ ...verb(), marginBottom: 0, borderColor: 'rgba(255,255,255,0.45)', color: INK }}>↶ UNDO</span>
        <span onClick={() => p.onSaveSong?.()} title="save the song - the arrangement and every instrument in the rack" style={{ ...verb(), marginBottom: 0, borderColor: 'rgba(255,255,255,0.45)', color: INK }}>SAVE SONG</span>
        <span onClick={() => p.onOpenSong?.()} title="open a song from Haar/Songs - the arrangement and its rack" style={{ ...verb(), marginBottom: 0, borderColor: 'rgba(255,255,255,0.45)', color: INK }}>OPEN SONG</span>
        <div style={{ flex: 1 }} />
        <div onClick={p.onClose} title="back to the instrument" style={{ width: 36, height: 36, borderRadius: '50%', border: '0.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15 }}>×</div>
      </div>

      {mixView ? <Desk p={p} /> : null}
      <div style={{ flex: 1, display: mixView ? 'none' : 'grid', gridTemplateColumns: `${HEAD_W}px minmax(0,1fr) 220px`, minHeight: 0 }}>
        <div style={{ borderRight: '1px solid rgba(255,255,255,0.5)', overflowY: 'auto', background: 'transparent' }}>
          <div style={{ height: 26, borderBottom: '0.5px solid rgba(255,255,255,0.08)' }} />
          {p.tracks.map((t, i) => {
            const on = i === p.selTrack, empty = t.blocks.length === 0;
            return (
              <div key={t.id} onClick={() => p.onSelectTrack(i)} title="record target" style={{ height: ROW_H, boxSizing: 'border-box', padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', background: on ? 'rgba(255,90,90,0.12)' : 'transparent', borderLeft: on ? `2px solid ${RED}` : '2px solid transparent' }}>
                <div style={{ fontSize: 13, letterSpacing: '0.12em', fontWeight: 500, color: on ? RED : (empty ? INK3 : INK), display: 'flex', alignItems: 'baseline', gap: 8 }}>{i + 1} {t.name.replace(/^TRACK \d+$/, '')}{on ? ' ●' : ''}<span onClick={(e) => { e.stopPropagation(); const n = window.prompt('name this track', t.name && t.name !== String(i + 1) ? t.name : ''); if (n != null) p.onTrackChange?.(i, { name: n.trim() || String(i + 1) }); }} title="tap to name the track" style={{ fontSize: 12, fontWeight: 400, letterSpacing: '0.04em', cursor: 'text', color: t.name && t.name !== String(i + 1) ? INK : INK3, borderBottom: '1px dotted rgba(255,255,255,0.35)' }}>{t.name && t.name !== String(i + 1) ? t.name : 'name'}</span></div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                <span onClick={() => p.onTrackChange?.(i, { mute: !t.mute })} title="mute" style={{ width: 20, height: 20, borderRadius: 10, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid ' + (t.mute ? '#ffd27a' : 'rgba(255,255,255,0.35)'), background: t.mute ? 'rgba(255,210,122,0.35)' : 'transparent', color: t.mute ? '#ffd27a' : INK2 }}>M</span>
                <span onClick={() => p.onTrackChange?.(i, { solo: !t.solo })} title="solo" style={{ width: 20, height: 20, borderRadius: 10, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid ' + (t.solo ? '#a6ffd8' : 'rgba(255,255,255,0.35)'), background: t.solo ? 'rgba(166,255,216,0.3)' : 'transparent', color: t.solo ? '#a6ffd8' : INK2 }}>S</span>
              </div>
              <div style={{ fontSize: 10, color: INK3, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}><span>{t.blocks.length ? t.blocks.length + ' block' + (t.blocks.length === 1 ? '' : 's') : ''}</span>{t.blocks.length > 0 && <span onClick={(e) => { e.stopPropagation(); p.onClearTrack(i); }} title="clear this track" style={{ color: 'rgba(255,90,90,0.6)', cursor: 'pointer', padding: '0 4px' }}>×</span>}</div>
              </div>
            );
          })}
        </div>

        <div style={{ position: 'relative', overflow: 'hidden', background: 'transparent' }} onClick={() => p.onSelectBlock(null)}>
          <div ref={rulerRef} onPointerDown={onRulerDown} onPointerMove={onRulerMove} onPointerUp={onRulerUp} onClick={(e) => e.stopPropagation()} title="click: place the head · drag: set the loop range" style={{ height: 26, borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'relative', cursor: 'col-resize', userSelect: 'none' }}>
            {band(0, 0)}
            {Array.from({ length: BARS }, (_, i) => i).map(bn => (
              <span key={bn} style={{ position: 'absolute', left: x(bn), top: 6, fontSize: 9, padding: '0 4px', pointerEvents: 'none', color: bn % 4 === 0 ? INK2 : INK3 }}>{bn % 4 === 0 ? bn + 1 : '·'}</span>
            ))}
          </div>
          {p.tracks.map((t, ti) => (
            <div key={t.id} style={{ height: ROW_H, boxSizing: 'border-box', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'relative', backgroundColor: ti === p.selTrack ? 'rgba(255,90,90,0.03)' : 'transparent', backgroundImage: `repeating-linear-gradient(to right, rgba(255,244,246,0.16) 0 1px, transparent 1px ${p.zoom * 4}px), repeating-linear-gradient(to right, rgba(255,244,246,0.05) 0 1px, transparent 1px ${p.zoom}px)`, backgroundPositionX: `${-p.scroll * p.zoom}px` }}>
              {t.blocks.map(b => {
                const on = b.id === p.selBlock, performed = !!b.perf, rep = b.srcBars && b.lenBars > b.srcBars ? Math.round(b.lenBars / b.srcBars) : 0;
                return (
                  <div key={b.id} onPointerDown={(e) => onTileDown(e, b, ti)} onPointerMove={onTileMove} onPointerUp={onTileUp} title={b.name + ' · drag to move · right edge to extend · alt-drag to copy'}
                    style={{ position: 'absolute', left: x(b.startBar), width: b.lenBars * p.zoom - 2, top: 8, height: ROW_H - 16, boxSizing: 'border-box', borderRadius: 6, cursor: tool === 'cut' ? 'col-resize' : tool === 'erase' ? 'not-allowed' : 'grab', overflow: 'hidden', padding: '6px 8px', fontSize: 10, letterSpacing: '0.08em', userSelect: 'none', touchAction: 'none',
                      opacity: gest && gest.id === b.id && gest.moved && gest.mode === 'move' && !gest.copy ? 0.35 : 1,
                      background: 'linear-gradient(180deg, rgba(255,244,246,0.22), rgba(255,244,246,0.07))',
                      border: on ? '1.5px solid #fff' : '1px solid rgba(255,244,246,0.5)', color: INK, boxShadow: on ? '0 40px 60px -18px rgba(255,200,210,0.5), 0 0 0 1px rgba(255,255,255,0.5)' : '0 30px 50px -18px rgba(30,10,40,0.9), inset 0 1px 0 rgba(255,255,255,0.35)', borderRadius: 14 }}>
                    <Wave peaks={p.peaksFor?.(b.id) ?? null} hue={HUES[ti % HUES.length]} w={b.lenBars * p.zoom - 2} h={ROW_H - 16} repeats={b.srcBars ? Math.max(1, b.lenBars / b.srcBars) : 1} tick={p.peaksTick ?? 0} />
                    {(b.fadeIn ?? 0) > 0 && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (b.fadeIn ?? 0) * p.zoom, background: 'linear-gradient(90deg, rgba(30,10,40,0.6), rgba(30,10,40,0))', pointerEvents: 'none' }} />}
                    {(b.fadeOut ?? 0) > 0 && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: (b.fadeOut ?? 0) * p.zoom, background: 'linear-gradient(270deg, rgba(30,10,40,0.6), rgba(30,10,40,0))', pointerEvents: 'none' }} />}
                    {b.name}{rep ? <span style={{ color: 'rgba(255,255,255,0.5)' }}> ×{rep}</span> : null}
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 10, cursor: 'col-resize', borderRight: '2px solid rgba(255,255,255,0.18)' }} />
                  </div>
                );
              })}
              {ti === p.selTrack && p.rec === 'rolling' && (
                <div style={{ position: 'absolute', left: x(p.recStartBar), width: Math.max(4, (p.playhead - p.recStartBar) * p.zoom), top: 8, height: ROW_H - 16, boxSizing: 'border-box', borderRadius: 6, border: `1px dashed ${RED}`, background: 'rgba(255,90,90,0.08)', padding: '6px 8px', fontSize: 10, color: RED }}>REC</div>
              )}
            </div>
          ))}
          {band(26, 0)}
          {ghost && <div style={{ position: 'absolute', left: x(ghost.startBar), width: ghost.lenBars * p.zoom - 2, top: 26 + ghost.track * ROW_H + 8, height: ROW_H - 16, boxSizing: 'border-box', borderRadius: 6, border: `1.5px dashed ${FOG}`, background: 'rgba(159,180,200,0.14)', pointerEvents: 'none', padding: '6px 8px', fontSize: 10, color: FOG }}>{ghost.copy ? 'copy' : ''} bar {ghost.startBar + 1} · {ghost.lenBars}</div>}
          <div style={{ position: 'absolute', left: x(p.playhead) - 150, top: 0, bottom: 0, width: 300, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(255,245,225,0.5), rgba(255,245,225,0.06) 60%, rgba(255,245,225,0) 100%)', clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0 100%)', mixBlendMode: 'screen' }} />
          <div style={{ position: 'absolute', left: x(p.playhead), top: 0, bottom: 0, width: 1.5, boxShadow: '0 0 30px 4px rgba(255,240,220,0.8)', background: p.rec === 'rolling' ? RED : '#fff', pointerEvents: 'none' }} />
        </div>

        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.5)', padding: 16, fontSize: 11, background: 'transparent' }}>
          {sel ? (
            <>
              <div title="tap to rename" onClick={() => { const n = window.prompt('name this take', sel.name); if (n && n.trim()) p.onBlockChange(sel.id, { name: n.trim() }); }} style={{ fontSize: 13, letterSpacing: '0.12em', marginBottom: 12, cursor: 'text', borderBottom: '1px dotted rgba(255,255,255,0.4)', display: 'inline-block' }}>{sel.name}</div>
              <div style={lbl}>START</div><div style={{ marginBottom: 8 }}>bar {sel.startBar + 1}</div>
              <div style={lbl}>LENGTH</div><div style={{ marginBottom: 8 }}>{sel.lenBars} bars{sel.srcBars && sel.srcBars !== sel.lenBars ? ' · source ' + sel.srcBars : ''}</div>
              <div style={lbl}>BODY</div><div style={{ marginBottom: 8 }}>{sel.perf ? 'render + performance' : 'audio only'}</div>
              {/* THE VOICE of the take: gain, normalise, fades - applied at play time, never written into the wav */}
              <div style={{ ...lbl, marginTop: 10 }}>GAIN</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span onClick={() => p.onBlockChange(sel.id, { gain: Math.max(-36, Math.round(((sel.gain ?? 0) - 1) * 10) / 10) })} style={{ ...verb(false), marginBottom: 0, padding: '2px 8px' }}>−</span>
                <span title="drag up / down" style={{ minWidth: 64, textAlign: 'center', cursor: 'ns-resize', fontSize: 13, userSelect: 'none' }}
                  onPointerDown={(e) => { const y0 = e.clientY, g0 = sel.gain ?? 0; const el = e.currentTarget; el.setPointerCapture(e.pointerId);
                    const mv = (ev: PointerEvent) => { const g = Math.max(-36, Math.min(24, Math.round((g0 + (y0 - ev.clientY) * 0.15) * 10) / 10)); p.onBlockChange(sel.id, { gain: g }); };
                    const up = () => { el.removeEventListener('pointermove', mv as any); el.removeEventListener('pointerup', up); };
                    el.addEventListener('pointermove', mv as any); el.addEventListener('pointerup', up); }}>{((sel.gain ?? 0) >= 0 ? '+' : '') + (sel.gain ?? 0).toFixed(1)} dB</span>
                <span onClick={() => p.onBlockChange(sel.id, { gain: Math.min(24, Math.round(((sel.gain ?? 0) + 1) * 10) / 10) })} style={{ ...verb(false), marginBottom: 0, padding: '2px 8px' }}>+</span>
              </div>
              <div onClick={() => p.onNormalise?.(sel.id)} style={verb(false)}>NORMALISE</div>
              <div style={{ ...lbl, marginTop: 10 }}>FADE IN</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span onClick={() => p.onBlockChange(sel.id, { fadeIn: Math.max(0, (sel.fadeIn ?? 0) - 0.25) })} style={{ ...verb(false), marginBottom: 0, padding: '2px 8px' }}>−</span>
                <span style={{ minWidth: 64, textAlign: 'center', fontSize: 13 }}>{(sel.fadeIn ?? 0).toFixed(2)} bars</span>
                <span onClick={() => p.onBlockChange(sel.id, { fadeIn: Math.min(sel.lenBars, (sel.fadeIn ?? 0) + 0.25) })} style={{ ...verb(false), marginBottom: 0, padding: '2px 8px' }}>+</span>
              </div>
              <div style={lbl}>FADE OUT</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span onClick={() => p.onBlockChange(sel.id, { fadeOut: Math.max(0, (sel.fadeOut ?? 0) - 0.25) })} style={{ ...verb(false), marginBottom: 0, padding: '2px 8px' }}>−</span>
                <span style={{ minWidth: 64, textAlign: 'center', fontSize: 13 }}>{(sel.fadeOut ?? 0).toFixed(2)} bars</span>
                <span onClick={() => p.onBlockChange(sel.id, { fadeOut: Math.min(sel.lenBars, (sel.fadeOut ?? 0) + 0.25) })} style={{ ...verb(false), marginBottom: 0, padding: '2px 8px' }}>+</span>
              </div>
              <div onClick={() => { if (p.playhead > sel.startBar && p.playhead < sel.startBar + sel.lenBars) p.onSplitBlock(sel.id, Math.round(p.playhead)); }} style={verb(false)}>SPLIT AT HEAD</div>
              {sel.instrument && <><div style={lbl}>INSTRUMENT</div><div style={{ marginBottom: 14, wordBreak: 'break-all', color: 'rgba(255,255,255,0.7)' }}>{sel.instrument.replace(/\.json$/, '')}</div></>}
              {sel.instrument && <div onClick={() => p.onOpenInstrument?.(sel.id)} style={verb(false)} title="reload the instrument that made this take into Build - the current one saves first">OPEN INSTRUMENT</div>}
              <div onClick={() => p.onDeleteBlock(sel.id)} style={verb(true, true)}>DELETE</div>
            </>
          ) : (
            <div style={{ color: INK3, lineHeight: 1.8 }}>tap a track to make it the record target<br />tap a block to see it here<br />tap the ruler to place the head</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '10px 28px', borderTop: '1px solid rgba(255,255,255,0.5)', fontSize: 11, color: INK2, background: 'transparent' }}>
        <span><span onClick={() => p.onZoom(-4)} style={{ cursor: 'pointer', padding: '0 8px' }}>−</span>zoom<span onClick={() => p.onZoom(4)} style={{ cursor: 'pointer', padding: '0 8px' }}>+</span></span>
        <span><span onClick={() => p.onScroll(-4)} style={{ cursor: 'pointer', padding: '0 8px' }}>◀</span>scroll<span onClick={() => p.onScroll(4)} style={{ cursor: 'pointer', padding: '0 8px' }}>▶</span></span>
        <span>snap: bar</span>
        <span style={{ display: 'flex', gap: 6 }}>{([['select', '1 · select'], ['cut', '3 · scissors'], ['erase', '5 · eraser']] as const).map(([k, l]) => <span key={k} onClick={() => setTool(k)} style={{ border: `0.5px solid ${tool === k ? '#7af5c8' : 'rgba(255,255,255,0.25)'}`, color: tool === k ? '#7af5c8' : 'rgba(255,255,255,0.5)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>{l}</span>)}</span>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <span onClick={() => setMixView(false)} style={{ padding: '7px 16px', borderRadius: 16, cursor: 'pointer', fontSize: 13, letterSpacing: '0.14em', border: '1px solid ' + (mixView ? 'rgba(255,255,255,0.3)' : '#fff'), background: mixView ? 'transparent' : 'rgba(255,255,255,0.22)', color: mixView ? 'rgba(255,255,255,0.55)' : INK }}>ARRANGE</span>
          <span onClick={() => setMixView(true)} style={{ padding: '7px 16px', borderRadius: 16, cursor: 'pointer', fontSize: 13, letterSpacing: '0.14em', border: '1px solid ' + (mixView ? '#fff' : 'rgba(255,255,255,0.3)'), background: mixView ? 'rgba(255,255,255,0.22)' : 'transparent', color: mixView ? INK : 'rgba(255,255,255,0.55)' }}>MIX</span>
        </span>
      </div>
    </div>
  );
}

// THE DESK - one strip per track, then reverb, delay and master. Glass on the sky. Faders drag vertically; pan and knobs drag too.
function Drag({ value, min, max, onChange, children, vertical = true, fine = 0.25 }: { value: number; min: number; max: number; onChange: (v: number) => void; children: React.ReactNode; vertical?: boolean; fine?: number }) {
  return <div onPointerDown={(e) => { const el = e.currentTarget; const x0 = e.clientX, y0 = e.clientY, v0 = value; el.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => { const d = vertical ? (y0 - ev.clientY) : (ev.clientX - x0); const v = Math.max(min, Math.min(max, v0 + d * ((max - min) / 160) * (ev.shiftKey ? fine : 1))); onChange(Math.round(v * 100) / 100); };
    const up = () => { el.removeEventListener('pointermove', mv as any); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', mv as any); el.addEventListener('pointerup', up); }} style={{ cursor: vertical ? 'ns-resize' : 'ew-resize', userSelect: 'none', touchAction: 'none' }}>{children}</div>;
}
function Fader({ value, min, max, onChange, label, unit = 'dB', h = 150 }: { value: number; min: number; max: number; onChange: (v: number) => void; label?: string; unit?: string; h?: number }) {
  const t = (value - min) / (max - min);
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
    {label && <div style={{ fontSize: 9, letterSpacing: '0.18em', opacity: 0.55 }}>{label}</div>}
    <Drag value={value} min={min} max={max} onChange={onChange}><div style={{ width: 22, height: h, position: 'relative' }}>
      <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
      <div style={{ position: 'absolute', left: 9, bottom: 0, height: `${t * 100}%`, width: 4, borderRadius: 2, background: 'rgba(255,255,255,0.55)' }} />
      <div style={{ position: 'absolute', left: 2, top: `calc(${(1 - t) * 100}% - 9px)`, width: 18, height: 18, borderRadius: 9, background: '#fff', boxShadow: '0 2px 10px rgba(20,10,40,0.5)' }} />
    </div></Drag>
    <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{value > 0 && unit === 'dB' ? '+' : ''}{unit === 'dB' ? value.toFixed(1) : value.toFixed(2)}{unit === 'dB' ? ' dB' : ''}</div>
  </div>;
}
function Knob({ value, min, max, onChange, label, fmt }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; fmt?: (v: number) => string }) {
  const t = (value - min) / (max - min); const a = -135 + t * 270;
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
    <Drag value={value} min={min} max={max} onChange={onChange}><div style={{ width: 34, height: 34, borderRadius: 17, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.08)', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 16, top: 3, width: 2, height: 11, borderRadius: 1, background: '#fff', transformOrigin: '1px 14px', transform: `rotate(${a}deg)` }} />
    </div></Drag>
    <div style={{ fontSize: 9, letterSpacing: '0.14em', opacity: 0.6 }}>{label}</div>
    <div style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{fmt ? fmt(value) : value.toFixed(2)}</div>
  </div>;
}
const strip: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 10px', borderRadius: 16, minWidth: 108, background: 'linear-gradient(180deg, rgba(255,244,246,0.16), rgba(255,244,246,0.06))', border: '1px solid rgba(255,244,246,0.35)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 20px 40px -20px rgba(30,10,40,0.7)' };
// the skyline of light above a strip - the channel's spectrum, drawn like a front on the horizon
function Light({ get, w = 190, h = 170, hue = 215 }: { get: () => number[] | null; w?: number; h?: number; hue?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0; const c = ref.current; if (!c) return; const g = c.getContext('2d'); if (!g) return;
    const draw = () => { const b = get(); g.clearRect(0, 0, w, h); if (b) { const n = b.length, bw = w / n;
        for (let i = 0; i < n; i++) { const v = Math.min(1, Math.pow(b[i], 0.6) * 1.35); const hh = v * h * 0.96;   // lifted: quiet is still visible, loud fills the sky
          g.shadowColor = `hsla(${hue}, 100%, 75%, ${0.5 + v * 0.5})`; g.shadowBlur = 14 + v * 18;
          g.fillStyle = `hsla(${hue}, 100%, ${70 + v * 28}%, ${0.55 + v * 0.45})`; g.fillRect(i * bw + bw * 0.2, h - hh, bw * 0.6, hh); }
        g.shadowBlur = 0; }
      raf = requestAnimationFrame(draw); };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [get, w, h, hue]);
  return <canvas ref={ref} width={w} height={h} style={{ width: w, height: h, display: 'block', pointerEvents: 'none' }} />;
}
function Desk({ p }: { p: Props }) {
  const fx = p.fx ?? { rev: { size: 0.5, damp: 0.4, mix: 1 }, dly: { beats: 0.75, feedback: 0.35, mix: 1 } };
  const dB = (v: number) => (v > 0 ? '+' : '') + v.toFixed(1);
  return <div style={{ flex: 1, overflowX: 'auto', display: 'flex', alignItems: 'flex-end', gap: 10, padding: '18px 28px 22px' }}>
    {p.tracks.map((t, i) => { const eq = t.eq ?? { lo: 0, mid: 0, hi: 0 }; const sd = t.sends ?? { rev: 0, dly: 0 }; const on = i === p.selTrack; const empty = t.blocks.length === 0;
      return <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Light get={() => p.meters?.()?.bands[i] ?? null} hue={HUES[i % HUES.length]} />
        <div style={{ ...strip, opacity: empty ? 0.55 : 1, borderColor: on ? '#fff' : 'rgba(255,244,246,0.35)' }}>
        <div onClick={() => p.onSelectTrack(i)} style={{ fontSize: 12, letterSpacing: '0.1em', color: on ? RED : INK, cursor: 'pointer', maxWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}{t.name && t.name !== String(i + 1) ? ' · ' + t.name : ''}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Knob value={eq.hi} min={-12} max={12} onChange={v => p.onTrackChange?.(i, { eq: { ...eq, hi: v } })} label="HI" fmt={dB} />
          <Knob value={eq.mid} min={-12} max={12} onChange={v => p.onTrackChange?.(i, { eq: { ...eq, mid: v } })} label="MID" fmt={dB} />
          <Knob value={eq.lo} min={-12} max={12} onChange={v => p.onTrackChange?.(i, { eq: { ...eq, lo: v } })} label="LO" fmt={dB} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Knob value={sd.rev} min={0} max={1} onChange={v => p.onTrackChange?.(i, { sends: { ...sd, rev: v } })} label="REV" />
          <Knob value={sd.dly} min={0} max={1} onChange={v => p.onTrackChange?.(i, { sends: { ...sd, dly: v } })} label="DLY" />
        </div>
        <Knob value={t.pan ?? 0} min={-1} max={1} onChange={v => p.onTrackChange?.(i, { pan: v })} label="PAN" fmt={v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100)} />
        <Fader value={t.level ?? 0} min={-48} max={12} onChange={v => p.onTrackChange?.(i, { level: v })} h={130} />
        <div style={{ display: 'flex', gap: 6 }}>
          <span onClick={() => p.onTrackChange?.(i, { mute: !t.mute })} style={{ width: 24, height: 24, borderRadius: 12, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid ' + (t.mute ? '#ffd27a' : 'rgba(255,255,255,0.35)'), background: t.mute ? 'rgba(255,210,122,0.35)' : 'transparent', color: t.mute ? '#ffd27a' : INK2 }}>M</span>
          <span onClick={() => p.onTrackChange?.(i, { solo: !t.solo })} style={{ width: 24, height: 24, borderRadius: 12, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid ' + (t.solo ? '#a6ffd8' : 'rgba(255,255,255,0.35)'), background: t.solo ? 'rgba(166,255,216,0.3)' : 'transparent', color: t.solo ? '#a6ffd8' : INK2 }}>S</span>
        </div>
      </div></div>; })}
    <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.25)', margin: '0 6px' }} />
    <div style={{ ...strip, minWidth: 128 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.16em', color: INK }}>REVERB</div>
      <Knob value={fx.rev.size} min={0} max={1} onChange={v => p.onFx?.({ ...fx, rev: { ...fx.rev, size: v } })} label="SIZE" />
      <Knob value={fx.rev.damp} min={0} max={1} onChange={v => p.onFx?.({ ...fx, rev: { ...fx.rev, damp: v } })} label="DAMP" />
      <Fader value={20 * Math.log10(Math.max(0.001, fx.rev.mix))} min={-48} max={6} onChange={v => p.onFx?.({ ...fx, rev: { ...fx.rev, mix: Math.pow(10, v / 20) } })} label="RETURN" h={110} />
    </div>
    <div style={{ ...strip, minWidth: 128 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.16em', color: INK }}>DELAY</div>
      <Knob value={fx.dly.beats} min={0.125} max={2} onChange={v => p.onFx?.({ ...fx, dly: { ...fx.dly, beats: Math.round(v * 8) / 8 } })} label="BEATS" fmt={v => v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} />
      <Knob value={fx.dly.feedback} min={0} max={0.92} onChange={v => p.onFx?.({ ...fx, dly: { ...fx.dly, feedback: v } })} label="FEEDBACK" />
      <Fader value={20 * Math.log10(Math.max(0.001, fx.dly.mix))} min={-48} max={6} onChange={v => p.onFx?.({ ...fx, dly: { ...fx.dly, mix: Math.pow(10, v / 20) } })} label="RETURN" h={110} />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <Light get={() => p.meters?.()?.master ?? null} hue={30} w={190} />
    <div style={{ ...strip, minWidth: 128, borderColor: '#fff' }}>
      <div style={{ fontSize: 12, letterSpacing: '0.16em', color: INK }}>MASTER</div>
      <span onClick={() => p.onLimiter?.(!(p.limiter ?? true))} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 10, letterSpacing: '0.12em', cursor: 'pointer', border: '1px solid ' + ((p.limiter ?? true) ? '#fff' : 'rgba(255,255,255,0.35)'), background: (p.limiter ?? true) ? 'rgba(255,255,255,0.2)' : 'transparent' }}>LIMITER</span>
      <Fader value={p.master ?? 0} min={-48} max={12} onChange={v => p.onMaster?.(v)} h={196} />
    </div></div>
  </div>;
}

// the voice's colour by track: cool pad, magenta bass, warm vocal, then round again
const HUES = [215, 320, 24, 160, 275, 45, 195, 340, 100, 230, 10, 300, 130, 250, 60, 180];
function Wave({ peaks, hue, w, h, repeats, tick }: { peaks: Float32Array | null; hue: number; w: number; h: number; repeats: number; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const W = Math.max(1, Math.floor(w)), H = Math.max(1, Math.floor(h));
    c.width = W; c.height = H; const g = c.getContext('2d'); if (!g) return; g.clearRect(0, 0, W, H);
    if (!peaks) return;
    const span = W / Math.max(1, repeats);
    for (let x = 0; x < W; x += 2) {
      const u = ((x % span) / span) * (peaks.length - 1); const i0 = Math.floor(u); const a = Math.max(peaks[i0], peaks[Math.min(peaks.length - 1, i0 + 1)]);
      const hh = Math.max(1, a * H * 0.42);
      g.fillStyle = `hsla(${hue}, 95%, ${70 + a * 25}%, ${0.55 + a * 0.45})`;
      g.fillRect(x, H * 0.5 - hh, 1.4, hh * 2);
    }
  }, [peaks, hue, w, h, repeats, tick]);
  return <canvas ref={ref} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
