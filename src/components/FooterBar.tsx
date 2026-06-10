'use client';

export default function FooterBar() {
  return (
    <div style={{ display: 'flex', height: '4px' }}>
      <div style={{ background: 'var(--pink)', flex: 1 }} />
      <div style={{ background: 'var(--blue)', flex: 3 }} />
      <div style={{ background: 'var(--gold)', flex: 1 }} />
      <div style={{ background: 'var(--pink)', flex: 0.4 }} />
      <div style={{ background: 'var(--cream)', flex: 8 }} />
    </div>
  );
}
