import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TurnoEstado, normalizeDiasTrabajo, getDayName } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useCentroConfig } from '@/hooks/use-centro-config';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react';
import { NuevoTurnoForm } from '@/components/NuevoTurnoForm';
import { TurnoDetailDialog } from '@/components/TurnoDetailDialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface Profesional {
  id: string;
  nombre: string;
  apellido: string;
}

interface Servicio {
  id: string;
  nombre: string;
}

interface PCSRecord {
  profesional_id: string | null;
  servicio_id: string | null;
  dias_trabajo: string[];
  hora_inicio: string;
  hora_fin: string;
  capacidad_simultanea: number;
  servicio?: { id: string; nombre: string; duracion_minutos: number } | null;
}

interface Turno {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: TurnoEstado;
  profesional_id: string;
  paciente_id: string;
  servicio_id?: string | null;
  paciente?: { nombre: string; apellido: string };
  servicio?: { nombre: string } | null;
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

const ESTADO_COUNTS_LABELS: { key: TurnoEstado; label: string; color: string }[] = [
  { key: 'finalizado', label: 'Finalizados', color: '#1D9E75' },
  { key: 'confirmado', label: 'Confirmados', color: '#378ADD' },
  { key: 'en_sala', label: 'En sala', color: '#EF9F27' },
  { key: 'cancelado', label: 'Cancelados / Ausentes', color: '#E24B4A' },
  { key: 'reservado', label: 'Reservados', color: '#7F77DD' },
];

export default function Dashboard() {
  const { centroId } = useAuth();
  const { getNumber, get, loading: configLoading } = useCentroConfig(centroId);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pcsRecords, setPcsRecords] = useState<PCSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfId, setSelectedProfId] = useState<string>('todos');
  const [newTurnoSlot, setNewTurnoSlot] = useState<{ fecha: string; hora: string; profesional_id: string; profesional_nombre: string } | null>(null);
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);
  const [mobileColIndex, setMobileColIndex] = useState(0);
  const isMobile = useIsMobile();

  const dateStr = useMemo(() => {
    const d = selectedDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  const dayName = useMemo(() => getDayName(selectedDate.getDay()), [selectedDate]);

  const profSlotMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    pcsRecords.forEach(r => {
      if (!r.profesional_id) return;
      if (!normalizeDiasTrabajo(r.dias_trabajo).includes(dayName)) return;
      const duracion = r.servicio?.duracion_minutos ?? getNumber('intervalo_turnos') ?? 30;
      const slots = generateTimeSlots(r.hora_inicio, r.hora_fin, duracion);
      if (!map[r.profesional_id]) map[r.profesional_id] = new Set();
      slots.forEach(s => map[r.profesional_id!].add(s));
    });
    return map;
  }, [pcsRecords, dayName, configLoading]);

  const timeAxis = useMemo(() => {
    const all = new Set<string>();
    const profIds = selectedProfId === 'todos'
      ? profesionales.map(p => p.id)
      : [selectedProfId];
    profIds.forEach(id => profSlotMap[id]?.forEach(s => all.add(s)));
    if (all.size === 0) {
      const intervalo = getNumber('intervalo_turnos') ?? 30;
      const inicio = get('hora_inicio_agenda') ?? '08:00';
      const fin = get('hora_fin_agenda') ?? '20:00';
      generateTimeSlots(inicio, fin, intervalo).forEach(s => all.add(s));
    }
    return Array.from(all).sort();
  }, [profSlotMap, selectedProfId, profesionales, configLoading]);

  // Servicios disponibles para el profesional seleccionado
  const serviciosDelProf = useMemo((): Servicio[] => {
    if (selectedProfId === 'todos') return [];
    const seen = new Set<string>();
    const result: Servicio[] = [];
    pcsRecords
      .filter(r => r.profesional_id === selectedProfId && r.servicio)
      .forEach(r => {
        if (r.servicio && !seen.has(r.servicio.id)) {
          seen.add(r.servicio.id);
          result.push({ id: r.servicio.id, nombre: r.servicio.nombre });
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
        id, fecha, hora_inicio, estado, profesional_id, paciente_id, servicio_id,
        paciente:pacientes(nombre, apellido),
        servicio:servicios(nombre)
      `).eq('fecha', dateStr).eq('centro_id', centroId),
      supabase.from('profesional_centro_servicio').select('profesional_id, servicio_id, dias_trabajo, hora_inicio, hora_fin, capacidad_simultanea, servicio:servicios(id, nombre, duracion_minutos)').eq('centro_id', centroId).eq('activo', true),
    ]);
    setProfesionales(profRes.data ?? []);
    setTurnos((turnosRes.data as any[]) ?? []);
    setPcsRecords(((pcsRes.data as PCSRecord[]) ?? []).map(r => ({ ...r, dias_trabajo: normalizeDiasTrabajo(r.dias_trabajo) })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateStr, centroId]);
  useEffect(() => { setMobileColIndex(0); }, [profesionales]);

  const turnoMap = useMemo(() => {
    const map: Record<string, Turno[]> = {};
    turnos.forEach(t => {
      const hora = t.hora_inicio?.substring(0, 5);
      const key = `${t.profesional_id}-${hora}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [turnos]);

  // servicio_id-hora (para un profesional) → turnos
  const turnoMapServicio = useMemo(() => {
    const map: Record<string, Turno[]> = {};
    turnos.forEach(t => {
      if (t.profesional_id !== selectedProfId) return;
      const hora = t.hora_inicio?.substring(0, 5);
      const key = `${t.servicio_id ?? 'sin-servicio'}-${hora}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [turnos, selectedProfId]);

  const capacityMap = useMemo(() => {
    const map: Record<string, number> = {};
    pcsRecords.forEach(r => {
      if (!r.profesional_id) return;
      if (normalizeDiasTrabajo(r.dias_trabajo).includes(dayName)) {
        map[r.profesional_id] = Math.max(map[r.profesional_id] ?? 1, r.capacidad_simultanea ?? 1);
      }
    });
    return map;
  }, [pcsRecords, dayName]);

  const isSlotAvailable = (profId: string, hora: string) => profSlotMap[profId]?.has(hora) ?? true;
  const isSlotFull = (profId: string, hora: string) => {
    const slotTurnos = turnoMap[`${profId}-${hora}`] ?? [];
    return slotTurnos.length >= (capacityMap[profId] ?? 1);
  };

  const handleSlotClick = (profId: string, hora: string) => {
    const slotTurnos = turnoMap[`${profId}-${hora}`] ?? [];
    const available = isSlotAvailable(profId, hora);
    const full = isSlotFull(profId, hora);
    if (available && !full) {
      const prof = profesionales.find(p => p.id === profId);
      setNewTurnoSlot({ fecha: dateStr, hora, profesional_id: profId, profesional_nombre: prof ? `${prof.nombre} ${prof.apellido}` : '' });
    } else if (slotTurnos.length > 0 && !full && available) {
      const prof = profesionales.find(p => p.id === profId);
      setNewTurnoSlot({ fecha: dateStr, hora, profesional_id: profId, profesional_nombre: prof ? `${prof.nombre} ${prof.apellido}` : '' });
    }
  };

  // Resumen de estados del día
  const estadoResumen = useMemo(() => {
    const turnosFiltrados = selectedProfId === 'todos'
      ? turnos
      : turnos.filter(t => t.profesional_id === selectedProfId);
    const counts: Record<string, number> = {};
    turnosFiltrados.forEach(t => { counts[t.estado] = (counts[t.estado] ?? 0) + 1; });
    return counts;
  }, [turnos, selectedProfId]);

  const selectedProf = profesionales.find(p => p.id === selectedProfId);
  const visibleProfesionales = selectedProfId !== 'todos'
    ? [selectedProf!].filter(Boolean)
    : isMobile
      ? profesionales.slice(mobileColIndex, mobileColIndex + 1)
      : profesionales;

  const formattedDate = selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Genera strip de 7 días centrado en la fecha seleccionada
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
        {/* Selector de profesional */}
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

        {/* Mini calendario */}
        <div className="border rounded-lg overflow-hidden bg-background w-full">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={d => d && setSelectedDate(d)}
            className="w-full"
          />
        </div>

        {/* Resumen de estados */}
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            {selectedProfId === 'todos' ? 'Hoy · todos' : `${selectedProf?.nombre?.split(' ')[0] ?? ''}`}
          </p>
          <div className="flex flex-col gap-1">
            {ESTADO_COUNTS_LABELS.map(e => {
              const count = estadoResumen[e.key] ?? 0;
              return (
                <div key={e.key} className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    {e.label}
                  </span>
                  <span className="font-medium text-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Servicios del profesional (solo cuando se selecciona uno) */}
        {selectedProfId !== 'todos' && serviciosDelProf.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Servicios</p>
            <div className="flex flex-wrap gap-1">
              {serviciosDelProf.map(s => (
                <span key={s.id} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  {s.nombre}
                </span>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sub-header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0 gap-3">
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold truncate">
              {selectedProfId === 'todos' ? 'Panel principal · Todos los profesionales' : `Agenda · ${selectedProf?.nombre ?? ''} ${selectedProf?.apellido ?? ''}`}
            </h1>
            <p className="text-[12px] text-muted-foreground capitalize">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Strip de días */}
            <div className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {weekDays.map((d, i) => {
                const isSelected = d.toDateString() === selectedDate.toDateString();
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(d)}
                    className={`w-7 h-7 rounded-full text-[12px] font-medium transition-colors
                      ${isSelected
                        ? 'bg-[#0F6E56] text-white'
                        : isToday
                          ? 'border border-[#0F6E56] text-[#0F6E56]'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button
              size="sm"
              className="h-8 bg-[#0F6E56] hover:bg-[#0a5c48] text-white text-[12px] gap-1"
              onClick={() => {
                const profId = selectedProfId !== 'todos' ? selectedProfId : (profesionales[0]?.id ?? '');
                const prof = profesionales.find(p => p.id === profId);
                setNewTurnoSlot({ fecha: dateStr, hora: '09:00', profesional_id: profId, profesional_nombre: prof ? `${prof.nombre} ${prof.apellido}` : '' });
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo turno
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : profesionales.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No hay profesionales activos. Agregá uno desde el menú Agendas → Profesionales.
            </div>
          ) : selectedProfId === 'todos' ? (
            /* ── VISTA TODOS ── */
            <div className="min-w-max">
              {isMobile && profesionales.length > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-b bg-background sticky top-0 z-10">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={mobileColIndex === 0} onClick={() => setMobileColIndex(i => i - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[13px] font-medium">
                    {profesionales[mobileColIndex]?.nombre} {profesionales[mobileColIndex]?.apellido}
                  </span>
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
                              <Users className="h-2.5 w-2.5" />{capacityMap[p.id]} asientos
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeAxis.map(hora => (
                    <tr key={hora} className="border-b border-border/40">
                      <td className="p-1 px-2 text-[11px] text-muted-foreground font-mono sticky left-0 bg-card w-14">{hora}</td>
                      {visibleProfesionales.map(p => {
                        const slotTurnos = turnoMap[`${p.id}-${hora}`] ?? [];
                        const available = isSlotAvailable(p.id, hora);
                        const full = isSlotFull(p.id, hora);
                        const capacity = capacityMap[p.id] ?? 1;
                        return (
                          <td
                            key={p.id}
                            className={`p-1 align-top min-h-[36px] transition-colors
                              ${available && !full ? 'cursor-pointer hover:bg-primary/5' : !available && slotTurnos.length === 0 ? 'bg-muted/40 cursor-not-allowed' : 'cursor-default'}`}
                            onClick={() => handleSlotClick(p.id, hora)}
                          >
                            <div className="space-y-0.5">
                              {slotTurnos.map(t => {
                                const est = TURNO_ESTADOS[t.estado] ?? TURNO_ESTADOS.reservado;
                                return (
                                  <div
                                    key={t.id}
                                    className="rounded px-1.5 py-1 text-[11px] border-l-[3px] cursor-pointer hover:brightness-95"
                                    style={{ borderLeftColor: est.color, backgroundColor: `${est.color}22` }}
                                    onClick={e => { e.stopPropagation(); setSelectedTurno(t); }}
                                  >
                                    <p className="font-semibold text-foreground truncate leading-tight">
                                      {t.paciente ? `${t.paciente.apellido}, ${t.paciente.nombre}` : 'Paciente'}
                                    </p>
                                    <p className="leading-tight truncate" style={{ color: est.color }}>{est.label}</p>
                                  </div>
                                );
                              })}
                              {capacity > 1 && slotTurnos.length > 0 && (
                                <p className={`text-[10px] px-1 font-medium ${full ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {slotTurnos.length}/{capacity}
                                </p>
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
            /* ── VISTA PROFESIONAL INDIVIDUAL (columnas = servicios) ── */
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50 sticky top-0 z-10">
                    <th className="p-2 text-[11px] font-medium text-muted-foreground w-14 text-left sticky left-0 bg-muted/50">Hora</th>
                    {serviciosDelProf.length > 0
                      ? serviciosDelProf.map(s => (
                          <th key={s.id} className="p-2 text-[12px] font-medium text-foreground text-center min-w-[200px]">
                            {s.nombre}
                          </th>
                        ))
                      : (
                          <th className="p-2 text-[12px] font-medium text-foreground text-center min-w-[250px]">
                            {selectedProf?.nombre} {selectedProf?.apellido}
                          </th>
                        )
                    }
                  </tr>
                </thead>
                <tbody>
                  {timeAxis.map(hora => (
                    <tr key={hora} className="border-b border-border/40">
                      <td className="p-1 px-2 text-[11px] text-muted-foreground font-mono sticky left-0 bg-card w-14">{hora}</td>
                      {serviciosDelProf.length > 0
                        ? serviciosDelProf.map(s => {
                            const key = `${s.id}-${hora}`;
                            const slotTurnos = turnoMapServicio[key] ?? [];
                            return (
                              <td
                                key={s.id}
                                className="p-1 align-top min-h-[48px] cursor-pointer hover:bg-primary/5 transition-colors"
                                onClick={() => handleSlotClick(selectedProfId, hora)}
                              >
                                <div className="space-y-0.5">
                                  {slotTurnos.map(t => {
                                    const est = TURNO_ESTADOS[t.estado] ?? TURNO_ESTADOS.reservado;
                                    return (
                                      <div
                                        key={t.id}
                                        className="rounded px-2 py-1.5 text-[11px] border-l-[3px] cursor-pointer hover:brightness-95"
                                        style={{ borderLeftColor: est.color, backgroundColor: `${est.color}22` }}
                                        onClick={e => { e.stopPropagation(); setSelectedTurno(t); }}
                                      >
                                        <p className="font-semibold text-foreground leading-tight">
                                          {t.paciente ? `${t.paciente.apellido}, ${t.paciente.nombre}` : 'Paciente'}
                                        </p>
                                        {t.servicio && (
                                          <p className="text-[10px] text-muted-foreground leading-tight truncate">
                                            {t.servicio.nombre}
                                          </p>
                                        )}
                                        <p className="leading-tight mt-0.5" style={{ color: est.color }}>{est.label}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            );
                          })
                        : (
                            <td
                              className="p-1 align-top min-h-[48px] cursor-pointer hover:bg-primary/5"
                              onClick={() => handleSlotClick(selectedProfId, hora)}
                            >
                              <div className="space-y-0.5">
                                {(turnoMap[`${selectedProfId}-${hora}`] ?? []).map(t => {
                                  const est = TURNO_ESTADOS[t.estado] ?? TURNO_ESTADOS.reservado;
                                  return (
                                    <div
                                      key={t.id}
                                      className="rounded px-2 py-1.5 text-[11px] border-l-[3px] cursor-pointer"
                                      style={{ borderLeftColor: est.color, backgroundColor: `${est.color}22` }}
                                      onClick={e => { e.stopPropagation(); setSelectedTurno(t); }}
                                    >
                                      <p className="font-semibold">{t.paciente ? `${t.paciente.apellido}, ${t.paciente.nombre}` : 'Paciente'}</p>
                                      <p style={{ color: est.color }}>{est.label}</p>
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
    </div>
  );
}
