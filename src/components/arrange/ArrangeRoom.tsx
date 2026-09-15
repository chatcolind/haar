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
  onBlockChange: (id: string, patch: { startBar?: number; lenBars?: number; gain?: number; fadeIn?: number; fadeOut?: number; name?: string }, track?: number) => void;
  onNormalise?: (id: string) => void;
  onTrackChange?: (i: number, patch: { mute?: boolean; solo?: boolean; name?: string }) => void;
  onOpenInstrument?: (id: string) => void;
  onSaveSong?: () => void; onOpenSong?: () => void;
  songName?: string;
  onCopyBlock: (id: string, startBar: number, track: number) => void;
  onUndo: () => void;
  onSplitBlock: (id: string, atBar: number) => void;
  onClearTrack: (i: number) => void;
};

const FOG = '#9fb4c8', RED = '#ff5a5a', HEAD_W = 120, ROW_H = 68, BARS = 64;
const INK = '#2a1433', INK2 = 'rgba(42,20,51,0.72)', INK3 = 'rgba(42,20,51,0.42)';   // dark ink on the Skye sky
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'transparent', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, "Helvetica Neue", Inter, sans-serif', color: INK }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.5)', background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.3))', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <span style={{ fontSize: 15, letterSpacing: '0.34em', color: INK2, marginRight: 26 }}>ARRANGE{p.songName ? <span style={{ letterSpacing: '0.08em', color: INK, marginLeft: 14 }}>· {p.songName}</span> : null}</span>
        <span onClick={p.onNew} style={{ ...verb(), marginBottom: 0, borderColor: 'rgba(255,255,255,0.45)', color: INK }}>NEW SONG</span>
        <span onClick={() => p.onUndo?.()} title="undo the last change  (Cmd+Z)" style={{ ...verb(), marginBottom: 0, borderColor: 'rgba(255,255,255,0.45)', color: INK }}>↶ UNDO</span>
        <span onClick={() => p.onSaveSong?.()} title="save the song - the arrangement and every instrument in the rack" style={{ ...verb(), marginBottom: 0, borderColor: 'rgba(255,255,255,0.45)', color: INK }}>SAVE SONG</span>
        <span onClick={() => p.onOpenSong?.()} title="open a song from Haar/Songs - the arrangement and its rack" style={{ ...verb(), marginBottom: 0, borderColor: 'rgba(255,255,255,0.45)', color: INK }}>OPEN SONG</span>
        <div style={{ flex: 1 }} />
        <div onClick={p.onClose} title="back to the instrument" style={{ width: 36, height: 36, borderRadius: '50%', border: '0.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15 }}>×</div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `${HEAD_W}px minmax(0,1fr) 220px`, minHeight: 0 }}>
        <div style={{ borderRight: '1px solid rgba(255,255,255,0.5)', overflowY: 'auto', background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.3))', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
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

        <div style={{ position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={() => p.onSelectBlock(null)}>
          <div ref={rulerRef} onPointerDown={onRulerDown} onPointerMove={onRulerMove} onPointerUp={onRulerUp} onClick={(e) => e.stopPropagation()} title="click: place the head · drag: set the loop range" style={{ height: 26, borderBottom: '0.5px solid rgba(255,255,255,0.08)', position: 'relative', cursor: 'col-resize', userSelect: 'none' }}>
            {band(0, 0)}
            {Array.from({ length: BARS }, (_, i) => i).map(bn => (
              <span key={bn} style={{ position: 'absolute', left: x(bn), top: 6, fontSize: 9, padding: '0 4px', pointerEvents: 'none', color: bn % 4 === 0 ? INK2 : INK3 }}>{bn % 4 === 0 ? bn + 1 : '·'}</span>
            ))}
          </div>
          {p.tracks.map((t, ti) => (
            <div key={t.id} style={{ height: ROW_H, boxSizing: 'border-box', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'relative', backgroundColor: ti === p.selTrack ? 'rgba(255,90,90,0.03)' : 'transparent', backgroundImage: `repeating-linear-gradient(to right, rgba(42,20,51,0.22) 0 1px, transparent 1px ${p.zoom * 4}px), repeating-linear-gradient(to right, rgba(42,20,51,0.08) 0 1px, transparent 1px ${p.zoom}px)`, backgroundPositionX: `${-p.scroll * p.zoom}px` }}>
              {t.blocks.map(b => {
                const on = b.id === p.selBlock, performed = !!b.perf, rep = b.srcBars && b.lenBars > b.srcBars ? Math.round(b.lenBars / b.srcBars) : 0;
                return (
                  <div key={b.id} onPointerDown={(e) => onTileDown(e, b, ti)} onPointerMove={onTileMove} onPointerUp={onTileUp} title={b.name + ' · drag to move · right edge to extend · alt-drag to copy'}
                    style={{ position: 'absolute', left: x(b.startBar), width: b.lenBars * p.zoom - 2, top: 8, height: ROW_H - 16, boxSizing: 'border-box', borderRadius: 6, cursor: tool === 'cut' ? 'col-resize' : tool === 'erase' ? 'not-allowed' : 'grab', overflow: 'hidden', padding: '6px 8px', fontSize: 10, letterSpacing: '0.08em', userSelect: 'none', touchAction: 'none',
                      opacity: gest && gest.id === b.id && gest.moved && gest.mode === 'move' && !gest.copy ? 0.35 : 1,
                      background: performed ? (on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.32)') : (on ? 'rgba(42,20,51,0.35)' : 'rgba(42,20,51,0.18)'),
                      border: on ? `1.5px solid ${INK}` : `1px solid ${performed ? 'rgba(255,255,255,0.7)' : 'rgba(42,20,51,0.35)'}`, color: INK, boxShadow: '0 10px 24px -10px rgba(42,20,51,0.5)' }}>
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
          <div style={{ position: 'absolute', left: x(p.playhead), top: 0, bottom: 0, width: 1.5, background: p.rec === 'rolling' ? RED : FOG, pointerEvents: 'none' }} />
        </div>

        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.5)', padding: 16, fontSize: 11, background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.3))', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
          {sel ? (
            <>
              <div title="tap to rename" onClick={() => { const n = window.prompt('name this take', sel.name); if (n && n.trim()) p.onBlockChange(sel.id, { name: n.trim() }); }} style={{ fontSize: 13, letterSpacing: '0.12em', marginBottom: 12, cursor: 'text', borderBottom: '1px dotted rgba(255,255,255,0.4)', display: 'inline-block' }}>{sel.name}</div>
              <div style={lbl}>START</div><div style={{ marginBottom: 8 }}>bar {sel.startBar + 1}</div>
              <div style={lbl}>LENGTH</div><div style={{ marginBottom: 8 }}>{sel.lenBars} bars{sel.srcBars && sel.srcBars !== sel.lenBars ? ' · source ' + sel.srcBars : ''}</div>
              <div style={lbl}>BODY</div><div style={{ marginBottom: 8 }}>{sel.perf ? 'render + performance' : 'audio only'}</div>
              {sel.instrument && <><div style={lbl}>INSTRUMENT</div><div style={{ marginBottom: 14, wordBreak: 'break-all', color: 'rgba(255,255,255,0.7)' }}>{sel.instrument.replace(/\.json$/, '')}</div></>}
              {sel.instrument && <div onClick={() => p.onOpenInstrument?.(sel.id)} style={verb(false)} title="reload the instrument that made this take into Build - the current one saves first">OPEN INSTRUMENT</div>}
              <div onClick={() => p.onDeleteBlock(sel.id)} style={verb(true, true)}>DELETE</div>
            </>
          ) : (
            <div style={{ color: INK3, lineHeight: 1.8 }}>tap a track to make it the record target<br />tap a block to see it here<br />tap the ruler to place the head</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '10px 28px', borderTop: '1px solid rgba(255,255,255,0.5)', fontSize: 11, color: INK2, background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.3))', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <span><span onClick={() => p.onZoom(-4)} style={{ cursor: 'pointer', padding: '0 8px' }}>−</span>zoom<span onClick={() => p.onZoom(4)} style={{ cursor: 'pointer', padding: '0 8px' }}>+</span></span>
        <span><span onClick={() => p.onScroll(-4)} style={{ cursor: 'pointer', padding: '0 8px' }}>◀</span>scroll<span onClick={() => p.onScroll(4)} style={{ cursor: 'pointer', padding: '0 8px' }}>▶</span></span>
        <span>snap: bar</span>
        <span style={{ display: 'flex', gap: 6 }}>{([['select', '1 · select'], ['cut', '3 · scissors'], ['erase', '5 · eraser']] as const).map(([k, l]) => <span key={k} onClick={() => setTool(k)} style={{ border: `0.5px solid ${tool === k ? '#7af5c8' : 'rgba(255,255,255,0.25)'}`, color: tool === k ? '#7af5c8' : 'rgba(255,255,255,0.5)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>{l}</span>)}</span>
        <div style={{ flex: 1 }} />
        <span>arrange · <span style={{ color: 'rgba(255,255,255,0.25)' }}>mix</span></span>
      </div>
    </div>
  );
}
