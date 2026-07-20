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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePlan } from '@/hooks/use-plan';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const DIAS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

interface Agenda { id: string; nombre: string; }
interface Profesional { id: string; nombre: string; apellido: string; }

interface FranjaHoraria {
  tempId: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  acepta_os: boolean;
  precio_particular: string;
}

interface Servicio {
  id: string;
  nombre: string;
  duracion_minutos: number;
  es_tratamiento: boolean;
  sesiones_por_bloque: number | null;
  activo: boolean;
  agenda_id: string | null;
  agenda?: { nombre: string } | null;
}

const emptyForm = {
  nombre: '',
  duracion_minutos: 30,
  es_tratamiento: false,
  sesiones_por_bloque: null as number | null,
  activo: true,
  agenda_id: '',
};

const newFranja = (dia: number): FranjaHoraria => ({
  tempId: crypto.randomUUID(),
  dia_semana: dia,
  hora_inicio: '08:00',
  hora_fin: '20:00',
  acepta_os: true,
  precio_particular: '',
});

export default function Servicios() {
  const { centroId } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { tiene } = usePlan();

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [profSeleccionados, setProfSeleccionados] = useState<string[]>([]);
  const [franjas, setFranjas] = useState<FranjaHoraria[]>([]);
  const [diasExpandidos, setDiasExpandidos] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setFranjas([]);
    setDiasExpandidos([]);
    setDialogOpen(true);
  };

  const openEdit = async (s: Servicio) => {
    setEditId(s.id);
    setForm({
      nombre: s.nombre,
      duracion_minutos: s.duracion_minutos,
      es_tratamiento: s.es_tratamiento,
      sesiones_por_bloque: s.sesiones_por_bloque,
      activo: s.activo,
      agenda_id: s.agenda_id ?? '',
    });

    // Cargar profesionales asignados y sus franjas horarias
    const { data: pcsData } = await supabase
      .from('profesional_centro_servicio')
      .select('id, profesional_id')
      .eq('servicio_id', s.id)
      .eq('centro_id', centroId!);

    const profIds = (pcsData ?? []).map(r => r.profesional_id).filter(Boolean);
    setProfSeleccionados(profIds);

    // Cargar franjas de pcs_horario_dia para cada PCS
    const pcsIds = (pcsData ?? []).map(r => r.id);
    let franjasDb: FranjaHoraria[] = [];
    if (pcsIds.length > 0) {
      const { data: hData } = await supabase
        .from('pcs_horario_dia')
        .select('*')
        .in('pcs_id', pcsIds)
        .eq('activo', true);

      // Agrupar por día (tomamos la primera PCS como referencia — asumimos mismas franjas por servicio)
      const seen = new Set<string>();
      franjasDb = (hData ?? [])
        .filter(h => {
          const key = `${h.dia_semana}-${h.hora_inicio}-${h.hora_fin}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(h => ({
          tempId: crypto.randomUUID(),
          dia_semana: h.dia_semana,
          hora_inicio: h.hora_inicio.substring(0, 5),
          hora_fin: h.hora_fin.substring(0, 5),
          acepta_os: h.acepta_os,
          precio_particular: h.precio_particular?.toString() ?? '',
        }));
    }

    setFranjas(franjasDb);
    setDiasExpandidos([...new Set(franjasDb.map(f => f.dia_semana))]);
    setDialogOpen(true);
  };

  const toggleDia = (dia: number, checked: boolean) => {
    if (checked) {
      setFranjas(prev => [...prev, newFranja(dia)]);
      setDiasExpandidos(prev => [...prev, dia]);
    } else {
      setFranjas(prev => prev.filter(f => f.dia_semana !== dia));
      setDiasExpandidos(prev => prev.filter(d => d !== dia));
    }
  };

  const addFranja = (dia: number) => {
    setFranjas(prev => [...prev, newFranja(dia)]);
  };

  const removeFranja = (tempId: string) => {
    setFranjas(prev => prev.filter(f => f.tempId !== tempId));
  };

  const updateFranja = (tempId: string, patch: Partial<FranjaHoraria>) => {
    setFranjas(prev => prev.map(f => f.tempId === tempId ? { ...f, ...patch } : f));
  };

  const toggleDiaExpandido = (dia: number) => {
    setDiasExpandidos(prev =>
      prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]
    );
  };

  const diasActivos = [...new Set(franjas.map(f => f.dia_semana))].sort((a, b) => a - b);

  const handleSave = async () => {
    if (!centroId) return;
    if (!editId && !tiene('servicios_ilimit') && servicios.length >= 3) {
      toast({ title: 'Límite del plan Básico', description: 'El plan Básico incluye hasta 3 servicios. Actualizá tu plan para agregar más.', variant: 'destructive' });
      return;
    }
    if (franjas.length === 0) {
      toast({ title: 'Falta horario', description: 'Agregá al menos un día y franja horaria.', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const payload = {
      nombre: form.nombre,
      duracion_minutos: form.duracion_minutos,
      es_tratamiento: form.es_tratamiento,
      sesiones_por_bloque: form.es_tratamiento ? form.sesiones_por_bloque : null,
      activo: form.activo,
      agenda_id: form.agenda_id || null,
    };

    let servicioId = editId;

    if (editId) {
      const { error } = await supabase.from('servicios').update(payload).eq('id', editId);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setSaving(false); return;
      }
    } else {
      const { data, error } = await supabase.from('servicios').insert({ ...payload, centro_id: centroId }).select('id').single();
      if (error || !data) {
        toast({ title: 'Error', description: error?.message, variant: 'destructive' });
        setSaving(false); return;
      }
      servicioId = data.id;
    }

    // Eliminar PCS existentes para este servicio (solo los que no tienen turnos activos)
    const { data: oldPcs } = await supabase
      .from('profesional_centro_servicio')
      .select('id, profesional_id')
      .eq('servicio_id', servicioId!)
      .eq('centro_id', centroId);

    if (oldPcs && oldPcs.length > 0) {
      // Profesionales que tienen turnos activos (no cancelados/finalizados) para este servicio
      const { data: turnosActivos } = await supabase
        .from('turnos')
        .select('profesional_id')
        .eq('centro_id', centroId!)
        .eq('servicio_id', servicioId!)
        .not('estado', 'in', '(cancelado,finalizado)');

      const profsConTurnos = new Set((turnosActivos ?? []).map((t: any) => t.profesional_id));

      const idsParaEliminar = oldPcs
        .filter(p => !profsConTurnos.has(p.profesional_id))
        .map(p => p.id);

      if (idsParaEliminar.length > 0) {
        await supabase.from('pcs_horario_dia').delete().in('pcs_id', idsParaEliminar);
        await supabase.from('profesional_centro_servicio').delete().in('id', idsParaEliminar);
      }
    }

    // Crear nuevo PCS por profesional seleccionado y sus franjas
    for (const profId of profSeleccionados) {
      // Crear PCS
      const { data: pcsData, error: pcsErr } = await supabase
        .from('profesional_centro_servicio')
        .insert({
          centro_id: centroId,
          profesional_id: profId,
          servicio_id: servicioId,
          activo: true,
          capacidad_simultanea: 1,
          // Mantener dias_trabajo para compatibilidad con código existente
          dias_trabajo: franjas.map(f => DIAS.find(d => d.value === f.dia_semana)?.label.toLowerCase().replace('é', 'e').replace('á', 'a') ?? '').filter(Boolean),
          hora_inicio: franjas[0]?.hora_inicio ? franjas[0].hora_inicio + ':00' : '08:00:00',
          hora_fin: franjas[0]?.hora_fin ? franjas[0].hora_fin + ':00' : '20:00:00',
        })
        .select('id')
        .single();

      if (pcsErr || !pcsData) continue;

      // Crear franjas horarias en pcs_horario_dia
      const franjaRows = franjas.map(f => ({
        centro_id: centroId,
        pcs_id: pcsData.id,
        dia_semana: f.dia_semana,
        hora_inicio: f.hora_inicio + ':00',
        hora_fin: f.hora_fin + ':00',
        acepta_os: f.acepta_os,
        precio_particular: f.precio_particular ? parseFloat(f.precio_particular) : null,
        activo: true,
      }));

      await supabase.from('pcs_horario_dia').insert(franjaRows);
    }

    toast({ title: editId ? 'Servicio actualizado' : 'Servicio creado' });
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await supabase.from('servicios').update({ activo: false }).eq('id', deleteId);
    setDeleting(false);
    setDeleteId(null);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Servicio desactivado' }); fetchData(); }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Servicios</h1>
          <p className="text-sm text-muted-foreground">{servicios.filter(s => s.activo).length} servicios activos</p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Nuevo Servicio</Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : servicios.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No hay servicios</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Agenda</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicios.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nombre}</TableCell>
                    <TableCell>
                      {s.agenda?.nombre
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">{s.agenda.nombre}</span>
                        : <span className="text-xs text-muted-foreground">Sin asignar</span>}
                    </TableCell>
                    <TableCell>{s.duracion_minutos} min</TableCell>
                    <TableCell>
                      {s.es_tratamiento
                        ? <Badge variant="secondary">Tratamiento ({s.sesiones_por_bloque} ses.)</Badge>
                        : <Badge variant="outline">Consulta</Badge>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </TableCell>
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl w-full">
          <DialogHeader><DialogTitle>{editId ? 'Editar' : 'Nuevo'} Servicio</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[78vh] pr-3">
            <div className="space-y-5">

              {/* Datos básicos */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold border-b pb-1">Datos del servicio</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Nombre *</Label>
                    <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Agenda *</Label>
                    <Select value={form.agenda_id} onValueChange={v => setForm({ ...form, agenda_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar agenda" /></SelectTrigger>
                      <SelectContent>{agendas.map(a => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Duración</Label>
                    <Select value={String(form.duracion_minutos)} onValueChange={v => setForm({ ...form, duracion_minutos: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (i + 1) * 5).map(m => (
                          <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.es_tratamiento} onCheckedChange={v => setForm({ ...form, es_tratamiento: v })} />
                  <Label>Es tratamiento</Label>
                </div>
                {form.es_tratamiento && (
                  <div className="space-y-1">
                    <Label>Sesiones por bloque</Label>
                    <Input type="number" value={form.sesiones_por_bloque ?? ''} onChange={e => setForm({ ...form, sesiones_por_bloque: Number(e.target.value) })} className="w-32" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} />
                  <Label>Activo</Label>
                </div>
              </section>

              {/* Profesionales */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold border-b pb-1">Profesionales que lo atienden</h3>
                {profesionales.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay profesionales activos.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {profesionales.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={profSeleccionados.includes(p.id)}
                          onCheckedChange={v => setProfSeleccionados(prev => v ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                        />
                        {p.apellido}, {p.nombre}
                      </label>
                    ))}
                  </div>
                )}
              </section>

              {/* Días y horarios */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold border-b pb-1">Días y horarios de atención</h3>
                <div className="flex flex-wrap gap-2">
                  {DIAS.map(d => (
                    <label key={d.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={diasActivos.includes(d.value)}
                        onCheckedChange={v => toggleDia(d.value, !!v)}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>

                {diasActivos.length === 0 && (
                  <p className="text-xs text-muted-foreground">Seleccioná al menos un día.</p>
                )}

                {DIAS.filter(d => diasActivos.includes(d.value)).map(d => {
                  const franjasDelDia = franjas.filter(f => f.dia_semana === d.value);
                  const expandido = diasExpandidos.includes(d.value);
                  return (
                    <div key={d.value} className="border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
                        onClick={() => toggleDiaExpandido(d.value)}
                      >
                        <span>{d.label} — {franjasDelDia.length} franja{franjasDelDia.length !== 1 ? 's' : ''}</span>
                        {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {expandido && (
                        <div className="p-3 space-y-3">
                          {franjasDelDia.map((f, idx) => (
                            <div key={f.tempId} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end p-3 bg-background border rounded-md">
                              <div className="space-y-1">
                                <Label className="text-xs">Desde</Label>
                                <Input type="time" value={f.hora_inicio} onChange={e => updateFranja(f.tempId, { hora_inicio: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Hasta</Label>
                                <Input type="time" value={f.hora_fin} onChange={e => updateFranja(f.tempId, { hora_fin: e.target.value })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Precio particular $</Label>
                                <Input type="number" placeholder="General" value={f.precio_particular} onChange={e => updateFranja(f.tempId, { precio_particular: e.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <Switch
                                    checked={f.acepta_os}
                                    onCheckedChange={v => updateFranja(f.tempId, { acepta_os: v })}
                                  />
                                  <Label className="text-xs">Acepta OS</Label>
                                </div>
                                {franjasDelDia.length > 1 && (
                                  <Button variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => removeFranja(f.tempId)}>
                                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Quitar
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => addFranja(d.value)}>
                            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar franja horaria
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving || !form.nombre || !form.agenda_id} className="flex-1 sm:flex-none">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-none">Cancelar</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="¿Desactivar servicio?"
        description="El servicio quedará inactivo. Los turnos existentes no se ven afectados."
        confirmLabel="Desactivar"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
