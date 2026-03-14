import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { CENTRO_ID, TURNO_ESTADOS, TIME_SLOTS, TurnoEstado } from '@/lib/constants';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { NuevoTurnoForm } from '@/components/NuevoTurnoForm';
import { TurnoDetailDialog } from '@/components/TurnoDetailDialog';

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

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTurnoSlot, setNewTurnoSlot] = useState<{ fecha: string; hora: string; profesional_id: string } | null>(null);
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);

  const dateStr = useMemo(() => {
    const d = selectedDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    const [profRes, turnosRes] = await Promise.all([
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', CENTRO_ID).eq('activo', true).order('apellido'),
      supabase.from('turnos').select('id, fecha, hora, estado, profesional_id, paciente_id, monto_pagado, paciente:pacientes(nombre, apellido)').eq('fecha', dateStr).eq('centro_id', CENTRO_ID),
    ]);
    setProfesionales(profRes.data ?? []);
    setTurnos((turnosRes.data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateStr]);

  const turnoMap = useMemo(() => {
    const map: Record<string, Turno> = {};
    turnos.forEach(t => { map[`${t.profesional_id}-${t.hora}`] = t; });
    return map;
  }, [turnos]);

  const handleSlotClick = (profId: string, hora: string) => {
    const existing = turnoMap[`${profId}-${hora}`];
    if (existing) {
      setSelectedTurno(existing);
    } else {
      const prof = profesionales.find(p => p.id === profId);
      const profNombre = prof ? `${prof.nombre} ${prof.apellido}` : '';
      setNewTurnoSlot({ fecha: dateStr, hora, profesional_id: profId, profesional_nombre: profNombre });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Panel Principal</h1>
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
            <div className="border rounded-lg overflow-auto bg-card">
              <table className="w-full border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-xs font-medium text-muted-foreground w-16 text-left sticky left-0 bg-muted/50">Hora</th>
                    {profesionales.map(p => (
                      <th key={p.id} className="p-2 text-xs font-medium text-foreground text-center min-w-[160px]">
                        {p.nombre} {p.apellido}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_SLOTS.map(hora => (
                    <tr key={hora} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-1 px-2 text-xs text-muted-foreground font-mono sticky left-0 bg-card">{hora}</td>
                      {profesionales.map(p => {
                        const turno = turnoMap[`${p.id}-${hora}`];
                        const estado = turno ? TURNO_ESTADOS[turno.estado] || TURNO_ESTADOS.reservado : null;
                        return (
                          <td
                            key={p.id}
                            className="p-1 cursor-pointer hover:bg-primary/5 transition-colors"
                            onClick={() => handleSlotClick(p.id, hora)}
                          >
                            {turno && (
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
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* New appointment dialog */}
      <Dialog open={!!newTurnoSlot} onOpenChange={(o) => !o && setNewTurnoSlot(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Turno</DialogTitle>
          </DialogHeader>
          {newTurnoSlot && (
            <NuevoTurnoForm
              fecha={newTurnoSlot.fecha}
              hora={newTurnoSlot.hora}
              profesionalId={newTurnoSlot.profesional_id}
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
