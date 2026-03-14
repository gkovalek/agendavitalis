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

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (p: Profesional) => {
    setEditId(p.id);
    setForm({ nombre: p.nombre, apellido: p.apellido, dni: p.dni || '', mail: p.mail || '', celular: p.celular || '', activo: p.activo });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (editId) {
      const { error } = await supabase.from('profesionales').update(form).eq('id', editId);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else toast({ title: 'Profesional actualizado' });
    } else {
      const { error } = await supabase.from('profesionales').insert({ ...form, centro_id: CENTRO_ID });
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else toast({ title: 'Profesional creado' });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} Profesional</DialogTitle></DialogHeader>
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
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.nombre || !form.apellido}>
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
