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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Pencil, ChevronRight, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ServiciosHorariosTab } from '@/components/ServiciosHorariosTab';
import { InlineServiciosHorarios, type InlineServicioAsignado } from '@/components/InlineServiciosHorarios';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const { centroId } = useAuth();
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [inlineServicios, setInlineServicios] = useState<InlineServicioAsignado[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedProfesional, setSelectedProfesional] = useState<Profesional | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const fetchData = async () => {
    if (!centroId) return;
    setLoading(true);
    const { data } = await supabase.from('profesionales').select('*').eq('centro_id', centroId).order('apellido');
    setProfesionales(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [centroId]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setInlineServicios([]);
    setDialogOpen(true);
  };

  const openEdit = async (p: Profesional) => {
    if (!centroId) return;
    setEditId(p.id);
    setForm({ nombre: p.nombre, apellido: p.apellido, dni: p.dni || '', mail: p.mail || '', celular: p.celular || '', activo: p.activo });

    const { data: asignaciones } = await supabase
      .from('profesional_centro_servicio')
      .select('id, servicio_id, capacidad_simultanea, dias_trabajo, hora_inicio, hora_fin')
      .eq('profesional_id', p.id)
      .eq('centro_id', centroId);

    if (asignaciones && asignaciones.length > 0) {
      const mapped: InlineServicioAsignado[] = asignaciones.map(a => ({
        id: a.id,
        servicio_id: a.servicio_id,
        capacidad_simultanea: a.capacidad_simultanea,
        dias_trabajo: a.dias_trabajo ?? [],
        hora_inicio: a.hora_inicio,
        hora_fin: a.hora_fin,
      }));
      setInlineServicios(mapped);
    } else {
      setInlineServicios([]);
    }

    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!centroId) return;
    setSaving(true);
    let profesionalId = editId;

    console.log('[handleSave] Starting save. centroId:', centroId, 'editId:', editId);
    console.log('[handleSave] inlineServicios state:', JSON.stringify(inlineServicios, null, 2));

    if (editId) {
      const { error } = await supabase.from('profesionales').update(form).eq('id', editId);
      if (error) { toast({ title: 'Error', description: 'No se pudo actualizar el profesional. Intentá de nuevo.', variant: 'destructive' }); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('profesionales').insert({ ...form, centro_id: centroId }).select('id').single();
      if (error || !data) { toast({ title: 'Error', description: 'No se pudo crear el profesional. Intentá de nuevo.', variant: 'destructive' }); setSaving(false); return; }
      profesionalId = data.id;
    }

    console.log('[handleSave] profesionalId for services:', profesionalId);

    const srvError = await saveInlineServicios('profesional_id', profesionalId!);
    if (srvError) {
      toast({ title: 'Error guardando servicios', description: srvError, variant: 'destructive' });
    }

    setSaving(false);
    setDialogOpen(false);
    toast({ title: editId ? 'Profesional actualizado' : 'Profesional creado' });
    fetchData();
  };

  const saveInlineServicios = async (entityColumn: string, entityId: string): Promise<string | null> => {
    if (!centroId) return 'No se pudo determinar el centro.';

    const { data: existing } = await supabase
      .from('profesional_centro_servicio')
      .select('id')
      .eq(entityColumn, entityId)
      .eq('centro_id', centroId);

    if (existing && existing.length > 0) {
      const existingIds = existing.map(e => e.id);
      const { error: delErr } = await supabase.from('profesional_centro_servicio').delete().in('id', existingIds);
      if (delErr) return 'No se pudieron actualizar los servicios asignados. Verificá los permisos.';
    }

    console.log('[saveInlineServicios] Total servicios to save:', inlineServicios.length);

    for (const srv of inlineServicios) {
      if (!srv.servicio_id) {
        console.log('[saveInlineServicios] Skipping service with empty servicio_id');
        continue;
      }
      const insertPayload = {
        [entityColumn]: entityId,
        servicio_id: srv.servicio_id,
        capacidad_simultanea: srv.capacidad_simultanea,
        activo: true,
        centro_id: centroId,
        dias_trabajo: srv.dias_trabajo,
        hora_inicio: srv.hora_inicio,
        hora_fin: srv.hora_fin,
      };
      console.log('[saveInlineServicios] Inserting profesional_centro_servicio:', JSON.stringify(insertPayload));

      const { data: asig, error: insErr } = await supabase.from('profesional_centro_servicio').insert(insertPayload).select('id').single();

      console.log('[saveInlineServicios] Insert result - data:', asig, 'error:', insErr);

      if (insErr) {
        console.error('[saveInlineServicios] ERROR:', insErr.message, insErr.code, insErr.details);
        return `Error al asignar servicio: ${insErr.message}`;
      }
    }
    return null;
  };

  if (isMobile && selectedProfesional) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => setSelectedProfesional(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Button>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">{selectedProfesional.nombre} {selectedProfesional.apellido}</h2>
          <Button variant="ghost" size="icon" onClick={() => openEdit(selectedProfesional)}>
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
        <Tabs defaultValue="info">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="servicios">Servicios</TabsTrigger>
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

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} Profesional</DialogTitle></DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-3">
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <InlineServiciosHorarios centroId={centroId} servicios={inlineServicios} onChange={setInlineServicios} />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving || !form.nombre || !form.apellido} className="flex-1 sm:flex-none">
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
                  </Button>
                  <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-none">Cancelar</Button>
                </div>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Profesionales</h1>
          <p className="text-sm text-muted-foreground">{profesionales.length} profesionales registrados</p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Nuevo Profesional</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="shadow-sm lg:col-span-1">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : profesionales.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No hay profesionales</p>
            ) : isMobile ? (
              <div className="divide-y">
                {profesionales.map(p => (
                  <button key={p.id} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedProfesional(p)}>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{p.apellido}, {p.nombre}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                  </button>
                ))}
              </div>
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
                  {profesionales.map(p => (
                    <TableRow key={p.id} className={`cursor-pointer ${selectedProfesional?.id === p.id ? 'bg-muted' : ''}`}
                      onClick={() => setSelectedProfesional(p)}>
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

        {!isMobile && (
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
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} Profesional</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-3">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <InlineServiciosHorarios centroId={centroId} servicios={inlineServicios} onChange={setInlineServicios} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving || !form.nombre || !form.apellido} className="flex-1 sm:flex-none">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-none">Cancelar</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
