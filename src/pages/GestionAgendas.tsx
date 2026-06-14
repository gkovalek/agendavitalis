import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { normalizeDiasTrabajo } from '@/lib/constants';

interface Profesional {
  id: string;
  nombre: string;
  apellido: string;
}

interface Agenda {
  id: string;
  nombre: string;
  duracion_minutos: number;
  sesiones_por_bloque: number;
}

interface AgendaConProfesional extends Agenda {
  pcs?: {
    id: string;
    profesional_id: string;
    profesional_nombre: string;
    dias_trabajo: string[];
    hora_inicio: string;
    hora_fin: string;
  }[];
}

const DIAS_SEMANA = [
  { value: 'lunes', label: 'Lun' },
  { value: 'martes', label: 'Mar' },
  { value: 'miercoles', label: 'Mié' },
  { value: 'jueves', label: 'Jue' },
  { value: 'viernes', label: 'Vie' },
  { value: 'sabado', label: 'Sáb' },
];

const emptyForm = {
  nombre: '',
  duracion_minutos: 45,
  sesiones_por_bloque: 1,
  profesional_id: '',
  dias_trabajo: [] as string[],
  hora_inicio: '08:00',
  hora_fin: '18:00',
};

export default function GestionAgendas() {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const [agendas, setAgendas] = useState<AgendaConProfesional[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPcsId, setEditPcsId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    if (!centroId) return;
    setLoading(true);

    const [{ data: agendasData }, { data: pcsData }] = await Promise.all([
      supabase.from('agendas').select('id, nombre, duracion_minutos, sesiones_por_bloque').eq('centro_id', centroId).order('nombre'),
      supabase.from('profesional_centro_servicio')
        .select('id, agenda_id, profesional_id, dias_trabajo, hora_inicio, hora_fin, profesional:profesionales(nombre, apellido)')
        .eq('centro_id', centroId)
        .not('profesional_id', 'is', null)
        .not('agenda_id', 'is', null),
    ]);

    const agList: AgendaConProfesional[] = (agendasData ?? []).map(ag => ({
      ...ag,
      pcs: (pcsData ?? [])
        .filter(p => p.agenda_id === ag.id)
        .map(p => ({
          id: p.id,
          profesional_id: p.profesional_id,
          profesional_nombre: `${(p.profesional as any)?.apellido ?? ''}, ${(p.profesional as any)?.nombre ?? ''}`,
          dias_trabajo: normalizeDiasTrabajo(p.dias_trabajo),
          hora_inicio: p.hora_inicio ?? '',
          hora_fin: p.hora_fin ?? '',
        })),
    }));

    setAgendas(agList);
    setLoading(false);
  };

  useEffect(() => {
    if (!centroId) return;
    supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido')
      .then(({ data }) => setProfesionales(data ?? []));
  }, [centroId]);

  useEffect(() => { fetchData(); }, [centroId]);

  const openNew = () => {
    setEditId(null);
    setEditPcsId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (ag: AgendaConProfesional, pcs?: AgendaConProfesional['pcs'][0]) => {
    setEditId(ag.id);
    setEditPcsId(pcs?.id ?? null);
    setForm({
      nombre: ag.nombre,
      duracion_minutos: ag.duracion_minutos,
      sesiones_por_bloque: ag.sesiones_por_bloque,
      profesional_id: pcs?.profesional_id ?? '',
      dias_trabajo: pcs?.dias_trabajo ?? [],
      hora_inicio: pcs?.hora_inicio ?? '08:00',
      hora_fin: pcs?.hora_fin ?? '18:00',
    });
    setDialogOpen(true);
  };

  const toggleDia = (dia: string, checked: boolean) => {
    const current = normalizeDiasTrabajo(form.dias_trabajo);
    const next = checked ? [...current, dia] : current.filter(d => d !== dia);
    setForm(f => ({ ...f, dias_trabajo: normalizeDiasTrabajo(next) }));
  };

  const handleSave = async () => {
    if (!centroId || !form.nombre.trim() || !form.profesional_id) return;
    setSaving(true);

    let agendaId = editId;

    if (editId) {
      const { error } = await supabase.from('agendas').update({
        nombre: form.nombre,
        duracion_minutos: form.duracion_minutos,
        sesiones_por_bloque: form.sesiones_por_bloque,
      }).eq('id', editId);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('agendas').insert({
        nombre: form.nombre,
        duracion_minutos: form.duracion_minutos,
        sesiones_por_bloque: form.sesiones_por_bloque,
        centro_id: centroId,
      }).select('id').single();
      if (error || !data) { toast({ title: 'Error', description: error?.message, variant: 'destructive' }); setSaving(false); return; }
      agendaId = data.id;
    }

    const pcsPayload = {
      profesional_id: form.profesional_id,
      agenda_id: agendaId,
      centro_id: centroId,
      dias_trabajo: normalizeDiasTrabajo(form.dias_trabajo),
      hora_inicio: form.hora_inicio,
      hora_fin: form.hora_fin,
      activo: true,
    };

    if (editPcsId) {
      const { error } = await supabase.from('profesional_centro_servicio').update(pcsPayload).eq('id', editPcsId);
      if (error) { toast({ title: 'Error guardando asignación', description: error.message, variant: 'destructive' }); }
    } else {
      const { error } = await supabase.from('profesional_centro_servicio').insert(pcsPayload);
      if (error) { toast({ title: 'Error guardando asignación', description: error.message, variant: 'destructive' }); }
    }

    setSaving(false);
    setDialogOpen(false);
    toast({ title: editId ? 'Agenda actualizada' : 'Agenda creada' });
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await supabase.from('profesional_centro_servicio').delete().eq('agenda_id', deleteId);
    const { error } = await supabase.from('agendas').delete().eq('id', deleteId);
    setDeleting(false);
    setDeleteId(null);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Agenda eliminada' }); fetchData(); }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Gestión de Agendas</h1>
          <p className="text-sm text-muted-foreground">{agendas.length} agendas configuradas</p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Nueva Agenda</Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : agendas.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No hay agendas configuradas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-[11px] uppercase tracking-wide">Agenda</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Duración</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Simultáneos</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Profesional</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Días</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide">Horario</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agendas.flatMap(ag => {
                  if (!ag.pcs || ag.pcs.length === 0) {
                    return [(
                      <TableRow key={ag.id}>
                        <TableCell className="font-semibold text-[13px]">{ag.nombre}</TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">{ag.duracion_minutos} min</TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">{ag.sesiones_por_bloque}</TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">—</TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">—</TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">—</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(ag)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(ag.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )];
                  }
                  return ag.pcs.map((pcs, i) => (
                    <TableRow key={`${ag.id}-${pcs.id}`}>
                      {i === 0 && (
                        <TableCell className="font-semibold text-[13px]" rowSpan={ag.pcs!.length}>{ag.nombre}</TableCell>
                      )}
                      {i === 0 && (
                        <TableCell className="text-[13px] text-muted-foreground" rowSpan={ag.pcs!.length}>{ag.duracion_minutos} min</TableCell>
                      )}
                      {i === 0 && (
                        <TableCell className="text-[13px] text-muted-foreground" rowSpan={ag.pcs!.length}>{ag.sesiones_por_bloque}</TableCell>
                      )}
                      <TableCell className="text-[13px]">{pcs.profesional_nombre}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">
                        {pcs.dias_trabajo.map(d => d.slice(0, 2)).join(' · ')}
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">
                        {pcs.hora_inicio?.slice(0, 5)} – {pcs.hora_fin?.slice(0, 5)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(ag, pcs)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {i === 0 && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(ag.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ));
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar' : 'Nueva'} Agenda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-1">
                <Label>Nombre de la agenda *</Label>
                <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="ej: RPG, Kinesiología" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duración (min)</Label>
                <Input type="number" min={5} max={180} value={form.duracion_minutos}
                  onChange={e => setForm(f => ({ ...f, duracion_minutos: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Pacientes simultáneos</Label>
                <Input type="number" min={1} max={20} value={form.sesiones_por_bloque}
                  onChange={e => setForm(f => ({ ...f, sesiones_por_bloque: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold">Asignación de profesional</p>
              <div className="space-y-1">
                <Label>Profesional *</Label>
                <Select value={form.profesional_id} onValueChange={v => setForm(f => ({ ...f, profesional_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar profesional" /></SelectTrigger>
                  <SelectContent>
                    {profesionales.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Días de atención</Label>
                <div className="flex flex-wrap gap-2">
                  {DIAS_SEMANA.map(d => (
                    <label key={d.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={normalizeDiasTrabajo(form.dias_trabajo).includes(d.value)}
                        onCheckedChange={(checked) => toggleDia(d.value, !!checked)}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Hora inicio</Label>
                  <Input type="time" value={form.hora_inicio} onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Hora fin</Label>
                  <Input type="time" value={form.hora_fin} onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleSave}
                disabled={saving || !form.nombre.trim() || !form.profesional_id}
                className="flex-1"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="¿Eliminar agenda?"
        description="Se eliminará la agenda y todas sus asignaciones a profesionales. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
