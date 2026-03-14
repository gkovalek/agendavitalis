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
import { Loader2, Plus, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ServiciosHorariosTab } from '@/components/ServiciosHorariosTab';
import { InlineServiciosHorarios, type InlineServicioAsignado } from '@/components/InlineServiciosHorarios';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Profesional {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  mail: string;
  celular: string;
  activo: boolean;
}

const emptyForm = { nombre: '', apellido: '', dni: '', mail: '', celular: '', activo: true };

export default function Profesionales() {
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [inlineServicios, setInlineServicios] = useState<InlineServicioAsignado[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedProfesional, setSelectedProfesional] = useState<Profesional | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('profesionales').select('*').eq('centro_id', CENTRO_ID).order('apellido');
    setProfesionales(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setInlineServicios([]);
    setDialogOpen(true);
  };

  const openEdit = async (p: Profesional) => {
    setEditId(p.id);
    setForm({ nombre: p.nombre, apellido: p.apellido, dni: p.dni || '', mail: p.mail || '', celular: p.celular || '', activo: p.activo });

    // Load existing service assignments and schedules
    const { data: asignaciones } = await supabase
      .from('profesional_centro_servicio')
      .select('id, servicio_id, capacidad_simultanea')
      .eq('profesional_id', p.id)
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
    let profesionalId = editId;

    if (editId) {
      const { error } = await supabase.from('profesionales').update(form).eq('id', editId);
      if (error) { toast({ title: 'Error', description: 'No se pudo actualizar el profesional. Intentá de nuevo.', variant: 'destructive' }); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('profesionales').insert({ ...form, centro_id: CENTRO_ID }).select('id').single();
      if (error || !data) { toast({ title: 'Error', description: 'No se pudo crear el profesional. Intentá de nuevo.', variant: 'destructive' }); setSaving(false); return; }
      profesionalId = data.id;
    }

    // Save inline servicios y horarios
    await saveInlineServicios('profesional_id', profesionalId!);

    setSaving(false);
    setDialogOpen(false);
    toast({ title: editId ? 'Profesional actualizado' : 'Profesional creado' });
    fetchData();
  };

  const saveInlineServicios = async (entityColumn: string, entityId: string) => {
    // Delete existing assignments for this entity
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

    // Insert new assignments
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profesionales</h1>
          <p className="text-muted-foreground">{profesionales.length} profesionales registrados</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nuevo Profesional</Button>
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
                    <TableHead>Apellido</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profesionales.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No hay profesionales</TableCell></TableRow>
                  ) : profesionales.map(p => (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer ${selectedProfesional?.id === p.id ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedProfesional(p)}
                    >
                      <TableCell className="font-medium">{p.apellido}</TableCell>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
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
            {selectedProfesional ? (
              <Tabs defaultValue="info">
                <TabsList>
                  <TabsTrigger value="info">Información</TabsTrigger>
                  <TabsTrigger value="servicios">Servicios y Horarios</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="space-y-3 pt-4">
                  <p><strong>Nombre:</strong> {selectedProfesional.nombre} {selectedProfesional.apellido}</p>
                  <p><strong>DNI:</strong> {selectedProfesional.dni || '—'}</p>
                  <p><strong>Mail:</strong> {selectedProfesional.mail || '—'}</p>
                  <p><strong>Celular:</strong> {selectedProfesional.celular || '—'}</p>
                  <p><strong>Estado:</strong> {selectedProfesional.activo ? 'Activo' : 'Inactivo'}</p>
                </TabsContent>
                <TabsContent value="servicios">
                  <ServiciosHorariosTab entityType="profesional" entityId={selectedProfesional.id} />
                </TabsContent>
              </Tabs>
            ) : (
              <p className="text-muted-foreground text-center py-12">Seleccioná un profesional para ver sus detalles</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} Profesional</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} /></div>
                <div className="space-y-1"><Label>Apellido *</Label><Input value={form.apellido} onChange={e => setForm({...form, apellido: e.target.value})} /></div>
                <div className="space-y-1"><Label>DNI</Label><Input value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} /></div>
                <div className="space-y-1"><Label>Celular</Label><Input value={form.celular} onChange={e => setForm({...form, celular: e.target.value})} /></div>
              </div>
              <div className="space-y-1"><Label>Mail</Label><Input type="email" value={form.mail} onChange={e => setForm({...form, mail: e.target.value})} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.activo} onCheckedChange={v => setForm({...form, activo: v})} />
                <Label>Activo</Label>
              </div>

              <div className="border-t pt-3 mt-3">
                <InlineServiciosHorarios servicios={inlineServicios} onChange={setInlineServicios} />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving || !form.nombre || !form.apellido}>
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
