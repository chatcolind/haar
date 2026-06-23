'use client';

import { useState, useEffect, useRef } from 'react';

interface ParamDef {
  label: string;
  min: number;
  max: number;
  default: number;
  unit?: string;
  step?: number;
}

const EFFECT_PARAMS: Record<string, ParamDef[]> = {
  Reverb:   [
    { label: 'DECAY',   min: 0.5, max: 20,  default: 6,  unit: 's',  step: 0.1 },
    { label: 'PRE-DLY', min: 0,   max: 200, default: 60, unit: 'ms', step: 1   },
    { label: 'WET',     min: 0,   max: 100, default: 60, unit: '%',  step: 1   },
  ],
  Tape:     [
    { label: 'WOW',     min: 0,   max: 100, default: 30, unit: '%', step: 1 },
    { label: 'HF ROLL', min: 0,   max: 100, default: 40, unit: '%', step: 1 },
    { label: 'WET',     min: 0,   max: 100, default: 50, unit: '%', step: 1 },
  ],
  Delay:    [
    { label: 'TIME',    min: 0,   max: 100, default: 40, unit: '%', step: 1 },
    { label: 'FDBK',   min: 0,   max: 95,  default: 40, unit: '%', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 40, unit: '%', step: 1 },
  ],
  Chorus:   [
    { label: 'RATE',   min: 0,   max: 100, default: 30, unit: '%', step: 1 },
    { label: 'DEPTH',  min: 0,   max: 100, default: 50, unit: '%', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 50, unit: '%', step: 1 },
  ],
  Filter:   [
    { label: 'CUTOFF', min: 0,   max: 100, default: 80, unit: '%', step: 1 },
    { label: 'RESO',   min: 0,   max: 100, default: 20, unit: '%', step: 1 },
  ],
  Pitch:    [
    { label: 'SEMI',   min: -12, max: 12,  default: 0,  unit: 'st', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 50, unit: '%',  step: 1 },
  ],
  Modulate: [
    { label: 'RATE',   min: 0,   max: 100, default: 20, unit: '%', step: 1 },
    { label: 'DEPTH',  min: 0,   max: 100, default: 50, unit: '%', step: 1 },
  ],
  Grain:    [
    { label: 'RATE',   min: 0,   max: 100, default: 30, unit: '%', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 50, unit: '%', step: 1 },
  ],
  Fuzz:     [
    { label: 'DRIVE',  min: 0,   max: 100, default: 50, unit: '%', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 50, unit: '%', step: 1 },
  ],
  Crush:    [
    { label: 'BITS',   min: 0,   max: 100, default: 40, unit: '%', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 50, unit: '%', step: 1 },
  ],
  Shimmer:  [
    { label: 'ORDER',  min: 0,   max: 100, default: 30, unit: '%', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 30, unit: '%', step: 1 },
  ],
  Warp:     [
    { label: 'FREQ',   min: 0,   max: 100, default: 30, unit: '%', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 50, unit: '%', step: 1 },
  ],
  Wobble:   [
    { label: 'RATE',   min: 0,   max: 100, default: 30, unit: '%', step: 1 },
    { label: 'DEPTH',  min: 0,   max: 100, default: 30, unit: '%', step: 1 },
  ],
  Pulse:    [
    { label: 'RATE',   min: 0,   max: 100, default: 30, unit: '%', step: 1 },
    { label: 'DEPTH',  min: 0,   max: 100, default: 50, unit: '%', step: 1 },
  ],
  Space:    [
    { label: 'TIME',   min: 0,   max: 100, default: 30, unit: '%', step: 1 },
    { label: 'FDBK',   min: 0,   max: 95,  default: 35, unit: '%', step: 1 },
    { label: 'WET',    min: 0,   max: 100, default: 40, unit: '%', step: 1 },
  ],
};

function displayVal(def: ParamDef, value: number): string {
  if (def.unit === 's')  return `${value.toFixed(1)}s`;
  if (def.unit === 'ms') return `${Math.round(value)}ms`;
  if (def.unit === 'st') return value > 0 ? `+${value}` : `${value}`;
  return `${Math.round(value)}%`;
}

