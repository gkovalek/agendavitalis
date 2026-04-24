import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, Search, ChevronRight, ArrowLeft, Calendar, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface Tratamiento {
  id: string;
  paciente_id: string;
  profesional_id: string;
  servicio_id: string;
  total_sesiones: number;
  sesiones_consumidas: number;
  sesiones_restantes: number;
  estado: 'activo' | 'finalizado' | 'pausado';
  fecha_inicio: string;
  fecha_fin: string | null;
  paciente?: { nombre: string; apellido: string };
  profesional?: { nombre: string; apellido: string };
  servicio?: { nombre: string };
}

interface Sesion {
  id: string;
  fecha: string;
  turno_id: string;
}

interface Paciente { id: string; nombre: string; apellido: string; dni: string; }
interface Profesional { id: string; nombre: string; apellido: string; }
interface Servicio { id: string; nombre: string; sesiones_por_bloque: number | null; }

const ESTADO_CONFIG = {
  activo: { label: 'Activo', className: 'bg-green-100 text-green-700' },
  pausado: { label: 'Pausado', className: 'bg-yellow-100 text-yellow-700' },
  finalizado: { label: 'Finalizado', className: 'bg-gray-100 text-gray-600' },
};

export default function Tratamientos() {
  const { centroId } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [tratamientos, setTratamientos] = useState<Tratamiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [selected, setSelected] = useState<Tratamiento | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [loadingSesiones, setLoadingSesiones] = useState(false);

  // Nuevo tratamiento
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [searchPaciente, setSearchPaciente] = useState('');
  const [pacientesFiltrados, setPacientesFiltrados] = useState<Paciente[]>([]);
  const [form, setForm] = useState({ paciente_id: '', profesional_id: '', servicio_id: '', total_sesiones: 10, fecha_inicio: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);

  const fetchTratamientos = async () => {
    if (!centroId) return;
    setLoading(true);
    const { data } = await supabase
      .from('tratamientos')
      .select('*, paciente:pacientes(nombre, apellido), profesional:profesionales(nombre, apellido), servicio:servicios(nombre)')
      .eq('centro_id', centroId)
      .order('fecha_inicio', { ascending: false });
    setTratamientos((data as any[]) ?? []);
    setLoading(false);
  };

  const fetchSesiones = async (tratamientoId: string) => {
    setLoadingSesiones(true);
    const { data } = await supabase
      .from('tratamiento_sesiones')
      .select('id, fecha, turno_id')
      .eq('tratamiento_id', tratamientoId)
      .order('fecha', { ascending: false });
    setSesiones((data as Sesion[]) ?? []);
    setLoadingSesiones(false);
  };

  const fetchCatalogos = async () => {
    if (!centroId) return;
    const [profRes, srvRes] = await Promise.all([
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
      supabase.from('servicios').select('id, nombre, sesiones_por_bloque').eq('centro_id', centroId).eq('activo', true).eq('es_tratamiento', true).order('nombre'),
    ]);
    setProfesionales(profRes.data ?? []);
    setServicios(srvRes.data ?? []);
  };

  useEffect(() => { fetchTratamientos(); }, [centroId]);

  const handleSelectTratamiento = (t: Tratamiento) => {
    setSelected(t);
    fetchSesiones(t.id);
  };

  const handleSearchPaciente = async (q: string) => {
    setSearchPaciente(q);
    if (q.length < 2) { setPacientesFiltrados([]); return; }
    const { data } = await supabase
      .from('pacientes')
      .select('id, nombre, apellido, dni')
      .eq('centro_id', centroId)
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,dni.ilike.%${q}%`)
      .limit(8);
    setPacientesFiltrados(data ?? []);
  };

  const openDialog = () => {
    setForm({ paciente_id: '', profesional_id: '', servicio_id: '', total_sesiones: 10, fecha_inicio: new Date().toISOString().split('T')[0] });
    setSearchPaciente('');
    setPacientesFiltrados([]);
    fetchCatalogos();
    setDialogOpen(true);
  };

  const handleServicioChange = (id: string) => {
    const srv = servicios.find(s => s.id === id);
    setForm(f => ({ ...f, servicio_id: id, total_sesiones: srv?.sesiones_por_bloque ?? f.total_sesiones }));
  };

  const handleSave = async () => {
    if (!centroId || !form.paciente_id || !form.profesional_id || !form.servicio_id) return;
    setSaving(true);
    const { error } = await supabase.from('tratamientos').insert({
      centro_id: centroId,
      paciente_id: form.paciente_id,
      profesional_id: form.profesional_id,
      servicio_id: form.servicio_id,
      total_sesiones: form.total_sesiones,
      sesiones_consumidas: 0,
      estado: 'activo',
      fecha_inicio: form.fecha_inicio,
    });
    if (error) {
      toast({ title: 'Error', description: 'No se pudo crear el tratamiento.', variant: 'destructive' });
    } else {
      toast({ title: 'Tratamiento creado' });
      setDialogOpen(false);
      fetchTratamientos();
    }
    setSaving(false);
  };

  const handleCambiarEstado = async (id: string, estado: string) => {
    const { error } = await supabase.from('tratamientos').update({ estado }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado.', variant: 'destructive' });
    } else {
      toast({ title: 'Estado actualizado' });
      fetchTratamientos();
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, estado: estado as any } : null);
    }
  };

  const tratamientosFiltrados = useMemo(() => {
    return tratamientos.filter(t => {
      const matchEstado = filtroEstado === 'todos' || t.estado === filtroEstado;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        t.paciente?.apellido.toLowerCase().includes(q) ||
        t.paciente?.nombre.toLowerCase().includes(q) ||
        t.servicio?.nombre.toLowerCase().includes(q) ||
        t.profesional?.apellido.toLowerCase().includes(q);
      return matchEstado && matchSearch;
    });
  }, [tratamientos, search, filtroEstado]);

  const selectedPaciente = pacientes.find(p => p.id === form.paciente_id);

  if (isMobile && selected) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Button>
        <TratamientoDetail tratamiento={selected} sesiones={sesiones} loading={loadingSesiones} onCambiarEstado={handleCambiarEstado} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Tratamientos</h1>
          <p className="text-sm text-muted-foreground">{tratamientosFiltrados.length} tratamientos</p>
        </div>
        <Button onClick={openDialog} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Nuevo Tratamiento</Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por paciente, profesional o servicio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="pausado">Pausados</SelectItem>
            <SelectItem value="finalizado">Finalizados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Lista */}
        <Card className="shadow-sm lg:col-span-1">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : tratamientosFiltrados.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No hay tratamientos</p>
            ) : isMobile ? (
              <div className="divide-y">
                {tratamientosFiltrados.map(t => (
                  <button key={t.id} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors" onClick={() => handleSelectTratamiento(t)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{t.paciente?.apellido}, {t.paciente?.nombre}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.servicio?.nombre}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Progress value={(t.sesiones_consumidas / t.total_sesiones) * 100} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground shrink-0">{t.sesiones_consumidas}/{t.total_sesiones}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_CONFIG[t.estado]?.className}`}>{ESTADO_CONFIG[t.estado]?.label}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Progreso</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tratamientosFiltrados.map(t => (
                    <TableRow key={t.id} className={`cursor-pointer ${selected?.id === t.id ? 'bg-muted' : ''}`} onClick={() => handleSelectTratamiento(t)}>
                      <TableCell>
                        <p className="font-medium">{t.paciente?.apellido}, {t.paciente?.nombre}</p>
                        <p className="text-xs text-muted-foreground">{t.profesional?.apellido}</p>
                      </TableCell>
                      <TableCell className="text-sm">{t.servicio?.nombre}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <Progress value={(t.sesiones_consumidas / t.total_sesiones) * 100} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground">{t.sesiones_consumidas}/{t.total_sesiones}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_CONFIG[t.estado]?.className}`}>{ESTADO_CONFIG[t.estado]?.label}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detalle desktop */}
        {!isMobile && (
          <Card className="shadow-sm lg:col-span-2">
            <CardContent className="p-4">
              {selected ? (
                <TratamientoDetail tratamiento={selected} sesiones={sesiones} loading={loadingSesiones} onCambiarEstado={handleCambiarEstado} />
              ) : (
                <p className="text-muted-foreground text-center py-12">Seleccioná un tratamiento para ver el detalle</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog nuevo tratamiento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo Tratamiento</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-3">
              {/* Búsqueda de paciente */}
              <div className="space-y-1">
                <Label>Paciente *</Label>
                {form.paciente_id ? (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                    <span className="text-sm">{selectedPaciente?.apellido}, {selectedPaciente?.nombre}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setForm(f => ({ ...f, paciente_id: '' }))}>Cambiar</Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar paciente..." className="pl-9" value={searchPaciente} onChange={e => handleSearchPaciente(e.target.value)} />
                    {pacientesFiltrados.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 border rounded-md bg-popover shadow-md max-h-48 overflow-auto">
                        {pacientesFiltrados.map(p => (
                          <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                            onClick={() => { setForm(f => ({ ...f, paciente_id: p.id })); setPacientes([p]); setPacientesFiltrados([]); setSearchPaciente(''); }}>
                            {p.apellido}, {p.nombre} — DNI {p.dni}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label>Profesional *</Label>
                <Select value={form.profesional_id} onValueChange={v => setForm(f => ({ ...f, profesional_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar profesional" /></SelectTrigger>
                  <SelectContent>
                    {profesionales.map(p => <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Servicio *</Label>
                <Select value={form.servicio_id} onValueChange={handleServicioChange}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
                  <SelectContent>
                    {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Total de sesiones</Label>
                  <Input type="number" min={1} value={form.total_sesiones} onChange={e => setForm(f => ({ ...f, total_sesiones: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha inicio</Label>
                  <Input type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving || !form.paciente_id || !form.profesional_id || !form.servicio_id} className="flex-1">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TratamientoDetail({ tratamiento, sesiones, loading, onCambiarEstado }: {
  tratamiento: Tratamiento;
  sesiones: Sesion[];
  loading: boolean;
  onCambiarEstado: (id: string, estado: string) => void;
}) {
  const pct = Math.round((tratamiento.sesiones_consumidas / tratamiento.total_sesiones) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{tratamiento.paciente?.apellido}, {tratamiento.paciente?.nombre}</h2>
          <p className="text-sm text-muted-foreground">{tratamiento.servicio?.nombre} · {tratamiento.profesional?.apellido}, {tratamiento.profesional?.nombre}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${ESTADO_CONFIG[tratamiento.estado]?.className}`}>
          {ESTADO_CONFIG[tratamiento.estado]?.label}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progreso de sesiones</span>
          <span className="font-semibold">{tratamiento.sesiones_consumidas} / {tratamiento.total_sesiones}</span>
        </div>
        <Progress value={pct} className="h-3" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct}% completado</span>
          <span>{tratamiento.sesiones_restantes} restantes</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>Inicio: {new Date(tratamiento.fecha_inicio + 'T00:00:00').toLocaleDateString('es-AR')}</span>
        </div>
        {tratamiento.fecha_fin && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Fin: {new Date(tratamiento.fecha_fin + 'T00:00:00').toLocaleDateString('es-AR')}</span>
          </div>
        )}
      </div>

      {/* Acciones de estado */}
      {tratamiento.estado !== 'finalizado' && (
        <div className="flex gap-2 flex-wrap">
          {tratamiento.estado === 'activo' && (
            <Button variant="outline" size="sm" onClick={() => onCambiarEstado(tratamiento.id, 'pausado')}>Pausar</Button>
          )}
          {tratamiento.estado === 'pausado' && (
            <Button variant="outline" size="sm" onClick={() => onCambiarEstado(tratamiento.id, 'activo')}>Reactivar</Button>
          )}
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => onCambiarEstado(tratamiento.id, 'finalizado')}>
            Finalizar tratamiento
          </Button>
        </div>
      )}

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" /> Sesiones realizadas
        </h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : sesiones.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin sesiones registradas aún</p>
        ) : (
          <div className="space-y-1">
            {sesiones.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-xs w-6 text-right">{sesiones.length - i}</span>
                  <span className="font-medium">{new Date(s.fecha + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </div>
                <Badge variant="outline" className="text-xs">Realizada</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
