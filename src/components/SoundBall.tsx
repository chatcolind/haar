'use client';

import { useEffect, useRef } from 'react';

export const ACCENT_COLORS: Record<string, string> = {
  Reverb:'#1B5CE8', Tape:'#E8B800', Delay:'#20B8C8', Chorus:'#9020C0',
  Filter:'#20C060', Pitch:'#D63020', Modulate:'#D46090', Grain:'#808040',
  Fuzz:'#C03020', Crush:'#606060', Shimmer:'#80C0E0', Warp:'#8040C0',
  Wobble:'#40A060', Pulse:'#E06020', Space:'#2080C0',
};

// Fixed palette — dark (closed/dry) to bright (open/wet)
const PALETTE = [
  [20, 30, 60],    // dark blue — closed, dry
  [40, 80, 160],   // mid blue
  [80, 140, 220],  // bright blue — open
  [180, 220, 255], // near white — fully open/wet
];

interface SoundBallProps {
  dotX: number;       // 0-1, X = filter cutoff
  dotY: number;       // 0-1, Y = wet/dry (0=dry, 1=wet)
  onDotChange: (x: number, y: number) => void;
  onDotRelease?: (x: number, y: number) => void;
  onReset: () => void;
  dimmed?: boolean;
}

export default function SoundBall({
  dotX, dotY, onDotChange, onDotRelease, onReset, dimmed = false,
}: SoundBallProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const dragging   = useRef(false);
  const W = 200, H = 200, R = 96, CX = W/2, CY = H/2;

  // Filter cutoff label
  const freqLabel = () => {
    const freq = Math.pow(10, dotX * (Math.log10(18000) - Math.log10(20)) + Math.log10(20));
    return freq >= 1000 ? `${(freq/1000).toFixed(1)}k` : `${Math.round(freq)}`;
  };

  const wetLabel = () => `${Math.round(dotY * 100)}%`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Draw gradient sphere
    const img = ctx.createImageData(W, H);
    const d   = img.data;

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const dx = px - CX, dy = py - CY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > R) continue;

        // X maps across sphere (cutoff), Y maps up/down (wet)
        const nx = px / W; // 0=left(dark/closed), 1=right(bright/open)
        const ny = 1 - (py / H); // 0=bottom(dry), 1=top(wet)

        // Blend palette based on position
        const xBlend = nx;
        const yBlend = ny;
        const overall = (xBlend + yBlend) / 2;

        // Pick colour from palette
        const pidx = overall * (PALETTE.length - 1);
        const pi   = Math.floor(pidx);
        const pt   = pidx - pi;
        const ca   = PALETTE[Math.min(pi, PALETTE.length-1)];
        const cb   = PALETTE[Math.min(pi+1, PALETTE.length-1)];

        // Edge darkening for sphere effect
        const edgeFade = 1 - Math.pow(dist / R, 2) * 0.4;

        const r = Math.round((ca[0] + (cb[0]-ca[0])*pt) * edgeFade);
        const g = Math.round((ca[1] + (cb[1]-ca[1])*pt) * edgeFade);
        const b = Math.round((ca[2] + (cb[2]-ca[2])*pt) * edgeFade);

        const idx = (py * W + px) * 4;
        d[idx]=r; d[idx+1]=g; d[idx+2]=b; d[idx+3]=255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Rim
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(100,160,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Axis lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2,4]);
    ctx.beginPath(); ctx.moveTo(CX, CY-R); ctx.lineTo(CX, CY+R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX-R, CY); ctx.lineTo(CX+R, CY); ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair to dot
    const px2 = CX + (dotX - 0.5) * R * 1.85;
    const py2 = CY + (0.5 - dotY) * R * 1.85; // Y inverted — up=wet

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(px2, CY-R+2); ctx.lineTo(px2, CY+R-2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX-R+2, py2); ctx.lineTo(CX+R-2, py2); ctx.stroke();
    ctx.setLineDash([]);

    // Dot glow
    const gradient = ctx.createRadialGradient(px2, py2, 0, px2, py2, 12);
    gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(px2, py2, 12, 0, Math.PI*2);
    ctx.fillStyle = gradient; ctx.fill();

    // Dot
    ctx.beginPath(); ctx.arc(px2, py2, 7, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px2, py2, 5, 0, Math.PI*2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(px2, py2, 2.5, 0, Math.PI*2);
    ctx.fillStyle = '#1B5CE8'; ctx.fill();

  }, [dotX, dotY]);

  const getPos = (e: React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect  = canvas.getBoundingClientRect();
    const scaleX = W / rect.width, scaleY = H / rect.height;
    const lx = (e.clientX - rect.left) * scaleX;
    const ly = (e.clientY - rect.top) * scaleY;
    const dx = lx - CX, dy = ly - CY;
    if (Math.sqrt(dx*dx + dy*dy) > R) return null;
    return {
      x: Math.min(1, Math.max(0, lx / W)),
      y: Math.min(1, Math.max(0, 1 - ly / H)), // invert Y — up=wet
    };
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', opacity:dimmed?0.4:1, transition:'opacity 0.3s' }}>

      {/* Axis labels top */}
      <div style={{ display:'flex', justifyContent:'space-between', width:'200px' }}>
        <span style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px' }}>DRY</span>
        <span style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px' }}>WET {wetLabel()}</span>
      </div>

      <div style={{ position:'relative' }}>
        {/* Left axis label */}
        <span style={{ position:'absolute', left:'-36px', top:'50%', transform:'translateY(-50%) rotate(-90deg)', fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px', whiteSpace:'nowrap' }}>DARK</span>

        <canvas
          ref={canvasRef}
          width={W} height={H}
          style={{ cursor:'crosshair', borderRadius:'50%', display:'block', width:'200px', height:'200px' }}
          onMouseDown={e => {
            const p = getPos(e);
            if (!p) return;
            dragging.current = true;
            onDotChange(p.x, p.y);
          }}
          onMouseMove={e => {
            if (!dragging.current) return;
            const p = getPos(e);
            if (p) onDotChange(p.x, p.y);
          }}
          onMouseUp={e => {
            if (!dragging.current) return;
            dragging.current = false;
            const p = getPos(e);
            if (p) onDotRelease?.(p.x, p.y);
          }}
          onMouseLeave={() => { dragging.current = false; }}
        />

        {/* Right axis label */}
        <span style={{ position:'absolute', right:'-40px', top:'50%', transform:'translateY(-50%) rotate(90deg)', fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px', whiteSpace:'nowrap' }}>BRIGHT</span>
      </div>

      {/* Bottom axis label + freq readout */}
      <div style={{ display:'flex', justifyContent:'space-between', width:'200px' }}>
        <span style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px' }}>20Hz</span>
        <span style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'#1B5CE8', letterSpacing:'1px' }}>{freqLabel()}Hz</span>
        <span style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px' }}>18kHz</span>
      </div>

      {/* Reset */}
      <button onClick={onReset} style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', letterSpacing:'1px', textTransform:'uppercase', padding:'3px 10px', background:'transparent', border:'1px solid var(--border)', color:'var(--light)', cursor:'pointer' }}>
        ↺ Reset
      </button>
    </div>
  );
}
