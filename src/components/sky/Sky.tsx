'use client';
// THE SKY - one painter behind every room (docs/ARRANGE.md, THE REEL).
// Four scenes, one horizon that holds still while the weather changes. Moving between rooms
// is the reel playing: a slow dissolve, never a cut. Pure CSS; no canvas on the hot path.
import React from 'react';

export type SkyScene = 'plains' | 'aurora' | 'catatumbo' | 'skye';
export const HORIZON = 0.44;   // fraction of the height - the one line every scene shares. Big skies: the line sits low.

const layer = (extra: React.CSSProperties = {}): React.CSSProperties => ({ position: 'absolute', inset: 0, ...extra });
const FADE = 'opacity 900ms ease-in-out';

function Horizon({ color, glow }: { color: string; glow: string }) {
  return <div style={{ position: 'absolute', left: 0, right: 0, top: `${HORIZON * 100}%`, height: 2, background: `linear-gradient(90deg, transparent, ${color} 30%, ${color} 65%, transparent)`, boxShadow: `0 0 22px 5px ${glow}, 0 0 80px 18px ${glow}` }} />;
}

export default function Sky({ scene, zIndex = -1 }: { scene: SkyScene; zIndex?: number }) {
  const on = (s: SkyScene) => (scene === s ? 1 : 0);
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex, pointerEvents: 'none', overflow: 'hidden' }}>

      {/* BUILD - the Great Plains, a supercell at dusk */}
      <div style={layer({ opacity: on('plains'), transition: FADE, background: 'linear-gradient(180deg, #1a0f2a 0%, #4a1f4a 12%, #a1405a 24%, #ff8a5c 31%, #ffc38a 34%, #6b3c4a 40%, #2a2030 62%, #0e0b12 100%)' })}>
        <div style={layer({ top: '0%', height: '30%', left: '-5%', right: '20%', background: 'radial-gradient(80% 100% at 40% 100%, rgba(20,10,30,0.95), rgba(40,20,50,0.85) 60%, rgba(60,30,70,0) 100%)', filter: 'blur(8px)' })} />
        <div style={layer({ top: '22%', height: '12%', left: 0, right: '24%', filter: 'blur(6px)', background: 'radial-gradient(9% 60% at 6% 50%, rgba(255,150,120,0.75), transparent 70%), radial-gradient(9% 60% at 18% 60%, rgba(255,140,110,0.7), transparent 70%), radial-gradient(9% 60% at 30% 45%, rgba(255,160,130,0.75), transparent 70%), radial-gradient(9% 60% at 42% 62%, rgba(255,130,100,0.7), transparent 70%), radial-gradient(9% 60% at 54% 50%, rgba(255,150,120,0.75), transparent 70%), radial-gradient(9% 60% at 66% 60%, rgba(255,140,110,0.7), transparent 70%), radial-gradient(9% 60% at 78% 48%, rgba(255,160,130,0.7), transparent 70%), radial-gradient(9% 60% at 90% 58%, rgba(255,130,100,0.65), transparent 70%)' })} />
        <div style={layer({ top: `${HORIZON * 100}%`, background: 'linear-gradient(180deg, rgba(60,30,40,0.7), #0b0810 60%)' })} />
      </div>

      {/* INSIDE A FRONT - Iceland, the aurora */}
      <div style={layer({ opacity: on('aurora'), transition: FADE, background: 'linear-gradient(180deg, #02040c 0%, #061224 40%, #0b1c33 70%, #06101c 100%)' })}>
        <div style={layer({ backgroundImage: 'radial-gradient(rgba(255,255,255,0.7) 0.6px, transparent 1px), radial-gradient(rgba(255,255,255,0.4) 0.5px, transparent 1px)', backgroundSize: '190px 170px, 130px 240px', opacity: 0.7, maskImage: 'linear-gradient(180deg, #000 30%, transparent 40%)' })} />
        <div style={layer({ top: '-10%', height: '46%', left: '-10%', right: '-10%', mixBlendMode: 'screen', background: 'linear-gradient(180deg, rgba(120,255,200,0.55) 0%, rgba(120,255,200,0.25) 40%, rgba(255,120,200,0.35) 70%, rgba(255,120,200,0) 100%)', maskImage: 'radial-gradient(60% 50% at 45% 35%, #000 10%, transparent 70%)', filter: 'blur(30px)' })} />
        <div style={layer({ top: '-10%', height: '46%', left: '-10%', right: '-10%', mixBlendMode: 'screen', background: 'repeating-linear-gradient(94deg, rgba(90,255,190,0) 0 30px, rgba(90,255,190,0.22) 30px 44px, rgba(90,255,190,0) 44px 90px)', maskImage: 'radial-gradient(70% 60% at 50% 40%, #000 20%, transparent 75%)', filter: 'blur(6px)', transform: 'skewX(-12deg)' })} />
        <div style={layer({ top: `${HORIZON * 100 - 8}%`, height: '9%', background: 'linear-gradient(180deg, transparent 0%, #05080f 60%, #03050a 100%)', clipPath: 'polygon(0 60%, 12% 42%, 24% 55%, 36% 30%, 48% 52%, 60% 38%, 72% 58%, 84% 44%, 100% 62%, 100% 100%, 0 100%)' })} />
        <div style={layer({ top: `${HORIZON * 100}%`, background: 'linear-gradient(180deg, rgba(90,255,190,0.10), #03050a 45%)' })} />
      </div>

      {/* SAMPLER - Catatumbo, the storm that never stops */}
      <div style={layer({ opacity: on('catatumbo'), transition: FADE, background: 'linear-gradient(180deg, #06070f 0%, #14173a 14%, #2e2a6a 26%, #4b3a86 32%, #1a1636 45%, #07060e 100%)' })}>
        <div style={layer({ top: 0, height: '36%', left: '-10%', right: '-10%', background: 'radial-gradient(50% 90% at 30% 40%, rgba(30,28,70,0.9), transparent 70%), radial-gradient(45% 90% at 70% 35%, rgba(40,30,80,0.9), transparent 70%)', filter: 'blur(24px)' })} />
        <div style={layer({ left: '30%', top: '2%', width: '40%', height: '28%', background: 'radial-gradient(closest-side, rgba(230,220,255,0.55), rgba(180,160,255,0.2) 50%, transparent 75%)', filter: 'blur(30px)' })} />
        <div style={layer({ top: `${HORIZON * 100}%`, background: 'linear-gradient(180deg, rgba(120,110,220,0.35), rgba(20,16,50,0.8) 30%, #05040c 100%)' })} />
      </div>

      {/* ARRANGE - Skye, the break */}
      <div style={layer({ opacity: on('skye'), transition: FADE, background: 'linear-gradient(180deg, #3a1a52 0%, #8a3a78 14%, #e07898 26%, #ffb6a6 33%, #ffc9b0 35%, #7a3f80 48%, #3a2260 75%, #1a1236 100%)' })}>
        <div style={layer({ left: '-12%', top: '-30%', width: '60%', height: '70%', background: 'radial-gradient(closest-side, rgba(255,236,190,0.95) 0%, rgba(255,190,150,0.6) 22%, rgba(255,140,160,0.25) 48%, rgba(255,140,160,0) 70%)' })} />
        <div style={layer({ top: '-30%', mixBlendMode: 'screen', maskImage: 'linear-gradient(180deg, #000 30%, transparent 88%)', background: 'conic-gradient(from 150deg at 18% -6%, rgba(255,240,210,0) 0deg, rgba(255,240,210,0.42) 2deg, rgba(255,240,210,0) 4deg, rgba(255,240,210,0) 7deg, rgba(255,240,210,0.28) 9deg, rgba(255,240,210,0) 11deg, rgba(255,240,210,0) 15deg, rgba(255,240,210,0.34) 17deg, rgba(255,240,210,0) 19.5deg, rgba(255,240,210,0) 24deg, rgba(255,240,210,0.22) 26deg, rgba(255,240,210,0) 28deg)' })} />
        <div style={layer({ right: '-8%', top: '-18%', width: '50%', height: '52%', left: 'auto', background: 'radial-gradient(closest-side, rgba(40,20,60,0.95) 0%, rgba(60,30,80,0.8) 40%, rgba(80,40,100,0) 72%)' })} />
        <div style={layer({ left: '22%', top: 0, width: '60%', height: '30%', background: 'radial-gradient(60% 60% at 40% 50%, rgba(255,170,200,0.55), rgba(255,170,200,0) 70%)', filter: 'blur(24px)' })} />
        <div style={layer({ top: `${HORIZON * 100}%`, background: 'linear-gradient(180deg, rgba(255,175,185,0.45), rgba(120,60,120,0.55) 22%, rgba(50,25,80,0.75) 55%, rgba(22,16,48,0.95) 100%)' })} />
      </div>
    </div>
  );
}