interface ParamRowProps {
  def: ParamDef;
  value: number;
  isFocused: boolean;
  onFocus: () => void;
  onChange: (v: number) => void;
  accentColor: string;
}

function ParamRow({ def, value, isFocused, onFocus, onChange, accentColor }: ParamRowProps) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const [dragging, setDragging] = useState(false);
  const editStarted = useRef(false);
  const pct = ((value - def.min) / (def.max - def.min)) * 100;

  const clamp = (v: number) => Math.min(def.max, Math.max(def.min, v));
  const round = (v: number) => Math.round(v / (def.step ?? 1)) * (def.step ?? 1);

  const handleDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw  = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onChange(round(clamp(def.min + raw * (def.max - def.min))));
  };

  // Keyboard control when focused — uses ref to avoid stale closure
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  useEffect(() => {
    if (!isFocused || editing) return;
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? (def.step ?? 1) * 10 : (def.step ?? 1);
      const dir  = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1 : -1;
      onChange(round(clamp(valueRef.current + dir * step)));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocused, editing, def]);

  const commitEdit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed !== '') {
      const v = parseFloat(trimmed);
      if (!isNaN(v)) onChange(round(clamp(v)));
    }
    setEditing(false);
    setEditVal('');
  };

  return (
    <div
      onClick={e => { e.stopPropagation(); onFocus(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        background: isFocused ? 'rgba(27,92,232,0.04)' : 'transparent',
      }}
    >
      {/* Focus indicator */}
      <div style={{ width: '3px', height: '20px', background: isFocused ? accentColor : 'transparent', borderRadius: '2px', flexShrink: 0 }} />

      {/* Label */}
      <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: isFocused ? accentColor : 'var(--light)', letterSpacing: '1px', width: '52px', flexShrink: 0 }}>{def.label}</span>

      {/* Slider track */}
      <div
        onMouseDown={e => { e.stopPropagation(); setDragging(true); onFocus(); handleDrag(e); }}
        onMouseMove={e => { if (dragging) handleDrag(e); }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        style={{ flex: 1, height: '4px', background: 'var(--cream-dark)', position: 'relative', cursor: 'pointer', borderRadius: '2px' }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: accentColor, borderRadius: '2px' }} />
        <div style={{ position: 'absolute', top: '-7px', left: `${pct}%`, transform: 'translateX(-50%)', width: '16px', height: '16px', borderRadius: '50%', background: isFocused ? accentColor : 'var(--cream-light)', border: `2px solid ${accentColor}`, cursor: 'grab', transition: 'background 0.15s' }} />
      </div>

      {/* Value — double-click to type */}
      {editing ? (
        <input
          autoFocus
          value={editVal}
          placeholder={String(value)}
          onChange={e => setEditVal(e.target.value)}
          onBlur={() => { commitEdit(editVal !== '' ? editVal : String(value)); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { commitEdit(editVal !== '' ? editVal : String(value)); }
            if (e.key === 'Escape') { setEditing(false); setEditVal(''); }
            e.stopPropagation();
          }}
          style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', width: '52px', background: 'var(--cream-dark)', border: `1px solid ${accentColor}`, color: accentColor, padding: '2px 4px', textAlign: 'right', outline: 'none', caretColor: accentColor }}
        />
      ) : (
        <span
          onDoubleClick={e => { e.stopPropagation(); setEditVal(''); editStarted.current = false; setEditing(true); }}
          title="Double-click to type value"
          style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: isFocused ? accentColor : 'var(--mid)', minWidth: '52px', textAlign: 'right', cursor: 'text', letterSpacing: '0.5px' }}
        >{displayVal(def, value)}</span>
      )}

      {/* Keyboard hint when focused */}
      {isFocused && !editing && (
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '8px', color: 'var(--light)', letterSpacing: '0.5px', flexShrink: 0 }}>↑↓ · shift×10</span>
      )}
    </div>
  );
}

