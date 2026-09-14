'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HORIZON } from '../sky/Sky';

export type OrbColor = { core: string; mid: string; glow: string; };

export const ORB_COLORS: Record<string, OrbColor> = {
  clean:    { core: '#ffffff', mid: '#c9cdd4', glow: '#6b7280' },   // the sampler station's white-silver - dry as a chosen voice
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
  selected?: boolean;
  xy?: { x: number; y: number };
  onSelect?: (id: string) => void;
  onXY?: (x: number, y: number) => void;
  hideLabel?: boolean;
  subLabel?: string;   // constellation name (source identity)
  tint?: string;       // per-constellation tint colour
  glowScale?: number;  // 1 = full bloom (forward/close); <1 tightens the halo (distant field view)
  energy?: number;     // 0..1 - the sound's energy right now; the front pulses with it (level until live loudness is wired)
  hideWave?: boolean;  // suppress the wave squiggle (wordless celestial field view)
};

const BOX = 600;
const PLANET = false;  // retired 14 Sept 2026 - orbs are FRONTS now (docs/ARRANGE.md, THE REEL). kept for the seam.
const FRONT = true;    // a voice is a mass of weather: low fronts, high fronts, a patch of sun. No outline anywhere.
const TRAVEL = 0.42;

export default function Orb({
  id, label, colorKey, x, y,
  size = 130, volume = 0.7, selected = false,
  xy = { x: 0.5, y: 0.5 },
  energy,
  onSelect, onXY, hideLabel = false, subLabel, tint, glowScale = 1, hideWave = false,
}: OrbProps) {
  const c0 = ORB_COLORS[colorKey];
  const c = FRONT && tint ? { core: tint, mid: tint, glow: c0.glow } : c0;   // a front wears its layer's tint - it matches its moon
  const waveRef = useRef<SVGPathElement>(null);
  const phase = useRef(0);
  const dragging = useRef(false);
  const [hover, setHover] = useState(false);
  const barsRef = useRef<(SVGRectElement | null)[]>([]);
  const reflRef = useRef<(SVGRectElement | null)[]>([]);
  const enRef = useRef(0.7);
  const NB = 40;
  const skyH = Math.max(size * 1.7, 240);                              // the tallest bar, at full energy
  let frontSeed = 7; for (let q = 0; q < id.length; q++) frontSeed = (frontSeed * 31 + id.charCodeAt(q)) >>> 0;
  // the front lives ON the horizon, whatever the field says: measure where this wrapper really is on screen
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dy, setDy] = useState(0);
  useLayoutEffect(() => {
    if (!FRONT) return;
    const place = () => { const el = wrapRef.current; if (!el) return; const rc = el.getBoundingClientRect(); setDy(window.innerHeight * HORIZON - (rc.top + cx)); };
    place();
    const t = window.setTimeout(place, 950);            // once more after the field's own placement transition settles
    window.addEventListener('resize', place);
    return () => { window.clearTimeout(t); window.removeEventListener('resize', place); };
  }, [x, y]);
  const en = Math.max(0, Math.min(1, energy ?? volume));
  enRef.current = en;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      phase.current += 0.018;
      const p = phase.current; const w = 44; const a = 7;
      const path = `M ${-w} 0 Q ${-w/2} ${Math.sin(p)*a} 0 0 T ${w} ${Math.sin(p+1.2)*a}`;
      if (waveRef.current) waveRef.current.setAttribute('d', path);
      if (FRONT && barsRef.current.length) {
        const e = enRef.current; const lvl = 0.25 + 0.75 * e;
        for (let i = 0; i < NB; i++) {
          const b = barsRef.current[i]; if (!b) continue;
          const u = i / (NB - 1);
          // the skyline: a few soft hills, seeded per front, so every voice has its own profile
          const hill = 0.9 * Math.exp(-Math.pow((u - 0.5) / 0.16, 2)) + 0.3 * Math.exp(-Math.pow((u - (0.2 + (frontSeed % 7) / 20)) / 0.09, 2)) + 0.25 * Math.exp(-Math.pow((u - (0.7 + (frontSeed % 5) / 25)) / 0.1, 2));
          // the sound moving through it: two slow waves and a fast shimmer
          const mv = 0.6 + 0.28 * Math.sin(p * 1.1 + i * 0.35 + frontSeed) + 0.2 * Math.sin(p * 2.3 - i * 0.21) * Math.sin(p * 0.5 + i * 0.07);
          const h = Math.max(0.6, hill * mv * lvl * skyH);
          b.setAttribute('y', String(-h)); b.setAttribute('height', String(h));
          const rf = reflRef.current[i]; if (rf) { rf.setAttribute('height', String(h * 0.9)); }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const r = size;
  const haloR = r * 0.62;
  const haloW = 14 + volume * 22;
  const cx = BOX / 2;
  const reach = r * TRAVEL;
  const hitR = r * 0.7; // clickable disc ~ visible body, NOT the full 600px box

  const coreX = selected ? (xy.x - 0.5) * 2 * reach : 0;
  const coreY = selected ? -(xy.y - 0.5) * 2 * reach : 0;

  function corePointerDown(e: React.PointerEvent) {
    if (!selected) return;
    e.stopPropagation();
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function corePointerMove(e: React.PointerEvent) {
    if (!dragging.current || !selected) return;
    e.stopPropagation();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const localX = (e.clientX - rect.left) / rect.width * BOX - cx;
    const localY = (e.clientY - rect.top) / rect.height * BOX - cx;
    const nx = Math.min(1, Math.max(0, 0.5 + localX / reach / 2));
    const ny = Math.min(1, Math.max(0, 0.5 - localY / reach / 2));
    onXY?.(nx, ny);
  }
  function corePointerUp(e: React.PointerEvent) { dragging.current = false; e.stopPropagation(); }

  return (
    <div ref={wrapRef}
      style={{
        position: 'absolute',
        left: x - BOX / 2, top: y - BOX / 2, width: BOX, height: BOX,
        pointerEvents: 'none',              // wrapper does NOT catch clicks
        transition: FRONT ? 'opacity 0.8s ease' : 'left 0.9s cubic-bezier(0.34,0.01,0.2,1), top 0.9s cubic-bezier(0.34,0.01,0.2,1), opacity 0.8s ease',
        opacity: selected ? 1 : 0.8,
        zIndex: selected ? 10 : 1,
      }}
    >
      <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} style={{ overflow: 'visible' }}>
        <defs>
          {PLANET ? (
            <radialGradient id={`fill-${id}`} className="planet-light" cx="38%" cy="32%" r="78%">
              <stop offset="0%" stopColor={c.core} stopOpacity="1" />
              <stop offset="28%" stopColor={c.mid} stopOpacity="0.96" />
              <stop offset="66%" stopColor={c.glow} stopOpacity="0.9" />
              <stop offset="92%" stopColor="#05060c" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#05060c" stopOpacity="0" />
            </radialGradient>
          ) : (
            <radialGradient id={`fill-${id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={c.core} stopOpacity={selected ? 1 : 0.8} />
              <stop offset={`${Math.round(46 + (1 - glowScale) * 34)}%`} stopColor={c.mid} stopOpacity={(selected ? 0.68 : 0.46) * (0.55 + glowScale * 0.45)} />
              <stop offset="100%" stopColor={c.glow} stopOpacity="0" />
            </radialGradient>
          )}
          {PLANET && (
            <radialGradient id={`term-${id}`} className="planet-term" cx="66%" cy="72%" r="80%">
              <stop offset="0%" stopColor="#05060c" stopOpacity="0" />
              <stop offset="58%" stopColor="#05060c" stopOpacity="0" />
              <stop offset="88%" stopColor="#05060c" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#05060c" stopOpacity="0.8" />
            </radialGradient>
          )}
          {PLANET && (
            <radialGradient id={`atmo-${id}`} className="planet-light" cx="42%" cy="38%" r="62%">
              <stop offset="0%" stopColor={c.mid} stopOpacity="0" />
              <stop offset="58%" stopColor={c.mid} stopOpacity="0" />
              <stop offset="78%" stopColor={c.mid} stopOpacity={0.16 * glowScale + 0.06} />
              <stop offset="92%" stopColor={c.mid} stopOpacity={0.08 * glowScale + 0.03} />
              <stop offset="100%" stopColor={c.glow} stopOpacity="0" />
            </radialGradient>
          )}
          <radialGradient id={`star-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id={`halo-${id}`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" /></filter>
          <filter id={`soft-${id}`} x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.2" /></filter>
          <filter id={`mass-${id}`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation={r * 0.02} /></filter>
          <filter id={`mass2-${id}`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation={r * 0.12} /></filter>
          <radialGradient id={`sun-${id}`} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#fffaf2" stopOpacity="1" />
            <stop offset="55%" stopColor="#fff0dc" stopOpacity="0.95" />
            <stop offset="82%" stopColor={c.core} stopOpacity="0.6" />
            <stop offset="100%" stopColor={c.mid} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`bar-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.core} stopOpacity="0.35" />
            <stop offset="60%" stopColor={c.core} stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff6ea" stopOpacity="1" />
          </linearGradient>
          <linearGradient id={`refl-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff0e0" stopOpacity="0.8" />
            <stop offset="25%" stopColor={c.mid} stopOpacity="0.4" />
            <stop offset="70%" stopColor={c.mid} stopOpacity="0.12" />
            <stop offset="100%" stopColor={c.mid} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`above-${id}`}><rect x={-r * 3} y={-r * 3} width={r * 6} height={r * 3} /></clipPath>
          <linearGradient id={`path-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffc4a0" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#ff9aa6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ff9aa6" stopOpacity="0" />
          </linearGradient>
          <filter id={`cloud-${id}`} x="-40%" y="-70%" width="180%" height="240%">
            <feTurbulence type="fractalNoise" baseFrequency={`${(1.1 / r).toFixed(4)} ${(1.8 / r).toFixed(4)}`} numOctaves="3" seed={frontSeed % 1000} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={r * 0.11} xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation={r * 0.003} />
          </filter>
        </defs>
        <g transform={`translate(${cx} ${cx + dy})`}>
          {/* visuals — non-interactive */}
          <g style={{ pointerEvents: 'none' }}>
            {FRONT && <animateTransform attributeName="transform" type="scale" values={`1;${(1 + 0.015 + en * 0.035).toFixed(3)};1`} dur="6s" repeatCount="indefinite" />}
            {FRONT ? (() => {
              // A FRONT: a sun on the horizon. Its body is the voice, the rings coming off it are the sound,
              // and its path on the water is where the sound goes. Nothing literal, nothing drawn - only light.
              const R = r * 0.15;
              const a = selected ? 1 : 0.85;
              const pulse = 0.55 + en * 0.45;
              const W = R * 2.4, H = R * 0.55;
              const Wb = Math.max(r * 0.85, 120), bw = Wb / NB;
              return (<g opacity={a}>
                {/* the glow the skyline throws into the sky */}
                <g clipPath={`url(#above-${id})`}>
                  <ellipse cx="0" cy="0" rx={Wb * 0.45} ry={skyH * 0.55} fill={c.mid} opacity={0.08 + 0.2 * en} filter={`url(#mass2-${id})`} />
                  {/* the sound, standing on the line */}
                  {Array.from({ length: NB }, (_, i) => <rect key={i} ref={el => { barsRef.current[i] = el; }} x={-Wb / 2 + i * bw + bw * 0.28} y={-1} width={bw * 0.44} height={1} rx={bw * 0.15} fill={`url(#bar-${id})`} />)}
                </g>
                {/* the line where it stands */}
                <rect x={-Wb / 2} y={-1} width={Wb} height={2} fill="#fff4e6" opacity={0.55 + 0.45 * en} filter={`url(#mass-${id})`} />
                {/* its reflection, falling down the water toward you */}
                <g opacity={0.45 + 0.55 * en} transform={`scale(1 ${3.4})`}>
                  {Array.from({ length: NB }, (_, i) => <rect key={'r' + i} ref={el => { reflRef.current[i] = el; }} x={-Wb / 2 + i * bw + bw * 0.22} y={2} width={bw * 0.56} height={1} fill={`url(#refl-${id})`} />)}
                </g>
                {/* and the shimmer on the water beneath it */}
                <g opacity={0.35 + 0.5 * en}>
                  <path d={`M ${-W * 0.28} ${H * 0.55} L ${W * 0.28} ${H * 0.55} L ${W * 2.2} ${H * 14} L ${-W * 2.2} ${H * 14} Z`} fill={`url(#path-${id})`} filter={`url(#mass2-${id})`} />
                </g>
              </g>);
            })() : PLANET ? (<>
              {/* atmosphere: thin luminous shell hugging the body */}
              <ellipse className="planet-atmo" cx="0" cy="0" rx={r * 0.78} ry={r * 0.78} fill={`url(#atmo-${id})`} />
              {/* the BODY: lit sphere with a real silhouette + drifting terminator shadow */}
              <ellipse cx="0" cy="0" rx={r * 0.52} ry={r * 0.52} fill={`url(#fill-${id})`} />
              <ellipse cx="0" cy="0" rx={r * 0.52} ry={r * 0.52} fill={`url(#term-${id})`} />
            </>) : (
              <ellipse cx="0" cy="0" rx={r} ry={r} fill={`url(#fill-${id})`} />
            )}
            {!FRONT && <circle cx="0" cy="0" r={haloR} fill="none" stroke={c.mid}
              strokeWidth={haloW * (0.4 + glowScale * 0.6)} opacity={(selected ? 0.3 : 0.18) * (0.5 + glowScale * 0.5)} filter={`url(#halo-${id})`} />}
            {!hideWave && <path ref={waveRef} transform={`translate(${coreX} ${coreY})`} d="M -44 0 Q -22 0 0 0 T 44 0"
              fill="none" stroke={c.core} strokeWidth="1.5" opacity="0.6" />}
          </g>
          {/* select disc — bounded to visible body */}
          <circle cx="0" cy="0" r={hitR} fill="transparent"
            onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onClick={() => { if (!dragging.current) onSelect?.(id); }} />
          {/* draggable core (on top) */}
          {(selected || FRONT || !PLANET) && <g transform={`translate(${coreX} ${coreY})`}
             onPointerDown={corePointerDown} onPointerMove={corePointerMove}
             onPointerUp={corePointerUp} onPointerLeave={corePointerUp}
             style={{ pointerEvents: selected ? 'all' : 'none', cursor: selected ? 'grab' : 'pointer' }}>
            <circle cx="0" cy="0" r={selected ? 34 : 18} fill="transparent" />
            <circle cx="0" cy="0" r={selected ? 18 : 11} fill={`url(#star-${id})`} filter={`url(#soft-${id})`} style={{ pointerEvents: 'none' }} opacity={selected ? 1 : 0.35} />
            <circle cx="0" cy="0" r={selected ? 7 : 4} fill="#fff" style={{ pointerEvents: 'none' }} opacity={selected ? 1 : 0.5} />
          </g>}
        </g>
      </svg>
      {hover && !selected && <div style={{ position: 'absolute', left: '50%', top: cx + dy - r * 0.9, transform: 'translateX(-50%)', padding: '7px 12px', borderRadius: 10, background: 'rgba(10,8,16,0.72)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 12, letterSpacing: '0.06em', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        <b style={{ fontWeight: 500 }}>{label}</b><span style={{ color: 'rgba(255,255,255,0.6)' }}> · {String(colorKey)}{subLabel ? ' · ' + subLabel : ''}</span>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>tap to open · drag the eye to move it</div>
      </div>}
      {!hideLabel && <div style={{
        position: 'absolute', left: 0, right: 0, top: cx + dy + 16,
        textAlign: 'center', color: c.core, fontSize: 15, fontWeight: 500,
        letterSpacing: '0.04em', opacity: selected ? 0.95 : 0.66, pointerEvents: 'none',
        transition: 'all 0.9s ease',
      }}>{label}</div>}
      {!hideLabel && subLabel && <div style={{
        position: 'absolute', left: 0, right: 0, top: cx + dy + 36,
        textAlign: 'center', color: tint || c.mid, fontSize: 11, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'monospace',
        opacity: selected ? 0.9 : 0.6, pointerEvents: 'none', transition: 'all 0.9s ease',
      }}>{subLabel}</div>}
    </div>
  );
}
