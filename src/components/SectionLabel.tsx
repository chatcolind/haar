'use client';

interface SectionLabelProps {
  left: string;
  right?: string;
}

export default function SectionLabel({ left, right }: SectionLabelProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '0 20px',
      margin: '14px 0 6px',
    }}>
      <span style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: '16px',
        letterSpacing: '3px',
        color: 'var(--pink)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>{left}</span>
      <div style={{
        flex: 1,
        height: '1px',
        background: 'linear-gradient(to right, var(--pink), rgba(212,96,144,0.08))',
      }} />
      {right && (
        <span style={{
          fontFamily: 'Space Mono, monospace',
          fontSize: '16px',
          letterSpacing: '3px',
          color: 'var(--pink)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>{right}</span>
      )}
    </div>
  );
}
