import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TurnoEstado, normalizeDiasTrabajo, getDayName } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useCentroConfig } from '@/hooks/use-centro-config';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, Plus, Users, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { NuevoTurnoForm } from '@/components/NuevoTurnoForm';
import { TurnoDetailDialog } from '@/components/TurnoDetailDialog';
import { TurnoContextMenu } from '@/components/TurnoContextMenu';
import { ReprogramarTurnoDialog } from '@/components/ReprogramarTurnoDialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface Profesional { id: string; nombre: string; apellido: string; }

interface Agenda { id: string; nombre: string; }

interface PCSRecord {
  profesional_id: string | null;
  agenda_id: string | null;
  dias_trabajo: string[];
  hora_inicio: string;
  hora_fin: string;
  capacidad_simultanea: number;
  agenda?: { id: string; nombre: string; duracion_minutos: number; sesiones_por_bloque: number | null } | null;
}

interface Turno {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: TurnoEstado;
  profesional_id: string;
  paciente_id: string;
  servicio_id?: string | null;
  motivo_cancelacion?: string | null;
  paciente?: { nombre: string; apellido: string };
  servicio?: { nombre: string; agenda_id?: string | null } | null;
  tratamiento?: { total_sesiones: number } | null;
  sesion_num?: number;
  sesiones_total?: number | null;
  tiene_pago?: boolean;
}

