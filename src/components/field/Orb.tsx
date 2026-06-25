'use client';

import { useEffect, useRef } from 'react';

export type OrbColor = { core: string; mid: string; glow: string; };

export const ORB_COLORS: Record<string, OrbColor> = {
  bubbles:  { core: '#f3e6ff', mid: '#c98cff', glow: '#8a3df5' },
  tunnel:   { core: '#aac4ff', mid: '#5b8cff', glow: '#2a4fa0' },
  shimmer:  { core: '#a6fff2', mid: '#3df5e0', glow: '#0f6e72' },
  warp:     { core: '#e0b0ff', mid: '#a060e0', glow: '#4a2080' },
  haze:     { core: '#bfe0ff', mid: '#6aa8e0', glow: '#2a5580' },
  strum:    { core: '#ffd9a6', mid: '#e0a050', glow: '#805020' },
  glitch:   { core: '#ffb0d0', mid: '#e05a90', glow: '#802040' },
  swarm:    { core: '#a6ffd0', mid: '#3dc888', glow: '#0f6040' },
};

type OrbProps = {
  id: string; label: string; colorKey: keyof typeof ORB_COLORS;
  x: number; y: number; size?: number; volume?: number;
  selected?: boolean; onSelect?: (id: string) => void;
};

const BOX = 600; // fixed canvas per orb; orb scales within it so travel is smooth

export default function Orb({
  id, label, colorKey, x, y,
  size = 130, volume = 0.7, selected = false, onSelect,
}: OrbProps) {
  const c = ORB_COLORS[colorKey];
  const waveRef = useRef<SVGPathElement>(null);
  const phase = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      phase.current += 0.018;
      const p = phase.current;
      const w = 44; const a = 7;
      const path = `M ${-w} 0 Q ${-w/2} ${Math.sin(p)*a} 0 0 T ${w} ${Math.sin(p+1.2)*a}`;
      if (waveRef.current) waveRef.current.setAttribute('d', path);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const r = size;            // orb radius within the fixed box
  const haloR = r * 0.62;
  const haloW = 14 + volume * 22;
  const cx = BOX / 2;

  return (
    <div
      onClick={() => onSelect?.(id)}
      style={{
        position: 'absolute',
        left: x - BOX / 2, top: y - BOX / 2, width: BOX, height: BOX,
        cursor: 'pointer',
        transition: 'left 0.9s cubic-bezier(0.34,0.01,0.2,1), top 0.9s cubic-bezier(0.34,0.01,0.2,1), opacity 0.8s ease',
        opacity: selected ? 1 : 0.8,
        zIndex: selected ? 10 : 1,
      }}
    >
      <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id={`fill-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={c.core} stopOpacity={selected ? 1 : 0.8} />
            <stop offset="46%" stopColor={c.mid} stopOpacity={selected ? 0.68 : 0.46} />
            <stop offset="100%" stopColor={c.glow} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`star-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id={`halo-${id}`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" /></filter>
          <filter id={`soft-${id}`} x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>
        <g transform={`translate(${cx} ${cx})`} style={{ transition: 'all 0.9s cubic-bezier(0.34,0.01,0.2,1)' }}>
          <ellipse cx="0" cy="0" rx={r} ry={r} fill={`url(#fill-${id})`}
            style={{ transition: 'all 0.9s cubic-bezier(0.34,0.01,0.2,1)' }} />
          <circle cx="0" cy="0" r={haloR} fill="none" stroke={c.mid}
            strokeWidth={haloW} opacity={selected ? 0.3 : 0.18} filter={`url(#halo-${id})`}
            style={{ transition: 'all 0.9s cubic-bezier(0.34,0.01,0.2,1)' }} />
          <path ref={waveRef} d="M -44 0 Q -22 0 0 0 T 44 0"
            fill="none" stroke={c.core} strokeWidth="1.5" opacity="0.6" />
          <circle cx="0" cy="0" r={selected ? 18 : 11} fill={`url(#star-${id})`} filter={`url(#soft-${id})`}
            style={{ transition: 'all 0.9s ease' }} />
          <circle cx="0" cy="0" r={selected ? 7 : 4} fill="#fff" style={{ transition: 'all 0.9s ease' }} />
        </g>
      </svg>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: cx + haloR - 6,
        textAlign: 'center', color: c.core, fontSize: 15, fontWeight: 500,
        letterSpacing: '0.04em', opacity: selected ? 0.95 : 0.66, pointerEvents: 'none',
        transition: 'all 0.9s ease',
      }}>{label}</div>
    </div>
  );
}
