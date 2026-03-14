import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CENTRO_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, CalendarIcon, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  entityType: 'profesional' | 'equipo';
  entityId: string;
}

interface Servicio {
  id: string;
  nombre: string;
}

interface AsignacionServicio {
  id: string;
  servicio_id: string;
  capacidad_simultanea: number;
  activo: boolean;
  servicio?: Servicio;
}

interface Horario {
  id: string;
  profesional_centro_servicio_id: string;
  tipo: 'semanal' | 'especifico';
  dia_semana: number[] | null;
  fecha_especifica: string | null;
  hora_inicio: string;
  hora_fin: string;
  capacidad_simultanea: number;
}

const DIAS_SEMANA = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

const emptyHorarioForm = {
  tipo: 'semanal' as 'semanal' | 'especifico',
  dia_semana: [] as number[],
  fecha_especifica: null as Date | null,
  hora_inicio: '08:00',
  hora_fin: '12:00',
  capacidad_simultanea: 1,
};

export function ServiciosHorariosTab({ entityType, entityId }: Props) {
  const [serviciosDisponibles, setServiciosDisponibles] = useState<Servicio[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionServicio[]>([]);
  const [horarios, setHorarios] = useState<Record<string, Horario[]>>({});
  const [loading, setLoading] = useState(true);

  // Service assignment dialog
  const [servicioDialogOpen, setServicioDialogOpen] = useState(false);
  const [servicioForm, setServicioForm] = useState({ servicio_id: '', capacidad_simultanea: 1, activo: true });
  const [savingServicio, setSavingServicio] = useState(false);

  // Horario dialog
  const [horarioDialogOpen, setHorarioDialogOpen] = useState(false);
  const [horarioForm, setHorarioForm] = useState(emptyHorarioForm);
  const [horarioForAsignacion, setHorarioForAsignacion] = useState<string | null>(null);
  const [editHorarioId, setEditHorarioId] = useState<string | null>(null);
  const [savingHorario, setSavingHorario] = useState(false);

  const { toast } = useToast();

  const entityColumn = entityType === 'profesional' ? 'profesional_id' : 'equipo_id';

  const fetchAll = async () => {
    setLoading(true);

    const [serviciosRes, asignacionesRes] = await Promise.all([
      supabase.from('servicios').select('id, nombre').eq('centro_id', CENTRO_ID).eq('activo', true).order('nombre'),
      supabase.from('profesional_centro_servicio').select('*, servicio:servicios(id, nombre)').eq(entityColumn, entityId).eq('centro_id', CENTRO_ID),
    ]);

    setServiciosDisponibles(serviciosRes.data ?? []);
    const asigs = (asignacionesRes.data ?? []).map((a: any) => ({
      id: a.id,
      servicio_id: a.servicio_id,
      capacidad_simultanea: a.capacidad_simultanea,
      activo: a.activo,
      servicio: a.servicio,
    }));
    setAsignaciones(asigs);

    // Fetch horarios for all asignaciones
    if (asigs.length > 0) {
      const ids = asigs.map((a: AsignacionServicio) => a.id);
      const { data: horariosData } = await supabase
        .from('horarios_disponibles')
        .select('*')
        .in('profesional_centro_servicio_id', ids);

      const grouped: Record<string, Horario[]> = {};
      (horariosData ?? []).forEach((h: any) => {
        if (!grouped[h.profesional_centro_servicio_id]) grouped[h.profesional_centro_servicio_id] = [];
        grouped[h.profesional_centro_servicio_id].push(h);
      });
      setHorarios(grouped);
    } else {
      setHorarios({});
    }

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [entityId]);

  // --- Service assignment ---
  const handleAddServicio = async () => {
    setSavingServicio(true);
    const payload: any = {
      servicio_id: servicioForm.servicio_id,
      capacidad_simultanea: servicioForm.capacidad_simultanea,
      activo: servicioForm.activo,
      centro_id: CENTRO_ID,
      [entityColumn]: entityId,
    };
    const { error } = await supabase.from('profesional_centro_servicio').insert(payload);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Servicio asignado' }); setServicioDialogOpen(false); fetchAll(); }
    setSavingServicio(false);
  };

  const handleDeleteAsignacion = async (id: string) => {
    const { error } = await supabase.from('profesional_centro_servicio').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Servicio desasignado' }); fetchAll(); }
  };

  // --- Horarios ---
  const openNewHorario = (asignacionId: string) => {
    setHorarioForAsignacion(asignacionId);
    setEditHorarioId(null);
    setHorarioForm(emptyHorarioForm);
    setHorarioDialogOpen(true);
  };

  const openEditHorario = (h: Horario) => {
    setHorarioForAsignacion(h.profesional_centro_servicio_id);
    setEditHorarioId(h.id);
    setHorarioForm({
      tipo: h.tipo,
      dia_semana: h.dia_semana ?? [],
      fecha_especifica: h.fecha_especifica ? new Date(h.fecha_especifica) : null,
      hora_inicio: h.hora_inicio,
      hora_fin: h.hora_fin,
      capacidad_simultanea: h.capacidad_simultanea,
    });
    setHorarioDialogOpen(true);
  };

  const handleSaveHorario = async () => {
    setSavingHorario(true);
    const payload: any = {
      profesional_centro_servicio_id: horarioForAsignacion,
      tipo: horarioForm.tipo,
      dia_semana: horarioForm.tipo === 'semanal' ? horarioForm.dia_semana : null,
      fecha_especifica: horarioForm.tipo === 'especifico' && horarioForm.fecha_especifica
        ? format(horarioForm.fecha_especifica, 'yyyy-MM-dd')
        : null,
      hora_inicio: horarioForm.hora_inicio,
      hora_fin: horarioForm.hora_fin,
      capacidad_simultanea: horarioForm.capacidad_simultanea,
    };

    if (editHorarioId) {
      const { error } = await supabase.from('horarios_disponibles').update(payload).eq('id', editHorarioId);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else toast({ title: 'Horario actualizado' });
    } else {
      const { error } = await supabase.from('horarios_disponibles').insert(payload);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else toast({ title: 'Horario creado' });
    }
    setSavingHorario(false);
    setHorarioDialogOpen(false);
    fetchAll();
  };

  const handleDeleteHorario = async (id: string) => {
    const { error } = await supabase.from('horarios_disponibles').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Horario eliminado' }); fetchAll(); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Servicios asignados</h3>
        <Button size="sm" onClick={() => { setServicioForm({ servicio_id: '', capacidad_simultanea: 1, activo: true }); setServicioDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Agregar Servicio
        </Button>
      </div>

      {asignaciones.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay servicios asignados</p>
      ) : (
        asignaciones.map(a => (
          <Card key={a.id} className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {a.servicio?.nombre ?? 'Servicio'}
                  <Badge variant={a.activo ? 'default' : 'secondary'}>{a.activo ? 'Activo' : 'Inactivo'}</Badge>
                  <span className="text-xs text-muted-foreground">Cap: {a.capacidad_simultanea}</span>
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteAsignacion(a.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Horarios</span>
                <Button variant="outline" size="sm" onClick={() => openNewHorario(a.id)}>
                  <Plus className="w-3 h-3 mr-1" /> Agregar Horario
                </Button>
              </div>
              {(horarios[a.id] ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin horarios configurados</p>
              ) : (
                <div className="space-y-1">
                  {(horarios[a.id] ?? []).map(h => (
                    <div key={h.id} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {h.tipo === 'semanal' ? (
                          <span>{(h.dia_semana ?? []).map(d => DIAS_SEMANA.find(ds => ds.value === d)?.label).join(', ')}</span>
                        ) : (
                          <span>{h.fecha_especifica}</span>
                        )}
                        <span className="text-muted-foreground">|</span>
                        <span>{h.hora_inicio} - {h.hora_fin}</span>
                        <span className="text-muted-foreground text-xs">(Cap: {h.capacidad_simultanea})</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditHorario(h)}><Pencil className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteHorario(h.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Assign service dialog */}
      <Dialog open={servicioDialogOpen} onOpenChange={setServicioDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Agregar Servicio</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Servicio</Label>
              <Select value={servicioForm.servicio_id} onValueChange={v => setServicioForm({ ...servicioForm, servicio_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
                <SelectContent>
                  {serviciosDisponibles.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Capacidad simultánea</Label>
              <Input type="number" value={servicioForm.capacidad_simultanea} onChange={e => setServicioForm({ ...servicioForm, capacidad_simultanea: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={servicioForm.activo} onCheckedChange={v => setServicioForm({ ...servicioForm, activo: v })} />
              <Label>Activo</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAddServicio} disabled={savingServicio || !servicioForm.servicio_id}>
                {savingServicio && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
              <Button variant="outline" onClick={() => setServicioDialogOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Horario dialog */}
      <Dialog open={horarioDialogOpen} onOpenChange={setHorarioDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editHorarioId ? 'Editar' : 'Agregar'} Horario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={horarioForm.tipo} onValueChange={v => setHorarioForm({ ...horarioForm, tipo: v as 'semanal' | 'especifico' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanal">Semanal fijo</SelectItem>
                  <SelectItem value="especifico">Día específico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {horarioForm.tipo === 'semanal' ? (
              <div className="space-y-2">
                <Label>Días de la semana</Label>
                <div className="flex flex-wrap gap-3">
                  {DIAS_SEMANA.map(d => (
                    <label key={d.value} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={horarioForm.dia_semana.includes(d.value)}
                        onCheckedChange={(checked) => {
                          setHorarioForm(prev => ({
                            ...prev,
                            dia_semana: checked
                              ? [...prev.dia_semana, d.value]
                              : prev.dia_semana.filter(v => v !== d.value),
                          }));
                        }}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Fecha</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !horarioForm.fecha_especifica && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {horarioForm.fecha_especifica ? format(horarioForm.fecha_especifica, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={horarioForm.fecha_especifica ?? undefined}
                      onSelect={d => setHorarioForm({ ...horarioForm, fecha_especifica: d ?? null })}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Hora inicio</Label>
                <Input type="time" value={horarioForm.hora_inicio} onChange={e => setHorarioForm({ ...horarioForm, hora_inicio: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Hora fin</Label>
                <Input type="time" value={horarioForm.hora_fin} onChange={e => setHorarioForm({ ...horarioForm, hora_fin: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Capacidad simultánea</Label>
              <Input type="number" value={horarioForm.capacidad_simultanea} onChange={e => setHorarioForm({ ...horarioForm, capacidad_simultanea: Number(e.target.value) })} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSaveHorario} disabled={savingHorario}>
                {savingHorario && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
              <Button variant="outline" onClick={() => setHorarioDialogOpen(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