function generateTimeSlots(inicio: string, fin: string, intervalo: number): string[] {
  const slots: string[] = [];
  const [hI, mI] = inicio.split(':').map(Number);
  const [hF, mF] = fin.split(':').map(Number);
  let total = hI * 60 + mI;
  const end = hF * 60 + mF;
  while (total <= end) {
    slots.push(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
    total += intervalo;
  }
  return slots;
}

const MOTIVO_LABELS: Record<string, string> = {
  por_paciente: 'Cancelado por paciente',
  por_profesional: 'Cancelado por profesional',
  error_carga: 'Error de carga',
  ausente: 'Ausente',
};

function getCancelLabel(motivo?: string | null): string {
  return motivo ? (MOTIVO_LABELS[motivo] ?? 'Cancelado') : 'Cancelado';
}

const ESTADO_COUNTS_LABELS: { key: TurnoEstado; label: string; color: string }[] = [
  { key: 'finalizado', label: 'Finalizados', color: '#1D9E75' },
  { key: 'confirmado', label: 'Confirmados', color: '#378ADD' },
  { key: 'en_sala', label: 'En sala', color: '#EF9F27' },
  { key: 'siendo_atendido', label: 'Siendo atendidos', color: '#60A5FA' },
  { key: 'cancelado', label: 'Cancelados / Ausentes', color: '#E24B4A' },
  { key: 'reservado', label: 'Reservados', color: '#7F77DD' },
];

export default function Dashboard() {
  const { centroId, perfil } = useAuth();
  const { toast } = useToast();
  const { getNumber, loading: configLoading } = useCentroConfig(centroId);
  const esProfesional = perfil?.rol_nombre === 'profesional';
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pcsRecords, setPcsRecords] = useState<PCSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfId, setSelectedProfId] = useState<string>(
    perfil?.profesional_id ?? 'todos'
  );
  const [newTurnoSlot, setNewTurnoSlot] = useState<{
    fecha: string; hora: string; profesional_id: string; profesional_nombre: string; agenda_id?: string;
  } | null>(null);
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);
  const [mobileColIndex, setMobileColIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; turno: Turno; profId: string; hora: string; agendaId?: string;
  } | null>(null);
  const [reprogramarTurno, setReprogramarTurno] = useState<Turno | null>(null);
  const [selectedEstados, setSelectedEstados] = useState<TurnoEstado[]>(
    ESTADO_COUNTS_LABELS.map(e => e.key)
  );
  const [pastWarningOpen, setPastWarningOpen] = useState(false);
  const [pendingSlot, setPendingSlot] = useState<typeof newTurnoSlot>(null);
  const [currentTimeStr, setCurrentTimeStr] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  });
  const isMobile = useIsMobile();

  useEffect(() => {
    const update = () => {
      const n = new Date();
      setCurrentTimeStr(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`);
    };
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, []);

  const isToday = useMemo(() => selectedDate.toDateString() === new Date().toDateString(), [selectedDate]);

  const showTimeLine = useCallback((hora: string, nextHora: string | undefined): boolean => {
    if (!isToday) return false;
    const [ch, cm] = currentTimeStr.split(':').map(Number);
    const curr = ch * 60 + cm;
    const [h, m] = hora.split(':').map(Number);
    const slot = h * 60 + m;
    const next = nextHora
      ? nextHora.split(':').map(Number).reduce((a, v, i) => i === 0 ? v * 60 : a + v, 0)
      : Infinity;
    return curr >= slot && curr < next;
  }, [isToday, currentTimeStr]);

  const dateStr = useMemo(() => {
    const d = selectedDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  const dayName = useMemo(() => getDayName(selectedDate.getDay()), [selectedDate]);

  // Slots por profesional validados contra PCS (dias+horario de la agenda)
  const profSlotMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    pcsRecords.forEach(r => {
      if (!r.profesional_id) return;
      if (!normalizeDiasTrabajo(r.dias_trabajo).includes(dayName)) return;
      const duracion = r.agenda?.duracion_minutos ?? getNumber('intervalo_turnos') ?? 30;
      const slots = generateTimeSlots(r.hora_inicio, r.hora_fin, duracion);
      if (!map[r.profesional_id]) map[r.profesional_id] = new Set();
      slots.forEach(s => map[r.profesional_id!].add(s));
    });
    return map;
  }, [pcsRecords, dayName, configLoading]);

  // Slots por profesional+agenda para el día seleccionado
  const agendaSlotMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    pcsRecords.forEach(r => {
      if (!r.profesional_id || !r.agenda) return;
      if (!normalizeDiasTrabajo(r.dias_trabajo).includes(dayName)) return;
      const key = `${r.profesional_id}-${r.agenda.id}`;
      const duracion = r.agenda.duracion_minutos ?? getNumber('intervalo_turnos') ?? 30;
      const slots = generateTimeSlots(r.hora_inicio, r.hora_fin, duracion);
      if (!map[key]) map[key] = new Set();
      slots.forEach(s => map[key].add(s));
    });
    return map;
  }, [pcsRecords, dayName, configLoading]);

  // Eje de tiempo: solo horas reales de trabajo (sin fallback al día completo)
  const timeAxis = useMemo(() => {
    const all = new Set<string>();
    const profIds = selectedProfId === 'todos'
      ? profesionales.map(p => p.id)
      : [selectedProfId];
    profIds.forEach(id => profSlotMap[id]?.forEach(s => all.add(s)));
    // Incluir horas de turnos existentes aunque estén fuera del horario configurado
    turnos.forEach(t => {
      if (selectedProfId !== 'todos' && t.profesional_id !== selectedProfId) return;
      const h = t.hora_inicio?.substring(0, 5);
      if (h) all.add(h);
    });
    return Array.from(all).sort();
  }, [profSlotMap, selectedProfId, profesionales, turnos]);





  // Agendas del profesional seleccionado (desde PCS)
  const agendasDelProf = useMemo((): Agenda[] => {
    if (selectedProfId === 'todos') return [];
    const seen = new Set<string>();
    const result: Agenda[] = [];
    pcsRecords
      .filter(r => r.profesional_id === selectedProfId && r.agenda)
      .forEach(r => {
        if (r.agenda && !seen.has(r.agenda.id)) {
          seen.add(r.agenda.id);
          result.push({ id: r.agenda.id, nombre: r.agenda.nombre });
        }
      });
    return result;
  }, [pcsRecords, selectedProfId]);

  const fetchData = async () => {
    if (!centroId) return;
    setLoading(true);
    const [profRes, turnosRes, pcsRes] = await Promise.all([
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
      supabase.from('turnos').select(`
        id, fecha, hora_inicio, estado, profesional_id, paciente_id, servicio_id, motivo_cancelacion, tratamiento_id,
        paciente:pacientes(nombre, apellido),
        servicio:servicios(nombre, agenda_id),
        tratamiento:tratamientos(total_sesiones)
      `).eq('fecha', dateStr).eq('centro_id', centroId),
      supabase.from('profesional_centro_servicio')
        .select('profesional_id, agenda_id, dias_trabajo, hora_inicio, hora_fin, capacidad_simultanea, agenda:agendas(id, nombre, duracion_minutos, sesiones_por_bloque)')
        .eq('centro_id', centroId).eq('activo', true),
    ]);
    const turnosList: Turno[] = (turnosRes.data as any[]) ?? [];
    const pcsListRaw: PCSRecord[] = ((pcsRes.data as any[]) ?? []).map((r: any) => ({
      ...r,
      dias_trabajo: normalizeDiasTrabajo(r.dias_trabajo),
      agenda: Array.isArray(r.agenda) ? (r.agenda[0] ?? null) : r.agenda,
    }));

    // Queries adicionales: conteo de sesiones finalizadas y pagos
    const uniquePacienteIds = [...new Set(turnosList.map(t => t.paciente_id).filter(Boolean))];
    const uniqueTurnoIds = turnosList.map(t => t.id);

    const [countRes, payRes] = await Promise.all([
      uniquePacienteIds.length > 0
        ? supabase.from('turnos').select('paciente_id, servicio_id').in('paciente_id', uniquePacienteIds).eq('centro_id', centroId!).eq('estado', 'finalizado')
        : Promise.resolve({ data: [] }),
      uniqueTurnoIds.length > 0
        ? supabase.from('caja_movimientos').select('turno_id, monto_efectivo, monto_transferencia, monto_prepaga').in('turno_id', uniqueTurnoIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Mapa finalizados: `pacienteId-servicioId` → cantidad
    const finalizedMap: Record<string, number> = {};
    ((countRes as any).data ?? []).forEach((r: any) => {
      const key = `${r.paciente_id}-${r.servicio_id}`;
      finalizedMap[key] = (finalizedMap[key] ?? 0) + 1;
    });

    // Set de turno_ids con pago cargado
    const pagadoSet = new Set<string>();
    ((payRes as any).data ?? []).forEach((p: any) => {
      if (p.turno_id && ((p.monto_efectivo ?? 0) + (p.monto_transferencia ?? 0) + (p.monto_prepaga ?? 0)) > 0) {
        pagadoSet.add(p.turno_id);
      }
    });

    // Enriquecer cada turno con nro sesión y pago
    const enriched: Turno[] = turnosList.map(t => {
      const key = `${t.paciente_id}-${t.servicio_id}`;
      const finalizados = finalizedMap[key] ?? 0;
      const sesion_num = t.estado === 'finalizado' ? finalizados : finalizados + 1;
      const agendaId = t.servicio?.agenda_id;
      const agendaRec = pcsListRaw.find(r => r.agenda?.id === agendaId);
      // Preferir total_sesiones del tratamiento real; fallback a sesiones_por_bloque de la agenda
      const sesiones_total = (t as any).tratamiento?.total_sesiones ?? agendaRec?.agenda?.sesiones_por_bloque ?? null;
      return { ...t, sesion_num, sesiones_total, tiene_pago: pagadoSet.has(t.id) };
    });

    setProfesionales(profRes.data ?? []);
    setTurnos(enriched);
    setPcsRecords(pcsListRaw);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateStr, centroId]);
  useEffect(() => { setMobileColIndex(0); }, [profesionales]);

  const handleEstadoChange = async (turnoId: string, estado: TurnoEstado, motivo?: string) => {
    const updateData: Record<string, unknown> = { estado };
    if (estado === 'cancelado' && motivo) updateData.motivo_cancelacion = motivo;
    else if (estado !== 'cancelado') updateData.motivo_cancelacion = null;
    const { error } = await supabase.from('turnos').update(updateData).eq('id', turnoId);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado', variant: 'destructive' });
      setContextMenu(null);
      return;
    }

    // Recalculate sesiones_consumidas based on actual finalized turnos
    const { data: turnoData } = await supabase.from('turnos').select('tratamiento_id').eq('id', turnoId).single();
    if (turnoData?.tratamiento_id) {
      const { count } = await supabase.from('turnos')
        .select('id', { count: 'exact', head: true })
        .eq('tratamiento_id', turnoData.tratamiento_id)
        .eq('estado', 'finalizado');
      const sesiones = count ?? 0;
      const { data: trat } = await supabase.from('tratamientos').select('total_sesiones').eq('id', turnoData.tratamiento_id).single();
      await supabase.from('tratamientos').update({
        sesiones_consumidas: sesiones,
        sesiones_restantes: (trat?.total_sesiones ?? 0) - sesiones,
      }).eq('id', turnoData.tratamiento_id);
    }

    fetchData();
    setContextMenu(null);
  };

  const filteredTurnos = useMemo(() =>
    turnos.filter(t => selectedEstados.includes(t.estado)),
  [turnos, selectedEstados]);

  const allEstadosSelected = selectedEstados.length === ESTADO_COUNTS_LABELS.length;

  const visibleTimeAxis = useMemo(() => {
    if (allEstadosSelected) return timeAxis;
    const horasConTurnos = new Set(filteredTurnos.map(t => t.hora_inicio?.substring(0, 5)).filter(Boolean));
    return timeAxis.filter(h => horasConTurnos.has(h));
  }, [timeAxis, filteredTurnos, allEstadosSelected]);


  // turnoMap: profId-hora → turnos (vista todos) — filtrado por estado
  const turnoMap = useMemo(() => {
    const map: Record<string, Turno[]> = {};
    filteredTurnos.forEach(t => {
      const hora = t.hora_inicio?.substring(0, 5);
      const key = `${t.profesional_id}-${hora}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [filteredTurnos]);

  // turnoMapAgenda: agendaId-hora → turnos (vista por profesional) — filtrado por estado
  const turnoMapAgenda = useMemo(() => {
    const map: Record<string, Turno[]> = {};
    filteredTurnos.forEach(t => {
      if (t.profesional_id !== selectedProfId) return;
      const agendaId = (t.servicio as any)?.agenda_id;
      if (!agendaId) return;
      const hora = t.hora_inicio?.substring(0, 5);
      const key = `${agendaId}-${hora}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [filteredTurnos, selectedProfId]);

  // capacidad por profesional (vista todos) — sin filtro de día
  const capacityMap = useMemo(() => {
    const map: Record<string, number> = {};
    pcsRecords.forEach(r => {
      if (!r.profesional_id) return;
      const cap = r.agenda?.sesiones_por_bloque ?? r.capacidad_simultanea ?? 1;
      map[r.profesional_id] = Math.max(map[r.profesional_id] ?? 1, cap);
    });
    return map;
  }, [pcsRecords]);

  // capacidad por agenda
  const agendaCapacityMap = useMemo(() => {
    const map: Record<string, number> = {};
    pcsRecords.forEach(r => {
      if (!r.agenda) return;
      const cap = r.agenda.sesiones_por_bloque ?? r.capacidad_simultanea ?? 1;
      map[r.agenda.id] = Math.max(map[r.agenda.id] ?? 1, cap);
    });
    return map;
  }, [pcsRecords]);

  const isSlotAvailable = (profId: string, hora: string) => profSlotMap[profId]?.has(hora) ?? false;

  const isAgendaSlotAvailable = (profId: string, agendaId: string, hora: string) =>
    agendaSlotMap[`${profId}-${agendaId}`]?.has(hora) ?? false;

  const isSlotFull = (profId: string, hora: string) => {
    const count = turnoMap[`${profId}-${hora}`]?.length ?? 0;
    return count >= (capacityMap[profId] ?? 1);
  };

  const isAgendaSlotFull = (agendaId: string, hora: string) => {
    const count = turnoMapAgenda[`${agendaId}-${hora}`]?.length ?? 0;
    return count >= (agendaCapacityMap[agendaId] ?? 1);
  };

  const openSlot = (slot: typeof newTurnoSlot) => {
    if (!slot) return;
    const slotTime = new Date(`${slot.fecha}T${slot.hora}:00`);
    if (slotTime < new Date()) {
      setPendingSlot(slot);
      setPastWarningOpen(true);
    } else {
      setNewTurnoSlot(slot);
    }
  };

  const handleSlotClick = (profId: string, hora: string) => {
    if (!isSlotAvailable(profId, hora)) return;
    if (isSlotFull(profId, hora)) return;
    const prof = profesionales.find(p => p.id === profId);
    openSlot({ fecha: dateStr, hora, profesional_id: profId, profesional_nombre: prof ? `${prof.nombre} ${prof.apellido}` : '' });
  };

  const handleAgendaSlotClick = (agendaId: string, hora: string) => {
    if (!isAgendaSlotAvailable(selectedProfId, agendaId, hora)) return;
    if (isAgendaSlotFull(agendaId, hora)) return;
    const prof = profesionales.find(p => p.id === selectedProfId);
    openSlot({ fecha: dateStr, hora, profesional_id: selectedProfId, profesional_nombre: prof ? `${prof.nombre} ${prof.apellido}` : '', agenda_id: agendaId });
  };

  const estadoResumen = useMemo(() => {
    const filtered = selectedProfId === 'todos' ? turnos : turnos.filter(t => t.profesional_id === selectedProfId);
    const counts: Record<string, number> = {};
    filtered.forEach(t => { counts[t.estado] = (counts[t.estado] ?? 0) + 1; });
    return counts;
  }, [turnos, selectedProfId]);

  const selectedProf = profesionales.find(p => p.id === selectedProfId);
  const visibleProfesionales = selectedProfId !== 'todos'
    ? [selectedProf!].filter(Boolean)
    : isMobile ? profesionales.slice(mobileColIndex, mobileColIndex + 1) : profesionales;

  const formattedDate = selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [selectedDate]);

  return (
    <div className="flex h-[calc(100vh-40px)] overflow-hidden">
      {/* ── LEFT PANEL ── */}
      <aside className="w-[300px] shrink-0 border-r bg-muted/40 flex flex-col gap-3 p-3 overflow-y-auto">
        {!esProfesional && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Profesional</p>
            <select
              value={selectedProfId}
              onChange={e => { setSelectedProfId(e.target.value); setMobileColIndex(0); }}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="todos">Todos</option>
              {profesionales.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>
              ))}
            </select>
          </div>
        )}

        <div className="border rounded-lg bg-background w-full">
          <Calendar mode="single" selected={selectedDate} onSelect={d => d && setSelectedDate(d)} className="w-full" />
        </div>

        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Filtrar estados</p>
          <div className="flex flex-col gap-2">
            {ESTADO_COUNTS_LABELS.map(e => {
              const count = estadoResumen[e.key] ?? 0;
              const checked = selectedEstados.includes(e.key);
              return (
                <label key={e.key} className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={ch => {
                      if (ch) setSelectedEstados(prev => [...prev, e.key]);
                      else setSelectedEstados(prev => prev.filter(x => x !== e.key));
                    }}
                  />
                  <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground flex-1">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    {e.label}
                  </span>
                  <span className="text-[12px] font-medium text-foreground">{count}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Agendas del profesional seleccionado */}
        {selectedProfId !== 'todos' && agendasDelProf.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Agendas</p>
            <div className="flex flex-wrap gap-1">
              {agendasDelProf.map(a => (
                <span key={a.id} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  {a.nombre}
                </span>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0 gap-3">
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold truncate">
              {selectedProfId === 'todos' ? 'Panel principal · Todos los profesionales' : `Agenda · ${selectedProf?.nombre ?? ''} ${selectedProf?.apellido ?? ''}`}
            </h1>
            <p className="text-[12px] text-muted-foreground capitalize">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {weekDays.map((d, i) => {
                const isSelected = d.toDateString() === selectedDate.toDateString();
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <button key={i} onClick={() => setSelectedDate(d)}
                    className={`w-7 h-7 rounded-full text-[12px] font-medium transition-colors
                      ${isSelected ? 'bg-[#0F6E56] text-white' : isToday ? 'border border-[#0F6E56] text-[#0F6E56]' : 'text-muted-foreground hover:bg-muted'}`}>
                    {d.getDate()}
                  </button>
                );
              })}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button size="sm" className="h-8 bg-[#0F6E56] hover:bg-[#0a5c48] text-white text-[12px] gap-1"
              onClick={() => {
                const profId = selectedProfId !== 'todos' ? selectedProfId : (profesionales[0]?.id ?? '');
                const prof = profesionales.find(p => p.id === profId);
                setNewTurnoSlot({ fecha: dateStr, hora: '09:00', profesional_id: profId, profesional_nombre: prof ? `${prof.nombre} ${prof.apellido}` : '', agenda_id: agendasDelProf[0]?.id });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo turno
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : profesionales.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No hay profesionales activos. Agregá uno desde el menú Agendas → Profesionales.
            </div>
          ) : timeAxis.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <p className="text-sm font-medium">Sin horarios configurados para este día</p>
              <p className="text-xs">Verificá la configuración en Agendas → Profesionales</p>
            </div>
          ) : selectedProfId === 'todos' ? (
            /* ── VISTA TODOS: columnas = profesionales ── */
            <div className="min-w-max">
              {isMobile && profesionales.length > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-b bg-background sticky top-0 z-10">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={mobileColIndex === 0} onClick={() => setMobileColIndex(i => i - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[13px] font-medium">{profesionales[mobileColIndex]?.nombre} {profesionales[mobileColIndex]?.apellido}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={mobileColIndex === profesionales.length - 1} onClick={() => setMobileColIndex(i => i + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50 sticky top-0 z-10">
                    <th className="p-2 text-[11px] font-medium text-muted-foreground w-14 text-left sticky left-0 bg-muted/50">Hora</th>
                    {visibleProfesionales.map(p => (
                      <th key={p.id} className="p-2 text-[12px] font-medium text-foreground text-center min-w-[150px]">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{p.nombre} {p.apellido}</span>
                          {(capacityMap[p.id] ?? 1) > 1 && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-normal">
                              <Users className="h-2.5 w-2.5" />{capacityMap[p.id]} lugares
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleTimeAxis.map((hora, idx) => (
                    <tr key={hora} className="border-b border-border/40"
                      style={showTimeLine(hora, visibleTimeAxis[idx + 1]) ? { borderBottom: '2px solid #E24B4A', position: 'relative' } : {}}>
                      <td className="p-1 px-2 text-[11px] font-mono sticky left-0 bg-card w-14"
                        style={{ color: showTimeLine(hora, visibleTimeAxis[idx + 1]) ? '#E24B4A' : undefined, fontWeight: showTimeLine(hora, visibleTimeAxis[idx + 1]) ? 600 : undefined }}>
                        {hora}
                      </td>
                      {visibleProfesionales.map(p => {
                        const slotTurnos = turnoMap[`${p.id}-${hora}`] ?? [];
                        const available = isSlotAvailable(p.id, hora);
                        const full = isSlotFull(p.id, hora);
                        const capacity = capacityMap[p.id] ?? 1;
                        return (
                          <td key={p.id}
                            className={`p-1 align-top min-h-[36px] transition-colors
                              ${available && !full ? 'cursor-pointer hover:bg-primary/5' : !available && slotTurnos.length === 0 ? 'bg-muted/40 cursor-not-allowed' : 'cursor-default'}`}
                            onClick={() => handleSlotClick(p.id, hora)}>
                            <div className="space-y-0.5">
                              {slotTurnos.map(t => {
                                const est = TURNO_ESTADOS[t.estado] ?? TURNO_ESTADOS.reservado;
                                return (
                                  <div key={t.id}
                                    className="relative rounded px-1.5 py-1 text-[11px] border-l-[3px] cursor-pointer hover:brightness-95"
                                    style={{ borderLeftColor: est.color, backgroundColor: `${est.color}22` }}
                                    onClick={e => { e.stopPropagation(); setSelectedTurno(t); }}
                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, turno: t, profId: p.id, hora }); }}>
                                    <div className="absolute top-0.5 right-1 flex items-center gap-0.5">
                                      {t.tiene_pago && <span className="text-[9px] font-bold text-emerald-600">$</span>}
                                      {t.sesiones_total && <span className="text-[9px] font-medium text-muted-foreground">{t.sesion_num}/{t.sesiones_total}</span>}
                                    </div>
                                    <p className="font-semibold text-foreground truncate leading-tight pr-7">
                                      {t.paciente ? `${t.paciente.apellido}, ${t.paciente.nombre}` : 'Paciente'}
                                    </p>
                                    <p className="leading-tight truncate" style={{ color: est.color }}>{t.estado === 'cancelado' ? getCancelLabel(t.motivo_cancelacion) : est.label}</p>
                                  </div>
                                );
                              })}
                              {capacity > 1 && slotTurnos.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <p className={`text-[10px] px-1 font-medium ${full ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    {slotTurnos.length}/{capacity}
                                  </p>
                                  {!full && available && (
                                    <button onClick={e => { e.stopPropagation(); handleSlotClick(p.id, hora); }}
                                      className="text-[10px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 leading-none">
                                      + turno
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── VISTA PROFESIONAL INDIVIDUAL: columnas = agendas ── */
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50 sticky top-0 z-10">
                    <th className="p-2 text-[11px] font-medium text-muted-foreground w-14 text-left sticky left-0 bg-muted/50">Hora</th>
                    {agendasDelProf.length > 0
                      ? agendasDelProf.map(a => (
                          <th key={a.id} className="p-2 text-[12px] font-medium text-foreground text-center min-w-[200px]">
                            {a.nombre}
                          </th>
                        ))
                      : <th className="p-2 text-[12px] font-medium text-foreground text-center min-w-[250px]">
                          {selectedProf?.nombre} {selectedProf?.apellido}
                        </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  {visibleTimeAxis.map((hora, idx) => (
                    <tr key={hora} className="border-b border-border/40"
                      style={showTimeLine(hora, visibleTimeAxis[idx + 1]) ? { borderBottom: '2px solid #E24B4A' } : {}}>
                      <td className="p-1 px-2 text-[11px] font-mono sticky left-0 bg-card w-14"
                        style={{ color: showTimeLine(hora, visibleTimeAxis[idx + 1]) ? '#E24B4A' : undefined, fontWeight: showTimeLine(hora, visibleTimeAxis[idx + 1]) ? 600 : undefined }}>
                        {hora}
                      </td>
                      {agendasDelProf.length > 0
                        ? agendasDelProf.map(a => {
                            const slotTurnos = turnoMapAgenda[`${a.id}-${hora}`] ?? [];
                            const cap = agendaCapacityMap[a.id] ?? 1;
                            const full = slotTurnos.length >= cap;
                            const available = isAgendaSlotAvailable(selectedProfId, a.id, hora);
                            return (
                              <td key={a.id}
                                className={`p-1 align-top min-h-[48px] transition-colors
                                  ${available && !full ? 'cursor-pointer hover:bg-primary/5' : slotTurnos.length > 0 ? 'cursor-default' : 'bg-muted/20 cursor-not-allowed'}`}
                                onClick={() => handleAgendaSlotClick(a.id, hora)}>
                                <div className="space-y-0.5">
                                  {slotTurnos.map(t => {
                                    const est = TURNO_ESTADOS[t.estado] ?? TURNO_ESTADOS.reservado;
                                    return (
                                      <div key={t.id}
                                        className="relative rounded px-2 py-1.5 text-[11px] border-l-[3px] cursor-pointer hover:brightness-95"
                                        style={{ borderLeftColor: est.color, backgroundColor: `${est.color}22` }}
                                        onClick={e => { e.stopPropagation(); setSelectedTurno(t); }}
                                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, turno: t, profId: selectedProfId, hora, agendaId: a.id }); }}>
                                        <div className="absolute top-0.5 right-1 flex items-center gap-0.5">
                                          {t.tiene_pago && <span className="text-[9px] font-bold text-emerald-600">$</span>}
                                          {t.sesiones_total && <span className="text-[9px] font-medium text-muted-foreground">{t.sesion_num}/{t.sesiones_total}</span>}
                                        </div>
                                        <p className="font-semibold text-foreground leading-tight pr-8">
                                          {t.paciente ? `${t.paciente.apellido}, ${t.paciente.nombre}` : 'Paciente'}
                                        </p>
                                        <p className="text-[10px] leading-tight text-muted-foreground">{t.servicio?.nombre}</p>
                                        <p className="leading-tight mt-0.5" style={{ color: est.color }}>{t.estado === 'cancelado' ? getCancelLabel(t.motivo_cancelacion) : est.label}</p>
                                      </div>
                                    );
                                  })}
                                  {cap > 1 && (
                                    <div className="flex items-center gap-1">
                                      <p className={`text-[10px] px-1 font-medium ${full ? 'text-destructive' : 'text-muted-foreground'}`}>
                                        {slotTurnos.length}/{cap} {full ? '· completo' : '· disponible'}
                                      </p>
                                      {!full && available && slotTurnos.length > 0 && (
                                        <button onClick={e => { e.stopPropagation(); handleAgendaSlotClick(a.id, hora); }}
                                          className="text-[10px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 leading-none">
                                          + turno
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })
                        : (
                            <td className="p-1 align-top min-h-[48px] cursor-pointer hover:bg-primary/5"
                              onClick={() => handleSlotClick(selectedProfId, hora)}>
                              <div className="space-y-0.5">
                                {(turnoMap[`${selectedProfId}-${hora}`] ?? []).map(t => {
                                  const est = TURNO_ESTADOS[t.estado] ?? TURNO_ESTADOS.reservado;
                                  return (
                                    <div key={t.id}
                                      className="relative rounded px-2 py-1.5 text-[11px] border-l-[3px] cursor-pointer hover:brightness-95"
                                      style={{ borderLeftColor: est.color, backgroundColor: `${est.color}22` }}
                                      onClick={e => { e.stopPropagation(); setSelectedTurno(t); }}
                                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, turno: t, profId: selectedProfId, hora }); }}>
                                      <div className="absolute top-0.5 right-1 flex items-center gap-0.5">
                                        {t.tiene_pago && <span className="text-[9px] font-bold text-emerald-600">$</span>}
                                        {t.sesiones_total && <span className="text-[9px] font-medium text-muted-foreground">{t.sesion_num}/{t.sesiones_total}</span>}
                                      </div>
                                      <p className="font-semibold pr-8">{t.paciente ? `${t.paciente.apellido}, ${t.paciente.nombre}` : 'Paciente'}</p>
                                      <p style={{ color: est.color }}>{t.estado === 'cancelado' ? getCancelLabel(t.motivo_cancelacion) : est.label}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          )
                      }
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Dialog: advertencia fecha pasada */}
      <Dialog open={pastWarningOpen} onOpenChange={o => { if (!o) { setPastWarningOpen(false); setPendingSlot(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              La fecha ya pasó
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            El horario seleccionado ({pendingSlot?.hora} horas del {pendingSlot?.fecha ? (() => { const [y,m,d] = pendingSlot.fecha.split('-'); return `${d}/${m}/${y.slice(2)}`; })() : ''}) ya es anterior a la hora actual. ¿Querés cargar el turno igual?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setPastWarningOpen(false); setPendingSlot(null); }}>Cancelar</Button>
            <Button size="sm" className="bg-[#0F6E56] hover:bg-[#0a5c48] text-white" onClick={() => { setPastWarningOpen(false); setNewTurnoSlot(pendingSlot); setPendingSlot(null); }}>
              Continuar igual
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <Dialog open={!!newTurnoSlot} onOpenChange={o => !o && setNewTurnoSlot(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Turno</DialogTitle></DialogHeader>
          {newTurnoSlot && (
            <NuevoTurnoForm
              fecha={newTurnoSlot.fecha}
              hora={newTurnoSlot.hora}
              profesionalId={newTurnoSlot.profesional_id}
              profesionalNombre={newTurnoSlot.profesional_nombre}
              preselectedAgendaId={newTurnoSlot.agenda_id}
              onSuccess={() => { setNewTurnoSlot(null); fetchData(); }}
              onCancel={() => setNewTurnoSlot(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <TurnoDetailDialog
        turno={selectedTurno}
        onClose={() => setSelectedTurno(null)}
        onUpdated={() => { setSelectedTurno(null); fetchData(); }}
      />

      <ReprogramarTurnoDialog
        turno={reprogramarTurno}
        onClose={() => setReprogramarTurno(null)}
        onReprogramado={() => { setReprogramarTurno(null); fetchData(); }}
      />

      {contextMenu && (
        <TurnoContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          slotFull={
            contextMenu.agendaId
              ? isAgendaSlotFull(contextMenu.agendaId, contextMenu.hora)
              : isSlotFull(contextMenu.profId, contextMenu.hora)
          }
          turnoId={contextMenu.turno?.id}
          onViewTurno={() => setSelectedTurno(contextMenu.turno)}
          onAddTurno={() => {
            const prof = profesionales.find(p => p.id === contextMenu.profId);
            setNewTurnoSlot({
              fecha: dateStr,
              hora: contextMenu.hora,
              profesional_id: contextMenu.profId,
              profesional_nombre: prof ? `${prof.nombre} ${prof.apellido}` : '',
              agenda_id: contextMenu.agendaId,
            });
          }}
          onEstadoChange={handleEstadoChange}
          onReprogramar={() => { setReprogramarTurno(contextMenu!.turno); setContextMenu(null); }}
          onEnviarRecordatorio={() => toast({ title: 'Enviar recordatorio', description: 'Función en desarrollo — próximamente disponible.' })}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
