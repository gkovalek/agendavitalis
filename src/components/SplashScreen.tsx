import { useEffect, useState } from 'react';

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hide = setTimeout(() => setVisible(false), 1600);
    const done = setTimeout(onDone, 2100);
    return () => { clearTimeout(hide); clearTimeout(done); };
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '16px',
        backgroundColor: '#ffffff',
        opacity: visible ? 1 : 0,
        transition: 'opacity 500ms ease-in-out',
        pointerEvents: visible ? 'all' : 'none',
      }}
    >
      <style>{`
        @keyframes vitalis-pulse {
          0%   { transform: scale(0.88); opacity: 0; }
          40%  { transform: scale(1.04); opacity: 1; }
          70%  { transform: scale(0.98); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
        .vitalis-logo-anim {
          animation: vitalis-pulse 700ms cubic-bezier(.22,1,.36,1) forwards;
        }
      `}</style>

      <img
        src="/favicon.png"
        alt="Vitalis"
        width={100}
        height={100}
        className="vitalis-logo-anim"
        style={{ objectFit: 'contain' }}
      />
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontSize: '22px', fontWeight: 800, letterSpacing: '0.16em',
          color: '#0F172A', margin: 0, fontFamily: 'inherit',
        }}>
          VITALIS
        </p>
        <p style={{
          fontSize: '11px', fontWeight: 500, letterSpacing: '0.12em',
          color: '#64748B', margin: '4px 0 0', textTransform: 'uppercase',
          fontFamily: 'inherit',
        }}>
          Gestión que impulsa tu centro
        </p>
      </div>
    </div>
  );
}
