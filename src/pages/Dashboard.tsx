import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { CENTRO_ID, TURNO_ESTADOS, TIME_SLOTS, TurnoEstado } from '@/lib/constants';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { NuevoTurnoForm } from '@/components/NuevoTurnoForm';
import { TurnoDetailDialog } from '@/components/TurnoDetailDialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface Profesional {
  id: string;
  nombre: string;
  apellido: string;
}

interface Turno {
  id: string;
  fecha: string;
  hora: string;
  estado: TurnoEstado;
  profesional_id: string;
  paciente_id: string;
  monto_pagado: number | null;
  paciente?: { nombre: string; apellido: string };
}

interface HorarioDisponible {
  tipo: 'semanal' | 'especifico';
  dia_semana: number[] | null;
  fecha_especifica: string | null;
  hora_inicio: string;
  hora_fin: string;
  profesional_id: string | null;
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [horarios, setHorarios] = useState<HorarioDisponible[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTurnoSlot, setNewTurnoSlot] = useState<{ fecha: string; hora: string; profesional_id: string; profesional_nombre: string } | null>(null);
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);
  const [mobileColIndex, setMobileColIndex] = useState(0);
  const isMobile = useIsMobile();

  const dateStr = useMemo(() => {
    const d = selectedDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  // Day of week: 1=Monday ... 6=Saturday, 0=Sunday
  const dayOfWeek = useMemo(() => {
    const jsDay = selectedDate.getDay(); // 0=Sun
    return jsDay === 0 ? 7 : jsDay; // convert to 1=Mon...7=Sun
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    const [profRes, turnosRes, horariosRes] = await Promise.all([
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', CENTRO_ID).eq('activo', true).order('apellido'),
      supabase.from('turnos').select('id, fecha, hora, estado, profesional_id, paciente_id, monto_pagado, paciente:pacientes(nombre, apellido)').eq('fecha', dateStr).eq('centro_id', CENTRO_ID),
      supabase.from('profesional_centro_servicio')
        .select('profesional_id, horarios:horarios_disponibles(tipo, dia_semana, fecha_especifica, hora_inicio, hora_fin)')
        .eq('centro_id', CENTRO_ID)
        .eq('activo', true),
    ]);
    setProfesionales(profRes.data ?? []);
    setTurnos((turnosRes.data as any[]) ?? []);

    // Flatten horarios with profesional_id
    const flatHorarios: HorarioDisponible[] = [];
    ((horariosRes.data as any[]) ?? []).forEach((pcs: any) => {
      ((pcs.horarios as any[]) ?? []).forEach((h: any) => {
        flatHorarios.push({
          tipo: h.tipo,
          dia_semana: h.dia_semana,
          fecha_especifica: h.fecha_especifica,
          hora_inicio: h.hora_inicio,
          hora_fin: h.hora_fin,
          profesional_id: pcs.profesional_id,
        });
      });
    });
    setHorarios(flatHorarios);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateStr]);
  useEffect(() => { setMobileColIndex(0); }, [profesionales]);

  const turnoMap = useMemo(() => {
    const map: Record<string, Turno> = {};
    turnos.forEach(t => { map[`${t.profesional_id}-${t.hora}`] = t; });
    return map;
  }, [turnos]);

  // Build availability map: profId -> Set of available time slots
  const availabilityMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    // Group horarios by profesional_id
    const profHorarios: Record<string, HorarioDisponible[]> = {};
    horarios.forEach(h => {
      if (!h.profesional_id) return;
      if (!profHorarios[h.profesional_id]) profHorarios[h.profesional_id] = [];
      profHorarios[h.profesional_id].push(h);
    });

    profesionales.forEach(p => {
      const pHorarios = profHorarios[p.id] ?? [];
      
      // If no horarios configured, all slots are available (backward compat)
      if (pHorarios.length === 0) {
        map[p.id] = new Set(TIME_SLOTS);
        return;
      }

      const available = new Set<string>();

      pHorarios.forEach(h => {
        let applies = false;

        if (h.tipo === 'semanal' && h.dia_semana && h.dia_semana.includes(dayOfWeek)) {
          applies = true;
        } else if (h.tipo === 'especifico' && h.fecha_especifica === dateStr) {
          applies = true;
        }

        if (applies) {
          // Add all TIME_SLOTS that fall within [hora_inicio, hora_fin)
          TIME_SLOTS.forEach(slot => {
            if (slot >= h.hora_inicio && slot < h.hora_fin) {
              available.add(slot);
            }
          });
        }
      });

      map[p.id] = available;
    });

    return map;
  }, [horarios, profesionales, dayOfWeek, dateStr]);

  const isSlotAvailable = (profId: string, hora: string): boolean => {
    const avail = availabilityMap[profId];
    return avail ? avail.has(hora) : true;
  };

  const handleSlotClick = (profId: string, hora: string) => {
    const existing = turnoMap[`${profId}-${hora}`];
    if (existing) {
      setSelectedTurno(existing);
    } else if (isSlotAvailable(profId, hora)) {
      const prof = profesionales.find(p => p.id === profId);
      const profNombre = prof ? `${prof.nombre} ${prof.apellido}` : '';
      setNewTurnoSlot({ fecha: dateStr, hora, profesional_id: profId, profesional_nombre: profNombre });
    }
    // If not available and no turno, do nothing
  };

  const visibleProfesionales = isMobile && profesionales.length > 0
    ? [profesionales[mobileColIndex]]
    : profesionales;

  const currentMobileProf = profesionales[mobileColIndex];

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">Panel Principal</h1>
      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Sidebar calendar */}
        <div className="shrink-0">
          <Card className="shadow-sm">
            <CardContent className="p-2">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                className="pointer-events-auto"
              />
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            {selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Agenda grid */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : profesionales.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay profesionales activos. Agregá profesionales desde el módulo Profesionales.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile professional selector */}
              {isMobile && profesionales.length > 1 && (
                <div className="flex items-center justify-between mb-3 px-1">
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    disabled={mobileColIndex === 0}
                    onClick={() => setMobileColIndex(i => i - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium text-foreground">
                    {currentMobileProf?.nombre} {currentMobileProf?.apellido}
                    <span className="text-muted-foreground ml-1 text-xs">({mobileColIndex + 1}/{profesionales.length})</span>
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    disabled={mobileColIndex === profesionales.length - 1}
                    onClick={() => setMobileColIndex(i => i + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="border rounded-lg overflow-auto bg-card">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-xs font-medium text-muted-foreground w-16 text-left sticky left-0 bg-muted/50">Hora</th>
                      {visibleProfesionales.map(p => (
                        <th key={p.id} className="p-2 text-xs font-medium text-foreground text-center min-w-[140px] sm:min-w-[160px]">
                          {isMobile ? '' : `${p.nombre} ${p.apellido}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.map(hora => (
                      <tr key={hora} className="border-b border-border/50">
                        <td className="p-1 px-2 text-xs text-muted-foreground font-mono sticky left-0 bg-card">{hora}</td>
                        {visibleProfesionales.map(p => {
                          const turno = turnoMap[`${p.id}-${hora}`];
                          const estado = turno ? TURNO_ESTADOS[turno.estado] || TURNO_ESTADOS.reservado : null;
                          const available = isSlotAvailable(p.id, hora);
                          return (
                            <td
                              key={p.id}
                              className={`p-1 transition-colors ${
                                available
                                  ? 'cursor-pointer hover:bg-primary/5'
                                  : turno
                                    ? 'cursor-pointer'
                                    : 'bg-muted/40 cursor-not-allowed'
                              }`}
                              onClick={() => handleSlotClick(p.id, hora)}
                            >
                              {turno ? (
                                <div
                                  className="rounded-md px-2 py-1 text-xs border-l-4"
                                  style={{ borderLeftColor: estado!.color, backgroundColor: `${estado!.color}15` }}
                                >
                                  <p className="font-semibold text-foreground truncate">
                                    {turno.paciente ? `${turno.paciente.apellido}, ${turno.paciente.nombre}` : 'Paciente'}
                                  </p>
                                  {turno.monto_pagado != null && (
                                    <p className="text-muted-foreground">${turno.monto_pagado}</p>
                                  )}
                                  <p style={{ color: estado!.color }} className="font-medium">{estado!.label}</p>
                                </div>
                              ) : !available ? (
                                <div className="h-6" />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New appointment dialog */}
      <Dialog open={!!newTurnoSlot} onOpenChange={(o) => !o && setNewTurnoSlot(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Turno</DialogTitle>
          </DialogHeader>
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

      {/* Turno detail dialog */}
      <TurnoDetailDialog
        turno={selectedTurno}
        onClose={() => setSelectedTurno(null)}
        onUpdated={() => { setSelectedTurno(null); fetchData(); }}
      />
    </div>
  );
}
