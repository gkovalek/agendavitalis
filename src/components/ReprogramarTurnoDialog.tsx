import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, CalendarDays, Clock, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { es } from 'date-fns/locale';

interface TurnoBasic {
  id: string;
  fecha: string;
  hora_inicio: string;
  profesional_id: string;
  paciente?: { nombre: string; apellido: string } | null;
  servicio?: { nombre: string; agenda_id?: string | null } | null;
}

interface Props {
  turno: TurnoBasic | null;
  onClose: () => void;
  onReprogramado: () => void;
}

interface SlotOcupado {
  hora_inicio: string;
}

interface PCSRecord {
  hora_inicio: string;
  hora_fin: string;
  dias_trabajo: string | string[];
  agenda_id: string | null;
  agenda?: { duracion_minutos: number; sesiones_por_bloque: number } | null;
}

function generateSlots(horaInicio: string, horaFin: string, duracion: number): string[] {
  const slots: string[] = [];
  const [h0, m0] = horaInicio.split(':').map(Number);
  const [hf, mf] = horaFin.split(':').map(Number);
  let min = h0 * 60 + m0;
  const maxMin = hf * 60 + mf;
  while (min < maxMin) {
    const h = Math.floor(min / 60).toString().padStart(2, '0');
    const m = (min % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    min += duracion;
  }
  return slots;
}

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function ReprogramarTurnoDialog({ turno, onClose, onReprogramado }: Props) {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const [newDate, setNewDate] = useState<Date | undefined>(undefined);
  const [newHora, setNewHora] = useState<string | null>(null);
  const [slotsDisponibles, setSlotsDisponibles] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pcs, setPcs] = useState<PCSRecord | null>(null);

  // Cargar config del profesional/agenda al abrir
  useEffect(() => {
    if (!turno || !centroId) return;
    const agendaId = turno.servicio?.agenda_id;
    supabase
      .from('profesional_centro_servicio')
      .select('hora_inicio, hora_fin, dias_trabajo, agenda_id, agenda:agendas(duracion_minutos, sesiones_por_bloque)')
      .eq('centro_id', centroId)
      .eq('profesional_id', turno.profesional_id)
      .then(({ data }) => {
        const rec = agendaId
          ? (data ?? []).find((r: any) => r.agenda_id === agendaId)
          : (data ?? [])[0];
        setPcs(rec ?? null);
      });
  }, [turno?.id]);

  // Cuando cambia la fecha, calcular slots disponibles
  useEffect(() => {
    if (!newDate || !turno || !pcs) return;
    setNewHora(null);
    setLoadingSlots(true);

    const dateStr = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;
    const duracion = pcs.agenda?.duracion_minutos ?? 30;
    const allSlots = generateSlots(pcs.hora_inicio, pcs.hora_fin, duracion);

    supabase
      .from('turnos')
      .select('hora_inicio')
      .eq('profesional_id', turno.profesional_id)
      .eq('fecha', dateStr)
      .eq('centro_id', centroId!)
      .neq('id', turno.id)
      .in('estado', ['reservado', 'confirmado', 'en_sala', 'siendo_atendido'])
      .then(({ data }) => {
        const ocupados = new Set((data ?? []).map((t: SlotOcupado) => t.hora_inicio.substring(0, 5)));
        setSlotsDisponibles(allSlots.filter(s => !ocupados.has(s)));
        setLoadingSlots(false);
      });
  }, [newDate, pcs]);

  const handleConfirmar = async () => {
    if (!turno || !newDate || !newHora) return;
    setSaving(true);

    const dateStr = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-${String(newDate.getDate()).padStart(2, '0')}`;

    const { error } = await supabase
      .from('turnos')
      .update({ fecha: dateStr, hora_inicio: newHora + ':00', estado: 'reservado' })
      .eq('id', turno.id);

    setSaving(false);

    if (error) {
      toast({ title: 'Error', description: 'No se pudo reprogramar el turno.', variant: 'destructive' });
      return;
    }

    toast({
      title: 'Turno reprogramado',
      description: `Nuevo turno: ${newDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${newHora}`,
    });
    onReprogramado();
    onClose();
  };

  // Deshabilitar días fuera del horario del profesional
  const isDayDisabled = (date: Date): boolean => {
    if (!pcs) return false;
    const dayName = DAY_NAMES[date.getDay()];
    const dias = Array.isArray(pcs.dias_trabajo)
      ? pcs.dias_trabajo
      : typeof pcs.dias_trabajo === 'string'
        ? JSON.parse(pcs.dias_trabajo || '[]')
        : [];
    return !dias.includes(dayName);
  };

  const fechaOriginal = turno
    ? new Date(turno.fecha + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <Dialog open={!!turno} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="p-0 max-w-lg overflow-hidden gap-0">
        {/* Header */}
        <div className="bg-[#0F6E56] text-white px-5 py-4">
          <DialogTitle className="text-white text-[15px] font-bold flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Reprogramar turno
          </DialogTitle>
          {turno && (
            <div className="mt-1 space-y-0.5 text-[12px] text-white/80">
              <p className="flex items-center gap-1.5"><User className="w-3 h-3" />{turno.paciente?.apellido}, {turno.paciente?.nombre}</p>
              <p className="flex items-center gap-1.5"><Clock className="w-3 h-3" />Turno actual: {fechaOriginal} · {turno.hora_inicio.substring(0, 5)}</p>
              {turno.servicio?.nombre && <p className="text-white/60">{turno.servicio.nombre}</p>}
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Selector de fecha */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">1. Elegí la nueva fecha</p>
            <div className="flex justify-center border rounded-lg p-2">
              <Calendar
                mode="single"
                selected={newDate}
                onSelect={setNewDate}
                locale={es}
                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) || isDayDisabled(date)}
                className="rounded-md"
              />
            </div>
          </div>

          {/* Selector de hora */}
          {newDate && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">2. Elegí el horario</p>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : slotsDisponibles.length === 0 ? (
                <p className="text-[13px] text-muted-foreground text-center py-3 border rounded-lg bg-muted/30">
                  No hay horarios disponibles para este día
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-40 overflow-y-auto">
                  {slotsDisponibles.map(slot => (
                    <button
                      key={slot}
                      onClick={() => setNewHora(slot)}
                      className={`py-1.5 px-2 rounded text-[12px] font-medium border transition-colors ${
                        newHora === slot
                          ? 'bg-[#0F6E56] text-white border-[#0F6E56]'
                          : 'bg-background hover:bg-primary/5 border-border text-foreground'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resumen */}
          {newDate && newHora && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3">
              <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">Nuevo turno:</p>
              <p className="text-[14px] font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                {newDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · {newHora}
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">El estado se cambia a "Reservado"</p>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleConfirmar}
              disabled={!newDate || !newHora || saving}
              className="flex-1"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar reprogramación
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
