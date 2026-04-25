import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, Search, ArrowLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

type Estado = 'pendiente' | 'presentado' | 'cobrado' | 'rechazado';

interface PedidoMedico {
  id: string;
  centro_id: string;
  paciente_id: string;
  profesional_id: string;
  turno_id: string | null;
  prepaga_id: string | null;
  numero_afiliado: string;
  fecha_pedido: string;
  fecha_vencimiento: string | null;
  descripcion: string;
  archivo_url: string | null;
  estado: Estado;
  created_at: string;
  paciente?: { nombre: string; apellido: string; dni: string };
  profesional?: { nombre: string; apellido: string };
  prepaga?: { nombre: string };
}

interface Paciente { id: string; nombre: string; apellido: string; dni: string; celular: string; }
interface Profesional { id: string; nombre: string; apellido: string; }
interface Prepaga { id: string; nombre: string; }

const ESTADO_CONFIG: Record<Estado, { label: string; className: string; variant: 'outline' | 'secondary' | 'default' | 'destructive' }> = {
  pendiente:   { label: 'Pendiente',   className: 'bg-yellow-100 text-yellow-700 border-yellow-200', variant: 'outline' },
  presentado:  { label: 'Presentado',  className: 'bg-blue-100 text-blue-700 border-blue-200',       variant: 'outline' },
  cobrado:     { label: 'Cobrado',     className: 'bg-green-100 text-green-700 border-green-200',    variant: 'outline' },
  rechazado:   { label: 'Rechazado',   className: 'bg-red-100 text-red-700 border-red-200',          variant: 'outline' },
};

