'use client';

import { useEffect, useRef } from 'react';

export const PALETTES: Record<string, number[][]> = {
  Reverb:   [[20,80,200],[100,40,180],[180,40,160],[200,100,200]],
  Tape:     [[180,120,20],[160,80,10],[200,160,40],[140,60,10]],
  Delay:    [[20,160,180],[10,120,160],[40,200,180],[20,80,140]],
  Chorus:   [[140,20,180],[100,20,200],[180,80,200],[60,10,160]],
  Filter:   [[20,180,80],[10,140,60],[40,200,120],[20,100,60]],
  Pitch:    [[200,40,40],[180,20,80],[220,80,60],[160,20,40]],
  Modulate: [[212,96,144],[180,60,120],[240,120,160],[160,40,100]],
  Grain:    [[100,100,60],[80,80,40],[120,120,80],[60,60,20]],
  Fuzz:     [[180,40,20],[160,20,10],[220,60,40],[140,10,10]],
  Crush:    [[80,80,80],[60,60,60],[100,100,100],[40,40,40]],
  Shimmer:  [[100,190,220],[60,160,210],[140,210,230],[80,180,220]],
  Warp:     [[110,40,190],[80,20,180],[140,60,200],[60,10,160]],
  Wobble:   [[40,160,80],[20,140,60],[60,180,100],[20,120,60]],
  Pulse:    [[220,90,20],[200,60,10],[240,120,40],[180,40,10]],
  Space:    [[20,110,200],[10,80,180],[40,140,220],[10,60,160]],
};

export const ACCENT_COLORS: Record<string, string> = {
  Reverb:   '#1B5CE8',
  Tape:     '#E8B800',
  Delay:    '#20B8C8',
  Chorus:   '#9020C0',
  Filter:   '#20C060',
  Pitch:    '#D63020',
  Modulate: '#D46090',
  Grain:    '#808040',
  Fuzz:     '#C03020',
  Crush:    '#606060',
  Shimmer:  '#80C0E0',
  Warp:     '#8040C0',
  Wobble:   '#40A060',
  Pulse:    '#E06020',
  Space:    '#2080C0',
};

interface SoundBallProps {
  activeEffect: string;
  dotX: number;
  dotY: number;
  onDotChange: (x: number, y: number) => void;
  onReset: () => void;
  level: number;
  onLevelChange: (v: number) => void;
  dimmed?: boolean;
}

