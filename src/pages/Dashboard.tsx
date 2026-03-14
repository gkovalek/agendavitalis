import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TIME_SLOTS, TurnoEstado, normalizeDiasTrabajo } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
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
  hora_inicio: string;
  estado: TurnoEstado;
  profesional_id: string;
  paciente_id: string;
  monto_pagado: number | null;
  paciente?: { nombre: string; apellido: string };
}

interface PCSRecord {
  profesional_id: string | null;
  dias_trabajo: number[];
  hora_inicio: string;
  hora_fin: string;
}

export default function Dashboard() {
  const { centroId } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pcsRecords, setPcsRecords] = useState<PCSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTurnoSlot, setNewTurnoSlot] = useState<{ fecha: string; hora: string; profesional_id: string; profesional_nombre: string } | null>(null);
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);
  const [mobileColIndex, setMobileColIndex] = useState(0);
  const isMobile = useIsMobile();

  const dateStr = useMemo(() => {
    const d = selectedDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  const dayOfWeek = useMemo(() => {
    const jsDay = selectedDate.getDay();
    return jsDay === 0 ? 7 : jsDay;
  }, [selectedDate]);

  const fetchData = async () => {
    if (!centroId) return;
    setLoading(true);

    const [profRes, turnosRes] = await Promise.all([
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
      supabase.from('turnos').select('id, fecha, hora_inicio, estado, profesional_id, paciente_id, monto_pagado, paciente:pacientes(nombre, apellido)').eq('fecha', dateStr).eq('centro_id', centroId),
    ]);

    setProfesionales(profRes.data ?? []);
    setTurnos((turnosRes.data as any[]) ?? []);

    // Fetch availability from profesional_centro_servicio directly
    const { data: pcsData } = await supabase
      .from('profesional_centro_servicio')
      .select('profesional_id, dias_trabajo, hora_inicio, hora_fin')
      .eq('centro_id', centroId)
      .eq('activo', true);

    setPcsRecords(((pcsData as PCSRecord[]) ?? []).map(r => ({ ...r, dias_trabajo: normalizeDiasTrabajo(r.dias_trabajo) })));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateStr, centroId]);
  useEffect(() => { setMobileColIndex(0); }, [profesionales]);

  const turnoMap = useMemo(() => {
    const map: Record<string, Turno> = {};
    turnos.forEach(t => { map[`${t.profesional_id}-${t.hora_inicio}`] = t; });
    return map;
  }, [turnos]);

  const availabilityMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    const profRecords: Record<string, PCSRecord[]> = {};
    pcsRecords.forEach(r => {
      if (!r.profesional_id) return;
      if (!profRecords[r.profesional_id]) profRecords[r.profesional_id] = [];
      profRecords[r.profesional_id].push(r);
    });

    profesionales.forEach(p => {
      const records = profRecords[p.id] ?? [];
      if (records.length === 0) {
        map[p.id] = new Set(TIME_SLOTS);
        return;
      }
      const available = new Set<string>();
      records.forEach(r => {
        if (normalizeDiasTrabajo(r.dias_trabajo).includes(dayOfWeek)) {
          TIME_SLOTS.forEach(slot => {
            if (slot >= r.hora_inicio && slot < r.hora_fin) available.add(slot);
          });
        }
      });
      map[p.id] = available;
    });
    return map;
  }, [pcsRecords, profesionales, dayOfWeek]);

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
  };

  const visibleProfesionales = isMobile && profesionales.length > 0
    ? [profesionales[mobileColIndex]]
    : profesionales;

  const currentMobileProf = profesionales[mobileColIndex];

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">Panel Principal</h1>
      <div className="flex gap-4 flex-col lg:flex-row">
        <div className="shrink-0">
          <Card className="shadow-sm">
            <CardContent className="p-2">
              <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} className="pointer-events-auto" />
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            {selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : profesionales.length === 0 ? (
            <Card className="shadow-sm"><CardContent className="py-12 text-center text-muted-foreground">No hay profesionales activos. Agregá profesionales desde el módulo Profesionales.</CardContent></Card>
          ) : (
            <>
              {isMobile && profesionales.length > 1 && (
                <div className="flex items-center justify-between mb-3 px-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={mobileColIndex === 0} onClick={() => setMobileColIndex(i => i - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium text-foreground">
                    {currentMobileProf?.nombre} {currentMobileProf?.apellido}
                    <span className="text-muted-foreground ml-1 text-xs">({mobileColIndex + 1}/{profesionales.length})</span>
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={mobileColIndex === profesionales.length - 1} onClick={() => setMobileColIndex(i => i + 1)}>
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
                            <td key={p.id}
                              className={`p-1 transition-colors ${available ? 'cursor-pointer hover:bg-primary/5' : turno ? 'cursor-pointer' : 'bg-muted/40 cursor-not-allowed'}`}
                              onClick={() => handleSlotClick(p.id, hora)}>
                              {turno ? (
                                <div className="rounded-md px-2 py-1 text-xs border-l-4" style={{ borderLeftColor: estado!.color, backgroundColor: `${estado!.color}15` }}>
                                  <p className="font-semibold text-foreground truncate">
                                    {turno.paciente ? `${turno.paciente.apellido}, ${turno.paciente.nombre}` : 'Paciente'}
                                  </p>
                                  {turno.monto_pagado != null && <p className="text-muted-foreground">${turno.monto_pagado}</p>}
                                  <p style={{ color: estado!.color }} className="font-medium">{estado!.label}</p>
                                </div>
                              ) : !available ? <div className="h-6" /> : null}
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

      <Dialog open={!!newTurnoSlot} onOpenChange={(o) => !o && setNewTurnoSlot(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Turno</DialogTitle></DialogHeader>
          {newTurnoSlot && (
            <NuevoTurnoForm fecha={newTurnoSlot.fecha} hora={newTurnoSlot.hora} profesionalId={newTurnoSlot.profesional_id}
              profesionalNombre={newTurnoSlot.profesional_nombre} onSuccess={() => { setNewTurnoSlot(null); fetchData(); }} onCancel={() => setNewTurnoSlot(null)} />
          )}
        </DialogContent>
      </Dialog>

      <TurnoDetailDialog turno={selectedTurno} onClose={() => setSelectedTurno(null)} onUpdated={() => { setSelectedTurno(null); fetchData(); }} />
    </div>
  );
}
