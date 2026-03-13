import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Prepaga {
  id: string;
  nombre: string;
  codigo: string | null;
}

export default function ObrasSociales() {
  const [items, setItems] = useState<Prepaga[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: '', codigo: '' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('prepagas').select('*').order('nombre');
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditId(null); setForm({ nombre: '', codigo: '' }); setDialogOpen(true); };
  const openEdit = (p: Prepaga) => { setEditId(p.id); setForm({ nombre: p.nombre, codigo: p.codigo || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    const payload = { nombre: form.nombre, codigo: form.codigo || null };
    if (editId) {
      const { error } = await supabase.from('prepagas').update(payload).eq('id', editId);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else toast({ title: 'Obra social actualizada' });
    } else {
      const { error } = await supabase.from('prepagas').insert(payload);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else toast({ title: 'Obra social creada' });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Obras Sociales</h1>
          <p className="text-muted-foreground">{items.length} registradas</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Nueva Obra Social</Button>
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
                  <TableHead>Código</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No hay obras sociales</TableCell></TableRow>
                ) : items.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>{p.codigo || '—'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nueva'} Obra Social</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} /></div>
            <div className="space-y-1"><Label>Código</Label><Input value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} /></div>
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