function EstadoBadge({ estado }: { estado: Estado }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

const hoy = () => new Date().toISOString().split('T')[0];

const emptyForm = {
  paciente_id: '',
  profesional_id: '',
  prepaga_id: '',
  numero_afiliado: '',
  fecha_pedido: hoy(),
  fecha_vencimiento: '',
  descripcion: '',
};

export default function PedidosMedicos() {
  const { centroId } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [pedidos, setPedidos] = useState<PedidoMedico[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [selected, setSelected] = useState<PedidoMedico | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [prepagas, setPrepagas] = useState<Prepaga[]>([]);
  const [pacientesBusqueda, setPacientesBusqueda] = useState<Paciente[]>([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [searchPaciente, setSearchPaciente] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPedidos = async () => {
    if (!centroId) return;
    setLoading(true);
    const { data } = await supabase
      .from('pedidos_medicos')
      .select('*, paciente:pacientes(nombre, apellido, dni), profesional:profesionales(nombre, apellido), prepaga:prepagas(nombre)')
      .eq('centro_id', centroId)
      .order('fecha_pedido', { ascending: false });
    setPedidos((data as PedidoMedico[]) ?? []);
    setLoading(false);
  };

  const fetchCatalogos = async () => {
    if (!centroId) return;
    const [profRes, prepRes] = await Promise.all([
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
      supabase.from('prepagas').select('id, nombre').eq('centro_id', centroId).order('nombre'),
    ]);
    setProfesionales(profRes.data ?? []);
    setPrepagas(prepRes.data ?? []);
  };

  useEffect(() => { fetchPedidos(); }, [centroId]);

  const handleSearchPacienteChange = (q: string) => {
    setSearchPaciente(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setPacientesBusqueda([]); return; }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('pacientes')
        .select('id, nombre, apellido, dni, celular')
        .eq('centro_id', centroId)
        .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,dni.ilike.%${q}%`)
        .limit(8);
      setPacientesBusqueda(data ?? []);
    }, 300);
  };

  const handleSelectPaciente = (p: Paciente) => {
    setPacienteSeleccionado(p);
    setPacientesBusqueda([]);
    setSearchPaciente('');
    setForm(f => ({ ...f, paciente_id: p.id }));
  };

  const openDialog = () => {
    setForm({ ...emptyForm, fecha_pedido: hoy() });
    setPacienteSeleccionado(null);
    setPacientesBusqueda([]);
    setSearchPaciente('');
    fetchCatalogos();
    setDialogOpen(true);
  };

  const handlePrepagaChange = (prepagaId: string) => {
    setForm(f => ({ ...f, prepaga_id: prepagaId, numero_afiliado: '' }));
  };

  const handleSave = async () => {
    if (!centroId || !form.paciente_id || !form.profesional_id || !form.descripcion.trim()) {
      toast({ title: 'Campos requeridos', description: 'Completá paciente, profesional y descripción.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      centro_id: centroId,
      paciente_id: form.paciente_id,
      profesional_id: form.profesional_id,
      prepaga_id: form.prepaga_id || null,
      numero_afiliado: form.numero_afiliado,
      fecha_pedido: form.fecha_pedido,
      fecha_vencimiento: form.fecha_vencimiento || null,
      descripcion: form.descripcion.trim(),
      estado: 'pendiente',
    };
    const { error } = await supabase.from('pedidos_medicos').insert(payload);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo guardar el pedido.', variant: 'destructive' });
    } else {
      toast({ title: 'Pedido creado' });
      setDialogOpen(false);
      fetchPedidos();
    }
    setSaving(false);
  };

  const handleCambiarEstado = async (id: string, estado: Estado) => {
    const { error } = await supabase.from('pedidos_medicos').update({ estado }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado.', variant: 'destructive' });
    } else {
      toast({ title: 'Estado actualizado' });
      setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado } : p));
      setSelected(prev => prev?.id === id ? { ...prev, estado } : prev);
    }
  };

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(p => {
      const matchEstado = filtroEstado === 'todos' || p.estado === filtroEstado;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        p.paciente?.nombre.toLowerCase().includes(q) ||
        p.paciente?.apellido.toLowerCase().includes(q) ||
        p.profesional?.nombre.toLowerCase().includes(q) ||
        p.profesional?.apellido.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q);
      return matchEstado && matchSearch;
    });
  }, [pedidos, search, filtroEstado]);

  if (isMobile && selected) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Button>
        <PedidoDetail pedido={selected} onCambiarEstado={handleCambiarEstado} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pedidos Médicos</h1>
          <p className="text-sm text-muted-foreground">{pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openDialog} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Pedido
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por paciente, profesional o descripción..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="presentado">Presentado</SelectItem>
            <SelectItem value="cobrado">Cobrado</SelectItem>
            <SelectItem value="rechazado">Rechazado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="shadow-sm lg:col-span-1">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : pedidosFiltrados.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No hay pedidos</p>
            ) : (
              <div className="divide-y">
                {pedidosFiltrados.map(p => (
                  <button
                    key={p.id}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selected?.id === p.id && !isMobile ? 'bg-muted' : ''}`}
                    onClick={() => setSelected(p)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">
                          {p.paciente?.apellido}, {p.paciente?.nombre}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {new Date(p.fecha_pedido + 'T00:00:00').toLocaleDateString('es-AR')} · {p.profesional?.apellido}
                        </p>
                        {p.prepaga && (
                          <p className="text-xs text-muted-foreground truncate">{p.prepaga.nombre}</p>
                        )}
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{p.descripcion}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <EstadoBadge estado={p.estado} />
                        <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {!isMobile && (
          <Card className="shadow-sm lg:col-span-2">
            <CardContent className="p-4 sm:p-6">
              {selected ? (
                <PedidoDetail pedido={selected} onCambiarEstado={handleCambiarEstado} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <FileText className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Seleccioná un pedido para ver el detalle</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Pedido Médico</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-2">
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>Paciente *</Label>
                {pacienteSeleccionado ? (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                    <span className="text-sm">{pacienteSeleccionado.apellido}, {pacienteSeleccionado.nombre} — DNI {pacienteSeleccionado.dni}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs ml-2 shrink-0"
                      onClick={() => { setPacienteSeleccionado(null); setForm(f => ({ ...f, paciente_id: '' })); }}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nombre, apellido o DNI..."
                      className="pl-9"
                      value={searchPaciente}
                      onChange={e => handleSearchPacienteChange(e.target.value)}
                    />
                    {pacientesBusqueda.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 border rounded-md bg-popover shadow-md max-h-48 overflow-auto">
                        {pacientesBusqueda.map(p => (
                          <button
                            key={p.id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                            onClick={() => handleSelectPaciente(p)}
                          >
                            {p.apellido}, {p.nombre} — DNI {p.dni}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
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

              <div className="space-y-1.5">
                <Label>Prepaga</Label>
                <Select value={form.prepaga_id} onValueChange={handlePrepagaChange}>
                  <SelectTrigger><SelectValue placeholder="Sin prepaga" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin prepaga</SelectItem>
                    {prepagas.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Número de afiliado</Label>
                <Input
                  placeholder="Ej: 12345678"
                  value={form.numero_afiliado}
                  onChange={e => setForm(f => ({ ...f, numero_afiliado: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Fecha del pedido *</Label>
                  <Input
                    type="date"
                    value={form.fecha_pedido}
                    onChange={e => setForm(f => ({ ...f, fecha_pedido: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha de vencimiento</Label>
                  <Input
                    type="date"
                    value={form.fecha_vencimiento}
                    onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Descripción *</Label>
                <Textarea
                  placeholder="Descripción del pedido médico..."
                  rows={3}
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving || !form.paciente_id || !form.profesional_id || !form.descripcion.trim()}
                  className="flex-1"
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancelar
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PedidoDetail({
  pedido,
  onCambiarEstado,
}: {
  pedido: PedidoMedico;
  onCambiarEstado: (id: string, estado: Estado) => void;
}) {
  const esFinal = pedido.estado === 'cobrado' || pedido.estado === 'rechazado';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            {pedido.paciente?.apellido}, {pedido.paciente?.nombre}
          </h2>
          <p className="text-sm text-muted-foreground">DNI {pedido.paciente?.dni}</p>
        </div>
        <EstadoBadge estado={pedido.estado} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Profesional</p>
          <p className="font-medium">{pedido.profesional?.apellido}, {pedido.profesional?.nombre}</p>
        </div>

        {pedido.prepaga && (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prepaga</p>
            <p className="font-medium">{pedido.prepaga.nombre}</p>
          </div>
        )}

        {pedido.numero_afiliado && (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Número de afiliado</p>
            <p className="font-medium">{pedido.numero_afiliado}</p>
          </div>
        )}

        <div className="space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fecha del pedido</p>
          <p className="font-medium">
            {new Date(pedido.fecha_pedido + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {pedido.fecha_vencimiento && (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vencimiento</p>
            <p className="font-medium">
              {new Date(pedido.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descripción</p>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{pedido.descripcion}</p>
      </div>

      {pedido.archivo_url && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Archivo adjunto</p>
          <a
            href={pedido.archivo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Download className="h-4 w-4" /> Descargar archivo
          </a>
        </div>
      )}

      {!esFinal && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Acciones</p>
            <div className="flex flex-wrap gap-2">
              {pedido.estado === 'pendiente' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-blue-700 border-blue-200 hover:bg-blue-50"
                  onClick={() => onCambiarEstado(pedido.id, 'presentado')}
                >
                  Marcar presentado
                </Button>
              )}
              {pedido.estado === 'presentado' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-700 border-green-200 hover:bg-green-50"
                    onClick={() => onCambiarEstado(pedido.id, 'cobrado')}
                  >
                    Marcar cobrado
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-200 hover:bg-red-50"
                    onClick={() => onCambiarEstado(pedido.id, 'rechazado')}
                  >
                    Rechazar
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
