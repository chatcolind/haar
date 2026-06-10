'use client';

import { useState } from 'react';

interface ChainModuleProps {
  name: string;
  stage: string;
  accentColor: string;
  isActive?: boolean;
  isSource?: boolean;
  volume?: number;
  isMuted?: boolean;
  onActivate?: () => void;
  onVolumeChange?: (v: number) => void;
  onMute?: () => void;
  onRemove?: () => void;
  children?: React.ReactNode;
}

export default function ChainModule({
  name, stage, accentColor, isActive = false, isSource = false,
  volume = 70, isMuted = false,
  onActivate, onVolumeChange, onMute, onRemove,
  children,
}: ChainModuleProps) {
  const [dragging, setDragging] = useState(false);

  const handleVolDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    onVolumeChange?.(pct);
  };

  return (
    <div
      onClick={!isSource ? onActivate : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: isActive ? 'rgba(212,96,144,0.06)' : 'var(--cream-light)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isActive ? 'var(--pink)' : accentColor}`,
        cursor: isSource ? 'default' : 'pointer',
        opacity: isMuted ? 0.35 : 1,
        transition: 'opacity 0.2s, border-color 0.15s, background 0.15s',
      }}
    >
      {/* Name + stage */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
          fontSize: '16px', letterSpacing: '2px',
          color: isActive ? 'var(--pink)' : accentColor,
          textTransform: 'uppercase',
        }}>{name}</div>
        <div style={{
          fontFamily: 'Space Mono, monospace', fontSize: '11px',
          color: 'var(--light)', letterSpacing: '1px', marginTop: '2px',
        }}>{isActive ? '● active' : stage}</div>
      </div>

      {children}

      {/* Volume slider */}
      {!isSource && (
        <>
          <div
            onMouseDown={(e) => { setDragging(true); handleVolDrag(e); e.stopPropagation(); }}
            onMouseMove={(e) => { if (dragging) handleVolDrag(e); }}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            onClick={e => e.stopPropagation()}
            style={{
              width: '90px', height: '3px',
              background: 'var(--cream-dark)',
              position: 'relative', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', left: 0, top: 0,
              height: '100%', width: `${volume}%`,
              background: accentColor,
            }} />
            <div style={{
              position: 'absolute', top: '-5px',
              left: `${volume}%`, transform: 'translateX(-50%)',
              width: '12px', height: '12px', borderRadius: '50%',
              background: 'var(--cream-light)',
              border: `2px solid ${accentColor}`,
            }} />
          </div>
          <span style={{
            fontFamily: 'Space Mono, monospace', fontSize: '12px',
            color: 'var(--light)', minWidth: '28px', textAlign: 'right',
          }}>{volume}</span>

          <button
            onClick={(e) => { e.stopPropagation(); onMute?.(); }}
            style={{
              fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
              fontSize: '12px', letterSpacing: '1px',
              padding: '6px 14px',
              background: isMuted ? 'var(--red)' : 'var(--cream-light)',
              border: `1px solid ${isMuted ? 'var(--red-dark)' : 'var(--border)'}`,
              color: isMuted ? 'white' : 'var(--dark)',
              cursor: 'pointer', borderRadius: '4px', flexShrink: 0,
            }}
          >{isMuted ? 'UNMUTE' : 'MUTE'}</button>

          <button
            onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
            style={{
              fontSize: '14px', padding: '5px 10px',
              background: 'var(--cream-light)',
              border: '1px solid var(--border)',
              color: 'var(--light)', cursor: 'pointer',
              borderRadius: '4px', flexShrink: 0,
            }}
          >✕</button>
        </>
      )}
    </div>
  );
}
