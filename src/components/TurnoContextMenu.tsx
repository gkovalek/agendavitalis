import { useEffect, useRef } from 'react';
import { UserPlus, Eye, XCircle, AlertCircle } from 'lucide-react';

interface TurnoContextMenuProps {
  x: number;
  y: number;
  slotFull: boolean;
  onAddTurno: () => void;
  onViewTurno: () => void;
  onClose: () => void;
}

export function TurnoContextMenu({ x, y, slotFull, onAddTurno, onViewTurno, onClose }: TurnoContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Ajustar posición para que no se salga de la pantalla
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 160);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: adjustedY, left: adjustedX, zIndex: 9999 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl min-w-[200px] py-1 overflow-hidden"
    >
      <button
        onClick={e => { e.stopPropagation(); onViewTurno(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
      >
        <Eye className="w-3.5 h-3.5 opacity-60" />
        Ver detalle del turno
      </button>

      <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-2 my-0.5" />

      {slotFull ? (
        <div className="flex items-start gap-2.5 px-3 py-2.5 text-[12px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Límite de turnos alcanzado para este horario</span>
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); onAddTurno(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-[#0F6E56] hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-left transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Agregar turno en este horario
        </button>
      )}
    </div>
  );
}
