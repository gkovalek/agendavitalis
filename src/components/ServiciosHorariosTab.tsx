import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { normalizeDiasTrabajo } from '@/lib/constants';

interface Props {
  entityType: 'profesional' | 'equipo';
  entityId: string;
}

interface Servicio { id: string; nombre: string; }

interface AsignacionServicio {
  id: string; servicio_id: string; capacidad_simultanea: number; activo: boolean;
  dias_trabajo: string[]; hora_inicio: string; hora_fin: string;
  servicio?: Servicio;
}

const DIAS_SEMANA = [
  { value: 'lunes', label: 'Lunes' }, { value: 'martes', label: 'Martes' }, { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' }, { value: 'viernes', label: 'Viernes' }, { value: 'sabado', label: 'Sábado' },
];

const DIAS_LABEL_MAP: Record<string, string> = Object.fromEntries(DIAS_SEMANA.map(d => [d.value, d.label]));

const emptyForm = {
  servicio_id: '', capacidad_simultanea: 1, activo: true,
  dias_trabajo: [] as string[], hora_inicio: '08:00', hora_fin: '18:00',
};

export function ServiciosHorariosTab({ entityType, entityId }: Props) {
  const { centroId } = useAuth();
  const [serviciosDisponibles, setServiciosDisponibles] = useState<Servicio[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionServicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const entityColumn = entityType === 'profesional' ? 'profesional_id' : 'equipo_id';

  const fetchAll = async () => {
    if (!centroId) return;
    setLoading(true);
    const [serviciosRes, asignacionesRes] = await Promise.all([
      supabase.from('servicios').select('id, nombre').eq('centro_id', centroId).eq('activo', true).order('nombre'),
      supabase.from('profesional_centro_servicio').select('*')
        .eq(entityColumn, entityId).eq('centro_id', centroId),
    ]);
    const serviciosMap: Record<string, string> = {};
    (serviciosRes.data ?? []).forEach(s => { serviciosMap[s.id] = s.nombre; });
    setServiciosDisponibles(serviciosRes.data ?? []);
    const asigs = (asignacionesRes.data ?? []).map((a: any) => ({
      id: a.id, servicio_id: a.servicio_id, capacidad_simultanea: a.capacidad_simultanea,
      activo: a.activo, dias_trabajo: normalizeDiasTrabajo(a.dias_trabajo), hora_inicio: a.hora_inicio,
      hora_fin: a.hora_fin, servicio: { id: a.servicio_id, nombre: serviciosMap[a.servicio_id] ?? 'Servicio' },
    }));
    setAsignaciones(asigs);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [entityId, centroId]);

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };

  const openEdit = (a: AsignacionServicio) => {
    setEditId(a.id);
    setForm({
      servicio_id: a.servicio_id, capacidad_simultanea: a.capacidad_simultanea, activo: a.activo,
      dias_trabajo: normalizeDiasTrabajo(a.dias_trabajo), hora_inicio: a.hora_inicio, hora_fin: a.hora_fin,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!centroId || !form.servicio_id) return;
    setSaving(true);
    const payload = {
      servicio_id: form.servicio_id, capacidad_simultanea: form.capacidad_simultanea,
      activo: form.activo, centro_id: centroId, [entityColumn]: entityId,
      dias_trabajo: normalizeDiasTrabajo(form.dias_trabajo), hora_inicio: form.hora_inicio, hora_fin: form.hora_fin,
    };

    if (editId) {
      const { error } = await supabase.from('profesional_centro_servicio').update(payload).eq('id', editId);
      if (error) {
        toast({ title: 'Error', description: `No se pudo actualizar: ${error.message}`, variant: 'destructive' });
      } else {
        toast({ title: 'Servicio actualizado' }); setDialogOpen(false); fetchAll();
      }
    } else {
      const { error } = await supabase.from('profesional_centro_servicio').insert(payload);
      if (error) {
        toast({ title: 'Error', description: `No se pudo asignar el servicio: ${error.message}`, variant: 'destructive' });
      } else {
        toast({ title: 'Servicio asignado' }); setDialogOpen(false); fetchAll();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('profesional_centro_servicio').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: 'No se pudo desasignar el servicio. Intentá de nuevo.', variant: 'destructive' });
    else { toast({ title: 'Servicio desasignado' }); fetchAll(); }
  };

  const toggleDia = (dia: string, checked: boolean) => {
    setForm(prev => {
      const diasActuales = normalizeDiasTrabajo(prev.dias_trabajo);
      const diasActualizados = checked
        ? [...diasActuales, dia]
        : diasActuales.filter(d => d !== dia);
      return { ...prev, dias_trabajo: normalizeDiasTrabajo(diasActualizados) };
    });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Servicios asignados</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Agregar Servicio
        </Button>
      </div>

      {asignaciones.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay servicios asignados</p>
      ) : asignaciones.map(a => (
        <Card key={a.id} className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {a.servicio?.nombre ?? 'Servicio'}
                <Badge variant={a.activo ? 'default' : 'secondary'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                <span className="text-xs text-muted-foreground">Cap: {a.capacidad_simultanea}</span>
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                {normalizeDiasTrabajo(a.dias_trabajo).map(d => DIAS_LABEL_MAP[d] ?? d).join(', ') || 'Sin días'}
              </span>
              <span>|</span>
              <span>{a.hora_inicio} - {a.hora_fin}</span>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar' : 'Agregar'} Servicio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Servicio</Label>
              <Select value={form.servicio_id} onValueChange={v => setForm({ ...form, servicio_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
                <SelectContent>{serviciosDisponibles.map(s => (<SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Capacidad simultánea</Label>
              <Input type="number" value={form.capacidad_simultanea} onChange={e => setForm({ ...form, capacidad_simultanea: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Días de trabajo</Label>
              <div className="flex flex-wrap gap-3">
                {DIAS_SEMANA.map(d => (
                  <label key={d.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={normalizeDiasTrabajo(form.dias_trabajo).includes(d.value)}
                      onCheckedChange={(checked) => toggleDia(d.value, !!checked)} />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Hora inicio</Label><Input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
              <div className="space-y-1"><Label>Hora fin</Label><Input type="time" value={form.hora_fin} onChange={e => setForm({ ...form, hora_fin: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} /><Label>Activo</Label></div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.servicio_id}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar</Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
