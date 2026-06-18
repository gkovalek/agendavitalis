import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Servicio {
  id: string;
  nombre: string;
  duracion_minutos: number;
  costo_base: number;
  es_tratamiento: boolean;
  sesiones_por_bloque: number | null;
  requiere_os: boolean;
  activo: boolean;
  agenda_id: string | null;
  agenda?: { nombre: string } | null;
}

interface AgendaOption { id: string; nombre: string; }
interface ProfesionalOption { id: string; nombre: string; apellido: string; }

const emptyForm = { nombre: '', duracion_minutos: 30, costo_base: 0, es_tratamiento: false, sesiones_por_bloque: null as number | null, requiere_os: false, activo: true, agenda_id: '' };

export default function Servicios() {
  const { centroId } = useAuth();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [agendas, setAgendas] = useState<AgendaOption[]>([]);
  const [profesionales, setProfesionales] = useState<ProfesionalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [profSeleccionados, setProfSeleccionados] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const fetchData = async () => {
    if (!centroId) return;
    setLoading(true);
    const [{ data: srvData }, { data: agData }, { data: profData }] = await Promise.all([
      supabase.from('servicios').select('*, agenda:agendas(nombre)').eq('centro_id', centroId).order('nombre'),
      supabase.from('agendas').select('id, nombre').eq('centro_id', centroId).order('nombre'),
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
    ]);
    setServicios(srvData ?? []);
    setAgendas(agData ?? []);
    setProfesionales(profData ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [centroId]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setProfSeleccionados([]);
    setDialogOpen(true);
  };

  const openEdit = async (s: Servicio) => {
    setEditId(s.id);
    setForm({ nombre: s.nombre, duracion_minutos: s.duracion_minutos, costo_base: s.costo_base, es_tratamiento: s.es_tratamiento, sesiones_por_bloque: s.sesiones_por_bloque, requiere_os: s.requiere_os ?? false, activo: s.activo, agenda_id: s.agenda_id ?? '' });
    // Cargar profesionales ya asignados a este servicio
    const { data } = await supabase.from('profesional_centro_servicio').select('profesional_id').eq('servicio_id', s.id).eq('centro_id', centroId!);
    setProfSeleccionados((data ?? []).map(r => r.profesional_id).filter(Boolean));
    setDialogOpen(true);
  };

  const toggleProf = (id: string, checked: boolean) => {
    setProfSeleccionados(prev => checked ? [...prev, id] : prev.filter(p => p !== id));
  };

  const handleSave = async () => {
    if (!centroId) return;
    setSaving(true);
    const payload = {
      ...form,
      sesiones_por_bloque: form.es_tratamiento ? form.sesiones_por_bloque : null,
      agenda_id: form.agenda_id || null,
    };

    let servicioId = editId;

    if (editId) {
      const { error } = await supabase.from('servicios').update(payload).eq('id', editId);
      if (error) { toast({ title: 'Error', description: 'No se pudo actualizar el servicio.', variant: 'destructive' }); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('servicios').insert({ ...payload, centro_id: centroId }).select('id').single();
      if (error || !data) { toast({ title: 'Error', description: 'No se pudo crear el servicio.', variant: 'destructive' }); setSaving(false); return; }
      servicioId = data.id;
    }

    // Sincronizar profesional_centro_servicio
    // Eliminar asignaciones existentes para este servicio
    await supabase.from('profesional_centro_servicio').delete().eq('servicio_id', servicioId!).eq('centro_id', centroId);

    // Insertar las seleccionadas
    if (profSeleccionados.length > 0) {
      const rows = profSeleccionados.map(profId => ({
        centro_id: centroId,
        profesional_id: profId,
        servicio_id: servicioId,
        activo: true,
        capacidad_simultanea: 1,
        dias_trabajo: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
        hora_inicio: '08:00:00',
        hora_fin: '20:00:00',
      }));
      await supabase.from('profesional_centro_servicio').insert(rows);
    }

    toast({ title: editId ? 'Servicio actualizado' : 'Servicio creado' });
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await supabase.from('servicios').delete().eq('id', deleteId);
    setDeleting(false);
    setDeleteId(null);
    if (error) toast({ title: 'Error', description: 'No se pudo eliminar el servicio.', variant: 'destructive' });
    else { toast({ title: 'Servicio eliminado' }); fetchData(); }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Servicios</h1>
          <p className="text-sm text-muted-foreground">{servicios.length} servicios registrados</p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Nuevo Servicio</Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : servicios.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No hay servicios</p>
          ) : isMobile ? (
            <div className="divide-y">
              {servicios.map(s => (
                <div key={s.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">{s.nombre}</p>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(s.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{s.duracion_minutos} min</span><span>·</span><span>${s.costo_base}</span><span>·</span>
                    {s.es_tratamiento ? <Badge variant="secondary" className="text-xs">Tratamiento ({s.sesiones_por_bloque} ses.)</Badge> : <Badge variant="outline" className="text-xs">Consulta</Badge>}
                    {s.requiere_os && <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">OS obligatoria</Badge>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.activo ? 'Activo' : 'Inactivo'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Agenda</TableHead><TableHead>Duración</TableHead><TableHead>Costo base</TableHead><TableHead>Tipo</TableHead><TableHead>Estado</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
              <TableBody>
                {servicios.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nombre}</TableCell>
                    <TableCell>
                      {s.agenda?.nombre
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{s.agenda.nombre}</span>
                        : <span className="text-xs text-muted-foreground">Sin asignar</span>
                      }
                    </TableCell>
                    <TableCell>{s.duracion_minutos} min</TableCell>
                    <TableCell>${s.costo_base}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.es_tratamiento ? <Badge variant="secondary">Tratamiento ({s.sesiones_por_bloque} ses.)</Badge> : <Badge variant="outline">Consulta</Badge>}
                        {s.requiere_os && <Badge className="bg-blue-100 text-blue-700 border-blue-200">OS obligatoria</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.activo ? 'Activo' : 'Inactivo'}</span></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} Servicio</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            <div className="space-y-1"><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Agenda *</Label>
              <Select value={form.agenda_id} onValueChange={v => setForm({ ...form, agenda_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar agenda" /></SelectTrigger>
                <SelectContent>
                  {agendas.map(a => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {agendas.length === 0 && <p className="text-xs text-amber-600">No hay agendas configuradas.</p>}
            </div>

            {/* Profesionales */}
            <div className="space-y-2">
              <Label>Profesionales que lo atienden</Label>
              {profesionales.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay profesionales activos.</p>
              ) : (
                <div className="border rounded-md p-3 space-y-2">
                  {profesionales.map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={profSeleccionados.includes(p.id)}
                        onCheckedChange={v => toggleProf(p.id, !!v)}
                      />
                      {p.apellido}, {p.nombre}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Duración del turno</Label>
                <Select value={String(form.duracion_minutos)} onValueChange={v => setForm({ ...form, duracion_minutos: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (i + 1) * 5).map(m => (
                      <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Costo base ($)</Label><Input type="number" value={form.costo_base} onChange={e => setForm({ ...form, costo_base: Number(e.target.value) })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.es_tratamiento} onCheckedChange={v => setForm({ ...form, es_tratamiento: v })} /><Label>Es tratamiento</Label></div>
            {form.es_tratamiento && (<div className="space-y-1"><Label>Sesiones por bloque</Label><Input type="number" value={form.sesiones_por_bloque ?? ''} onChange={e => setForm({ ...form, sesiones_por_bloque: Number(e.target.value) })} /></div>)}
            <div className="flex items-center gap-2">
              <Switch checked={form.requiere_os} onCheckedChange={v => setForm({ ...form, requiere_os: v })} />
              <div>
                <Label>Requiere obra social</Label>
                <p className="text-[11px] text-muted-foreground">Al cargar la cita se pedirá OS, plan y nro. de credencial obligatoriamente</p>
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} /><Label>Activo</Label></div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.nombre || !form.agenda_id} className="flex-1 sm:flex-none">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar</Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-none">Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="¿Eliminar servicio?"
        description="Esta acción eliminará el servicio permanentemente y no se puede deshacer."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
