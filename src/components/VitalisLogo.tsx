interface VitalisLogoProps {
  variant?: 'landing' | 'navbar' | 'splash';
}

function Isotipo({ size }: { size: number }) {
  return (
    <img
      src="/favicon.png"
      alt="Vitalis"
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
    />
  );
}

export function VitalisLogo({ variant = 'landing' }: VitalisLogoProps) {
  if (variant === 'navbar') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-[#080E1A]">
          <Isotipo size={28} />
        </div>
        <span className="text-sm font-extrabold tracking-[0.12em] text-white">VITALIS</span>
      </div>
    );
  }

  if (variant === 'splash') {
    return (
      <div className="flex flex-col items-center gap-4">
        <Isotipo size={96} />
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-extrabold tracking-[.16em] text-foreground">VITALIS</span>
          <span className="text-xs font-medium tracking-[.12em] text-muted-foreground uppercase">
            Gestión que impulsa tu centro
          </span>
        </div>
      </div>
    );
  }

  // landing (default)
  return (
    <div className="flex items-center gap-2.5">
      <Isotipo size={36} />
      <span className="text-lg font-extrabold tracking-[.14em] text-[#0F172A]">VITALIS</span>
    </div>
  );
}