export default function SoundBall({
  activeEffect, dotX, dotY, onDotChange, onReset,
  level, onLevelChange, dimmed = false,
}: SoundBallProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const levelDragging = useRef(false);
  const W = 200, H = 200, R = 96, CX = W / 2, CY = H / 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    const pal = PALETTES[activeEffect] || PALETTES.Reverb;
    const img = ctx.createImageData(W, H);
    const d = img.data;

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const dx = px - CX, dy = py - CY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > R) continue;
        const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
        const rad = dist / R;
        let ca: number[], cb: number[];
        if (angle < 0.5) {
          const t = angle * 2;
          ca = pal[0].map((v, i) => v + (pal[1][i] - v) * t);
          cb = pal[3].map((v, i) => v + (pal[2][i] - v) * t);
        } else {
          const t = (angle - 0.5) * 2;
          ca = pal[1].map((v, i) => v + (pal[2][i] - v) * t);
          cb = pal[0].map((v, i) => v + (pal[3][i] - v) * t);
        }
        const rgb = ca.map((v, i) => {
          const s = v + (cb[i] - v) * rad;
          return Math.round(s * rad + 235 * (1 - rad));
        });
        const idx = (py * W + px) * 4;
        d[idx] = rgb[0]; d[idx + 1] = rgb[1]; d[idx + 2] = rgb[2]; d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Rim
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#D46090'; ctx.lineWidth = 1.5; ctx.stroke();

    // Centre cross — home indicator
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(CX - 6, CY); ctx.lineTo(CX + 6, CY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX, CY - 6); ctx.lineTo(CX, CY + 6); ctx.stroke();

    // Crosshair from dot
    const px2 = CX + (dotX - 0.5) * R * 1.7;
    const py2 = CY + (dotY - 0.5) * R * 1.7;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(px2, CY - R + 2); ctx.lineTo(px2, CY + R - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX - R + 2, py2); ctx.lineTo(CX + R - 2, py2); ctx.stroke();
    ctx.setLineDash([]);

    // Dot
    ctx.beginPath(); ctx.arc(px2, py2, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px2, py2, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1A1814'; ctx.fill();
    ctx.beginPath(); ctx.arc(px2, py2, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#E8E2D6'; ctx.fill();

  }, [activeEffect, dotX, dotY]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width, scaleY = H / rect.height;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const lx = (clientX - rect.left) * scaleX;
    const ly = (clientY - rect.top) * scaleY;
    const dx = lx - CX, dy = ly - CY;
    if (Math.sqrt(dx * dx + dy * dy) > R) return null;
    return { x: Math.min(1, Math.max(0, lx / W)), y: Math.min(1, Math.max(0, ly / H)) };
  };

  const handleLevelDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    onLevelChange(pct);
  };

  const accentColor = ACCENT_COLORS[activeEffect] || 'var(--dark)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '8px', opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.3s',
    }}>
      {/* Effect name + reset on same row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '200px' }}>
        <div style={{
          fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
          fontSize: '16px', letterSpacing: '4px',
          color: accentColor, textTransform: 'uppercase',
        }}>{activeEffect}</div>
        <button
          onClick={onReset}
          title="Reset dot to centre"
          style={{
            fontFamily: 'Space Mono, monospace', fontSize: '10px',
            letterSpacing: '1px', textTransform: 'uppercase',
            padding: '3px 8px',
            background: 'transparent',
            border: `1px solid var(--border)`,
            color: 'var(--light)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          ↺ Reset
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={W} height={H}
        style={{ cursor: 'crosshair', borderRadius: '50%', display: 'block', width: '200px', height: '200px' }}
        onMouseDown={e => {
          const p = getPos(e);
          if (!p) return;
          draggingRef.current = true;
          onDotChange(p.x, p.y);
        }}
        onMouseMove={e => {
          if (!draggingRef.current) return;
          const p = getPos(e);
          if (p) onDotChange(p.x, p.y);
        }}
        onMouseUp={() => { draggingRef.current = false; }}
        onMouseLeave={() => { draggingRef.current = false; }}
      />

      <div style={{
        fontFamily: 'Space Mono, monospace', fontSize: '11px',
        color: 'var(--light)', letterSpacing: '1px', textTransform: 'uppercase',
      }}>Move dot · listen · find your place</div>

      {/* Level scrubber */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '200px' }}>
        <span style={{
          fontFamily: 'Space Mono, monospace', fontSize: '11px',
          color: 'var(--pink)', letterSpacing: '2px', textTransform: 'uppercase',
        }}>Level</span>
        <div
          onMouseDown={e => { levelDragging.current = true; handleLevelDrag(e); }}
          onMouseMove={e => { if (levelDragging.current) handleLevelDrag(e); }}
          onMouseUp={() => { levelDragging.current = false; }}
          onMouseLeave={() => { levelDragging.current = false; }}
          style={{ flex: 1, height: '3px', background: 'var(--cream-dark)', position: 'relative', cursor: 'pointer' }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${level}%`, background: 'var(--pink)' }} />
          <div style={{
            position: 'absolute', top: '-4px', left: `${level}%`, transform: 'translateX(-50%)',
            width: '11px', height: '11px', borderRadius: '50%',
            background: 'var(--cream-light)', border: '1.5px solid var(--pink)',
          }} />
        </div>
        <span style={{
          fontFamily: 'Space Mono, monospace', fontSize: '11px',
          color: 'var(--pink)', minWidth: '20px',
        }}>{level}</span>
      </div>
    </div>
  );
}
