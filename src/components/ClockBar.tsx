'use client';

import { useState, useEffect, useRef } from 'react';

const TIME_SIGS = ['4/4', '3/4', '6/8', '5/4'];
const SNAP_OPTS = ['1 bar', '2 bar', 'free'];

export default function ClockBar({ onBpmChange }: { onBpmChange?: (bpm: number) => void }) {
  const [bpm, setBpm] = useState(110);
  const updateBpm = (v: number) => { setBpm(v); onBpmChange?.(v); };
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('110');
  const [timeSig, setTimeSig] = useState('4/4');
  const [snap, setSnap] = useState('1 bar');
  const [taps, setTaps] = useState<number[]>([]);
  const [flashTap, setFlashTap] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const doTap = () => {
    const now = Date.now();
    const recent = [...taps, now].filter(t => now - t < 3000);
    setTaps(recent);
    if (recent.length >= 2) {
      const avg = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
      updateBpm(Math.round(60000 / avg));
    }
    setFlashTap(true);
    setTimeout(() => setFlashTap(false), 120);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body && !editing) {
        e.preventDefault();
        doTap();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [taps, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const confirmEdit = () => {
    const val = parseInt(editVal);
    if (!isNaN(val) && val >= 40 && val <= 250) updateBpm(val);
    setEditing(false);
  };

  const activeBtnStyle = {
    fontFamily: 'Space Mono, monospace' as const,
    fontSize: '12px', padding: '5px 12px',
    border: '1px solid var(--pink-dark)',
    background: 'var(--pink)', color: 'white',
    cursor: 'pointer' as const, letterSpacing: '1px',
  };

  const inactiveBtnStyle = {
    fontFamily: 'Space Mono, monospace' as const,
    fontSize: '12px', padding: '5px 12px',
    border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--mid)',
    cursor: 'pointer' as const, letterSpacing: '1px',
  };

  return (
    <div style={{
      background: 'var(--cream-light)',
      borderBottom: '2px solid var(--border)',
      borderLeft: '4px solid var(--pink)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      gap: '20px', padding: '12px 24px',
      flexWrap: 'wrap',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>

      {/* BPM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          fontFamily: 'Space Mono, monospace', fontSize: '12px',
          color: 'var(--pink)', letterSpacing: '3px', textTransform: 'uppercase',
        }}>BPM</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button onClick={() => updateBpm(Math.min(250, bpm + 1))} style={{ ...inactiveBtnStyle, padding: '1px 6px', fontSize: '11px' }}>▲</button>
          <button onClick={() => updateBpm(Math.max(40, bpm - 1))} style={{ ...inactiveBtnStyle, padding: '1px 6px', fontSize: '11px' }}>▼</button>
        </div>
        {editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={confirmEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{
              fontFamily: 'Rajdhani, sans-serif', fontWeight: 300,
              fontSize: '44px', letterSpacing: '2px', lineHeight: 1,
              width: '90px', background: 'transparent',
              border: 'none', borderBottom: '2px solid var(--pink)',
              color: 'var(--dark)', outline: 'none', padding: '0 2px',
            }}
          />
        ) : (
          <span
            onClick={() => { setEditVal(String(bpm)); setEditing(true); }}
            title="Click to type BPM"
            style={{
              fontFamily: 'Rajdhani, sans-serif', fontWeight: 300,
              fontSize: '44px', color: 'var(--dark)',
              minWidth: '70px', letterSpacing: '2px', lineHeight: 1,
              cursor: 'text', borderBottom: '1px dashed var(--border)',
            }}
          >{bpm}</span>
        )}
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: 'var(--light)', letterSpacing: '1px' }}>bpm</span>
      </div>

      <div style={{ width: '1px', height: '36px', background: 'rgba(212,96,144,0.3)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: 'var(--pink)', letterSpacing: '2px', textTransform: 'uppercase' }}>SIG</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {TIME_SIGS.map(s => <button key={s} onClick={() => setTimeSig(s)} style={timeSig === s ? activeBtnStyle : inactiveBtnStyle}>{s}</button>)}
        </div>
      </div>

      <div style={{ width: '1px', height: '36px', background: 'rgba(212,96,144,0.3)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: 'var(--pink)', letterSpacing: '2px', textTransform: 'uppercase' }}>SNAP</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {SNAP_OPTS.map(s => <button key={s} onClick={() => setSnap(s)} style={snap === s ? activeBtnStyle : inactiveBtnStyle}>{s}</button>)}
        </div>
      </div>

      <div style={{ width: '1px', height: '36px', background: 'rgba(212,96,144,0.3)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <button
          onClick={doTap}
          style={{
            fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
            fontSize: '15px', letterSpacing: '3px',
            padding: '9px 24px',
            background: flashTap ? 'var(--pink)' : 'transparent',
            border: '2px solid var(--pink)',
            color: flashTap ? 'white' : 'var(--pink)',
            cursor: 'pointer', textTransform: 'uppercase',
            clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)',
            transition: 'background 0.1s, color 0.1s',
          }}>TAP</button>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: 'var(--light)', letterSpacing: '1px' }}>SPACE to tap</span>
      </div>

    </div>
  );
}
