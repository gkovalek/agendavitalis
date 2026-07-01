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
import { Loader2, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface ObraSocial {
  id: string;
  codigo: string;
  nombre: string;
  valor_sesion: number;
  activa: boolean;
  factura_con_token: boolean;
  id_vitalis: string;
  profesional_id: string;
  profesional?: { nombre: string; apellido: string } | null;
}

interface Profesional {
  id: string;
  nombre: string;
  apellido: string;
}

const emptyForm = {
  codigo: '',
  nombre: '',
  valor_sesion: 0,
  activa: true,
  factura_con_token: false,
  profesional_id: '',
};

function getInitials(nombre: string, apellido: string): string {
  const n = nombre.trim()[0] ?? '';
  const a = apellido.trim()[0] ?? '';
  return (n + a).toUpperCase();
}

export default function ObrasSociales() {
  const { centroId } = useAuth();
  const [items, setItems] = useState<ObraSocial[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filterProf, setFilterProf] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const fetchData = async () => {
    setLoading(true);
    const [osRes, profRes] = await Promise.all([
      supabase
        .from('obras_sociales')
        .select('id, codigo, nombre, valor_sesion, activa, factura_con_token, id_vitalis, profesional_id, profesional:profesionales(nombre, apellido)')
        .eq('centro_id', centroId!)
        .order('nombre'),
      supabase
        .from('profesionales')
        .select('id, nombre, apellido')
        .eq('centro_id', centroId!)
        .eq('activo', true)
        .order('apellido'),
    ]);
    setItems(((osRes.data as any[]) ?? []).map((os: any) => ({
      ...os,
      profesional: Array.isArray(os.profesional) ? (os.profesional[0] ?? null) : os.profesional,
    })) as ObraSocial[]);
    setProfesionales((profRes.data as Profesional[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (centroId) fetchData(); }, [centroId]);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (os: ObraSocial) => {
    setEditId(os.id);
    setForm({
      codigo: os.codigo,
      nombre: os.nombre,
      valor_sesion: os.valor_sesion,
      activa: os.activa,
      factura_con_token: os.factura_con_token ?? false,
      profesional_id: os.profesional_id,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre || !form.profesional_id || !form.codigo) return;
    setSaving(true);

    const prof = profesionales.find(p => p.id === form.profesional_id);
    const initials = prof ? getInitials(prof.nombre, prof.apellido) : 'XX';
    const id_vitalis = `${initials}-${form.codigo}`;

    const payload = {
      codigo: form.codigo,
      nombre: form.nombre,
      valor_sesion: Number(form.valor_sesion) || 0,
      activa: form.activa,
      factura_con_token: form.factura_con_token,
      profesional_id: form.profesional_id,
      id_vitalis,
      centro_id: centroId,
    };

    if (editId) {
      const { error } = await supabase.from('obras_sociales').update(payload).eq('id', editId);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else toast({ title: 'Obra social actualizada' });
    } else {
      const { error } = await supabase.from('obras_sociales').insert(payload);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else toast({ title: 'Obra social creada' });
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await supabase.from('obras_sociales').delete().eq('id', deleteId);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Obra social eliminada' });
    setDeleting(false);
    setDeleteId(null);
    fetchData();
  };

  const handleToggleActiva = async (os: ObraSocial) => {
    await supabase.from('obras_sociales').update({ activa: !os.activa }).eq('id', os.id);
    fetchData();
  };

  const filtered = items.filter(os => {
    const matchProf = filterProf === 'todos' || os.profesional_id === filterProf;
    const q = search.toLowerCase();
    const matchSearch = !q || os.nombre.toLowerCase().includes(q) || os.codigo.includes(q) || os.id_vitalis.toLowerCase().includes(q);
    return matchProf && matchSearch;
  });

  const selectedProfForForm = profesionales.find(p => p.id === form.profesional_id);
  const previewIdVitalis = selectedProfForForm
    ? `${getInitials(selectedProfForForm.nombre, selectedProfForForm.apellido)}-${form.codigo || '???'}`
    : form.codigo ? `??-${form.codigo}` : '';

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Obras Sociales</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {items.length} registradas</p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto bg-[#0F6E56] hover:bg-[#0a5542]">
          <Plus className="w-4 h-4 mr-2" /> Nueva Obra Social
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, código o ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={filterProf} onValueChange={setFilterProf}>
          <SelectTrigger className="h-9 text-sm w-full sm:w-52">
            <SelectValue placeholder="Todos los profesionales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los profesionales</SelectItem>
            {profesionales.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No hay obras sociales</p>
          ) : isMobile ? (
            <div className="divide-y">
              {filtered.map(os => (
                <div key={os.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground truncate">{os.nombre}</p>
                      {!os.activa && <Badge variant="secondary" className="text-[10px] shrink-0">Inactiva</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cód. {os.codigo} · {(os.profesional as any)?.apellido ?? '—'} · ID: <span className="font-mono">{os.id_vitalis}</span>
                    </p>
                    {os.valor_sesion > 0 && (
                      <p className="text-xs text-emerald-600 font-medium">${os.valor_sesion.toFixed(2)} / sesión</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(os)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteId(os.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Cód.</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Profesional</TableHead>
                  <TableHead className="w-28">ID Vitalis</TableHead>
                  <TableHead className="w-28 text-right">$ / Sesión</TableHead>
                  <TableHead className="w-20 text-center">Activa</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(os => (
                  <TableRow key={os.id} className={!os.activa ? 'opacity-50' : ''}>
                    <TableCell className="text-muted-foreground font-mono text-xs">{os.codigo}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {os.nombre}
                        {os.factura_con_token && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">Token</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(os.profesional as any)?.apellido}, {(os.profesional as any)?.nombre}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">{os.id_vitalis}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {os.valor_sesion > 0 ? (
                        <span className="text-emerald-600 font-medium">${os.valor_sesion.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={os.activa}
                        onCheckedChange={() => handleToggleActiva(os)}
                        className="data-[state=checked]:bg-[#0F6E56]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(os)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteId(os.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar' : 'Nueva'} Obra Social</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Profesional */}
            <div className="space-y-1">
              <Label>Profesional *</Label>
              <Select value={form.profesional_id} onValueChange={v => setForm({ ...form, profesional_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná un profesional..." />
                </SelectTrigger>
                <SelectContent>
                  {profesionales.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Código */}
            <div className="space-y-1">
              <Label>Código *</Label>
              <Input
                value={form.codigo}
                onChange={e => setForm({ ...form, codigo: e.target.value })}
                placeholder="Ej: 347"
                className="font-mono"
              />
            </div>

            {/* Nombre */}
            <div className="space-y-1">
              <Label>Nombre obra social *</Label>
              <Input
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: SWISS MEDICAL GROUP"
              />
            </div>

            {/* Valor sesión */}
            <div className="space-y-1">
              <Label>Valor por sesión ($)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.valor_sesion}
                onChange={e => setForm({ ...form, valor_sesion: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>

            {/* ID Vitalis preview */}
            {previewIdVitalis && (
              <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">ID Vitalis (auto)</span>
                <span className="font-mono text-sm font-semibold text-[#0F6E56]">{previewIdVitalis}</span>
              </div>
            )}

            {/* Factura con token */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Factura con token</Label>
                <p className="text-xs text-muted-foreground mt-0.5">OSDE, Swiss Medical — factura por sesión realizada</p>
              </div>
              <Switch
                checked={form.factura_con_token}
                onCheckedChange={v => setForm({ ...form, factura_con_token: v })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>

            {/* Activa */}
            <div className="flex items-center justify-between">
              <Label>Activa</Label>
              <Switch
                checked={form.activa}
                onCheckedChange={v => setForm({ ...form, activa: v })}
                className="data-[state=checked]:bg-[#0F6E56]"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleSave}
                disabled={saving || !form.nombre || !form.codigo || !form.profesional_id}
                className="flex-1 bg-[#0F6E56] hover:bg-[#0a5542]"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminar */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Eliminar obra social"
        description="¿Estás seguro? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
