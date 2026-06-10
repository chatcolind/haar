'use client';

export default function Header() {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      padding: '14px 24px',
      borderBottom: '1px solid rgba(212, 96, 144, 0.3)',
      background: 'var(--cream)',
      position: 'relative',
      zIndex: 3,
    }}>

      <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 90px 90px 0', borderColor: 'transparent var(--blue) transparent transparent', zIndex: 4 }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 22px 22px 0', borderColor: 'transparent var(--gold) transparent transparent', zIndex: 5 }} />

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '32px' }}>
        <svg width="38" height="38" viewBox="0 0 36 36">
          <polygon points="18,2 33,10 33,26 18,34 3,26 3,10" fill="var(--blue)" />
          <polygon points="18,6 29,12 29,24 18,30 7,24 7,12" fill="none" stroke="var(--gold)" strokeWidth="1" />
          <text x="18" y="22" textAnchor="middle" fill="white" style={{ fontSize: '16px', fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>BP</text>
        </svg>
        <div>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: '15px', letterSpacing: '5px', color: 'var(--dark)', textTransform: 'uppercase' }}>Blind Panda</div>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '16px', color: 'var(--light)', letterSpacing: '2px' }}>systems / audio</div>
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 300, fontSize: '48px', letterSpacing: '16px', color: 'var(--dark)', textTransform: 'uppercase', lineHeight: 1 }}>HAAR</div>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '15px', letterSpacing: '4px', color: 'var(--light)', textTransform: 'uppercase', marginTop: '3px' }}>Ambient Field Machine</div>
      </div>

      {/* Status */}
      <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
        {[
          { color: 'var(--blue)', text: 'SYS ONLINE' },
          { color: 'var(--pink)', text: '110 BPM · 4/4' },
          { color: 'var(--gold)', text: 'NO BANKS ACTIVE' },
        ].map(({ color, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '16px', color: 'var(--light)', letterSpacing: '1px' }}>{text}</span>
          </div>
        ))}
      </div>

    </header>
  );
}
