import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TurnoEstado } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  celular: string;
  email: string;
  fecha_nacimiento: string;
}

interface TurnoHistorial {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: TurnoEstado;
  profesional?: { nombre: string; apellido: string };
}

export function PacienteProfile({ pacienteId }: { pacienteId: string }) {
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [turnos, setTurnos] = useState<TurnoHistorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [pacRes, turnosRes] = await Promise.all([
        supabase.from('pacientes').select('*').eq('id', pacienteId).single(),
        supabase.from('turnos').select('id, fecha, hora_inicio, estado, profesional:profesionales(nombre, apellido)').eq('paciente_id', pacienteId).order('fecha', { ascending: false }),
      ]);
      setPaciente(pacRes.data);
      setTurnos((turnosRes.data as any[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [pacienteId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!paciente) return <p className="text-muted-foreground">Paciente no encontrado</p>;

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg">Datos Personales</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><p className="text-muted-foreground">Nombre</p><p className="font-medium text-foreground">{paciente.nombre} {paciente.apellido}</p></div>
            <div><p className="text-muted-foreground">DNI</p><p className="font-medium text-foreground">{paciente.dni}</p></div>
            <div><p className="text-muted-foreground">Celular</p><p className="font-medium text-foreground">{paciente.celular || '—'}</p></div>
            <div><p className="text-muted-foreground">Email</p><p className="font-medium text-foreground">{paciente.email || '—'}</p></div>
            <div><p className="text-muted-foreground">Fecha Nac.</p><p className="font-medium text-foreground">{paciente.fecha_nacimiento || '—'}</p></div>
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg">Historial de Turnos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Hora</TableHead><TableHead>Profesional</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
            <TableBody>
              {turnos.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin turnos registrados</TableCell></TableRow>
              ) : turnos.map(t => {
                const est = TURNO_ESTADOS[t.estado] || TURNO_ESTADOS.reservado;
                return (
                  <TableRow key={t.id}>
                    <TableCell>{t.fecha}</TableCell><TableCell>{t.hora_inicio}</TableCell>
                    <TableCell>{t.profesional ? `${t.profesional.nombre} ${t.profesional.apellido}` : '—'}</TableCell>
                    <TableCell>{t.monto_pagado != null ? `$${t.monto_pagado}` : '—'}</TableCell>
                    <TableCell><span className="inline-flex items-center gap-1.5 text-xs font-medium"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: est.color }} />{est.label}</span></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
