import { useEffect, useRef, useState } from 'react';
import {
  Eye, UserPlus, AlertCircle, ChevronRight,
  CheckCircle2, XCircle, Clock, Calendar, MessageCircle,
} from 'lucide-react';
import { TurnoEstado } from '@/lib/constants';

interface TurnoContextMenuProps {
  x: number;
  y: number;
  slotFull: boolean;
  turnoId?: string;
  onAddTurno: () => void;
  onViewTurno: () => void;
  onEstadoChange?: (turnoId: string, estado: TurnoEstado, motivo?: string) => void;
  onReprogramar?: () => void;
  onEnviarRecordatorio?: () => void;
  onClose: () => void;
}

interface SubItem { label: string; value?: string; onClick?: () => void; danger?: boolean }

function SubMenu({ label, icon, items, onClose }: {
  label: string;
  icon: React.ReactNode;
  items: SubItem[];
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
      >
        {icon}
        {label}
        <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
      </button>
      {open && (
        <div className="absolute left-full top-0 z-[10000] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl min-w-[220px] py-1 overflow-hidden">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); item.onClick?.(); onClose(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-left transition-colors ${
                item.danger
                  ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TurnoContextMenu({
  x, y, slotFull, turnoId,
  onAddTurno, onViewTurno, onEstadoChange,
  onReprogramar, onEnviarRecordatorio, onClose,
}: TurnoContextMenuProps) {
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

  // Ajustar para no salirse de pantalla (ancho del submenu ~220px + menú ~220px)
  const adjustedX = Math.min(x, window.innerWidth - 460);
  const adjustedY = Math.min(y, window.innerHeight - 320);

  const estadoItems: SubItem[] = turnoId && onEstadoChange ? [
    { label: '✅  Llegó (en sala)', onClick: () => onEstadoChange(turnoId, 'en_sala') },
    { label: '🩺  Siendo atendido', onClick: () => onEstadoChange(turnoId, 'siendo_atendido') },
    { label: '✔️  Finalizó', onClick: () => onEstadoChange(turnoId, 'finalizado') },
    { label: '🚫  Ausente', onClick: () => onEstadoChange(turnoId, 'cancelado', 'ausente') },
  ] : [];

  const cancelarItems: SubItem[] = turnoId && onEstadoChange ? [
    { label: 'Cancelado por paciente', onClick: () => onEstadoChange(turnoId, 'cancelado', 'por_paciente'), danger: true },
    { label: 'Cancelado por profesional', onClick: () => onEstadoChange(turnoId, 'cancelado', 'por_profesional'), danger: true },
    { label: 'Error de carga', onClick: () => onEstadoChange(turnoId, 'cancelado', 'error_carga'), danger: true },
  ] : [];

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: adjustedY, left: adjustedX, zIndex: 9999 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl min-w-[220px] py-1 overflow-visible"
    >
      {/* Ver detalle */}
      <button
        onClick={e => { e.stopPropagation(); onViewTurno(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
      >
        <Eye className="w-3.5 h-3.5 opacity-60" />
        Ver detalle del turno
      </button>

      <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-2 my-0.5" />

      {/* Agregar turno */}
      {slotFull ? (
        <div className="flex items-start gap-2.5 px-3 py-2.5 text-[12px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Límite de turnos alcanzado</span>
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

      {turnoId && (
        <>
          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-2 my-0.5" />

          {/* Submenu Estados */}
          <SubMenu
            label="Estado"
            icon={<CheckCircle2 className="w-3.5 h-3.5 opacity-60" />}
            items={estadoItems}
            onClose={onClose}
          />

          {/* Submenu Cancelar */}
          <SubMenu
            label="Cancelar"
            icon={<XCircle className="w-3.5 h-3.5 text-red-400" />}
            items={cancelarItems}
            onClose={onClose}
          />

          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-2 my-0.5" />

          {/* Reprogramar */}
          <button
            onClick={e => { e.stopPropagation(); onReprogramar?.(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 opacity-60" />
            Reprogramar turno
            <span className="ml-auto text-[10px] text-zinc-400 italic">próximamente</span>
          </button>

          {/* Recordatorio */}
          <button
            onClick={e => { e.stopPropagation(); onEnviarRecordatorio?.(); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 opacity-60" />
            Enviar recordatorio
            <span className="ml-auto text-[10px] text-zinc-400 italic">próximamente</span>
          </button>
        </>
      )}
    </div>
  );
}
