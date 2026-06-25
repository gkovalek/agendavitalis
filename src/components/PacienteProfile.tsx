import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TurnoEstado } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil, X, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

function formatFecha(iso: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function PacienteProfile({ pacienteId }: { pacienteId: string }) {
  const { toast } = useToast();
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [turnos, setTurnos] = useState<TurnoHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Paciente>>({});

  useEffect(() => {
    const fetch = async () => {
      const [pacRes, turnosRes] = await Promise.all([
        supabase.from('pacientes').select('*').eq('id', pacienteId).single(),
        supabase.from('turnos').select('id, fecha, hora_inicio, estado, profesional:profesionales(nombre, apellido)').eq('paciente_id', pacienteId).order('fecha', { ascending: false }),
      ]);
      setPaciente(pacRes.data);
      setForm(pacRes.data ?? {});
      setTurnos((turnosRes.data as any[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [pacienteId]);

  const handleEdit = () => {
    setForm({ ...paciente });
    setEditing(true);
  };

  const handleCancel = () => {
    setForm({ ...paciente });
    setEditing(false);
  };

  const handleSave = async () => {
    if (!paciente) return;
    setSaving(true);
    const { error } = await supabase.from('pacientes').update({
      nombre: form.nombre,
      apellido: form.apellido,
      dni: form.dni,
      celular: form.celular,
      email: form.email,
      fecha_nacimiento: form.fecha_nacimiento || null,
    }).eq('id', paciente.id);

    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      setPaciente({ ...paciente, ...form } as Paciente);
      setEditing(false);
      toast({ title: 'Datos actualizados' });
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!paciente) return <p className="text-muted-foreground">Paciente no encontrado</p>;

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Datos Personales</CardTitle>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={handleEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5" style={{ backgroundColor: '#0F6E56' }}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!editing ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><p className="text-muted-foreground text-xs mb-0.5">Nombre</p><p className="font-medium">{paciente.nombre} {paciente.apellido}</p></div>
              <div><p className="text-muted-foreground text-xs mb-0.5">DNI</p><p className="font-medium">{paciente.dni || '—'}</p></div>
              <div><p className="text-muted-foreground text-xs mb-0.5">Celular</p><p className="font-medium">{paciente.celular || '—'}</p></div>
              <div><p className="text-muted-foreground text-xs mb-0.5">Email</p><p className="font-medium">{paciente.email || '—'}</p></div>
              <div><p className="text-muted-foreground text-xs mb-0.5">Fecha Nac.</p><p className="font-medium">{paciente.fecha_nacimiento ? formatFecha(paciente.fecha_nacimiento) : '—'}</p></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input value={form.nombre ?? ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Apellido</Label>
                <Input value={form.apellido ?? ''} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">DNI</Label>
                <Input value={form.dni ?? ''} onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Celular</Label>
                <Input value={form.celular ?? ''} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))} className="h-9" placeholder="ej: 3624075957" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-9" type="email" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha de nacimiento</Label>
                <Input value={form.fecha_nacimiento ?? ''} onChange={e => setForm(f => ({ ...f, fecha_nacimiento: e.target.value }))} className="h-9" type="date" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-lg">Historial de Turnos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Hora</TableHead><TableHead>Profesional</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
            <TableBody>
              {turnos.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Sin turnos registrados</TableCell></TableRow>
              ) : turnos.map(t => {
                const est = TURNO_ESTADOS[t.estado] || TURNO_ESTADOS.reservado;
                return (
                  <TableRow key={t.id}>
                    <TableCell>{formatFecha(t.fecha)}</TableCell>
                    <TableCell>{t.hora_inicio?.substring(0, 5)}</TableCell>
                    <TableCell>{t.profesional ? `${t.profesional.apellido}, ${t.profesional.nombre}` : '—'}</TableCell>
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
