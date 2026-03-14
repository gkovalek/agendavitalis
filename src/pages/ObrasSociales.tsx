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
import { useIsMobile } from '@/hooks/use-mobile';

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
  const isMobile = useIsMobile();

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
      if (error) toast({ title: 'Error', description: 'No se pudo actualizar la obra social. Intentá de nuevo.', variant: 'destructive' });
      else toast({ title: 'Obra social actualizada' });
    } else {
      const { error } = await supabase.from('prepagas').insert(payload);
      if (error) toast({ title: 'Error', description: 'No se pudo crear la obra social. Intentá de nuevo.', variant: 'destructive' });
      else toast({ title: 'Obra social creada' });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Obras Sociales</h1>
          <p className="text-sm text-muted-foreground">{items.length} registradas</p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Nueva Obra Social</Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No hay obras sociales</p>
          ) : isMobile ? (
            <div className="divide-y">
              {items.map(p => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{p.nombre}</p>
                    {p.codigo && <p className="text-xs text-muted-foreground">Código: {p.codigo}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(p)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
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
                {items.map(p => (
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nueva'} Obra Social</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} /></div>
            <div className="space-y-1"><Label>Código</Label><Input value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} /></div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.nombre} className="flex-1 sm:flex-none">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-none">Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
