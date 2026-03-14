import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CENTRO_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ServiciosHorariosTab } from '@/components/ServiciosHorariosTab';
import { InlineServiciosHorarios, type InlineServicioAsignado } from '@/components/InlineServiciosHorarios';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Equipo {
  id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
}

const emptyForm = { nombre: '', descripcion: '', activo: true };

export default function Equipos() {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [inlineServicios, setInlineServicios] = useState<InlineServicioAsignado[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedEquipo, setSelectedEquipo] = useState<Equipo | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('equipos').select('*').eq('centro_id', CENTRO_ID).order('nombre');
    setEquipos(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setInlineServicios([]);
    setDialogOpen(true);
  };

  const openEdit = async (e: Equipo) => {
    setEditId(e.id);
    setForm({ nombre: e.nombre, descripcion: e.descripcion || '', activo: e.activo });

    const { data: asignaciones } = await supabase
      .from('profesional_centro_servicio')
      .select('id, servicio_id, capacidad_simultanea')
      .eq('equipo_id', e.id)
      .eq('centro_id', CENTRO_ID);

    if (asignaciones && asignaciones.length > 0) {
      const ids = asignaciones.map(a => a.id);
      const { data: horarios } = await supabase
        .from('horarios_disponibles')
        .select('*')
        .in('profesional_centro_servicio_id', ids);

      const mapped: InlineServicioAsignado[] = asignaciones.map(a => ({
        id: a.id,
        servicio_id: a.servicio_id,
        capacidad_simultanea: a.capacidad_simultanea,
        horarios: (horarios ?? [])
          .filter(h => h.profesional_centro_servicio_id === a.id)
          .map(h => ({
            id: h.id,
            tipo: h.tipo as 'semanal' | 'especifico',
            dia_semana: h.dia_semana ?? [],
            fecha_especifica: h.fecha_especifica ? new Date(h.fecha_especifica) : null,
            hora_inicio: h.hora_inicio,
            hora_fin: h.hora_fin,
          })),
      }));
      setInlineServicios(mapped);
    } else {
      setInlineServicios([]);
    }

    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    let equipoId = editId;

    if (editId) {
      const { error } = await supabase.from('equipos').update(form).eq('id', editId);
      if (error) { toast({ title: 'Error', description: 'No se pudo actualizar el equipo. Intentá de nuevo.', variant: 'destructive' }); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('equipos').insert({ ...form, centro_id: CENTRO_ID }).select('id').single();
      if (error || !data) { toast({ title: 'Error', description: 'No se pudo crear el equipo. Intentá de nuevo.', variant: 'destructive' }); setSaving(false); return; }
      equipoId = data.id;
    }

    // Save inline servicios y horarios
    await saveInlineServicios('equipo_id', equipoId!);

    setSaving(false);
    setDialogOpen(false);
    toast({ title: editId ? 'Equipo actualizado' : 'Equipo creado' });
    fetchData();
  };

  const saveInlineServicios = async (entityColumn: string, entityId: string) => {
    const { data: existing } = await supabase
      .from('profesional_centro_servicio')
      .select('id')
      .eq(entityColumn, entityId)
      .eq('centro_id', CENTRO_ID);

    if (existing && existing.length > 0) {
      const existingIds = existing.map(e => e.id);
      await supabase.from('horarios_disponibles').delete().in('profesional_centro_servicio_id', existingIds);
      await supabase.from('profesional_centro_servicio').delete().in('id', existingIds);
    }

    for (const srv of inlineServicios) {
      if (!srv.servicio_id) continue;
      const { data: asig } = await supabase.from('profesional_centro_servicio').insert({
        [entityColumn]: entityId,
        servicio_id: srv.servicio_id,
        capacidad_simultanea: srv.capacidad_simultanea,
        activo: true,
        centro_id: CENTRO_ID,
      }).select('id').single();

      if (asig && srv.horarios.length > 0) {
        const horarioPayloads = srv.horarios.map(h => ({
          profesional_centro_servicio_id: asig.id,
          tipo: h.tipo,
          dia_semana: h.tipo === 'semanal' ? h.dia_semana : null,
          fecha_especifica: h.tipo === 'especifico' && h.fecha_especifica
            ? format(h.fecha_especifica, 'yyyy-MM-dd')
            : null,
          hora_inicio: h.hora_inicio,
          hora_fin: h.hora_fin,
          capacidad_simultanea: srv.capacidad_simultanea,
        }));
        await supabase.from('horarios_disponibles').insert(horarioPayloads);
      }
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('equipos').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: 'No se pudo eliminar el equipo. Intentá de nuevo.', variant: 'destructive' });
    else { toast({ title: 'Equipo eliminado' }); fetchData(); if (selectedEquipo?.id === id) setSelectedEquipo(null); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipos</h1>
          <p className="text-muted-foreground">{equipos.length} equipos registrados</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nuevo Equipo</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-sm lg:col-span-1">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipos.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No hay equipos</TableCell></TableRow>
                  ) : equipos.map(e => (
                    <TableRow
                      key={e.id}
                      className={`cursor-pointer ${selectedEquipo?.id === e.id ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedEquipo(e)}
                    >
                      <TableCell className="font-medium">{e.nombre}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {e.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardContent className="p-4">
            {selectedEquipo ? (
              <Tabs defaultValue="info">
                <TabsList>
                  <TabsTrigger value="info">Información</TabsTrigger>
                  <TabsTrigger value="servicios">Servicios y Horarios</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="space-y-3 pt-4">
                  <p><strong>Nombre:</strong> {selectedEquipo.nombre}</p>
                  <p><strong>Descripción:</strong> {selectedEquipo.descripcion || '—'}</p>
                  <p><strong>Estado:</strong> {selectedEquipo.activo ? 'Activo' : 'Inactivo'}</p>
                </TabsContent>
                <TabsContent value="servicios">
                  <ServiciosHorariosTab entityType="equipo" entityId={selectedEquipo.id} />
                </TabsContent>
              </Tabs>
            ) : (
              <p className="text-muted-foreground text-center py-12">Seleccioná un equipo para ver sus detalles</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} Equipo</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-3">
              <div className="space-y-1"><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
              <div className="space-y-1"><Label>Descripción</Label><Input value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} />
                <Label>Activo</Label>
              </div>

              <div className="border-t pt-3 mt-3">
                <InlineServiciosHorarios servicios={inlineServicios} onChange={setInlineServicios} />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving || !form.nombre}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
