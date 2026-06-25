'use client';

export default function FieldPage() {
  return (
    <main style={{ position:'fixed', inset:0, overflow:'hidden', background:'radial-gradient(ellipse at 50% 32%, #10131f 0%, #070810 66%, #04050a 100%)', fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', color:'#fff' }}>
      <div style={{ position:'absolute', inset:0, opacity:0.6, pointerEvents:'none', backgroundImage:'radial-gradient(1px 1px at 20% 14%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 88% 9%, rgba(255,255,255,0.45), transparent), radial-gradient(1px 1px at 94% 42%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 8% 46%, rgba(255,255,255,0.4), transparent), radial-gradient(1px 1px at 50% 8%, rgba(255,255,255,0.3), transparent)' }} />
      <div style={{ position:'absolute', top:26, left:34, fontSize:22, letterSpacing:'0.6em', fontWeight:500 }}>H A A R</div>
      <div style={{ position:'absolute', top:30, right:34, fontSize:11, fontWeight:500, color:'rgba(255,255,255,0.55)' }}>field · 0 active</div>
    </main>
  );
}