interface ChainModuleProps {
  name: string;
  stage: string;
  accentColor: string;
  isActive?: boolean;
  isSource?: boolean;
  isMuted?: boolean;
  params?: number[];
  onActivate?: () => void;
  onParamChange?: (paramIndex: number, value: number) => void;
  onMute?: () => void;
  onRemove?: () => void;
}

export default function ChainModule({
  name, stage, accentColor,
  isActive = false, isSource = false, isMuted = false,
  params, onActivate, onParamChange, onMute, onRemove,
}: ChainModuleProps) {
  const [expanded, setExpanded]     = useState(false);
  const [focusedParam, setFocusedParam] = useState<number | null>(null);
  const paramDefs = EFFECT_PARAMS[name] ?? [];

  const paramValues = paramDefs.map((def, i) =>
    params?.[i] !== undefined ? params[i] : def.default
  );

  const handleClick = () => {
    if (isSource) return;
    onActivate?.();
    setExpanded(p => !p);
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${isActive ? 'var(--pink)' : accentColor}`, opacity: isMuted ? 0.35 : 1, transition: 'opacity 0.2s, border-color 0.15s', background: isActive ? 'rgba(212,96,144,0.04)' : 'var(--cream-light)' }}>

      {/* Header row — always visible */}
      <div
        onClick={handleClick}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', cursor: isSource ? 'default' : 'pointer' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: '15px', letterSpacing: '2px', color: isActive ? 'var(--pink)' : accentColor, textTransform: 'uppercase' }}>{name}</div>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: 'var(--light)', letterSpacing: '1px', marginTop: '2px' }}>
            {isActive ? '● active' : stage}
            {!isSource && paramDefs.length > 0 && (
              <span style={{ marginLeft: '8px', color: expanded ? accentColor : 'var(--light)' }}>{expanded ? '▲ close' : '▼ edit'}</span>
            )}
          </div>
        </div>

        {/* Compact param summary when collapsed */}
        {!isSource && !expanded && paramDefs.length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {paramDefs.map((def, i) => (
              <span key={def.label} style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', color: 'var(--light)', letterSpacing: '0.5px' }}>
                {def.label} <span style={{ color: accentColor }}>{displayVal(def, paramValues[i])}</span>
              </span>
            ))}
          </div>
        )}

        {/* Mute + Remove */}
        {!isSource && (
          <div style={{ display: 'flex', gap: '5px' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onMute?.()}
              style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: '11px', letterSpacing: '1px', padding: '4px 10px', background: isMuted ? 'var(--red)' : 'var(--cream-light)', border: `1px solid ${isMuted ? 'var(--red-dark)' : 'var(--border)'}`, color: isMuted ? 'white' : 'var(--dark)', cursor: 'pointer', clipPath: 'polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)' }}
            >{isMuted ? 'UNMUTE' : 'MUTE'}</button>
            <button
              onClick={() => onRemove?.()}
              style={{ fontSize: '13px', padding: '4px 8px', background: 'var(--cream-light)', border: '1px solid var(--border)', color: 'var(--light)', cursor: 'pointer', clipPath: 'polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)' }}
            >✕</button>
          </div>
        )}
      </div>

      {/* Expanded param rows */}
      {expanded && !isSource && paramDefs.length > 0 && (
        <div style={{ padding: '0 14px 10px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginTop: '4px', fontFamily: 'Space Mono, monospace', fontSize: '9px', color: 'var(--light)', letterSpacing: '1px', padding: '4px 0 6px 15px' }}>
            click param · ↑↓ keys · shift = ×10 · double-click to type
          </div>
          {paramDefs.map((def, i) => (
            <ParamRow
              key={def.label}
              def={def}
              value={paramValues[i]}
              isFocused={focusedParam === i}
              onFocus={() => setFocusedParam(i)}
              onChange={v => onParamChange?.(i, v)}
              accentColor={accentColor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { EFFECT_PARAMS };
export type { ParamDef };
