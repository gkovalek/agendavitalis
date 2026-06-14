import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TurnoEstado } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Search, X, UserPlus, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PrepagaAutocomplete } from '@/components/PrepagaAutocomplete';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Props {
  fecha: string;
  hora: string;
  profesionalId: string;
  profesionalNombre: string;
  preselectedAgendaId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  celular: string;
  prepaga_id: string | null;
  numero_afiliado?: string;
  prepaga?: { nombre: string } | null;
}

interface Servicio {
  id: string;
  nombre: string;
  duracion_minutos: number;
  costo_base: number;
}

interface Tratamiento {
  id: string;
  servicio_id: string;
  total_sesiones: number;
  sesiones_consumidas: number;
  estado: string;
  servicio?: { nombre: string };
}

interface TurnoHistorial {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: TurnoEstado;
  profesional?: { nombre: string; apellido: string };
  servicio?: { nombre: string };
}

type FormaPago = 'efectivo' | 'transferencia' | 'obra_social' | 'mixto';

export function NuevoTurnoForm({ fecha, hora, profesionalId, profesionalNombre, preselectedAgendaId, onSuccess, onCancel }: Props) {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Paciente[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [newPatient, setNewPatient] = useState({
    nombre: '', apellido: '', dni: '', celular: '',
    prepaga_id: null as string | null, prepaga_nombre: '', numero_afiliado: '',
  });
  const [savingPatient, setSavingPatient] = useState(false);

  // Agendas disponibles para este profesional (desde PCS)
  const [agendas, setAgendas] = useState<{ id: string; nombre: string }[]>([]);
  const [agendaId, setAgendaId] = useState(preselectedAgendaId ?? '');

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [servicioId, setServicioId] = useState('');
  const [esTratamiento, setEsTratamiento] = useState(false);
  const [tratamientos, setTratamientos] = useState<Tratamiento[]>([]);
  const [tratamientoId, setTratamientoId] = useState('');
  const [nuevoTratamiento, setNuevoTratamiento] = useState(false);
  const [totalSesiones, setTotalSesiones] = useState(10);
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTransferencia, setMontoTransferencia] = useState(0);
  const [montoPrepaga, setMontoPrepaga] = useState(0);
  const [estadoInicial, setEstadoInicial] = useState<'reservado' | 'confirmado'>('reservado');
  const [saving, setSaving] = useState(false);

  const [historiaClinica, setHistoriaClinica] = useState<any[]>([]);
  const [historial, setHistorial] = useState<TurnoHistorial[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);

  // Cargar agendas del profesional (vía PCS → agendas)
  useEffect(() => {
    if (!centroId || !profesionalId) return;
    supabase
      .from('profesional_centro_servicio')
      .select('agenda:agendas(id, nombre)')
      .eq('centro_id', centroId)
      .eq('profesional_id', profesionalId)
      .eq('activo', true)
      .then(({ data }) => {
        const seen = new Set<string>();
        const unique: { id: string; nombre: string }[] = [];
        (data ?? []).forEach((r: any) => {
          const a = r.agenda;
          if (a && !seen.has(a.id)) { seen.add(a.id); unique.push(a); }
        });
        unique.sort((a, b) => a.nombre.localeCompare(b.nombre));
        setAgendas(unique);
        // Auto-seleccionar si viene preseleccionado o si solo hay una
        const pre = preselectedAgendaId && unique.find(a => a.id === preselectedAgendaId);
        if (pre) setAgendaId(pre.id);
        else if (unique.length === 1) setAgendaId(unique[0].id);
      });
  }, [centroId, profesionalId]);

  // Cargar servicios filtrados por agenda seleccionada
  useEffect(() => {
    setServicioId('');
    setServicios([]);
    if (!agendaId || !centroId) return;
    supabase
      .from('servicios')
      .select('id, nombre, duracion_minutos, costo_base')
      .eq('agenda_id', agendaId)
      .eq('centro_id', centroId)
      .eq('activo', true)
      .then(({ data }) => {
        const list = ((data as Servicio[]) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre));
        setServicios(list);
        if (list.length === 1) setServicioId(list[0].id);
        if (list.length === 0) {
          toast({
            title: 'Agenda sin servicios',
            description: 'Esta agenda no tiene servicios asignados. Asigná al menos un servicio en Agendas > Servicios antes de crear un turno.',
            variant: 'destructive',
          });
        }
      });
  }, [agendaId, centroId]);

  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 3 || !centroId) { setSearchResults([]); setShowResults(false); return; }
    setSearching(true);
    const { data } = await supabase.from('pacientes')
      .select('id, nombre, apellido, dni, celular, prepaga_id, numero_afiliado')
      .eq('centro_id', centroId)
      .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,dni.ilike.%${q}%,celular.ilike.%${q}%`)
      .limit(10);
    setSearchResults((data as any[]) ?? []);
    setShowResults(true);
    setSearching(false);
  }, [centroId]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPatients(searchQuery), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, searchPatients]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!selectedPaciente || !centroId) return;
    setLoadingTabs(true);
    Promise.all([
      supabase.from('tratamientos').select('id, servicio_id, total_sesiones, sesiones_consumidas, estado, servicio:servicios(nombre)')
        .eq('paciente_id', selectedPaciente.id).eq('centro_id', centroId).eq('estado', 'activo'),
      supabase.from('historia_clinica').select('*').eq('paciente_id', selectedPaciente.id).eq('centro_id', centroId).order('created_at', { ascending: false }),
      supabase.from('turnos').select('id, fecha, hora_inicio, estado, profesional:profesionales(nombre, apellido), servicio:servicios(nombre)')
        .eq('paciente_id', selectedPaciente.id).eq('centro_id', centroId).order('fecha', { ascending: false }).limit(50),
    ]).then(([tratRes, hcRes, histRes]) => {
      setTratamientos((tratRes.data as any[]) ?? []);
      setHistoriaClinica(hcRes.data ?? []);
      setHistorial((histRes.data as any[]) ?? []);
      setLoadingTabs(false);
    });
  }, [selectedPaciente, centroId]);

  const selectPaciente = (p: Paciente) => {
    setSelectedPaciente(p);
    setShowResults(false);
    setSearchQuery('');
    setShowNewPatientForm(false);
  };

  const handleCreatePatient = async () => {
    if (!newPatient.nombre || !newPatient.apellido || !newPatient.dni || !newPatient.celular) {
      toast({ title: 'Error', description: 'Completá los campos obligatorios', variant: 'destructive' });
      return;
    }
    if (!centroId) return;
    setSavingPatient(true);
    const { data, error } = await supabase.from('pacientes').insert({
      nombre: newPatient.nombre, apellido: newPatient.apellido,
      dni: newPatient.dni, celular: newPatient.celular,
      prepaga_id: newPatient.prepaga_id,
      numero_afiliado: newPatient.numero_afiliado || null,
      centro_id: centroId,
    }).select('id, nombre, apellido, dni, celular, prepaga_id, numero_afiliado').single();
    setSavingPatient(false);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo crear el paciente. Verificá los datos e intentá de nuevo.', variant: 'destructive' });
    } else if (data) {
      selectPaciente(data as any);
      toast({ title: 'Paciente creado' });
    }
  };

  const selectedServicio = servicios.find(s => s.id === servicioId);
  const horaFin = selectedServicio ? calcEndTime(hora, selectedServicio.duracion_minutos) : '';

  const montoTotal = formaPago === 'efectivo' ? montoEfectivo
    : formaPago === 'transferencia' ? montoTransferencia
    : formaPago === 'obra_social' ? montoPrepaga
    : montoEfectivo + montoTransferencia + montoPrepaga;

  // Solo los tratamientos activos del paciente cuyo servicio coincide con el seleccionado
  const tratamientosFiltrados = servicioId
    ? tratamientos.filter(t => t.servicio_id === servicioId)
    : tratamientos;

  const selectedTratamiento = tratamientos.find(t => t.id === tratamientoId);

  const handleSave = async () => {
    if (!selectedPaciente || !servicioId || !centroId) {
      toast({ title: 'Error', description: 'Seleccioná paciente y servicio', variant: 'destructive' });
      return;
    }
    setSaving(true);

    let finalTratamientoId: string | null = null;

    if (esTratamiento && nuevoTratamiento) {
      const { data: trat, error: tErr } = await supabase.from('tratamientos').insert({
        paciente_id: selectedPaciente.id,
        profesional_id: profesionalId,
        servicio_id: servicioId,
        total_sesiones: totalSesiones,
        sesiones_consumidas: 0,
        sesiones_restantes: totalSesiones,
        estado: 'activo',
        fecha_inicio: fecha,
        centro_id: centroId,
      }).select('id').single();
      if (tErr || !trat) {
        toast({ title: 'Error', description: 'No se pudo crear el tratamiento. Contactá al administrador.', variant: 'destructive' });
        setSaving(false);
        return;
      }
      finalTratamientoId = trat.id;
    } else if (esTratamiento && tratamientoId) {
      finalTratamientoId = tratamientoId;
    }

    const turnoPayload = {
      fecha, hora_inicio: hora, hora_fin: horaFin || hora,
      profesional_id: profesionalId, paciente_id: selectedPaciente.id,
      servicio_id: servicioId, estado: estadoInicial, tratamiento_id: finalTratamientoId,
      forma_pago: formaPago,
      centro_id: centroId,
    };
    console.log('[NuevoTurnoForm] Inserting turno:', JSON.stringify(turnoPayload));
    const { data: newTurno, error: turnoErr } = await supabase.from('turnos').insert(turnoPayload).select('id').single();

    if (turnoErr || !newTurno) {
      console.error('[NuevoTurnoForm] Turno insert error:', turnoErr?.message, turnoErr?.code, turnoErr?.details);
      toast({ title: 'Error', description: `No se pudo guardar el turno: ${turnoErr?.message}`, variant: 'destructive' });
      setSaving(false);
      return;
    }

    if (montoTotal > 0) {
      const { error: cajaErr } = await supabase.from('caja_movimientos').insert({
        turno_id: newTurno.id,
        centro_id: centroId,
        paciente_id: selectedPaciente.id,
        profesional_id: profesionalId,
        equipo_id: null,
        fecha,
        monto_efectivo: formaPago === 'efectivo' || formaPago === 'mixto' ? montoEfectivo : 0,
        monto_transferencia: formaPago === 'transferencia' || formaPago === 'mixto' ? montoTransferencia : 0,
        monto_prepaga: formaPago === 'obra_social' || formaPago === 'mixto' ? montoPrepaga : 0,
      });
      if (cajaErr) console.error('[NuevoTurnoForm] Caja insert error:', cajaErr.message, cajaErr.details);
    }

    setSaving(false);
    toast({ title: 'Turno creado', description: `${selectedPaciente.apellido}, ${selectedPaciente.nombre} — ${fecha} ${hora}` });
    onSuccess();
  };

  const totalTurnos = historial.length;
  const finalizados = historial.filter(t => t.estado === 'finalizado').length;
  const cancelados = historial.filter(t => t.estado === 'cancelado').length;

  return (
    <div className="space-y-4">
      <div className="border-b pb-3">
        <p className="text-sm text-muted-foreground">{fecha} — <strong>{hora}</strong>{horaFin ? ` a ${horaFin}` : ''}</p>
        <p className="text-sm font-medium text-foreground">{profesionalNombre}</p>
      </div>

      {!selectedPaciente ? (
        <div className="space-y-3">
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar paciente por nombre, apellido, DNI o celular..." className="pl-10 h-11 text-base" autoFocus />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                {searchResults.map(p => (
                  <button key={p.id} type="button" className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors border-b last:border-b-0" onClick={() => selectPaciente(p)}>
                    <span className="font-semibold text-foreground">{p.apellido}, {p.nombre}</span>
                    <span className="text-muted-foreground"> — DNI {p.dni} — {p.celular}</span>
                    {p.prepaga && <span className="text-primary ml-1">— {(p.prepaga as any).nombre}</span>}
                  </button>
                ))}
              </div>
            )}
            {showResults && searchResults.length === 0 && searchQuery.length >= 3 && !searching && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg p-3 text-sm text-muted-foreground">No se encontraron resultados</div>
            )}
          </div>

          <button type="button" onClick={() => setShowNewPatientForm(!showNewPatientForm)}
            className="text-sm text-primary hover:underline flex items-center gap-1">
            <UserPlus className="h-3.5 w-3.5" /> + Paciente no encontrado, crear nuevo
          </button>

          {showNewPatientForm && (
            <Card className="border-primary/30">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Nuevo Paciente</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Nombre *</Label><Input value={newPatient.nombre} onChange={e => setNewPatient({ ...newPatient, nombre: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Apellido *</Label><Input value={newPatient.apellido} onChange={e => setNewPatient({ ...newPatient, apellido: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">DNI *</Label><Input value={newPatient.dni} onChange={e => setNewPatient({ ...newPatient, dni: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Celular *</Label><Input value={newPatient.celular} onChange={e => setNewPatient({ ...newPatient, celular: e.target.value })} /></div>
                </div>
                <PrepagaAutocomplete value={newPatient.prepaga_id} onSelect={(id, nombre) => setNewPatient({ ...newPatient, prepaga_id: id, prepaga_nombre: nombre })} />
                {newPatient.prepaga_id && newPatient.prepaga_nombre.toLowerCase() !== 'particular' && (
                  <div className="space-y-1"><Label className="text-xs">Nro. de Afiliado</Label><Input value={newPatient.numero_afiliado} onChange={e => setNewPatient({ ...newPatient, numero_afiliado: e.target.value })} /></div>
                )}
                <Button size="sm" onClick={handleCreatePatient} disabled={savingPatient}>
                  {savingPatient ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Guardar Paciente
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <>
          <Card className="bg-secondary/50">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{selectedPaciente.apellido}, {selectedPaciente.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  DNI {selectedPaciente.dni} — {selectedPaciente.celular}
                  {selectedPaciente.prepaga && <> — <span className="text-primary">{(selectedPaciente.prepaga as any).nombre}</span></>}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedPaciente(null); setSearchQuery(''); }}>Cambiar</Button>
            </CardContent>
          </Card>

          <Tabs defaultValue="turno" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="turno">Turno</TabsTrigger>
              <TabsTrigger value="hc">Hist. Clínica</TabsTrigger>
              <TabsTrigger value="sesiones">Sesiones</TabsTrigger>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>

            <TabsContent value="turno" className="space-y-4 mt-4">
              {/* Agenda */}
              <div className="space-y-1">
                <Label>Agenda *</Label>
                <Select value={agendaId} onValueChange={setAgendaId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar agenda" /></SelectTrigger>
                  <SelectContent>
                    {agendas.map(a => (<SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              {/* Servicio (variante de facturación) */}
              {agendaId && (
                <div className="space-y-1">
                  <Label>Servicio *</Label>
                  <Select value={servicioId} onValueChange={setServicioId}>
                    <SelectTrigger><SelectValue placeholder={servicios.length === 0 ? 'Sin servicios para esta agenda' : 'Seleccionar servicio'} /></SelectTrigger>
                    <SelectContent>
                      {servicios.map(s => (<SelectItem key={s.id} value={s.id}>{s.nombre} ({s.duracion_minutos} min)</SelectItem>))}
                    </SelectContent>
                  </Select>
                  {horaFin && <p className="text-xs text-muted-foreground">Finaliza a las {horaFin}</p>}
                </div>
              )}

              <div className="flex items-center gap-2"><Switch checked={esTratamiento} onCheckedChange={setEsTratamiento} /><Label>¿Es parte de un tratamiento?</Label></div>

              {esTratamiento && (
                <div className="space-y-2 pl-4 border-l-2 border-primary/30">
                  {!nuevoTratamiento ? (
                    <>
                      <Select value={tratamientoId} onValueChange={(v) => { if (v === '__new') { setNuevoTratamiento(true); } else { setTratamientoId(v); } }}>
                        <SelectTrigger><SelectValue placeholder={tratamientosFiltrados.length === 0 ? 'Sin tratamientos activos para este servicio' : 'Seleccionar tratamiento'} /></SelectTrigger>
                        <SelectContent>
                          {tratamientosFiltrados.map(t => (<SelectItem key={t.id} value={t.id}>{(t.servicio as any)?.nombre} — sesión {t.sesiones_consumidas + 1}/{t.total_sesiones}</SelectItem>))}
                          <SelectItem value="__new">+ Iniciar nuevo tratamiento</SelectItem>
                        </SelectContent>
                      </Select>
                      {selectedTratamiento && <p className="text-sm text-muted-foreground">Sesión nro: <strong>{selectedTratamiento.sesiones_consumidas + 1}</strong></p>}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Nuevo tratamiento</p>
                      <div className="space-y-1"><Label className="text-xs">Total de sesiones</Label><Input type="number" value={totalSesiones} onChange={e => setTotalSesiones(Number(e.target.value))} min={1} className="w-32" /></div>
                      <p className="text-sm text-muted-foreground">Sesión nro: <strong>1</strong></p>
                      <Button variant="ghost" size="sm" onClick={() => setNuevoTratamiento(false)}>← Seleccionar existente</Button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Forma de pago *</Label>
                <div className="flex flex-wrap gap-1">
                  {(['efectivo', 'transferencia', 'obra_social', 'mixto'] as FormaPago[]).map(fp => (
                    <Button key={fp} type="button" size="sm" variant={formaPago === fp ? 'default' : 'outline'} onClick={() => setFormaPago(fp)}>
                      {fp === 'efectivo' ? 'Efectivo' : fp === 'transferencia' ? 'Transferencia' : fp === 'obra_social' ? 'Obra Social' : 'Mixto'}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(formaPago === 'efectivo' || formaPago === 'mixto') && (<div className="space-y-1"><Label className="text-xs">Monto efectivo</Label><Input type="number" value={montoEfectivo} onChange={e => setMontoEfectivo(Number(e.target.value))} min={0} /></div>)}
                {(formaPago === 'transferencia' || formaPago === 'mixto') && (<div className="space-y-1"><Label className="text-xs">Monto transferencia</Label><Input type="number" value={montoTransferencia} onChange={e => setMontoTransferencia(Number(e.target.value))} min={0} /></div>)}
                {(formaPago === 'obra_social' || formaPago === 'mixto') && (<div className="space-y-1"><Label className="text-xs">Monto prepaga</Label><Input type="number" value={montoPrepaga} onChange={e => setMontoPrepaga(Number(e.target.value))} min={0} /></div>)}
              </div>
              {formaPago === 'mixto' && <p className="text-sm font-medium text-foreground">Total: ${montoTotal}</p>}

              <div className="space-y-1">
                <Label>Estado inicial</Label>
                <Select value={estadoInicial} onValueChange={v => setEstadoInicial(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="reservado">Reservado</SelectItem><SelectItem value="confirmado">Confirmado</SelectItem></SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving || (!!agendaId && servicios.length === 0)}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Guardar Turno</Button>
                <Button variant="outline" onClick={onCancel}>Cancelar</Button>
              </div>
            </TabsContent>

            <TabsContent value="hc" className="mt-4">
              {loadingTabs ? <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /> : historiaClinica.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aún no hay historia clínica para este paciente</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-auto">
                  {historiaClinica.map((hc: any) => (
                    <Card key={hc.id}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{hc.created_at?.slice(0, 10)}</p><p className="text-sm text-foreground">{hc.comentario_evolucion || '—'}</p></CardContent></Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="sesiones" className="mt-4">
              {loadingTabs ? <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /> : tratamientos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Este paciente no tiene tratamientos activos</p>
              ) : (
                <div className="space-y-3">
                  {tratamientos.map(t => {
                    const pct = Math.round((t.sesiones_consumidas / t.total_sesiones) * 100);
                    return (
                      <Card key={t.id}><CardContent className="p-3 space-y-2">
                        <div className="flex justify-between items-center"><p className="text-sm font-medium text-foreground">{(t.servicio as any)?.nombre}</p><Badge variant="secondary">{t.sesiones_consumidas}/{t.total_sesiones}</Badge></div>
                        <Progress value={pct} className="h-2" />
                        <p className="text-xs text-muted-foreground">Restantes: {t.total_sesiones - t.sesiones_consumidas}</p>
                      </CardContent></Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="historial" className="mt-4">
              {loadingTabs ? <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /> : historial.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay turnos previos</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Card><CardContent className="p-2 text-center"><p className="text-lg font-bold text-foreground">{totalTurnos}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
                    <Card><CardContent className="p-2 text-center"><p className="text-lg font-bold text-foreground">{totalTurnos > 0 ? Math.round(finalizados / totalTurnos * 100) : 0}%</p><p className="text-xs text-muted-foreground">Finalizados</p></CardContent></Card>
                    <Card><CardContent className="p-2 text-center"><p className="text-lg font-bold text-foreground">{totalTurnos > 0 ? Math.round(cancelados / totalTurnos * 100) : 0}%</p><p className="text-xs text-muted-foreground">Cancelados</p></CardContent></Card>
                  </div>
                  <div className="max-h-48 overflow-auto space-y-1">
                    {historial.map(t => {
                      const est = TURNO_ESTADOS[t.estado] || TURNO_ESTADOS.reservado;
                      return (
                        <div key={t.id} className="flex items-center justify-between px-2 py-1.5 rounded border text-sm">
                          <div>
                            <span className="text-foreground">{t.fecha}</span>
                            <span className="text-muted-foreground ml-2">{t.hora_inicio}</span>
                            {t.profesional && <span className="text-muted-foreground ml-2">{(t.profesional as any).apellido}</span>}
                            {t.servicio && <span className="text-muted-foreground ml-2">{(t.servicio as any).nombre}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" style={{ borderColor: est.color, color: est.color }} className="text-xs">{est.label}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function calcEndTime(start: string, minutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
