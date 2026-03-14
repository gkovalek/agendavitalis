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
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Servicio {
  id: string;
  nombre: string;
  duracion_minutos: number;
  costo_base: number;
  es_tratamiento: boolean;
  sesiones_por_bloque: number | null;
  activo: boolean;
}

const emptyForm = {
  nombre: '',
  duracion_minutos: 30,
  costo_base: 0,
  es_tratamiento: false,
  sesiones_por_bloque: null as number | null,
  activo: true,
};

export default function Servicios() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('servicios').select('*').eq('centro_id', CENTRO_ID).order('nombre');
    setServicios(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (s: Servicio) => {
    setEditId(s.id);
    setForm({
      nombre: s.nombre,
      duracion_minutos: s.duracion_minutos,
      costo_base: s.costo_base,
      es_tratamiento: s.es_tratamiento,
      sesiones_por_bloque: s.sesiones_por_bloque,
      activo: s.activo,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      sesiones_por_bloque: form.es_tratamiento ? form.sesiones_por_bloque : null,
    };
    if (editId) {
      const { error } = await supabase.from('servicios').update(payload).eq('id', editId);
      if (error) toast({ title: 'Error', description: 'No se pudo actualizar el servicio. Intentá de nuevo.', variant: 'destructive' });
      else toast({ title: 'Servicio actualizado' });
    } else {
      const { error } = await supabase.from('servicios').insert({ ...payload, centro_id: CENTRO_ID });
      if (error) toast({ title: 'Error', description: 'No se pudo crear el servicio. Intentá de nuevo.', variant: 'destructive' });
      else toast({ title: 'Servicio creado' });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('servicios').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: 'No se pudo eliminar el servicio. Intentá de nuevo.', variant: 'destructive' });
    else { toast({ title: 'Servicio eliminado' }); fetchData(); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Servicios</h1>
          <p className="text-muted-foreground">{servicios.length} servicios registrados</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nuevo Servicio</Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Costo base</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicios.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay servicios</TableCell></TableRow>
                ) : servicios.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nombre}</TableCell>
                    <TableCell>{s.duracion_minutos} min</TableCell>
                    <TableCell>${s.costo_base}</TableCell>
                    <TableCell>
                      {s.es_tratamiento ? (
                        <Badge variant="secondary">Tratamiento ({s.sesiones_por_bloque} ses.)</Badge>
                      ) : (
                        <Badge variant="outline">Consulta</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} Servicio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Duración (minutos)</Label><Input type="number" value={form.duracion_minutos} onChange={e => setForm({ ...form, duracion_minutos: Number(e.target.value) })} /></div>
              <div className="space-y-1"><Label>Costo base</Label><Input type="number" value={form.costo_base} onChange={e => setForm({ ...form, costo_base: Number(e.target.value) })} /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.es_tratamiento} onCheckedChange={v => setForm({ ...form, es_tratamiento: v })} />
              <Label>Es tratamiento</Label>
            </div>
            {form.es_tratamiento && (
              <div className="space-y-1"><Label>Sesiones por bloque</Label><Input type="number" value={form.sesiones_por_bloque ?? ''} onChange={e => setForm({ ...form, sesiones_por_bloque: Number(e.target.value) })} /></div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} />
              <Label>Activo</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.nombre}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
