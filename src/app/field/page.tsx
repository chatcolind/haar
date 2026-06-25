'use client';

import { useState, useEffect } from 'react';
import Orb from '../../components/field/Orb';

type OrbDef = { id: string; label: string; colorKey: any };

const ORBS: OrbDef[] = [
  { id: 'bubbles', label: 'Bubbles', colorKey: 'bubbles' },
  { id: 'tunnel',  label: 'Tunnel',  colorKey: 'tunnel'  },
  { id: 'shimmer', label: 'Shimmer', colorKey: 'shimmer' },
  { id: 'strum',   label: 'Strum',   colorKey: 'strum'   },
];

// one centre slot (big) + satellite slots (small), as fractions of the screen
const CENTRE = { fx: 0.50, fy: 0.46, size: 250 };
const SATELLITES = [
  { fx: 0.20, fy: 0.30, size: 132 },
  { fx: 0.80, fy: 0.28, size: 132 },
  { fx: 0.76, fy: 0.70, size: 132 },
];

export default function FieldPage() {
  const [selected, setSelected] = useState<string>('bubbles');
  const [dim, setDim] = useState({ w: 1440, h: 900 });

  useEffect(() => {
    const update = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // selected orb takes the centre slot; the rest fill satellite slots in order
  const others = ORBS.filter(o => o.id !== selected);
  const slotFor = (id: string) => {
    if (id === selected) return CENTRE;
    const idx = others.findIndex(o => o.id === id);
    return SATELLITES[idx] ?? SATELLITES[SATELLITES.length - 1];
  };

  return (
    <main style={{ position:'fixed', inset:0, overflow:'hidden', background:'radial-gradient(ellipse at 50% 32%, #10131f 0%, #070810 66%, #04050a 100%)', fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', color:'#fff' }}>
      <div style={{ position:'absolute', inset:0, opacity:0.6, pointerEvents:'none', backgroundImage:'radial-gradient(1px 1px at 20% 14%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 88% 9%, rgba(255,255,255,0.45), transparent), radial-gradient(1px 1px at 94% 42%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 8% 46%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 50% 8%, rgba(255,255,255,0.3), transparent)' }} />
      <div style={{ position:'absolute', top:26, left:34, fontSize:22, letterSpacing:'0.6em', fontWeight:500 }}>H A A R</div>
      <div style={{ position:'absolute', top:30, right:34, fontSize:11, fontWeight:500, color:'rgba(255,255,255,0.55)' }}>field · {ORBS.length} active</div>

      {ORBS.map((o) => {
        const slot = slotFor(o.id);
        return (
          <Orb key={o.id} id={o.id} label={o.label} colorKey={o.colorKey}
            x={slot.fx * dim.w} y={slot.fy * dim.h} size={slot.size} volume={0.7}
            selected={selected===o.id} onSelect={setSelected} />
        );
      })}
    </main>
  );
}
