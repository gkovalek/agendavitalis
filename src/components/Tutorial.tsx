import { useEffect, useState, useCallback } from 'react';

interface TutorialStep {
  title: string;
  description: string;
  selector: string | null;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: TutorialStep[] = [
  {
    title: 'Panel principal',
    description: 'Aquí ves la agenda del día. Hacé clic en cualquier horario para crear un turno.',
    selector: '[data-tutorial="dashboard"]',
    position: 'bottom',
  },
  {
    title: 'Pacientes',
    description: 'Gestioná todos tus pacientes desde acá. Podés buscar, filtrar y ver su historia clínica.',
    selector: '[data-tutorial="nav-pacientes"]',
    position: 'bottom',
  },
  {
    title: 'Agenda',
    description: 'Vista semanal y mensual de todos los turnos de tus profesionales.',
    selector: '[data-tutorial="nav-agendas"]',
    position: 'bottom',
  },
  {
    title: 'Caja',
    description: 'Registrá cobros, consultá movimientos y cerrá la caja del día.',
    selector: '[data-tutorial="nav-caja"]',
    position: 'bottom',
  },
  {
    title: 'Servicios',
    description: 'Creá los servicios que ofrecés con duración y precio.',
    selector: '[data-tutorial="nav-agendas"]',
    position: 'bottom',
  },
  {
    title: 'Profesionales',
    description: 'Administrá los profesionales de tu centro.',
    selector: '[data-tutorial="nav-agendas"]',
    position: 'bottom',
  },
  {
    title: 'Mi perfil',
    description: 'Configurá tu perfil, conectá MercadoPago y gestioná tus FAQs para el bot de WhatsApp.',
    selector: '[data-tutorial="user-menu"]',
    position: 'bottom',
  },
  {
    title: '¡Listo!',
    description: '¡Ya conocés lo básico de Vitalis! Podés volver a ver este tutorial desde el menú Ayuda.',
    selector: null,
    position: 'bottom',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPos {
  top: number;
  left: number;
  arrowSide: 'top' | 'bottom' | 'left' | 'right' | null;
}

function getTooltipPos(rect: Rect, position: TutorialStep['position'], tw: number, th: number): TooltipPos {
  const GAP = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;
  let arrowSide: TooltipPos['arrowSide'] = null;

  if (position === 'bottom') {
    top = rect.top + rect.height + GAP;
    left = rect.left + rect.width / 2 - tw / 2;
    arrowSide = 'top';
    if (top + th > vh - 8) {
      top = rect.top - th - GAP;
      arrowSide = 'bottom';
    }
  } else if (position === 'top') {
    top = rect.top - th - GAP;
    left = rect.left + rect.width / 2 - tw / 2;
    arrowSide = 'bottom';
    if (top < 8) {
      top = rect.top + rect.height + GAP;
      arrowSide = 'top';
    }
  } else if (position === 'right') {
    top = rect.top + rect.height / 2 - th / 2;
    left = rect.left + rect.width + GAP;
    arrowSide = 'left';
  } else {
    top = rect.top + rect.height / 2 - th / 2;
    left = rect.left - tw - GAP;
    arrowSide = 'right';
  }

  // Clamp horizontally
  left = Math.max(8, Math.min(left, vw - tw - 8));
  top = Math.max(8, Math.min(top, vh - th - 8));

  return { top, left, arrowSide };
}

interface Props {
  active: boolean;
  onClose: () => void;
}

export function Tutorial({ active, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipSize] = useState({ w: 320, h: 180 });

  const currentStep = STEPS[step];

  const findTarget = useCallback(() => {
    if (!currentStep.selector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(currentStep.selector);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [currentStep.selector]);

  useEffect(() => {
    if (!active) return;
    findTarget();
    const onResize = () => findTarget();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, findTarget]);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const handleFinish = () => {
    localStorage.setItem('vitalis_tutorial_done', '1');
    setStep(0);
    onClose();
  };

  if (!active) return null;

  const PAD = 6;
  let spotlightStyle: React.CSSProperties = {};
  if (targetRect) {
    spotlightStyle = {
      position: 'fixed',
      top: targetRect.top - PAD,
      left: targetRect.left - PAD,
      width: targetRect.width + PAD * 2,
      height: targetRect.height + PAD * 2,
      borderRadius: 8,
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
      border: '2px solid rgba(0,173,187,0.6)',
      zIndex: 9998,
      pointerEvents: 'none',
    };
  }

  let tooltipPos: TooltipPos = { top: window.innerHeight / 2 - 90, left: window.innerWidth / 2 - 160, arrowSide: null };
  if (targetRect) {
    tooltipPos = getTooltipPos(targetRect, currentStep.position, tooltipSize.w, tooltipSize.h);
  }

  const arrowBase: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
    border: '8px solid transparent',
  };

  let arrowStyle: React.CSSProperties = {};
  if (tooltipPos.arrowSide === 'top') {
    arrowStyle = { ...arrowBase, top: -16, left: '50%', transform: 'translateX(-50%)', borderBottomColor: '#0d1b2e' };
  } else if (tooltipPos.arrowSide === 'bottom') {
    arrowStyle = { ...arrowBase, bottom: -16, left: '50%', transform: 'translateX(-50%)', borderTopColor: '#0d1b2e' };
  } else if (tooltipPos.arrowSide === 'left') {
    arrowStyle = { ...arrowBase, left: -16, top: '50%', transform: 'translateY(-50%)', borderRightColor: '#0d1b2e' };
  } else if (tooltipPos.arrowSide === 'right') {
    arrowStyle = { ...arrowBase, right: -16, top: '50%', transform: 'translateY(-50%)', borderLeftColor: '#0d1b2e' };
  }

  return (
    <>
      {/* Full-screen dim — only when no spotlight */}
      {!targetRect && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 9998,
          }}
        />
      )}

      {/* Spotlight */}
      {targetRect && <div style={spotlightStyle} />}

      {/* Tooltip */}
      <div
        style={{
          position: 'fixed',
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: tooltipSize.w,
          zIndex: 9999,
          background: '#0d1b2e',
          border: '1px solid rgba(0,173,187,0.4)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          padding: '18px 20px 16px',
          color: '#e8edf5',
          fontFamily: 'inherit',
        }}
      >
        {/* Arrow */}
        {tooltipPos.arrowSide && <div style={arrowStyle} />}

        {/* Step counter */}
        <div style={{ fontSize: 11, color: 'rgba(0,173,187,0.8)', fontWeight: 600, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Paso {step + 1} de {STEPS.length}
        </div>

        {/* Title */}
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#fff' }}>
          {currentStep.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(232,237,245,0.8)', marginBottom: 16 }}>
          {currentStep.description}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            onClick={handleFinish}
            style={{
              fontSize: 12,
              color: 'rgba(232,237,245,0.45)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            Saltar tutorial
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                onClick={handlePrev}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'rgba(232,237,245,0.7)',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 7,
                  padding: '6px 14px',
                  cursor: 'pointer',
                }}
              >
                Anterior
              </button>
            )}
            <button
              onClick={handleNext}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: '#00ADBB',
                border: 'none',
                borderRadius: 7,
                padding: '6px 18px',
                cursor: 'pointer',
              }}
            >
              {step < STEPS.length - 1 ? 'Siguiente' : 'Finalizar'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
