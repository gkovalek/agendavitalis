import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TurnoEstado } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, X, Phone, CreditCard, CalendarDays, Banknote, FileText, ChevronDown, ChevronUp, Plus, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PrepagaAutocomplete } from '@/components/PrepagaAutocomplete';

interface TurnoBasic {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: TurnoEstado;
  profesional_id: string;
  paciente_id: string;
  servicio_id?: string | null;
  paciente?: { nombre: string; apellido: string };
}

interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  celular: string;
  fecha_nacimiento: string | null;
  prepaga_id: string | null;
  obra_social_id: string | null;
  numero_afiliado: string | null;
  plan_os: string | null;
  prepaga?: { id: string; nombre: string } | null;
}

interface TurnoHistorial {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: TurnoEstado;
  profesional?: { nombre: string; apellido: string } | null;
  servicio?: { nombre: string } | null;
}

interface PagoRow {
  id: string;
  fecha: string;
  monto_efectivo: number;
  monto_transferencia: number;
  monto_prepaga: number;
  turno?: {
    hora_inicio: string;
    profesional?: { nombre: string; apellido: string } | null;
    servicio?: { nombre: string } | null;
  } | null;
}

interface TratamientoRow {
  id: string;
  total_sesiones: number;
  sesiones_consumidas: number;
  estado: string;
  fecha_inicio: string | null;
  servicio?: { nombre: string } | null;
  profesional?: { nombre: string; apellido: string } | null;
}

interface HistoriaEntrada {
  id: string;
  fecha: string;
  comentario_evolucion: string;
  comentarios_extras: string | null;
  variables_json: Record<string, string> | null;
  ficha_modelo?: { nombre: string } | null;
  profesional?: { nombre: string; apellido: string } | null;
}

type Tab = 'cita' | 'historia' | 'tratamiento' | 'pagos' | 'historial';

interface Props {
  turno: TurnoBasic | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function TurnoDetailDialog({ turno, onClose, onUpdated }: Props) {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>('cita');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [servicio, setServicio] = useState<{ id: string; nombre: string } | null>(null);
  const [horarioCita, setHorarioCita] = useState<{ acepta_os: boolean; precio_particular: number | null } | null>(null);
  const [tratamientoActual, setTratamientoActual] = useState<{ id: string; total_sesiones: number; sesiones_consumidas: number } | null>(null);
  const [sesionesFinalizadas, setSesionesFinalizadas] = useState(0);
  const [cajaActual, setCajaActual] = useState<{ monto_efectivo: number; monto_transferencia: number; monto_prepaga: number } | null>(null);

  const [profesionalTipo, setProfesionalTipo] = useState<'generador' | 'receptor' | null>(null);

  const [estado, setEstado] = useState<TurnoEstado>('reservado');
  const [prepagaId, setPrepagaId] = useState<string | null>(null);
  const [nroCredencial, setNroCredencial] = useState('');
  const [planOs, setPlanOs] = useState('');
  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoTransferencia, setMontoTransferencia] = useState(0);
  const [montoPrepaga, setMontoPrepaga] = useState(0);

  const [pedidoMatricula, setPedidoMatricula] = useState('');
  const [pedidoFecha, setPedidoFecha] = useState('');
  const [pedidoSesiones, setPedidoSesiones] = useState<number | ''>('');
  const [pedidoCIE, setPedidoCIE] = useState('');
  const [codigoPractica, setCodigoPractica] = useState('');

  const [historial, setHistorial] = useState<TurnoHistorial[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [tratamientos, setTratamientos] = useState<TratamientoRow[]>([]);

  const [historiaEntradas, setHistoriaEntradas] = useState<HistoriaEntrada[]>([]);
  const [hcComentario, setHcComentario] = useState('');
  const [hcFichasDisponibles, setHcFichasDisponibles] = useState<{ id: string; nombre: string; variables: { id: string; nombre_variable: string; orden: number }[] }[]>([]);
  const [hcFichaId, setHcFichaId] = useState('');
  const [hcVariables, setHcVariables] = useState<{ id: string; nombre_variable: string; orden: number }[]>([]);
  const [hcValores, setHcValores] = useState<Record<string, string>>({});
  const [hcSaving, setHcSaving] = useState(false);
  const [hcExpanded, setHcExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!turno || !centroId) return;
    setLoading(true);
    setTab('cita');

    Promise.all([
      supabase.from('pacientes')
        .select('id, nombre, apellido, dni, celular, fecha_nacimiento, prepaga_id, obra_social_id, numero_afiliado, plan_os, prepaga:prepagas(id, nombre)')
        .eq('id', turno.paciente_id).single(),
      turno.servicio_id
        ? supabase.from('servicios').select('id, nombre').eq('id', turno.servicio_id).single()
        : Promise.resolve({ data: null } as any),
      supabase.from('turnos')
        .select('tratamiento_id, tratamiento:tratamientos(id, total_sesiones, sesiones_consumidas), pedido_matricula, pedido_fecha, pedido_sesiones_autorizadas, pedido_cie, codigo_practica')
        .eq('id', turno.id).single(),
      supabase.from('profesionales')
        .select('profesion:profesiones(tipo)')
        .eq('id', turno.profesional_id)
        .single(),
      supabase.from('caja_movimientos')
        .select('monto_efectivo, monto_transferencia, monto_prepaga')
        .eq('turno_id', turno.id).maybeSingle(),
      turno.servicio_id
        ? supabase.from('turnos').select('id', { count: 'exact', head: true })
            .eq('paciente_id', turno.paciente_id)
            .eq('servicio_id', turno.servicio_id)
            .eq('estado', 'finalizado')
        : Promise.resolve({ count: 0 } as any),
      supabase.from('turnos')
        .select('id, fecha, hora_inicio, estado, profesional:profesionales(nombre, apellido), servicio:servicios(nombre)')
        .eq('paciente_id', turno.paciente_id)
        .eq('centro_id', centroId)
        .order('fecha', { ascending: false })
        .limit(100),
      supabase.from('caja_movimientos')
        .select('id, fecha, monto_efectivo, monto_transferencia, monto_prepaga, turno:turnos(hora_inicio, profesional:profesionales(nombre, apellido), servicio:servicios(nombre))')
        .eq('paciente_id', turno.paciente_id)
        .eq('centro_id', centroId)
        .order('fecha', { ascending: false })
        .limit(100),
      supabase.from('tratamientos')
        .select('id, total_sesiones, sesiones_consumidas, estado, fecha_inicio, servicio:servicios(nombre), profesional:profesionales(nombre, apellido)')
        .eq('paciente_id', turno.paciente_id)
        .eq('centro_id', centroId)
        .order('fecha_inicio', { ascending: false }),
      supabase.from('historia_clinica')
        .select('id, fecha, comentario_evolucion, comentarios_extras, variables_json, ficha_modelo:fichas_modelo(nombre), profesional:profesionales(nombre, apellido)')
        .eq('paciente_id', turno.paciente_id)
        .eq('centro_id', centroId!)
        .order('fecha', { ascending: false })
        .limit(50),
      supabase.from('fichas_modelo')
        .select('id, nombre, variables:fichas_modelo_variables(id, nombre_variable, orden)')
        .eq('centro_id', centroId!)
        .order('nombre'),
    ]).then(async ([pacRes, servRes, turnoRes, profTipoRes, cajaRes, sesRes, histRes, pagosRes, tratRes, hcRes, fichasRes]) => {
      const pac = (pacRes as any).data as Paciente | null;
      if (!pac) { setLoading(false); return; }

      setPaciente(pac);
      const srv = (servRes as any).data ?? null;
      setServicio(srv);

      if (srv && turno.servicio_id && turno.profesional_id && turno.fecha) {
        const diaSemana = new Date(turno.fecha + 'T00:00:00').getDay();
        const { data: pcsData } = await supabase
          .from('profesional_centro_servicio')
          .select('id')
          .eq('profesional_id', turno.profesional_id)
          .eq('servicio_id', turno.servicio_id)
          .eq('centro_id', centroId!)
          .maybeSingle();
        if (pcsData?.id) {
          const { data: hData } = await supabase
            .from('pcs_horario_dia')
            .select('acepta_os, precio_particular')
            .eq('pcs_id', pcsData.id)
            .eq('dia_semana', diaSemana)
            .eq('activo', true)
            .limit(1)
            .maybeSingle();
          setHorarioCita(hData ?? null);
        }
      }
      setTratamientoActual((turnoRes.data as any)?.tratamiento ?? null);

      const tipo = ((profTipoRes as any).data?.profesion?.tipo ?? null) as 'generador' | 'receptor' | null;
      setProfesionalTipo(tipo);

      const td = (turnoRes.data as any);
      setPedidoMatricula(td?.pedido_matricula ?? '');
      setPedidoFecha(td?.pedido_fecha ?? '');
      setPedidoSesiones(td?.pedido_sesiones_autorizadas ?? '');
      setPedidoCIE(td?.pedido_cie ?? '');
      setCodigoPractica(td?.codigo_practica ?? '');

      setCajaActual((cajaRes as any).data ?? null);
      setSesionesFinalizadas((sesRes as any).count ?? 0);
      setHistorial(((histRes as any).data ?? []) as TurnoHistorial[]);
      setPagos(((pagosRes as any).data ?? []) as PagoRow[]);
      setTratamientos(((tratRes as any).data ?? []) as TratamientoRow[]);
      setHistoriaEntradas(((hcRes as any).data ?? []) as HistoriaEntrada[]);
      setHcFichasDisponibles(((fichasRes as any).data ?? []) as any);

      setEstado(turno.estado);
      setPrepagaId(pac.obra_social_id ?? pac.prepaga_id);
      setNroCredencial(pac.numero_afiliado ?? '');
      setPlanOs(pac.plan_os ?? '');
      setMontoEfectivo((cajaRes as any).data?.monto_efectivo ?? 0);
      setMontoTransferencia((cajaRes as any).data?.monto_transferencia ?? 0);
      setMontoPrepaga((cajaRes as any).data?.monto_prepaga ?? 0);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno?.id]);

  const handleSave = async () => {
    if (!turno || !paciente) return;
    setSaving(true);

    const ops: any[] = [
      supabase.from('turnos').update({
        estado,
        pedido_matricula: pedidoMatricula || null,
        pedido_fecha: pedidoFecha || null,
        pedido_sesiones_autorizadas: pedidoSesiones || null,
        pedido_cie: pedidoCIE || null,
        codigo_practica: codigoPractica || null,
      }).eq('id', turno.id),
      supabase.from('pacientes').update({ obra_social_id: prepagaId, numero_afiliado: nroCredencial || null, plan_os: planOs || null }).eq('id', paciente.id),
    ];

    const totalPago = montoEfectivo + montoTransferencia + montoPrepaga;
    if (totalPago > 0 || cajaActual) {
      const payload = { monto_efectivo: montoEfectivo, monto_transferencia: montoTransferencia, monto_prepaga: montoPrepaga };
      if (cajaActual) {
        ops.push(supabase.from('caja_movimientos').update(payload).eq('turno_id', turno.id));
      } else if (totalPago > 0) {
        ops.push(supabase.from('caja_movimientos').insert({
          ...payload, turno_id: turno.id, centro_id: centroId,
          paciente_id: paciente.id, profesional_id: turno.profesional_id, fecha: turno.fecha,
        }));
      }
    }

    await Promise.all(ops);
    setSaving(false);
    toast({ title: 'Turno actualizado' });
    onUpdated();
  };

  const handleGuardarHC = async () => {
    if (!turno || !paciente || !centroId) return;
    if (!hcComentario.trim() && Object.values(hcValores).every(v => !v.trim())) {
      toast({ title: 'Sin contenido', description: 'Escribí un comentario o completá alguna variable antes de guardar.', variant: 'destructive' });
      return;
    }
    setHcSaving(true);
    const variablesJson: Record<string, string> = {};
    hcVariables.forEach(v => { if (hcValores[v.id]?.trim()) variablesJson[v.nombre_variable] = hcValores[v.id]; });

    const { data: newEntry, error } = await supabase.from('historia_clinica').insert({
      centro_id: centroId,
      paciente_id: paciente.id,
      profesional_id: turno.profesional_id,
      fecha: turno.fecha,
      comentario_evolucion: hcComentario.trim(),
      comentarios_extras: hcComentario.trim() || null,
      variables_json: Object.keys(variablesJson).length > 0 ? variablesJson : null,
      ficha_modelo_id: hcFichaId || null,
    }).select('id, fecha, comentario_evolucion, comentarios_extras, variables_json, ficha_modelo:fichas_modelo(nombre), profesional:profesionales(nombre, apellido)').single();

    setHcSaving(false);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo guardar la entrada.', variant: 'destructive' });
    } else {
      toast({ title: 'Entrada guardada en historia clínica' });
      setHistoriaEntradas(prev => [newEntry as unknown as HistoriaEntrada, ...prev]);
      setHcComentario(''); setHcFichaId(''); setHcVariables([]); setHcValores({});
    }
  };

  const handleHcFichaChange = async (fichaId: string) => {
    const realId = fichaId === '__none' ? '' : fichaId;
    setHcFichaId(realId);
    setHcValores({});
    const ficha = hcFichasDisponibles.find(f => f.id === realId);
    const vars = (ficha?.variables ?? []).sort((a, b) => a.orden - b.orden);
    setHcVariables(vars);
    const init: Record<string, string> = {};
    vars.forEach(v => { init[v.id] = ''; });
    setHcValores(init);
  };

  const fmt = (s: string | null) => {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };

  const nroSesion = turno?.estado === 'finalizado' ? sesionesFinalizadas : sesionesFinalizadas + 1;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'cita', label: 'Cita' },
    { key: 'historia', label: 'Historia clínica' },
    { key: 'tratamiento', label: 'Tratamiento' },
    { key: 'pagos', label: 'Pagos' },
    { key: 'historial', label: 'Historial de citas' },
  ];

  return (
    <Dialog open={!!turno} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col">
        {/* Header verde */}
        <div className="bg-[#0F6E56] text-white px-5 py-4 relative shrink-0">
          <button onClick={onClose} className="absolute top-3 right-3 text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
          {paciente ? (
            <>
              <div className="text-base font-semibold leading-tight">
                {paciente.apellido}, {paciente.nombre}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12px] text-white/85">
                <span>DNI {paciente.dni}</span>
                {paciente.celular && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {paciente.celular}</span>}
                {paciente.fecha_nacimiento && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Nac. {fmt(paciente.fecha_nacimiento)}</span>}
              </div>
            </>
          ) : (
            <div className="text-base font-semibold">Detalle del Turno</div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-background shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors
                ${tab === t.key
                  ? 'border-[#0F6E56] text-[#0F6E56]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !paciente ? (
            <p className="p-8 text-center text-muted-foreground">No se pudo cargar el turno</p>
          ) : (
            <>
              {/* ── CITA ── */}
              {tab === 'cita' && (
                <div className="p-5 space-y-5">
                  {/* Sección OS */}
                  <div className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Building2 className="w-3.5 h-3.5" /> Obra social
                      </div>
                      {horarioCita !== null && (
                        horarioCita.acepta_os
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Acepta OS</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Solo particular</span>
                      )}
                    </div>
                    {horarioCita?.acepta_os !== false && (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-[11px]">Obra social</Label>
                          <PrepagaAutocomplete value={prepagaId} onSelect={(id) => setPrepagaId(id)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px]">Nro. credencial</Label>
                            <Input value={nroCredencial} onChange={(e) => setNroCredencial(e.target.value)} placeholder="—" className="h-8 text-[12px]" />
                          </div>
                          <div>
                            <Label className="text-[11px]">Plan</Label>
                            <Input value={planOs} onChange={(e) => setPlanOs(e.target.value)} placeholder="Ej: 210, Gold, etc." className="h-8 text-[12px]" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pedido Médico — solo receptores */}
                  {profesionalTipo === 'receptor' && (
                    <div className="border rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <FileText className="w-3.5 h-3.5" /> Pedido Médico
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px]">Matrícula médico derivante</Label>
                          <Input value={pedidoMatricula} onChange={(e) => setPedidoMatricula(e.target.value)} placeholder="MP 12345" className="h-8 text-[12px]" />
                        </div>
                        <div>
                          <Label className="text-[11px]">Sesiones autorizadas</Label>
                          <Input type="number" value={pedidoSesiones} onChange={(e) => setPedidoSesiones(e.target.value ? Number(e.target.value) : '')} placeholder="Ej: 20" className="h-8 text-[12px]" />
                        </div>
                        <div>
                          <Label className="text-[11px]">Fecha del pedido</Label>
                          <Input type="date" value={pedidoFecha} onChange={(e) => setPedidoFecha(e.target.value)} className="h-8 text-[12px]" />
                        </div>
                        <div>
                          <Label className="text-[11px]">Vencimiento (30 días)</Label>
                          <Input
                            value={pedidoFecha ? (() => { const d = new Date(pedidoFecha + 'T00:00:00'); d.setDate(d.getDate() + 30); return d.toLocaleDateString('es-AR'); })() : '—'}
                            readOnly
                            className="h-8 text-[12px] bg-muted/50 cursor-default"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px]">Código CIE / Diagnóstico</Label>
                        <Input value={pedidoCIE} onChange={(e) => setPedidoCIE(e.target.value)} placeholder="Ej: M54.5 — Lumbago" className="h-8 text-[12px]" />
                      </div>
                    </div>
                  )}

                  {/* Código de práctica — solo generadores */}
                  {profesionalTipo === 'generador' && (
                    <div className="border rounded-lg p-3 space-y-2">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Código de práctica</Label>
                      <Input value={codigoPractica} onChange={(e) => setCodigoPractica(e.target.value)} placeholder="Ej: 1301" className="h-8 text-[12px]" />
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="border rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Servicio</p>
                      <p className="text-[13px] font-medium mt-1">{servicio?.nombre ?? '—'}</p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sesiones</p>
                      {tratamientoActual ? (
                        <p className="text-[13px] font-medium mt-1">Sesión {nroSesion} / {tratamientoActual.total_sesiones}</p>
                      ) : (
                        <p className="text-[13px] font-medium mt-1">{sesionesFinalizadas > 0 ? `${sesionesFinalizadas} prev.` : 'Sin tratamiento'}</p>
                      )}
                    </div>
                    <div className="border rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Precio ref.</p>
                      {horarioCita?.precio_particular != null
                        ? <p className="text-[13px] font-medium mt-1">${horarioCita.precio_particular.toLocaleString('es-AR')}</p>
                        : <p className="text-[13px] font-medium mt-1">—</p>
                      }
                    </div>
                  </div>

                  {/* Pagos */}
                  <div className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <CreditCard className="w-3.5 h-3.5" /> Pagos
                    </div>
                    <div className="space-y-2">
                      {horarioCita?.precio_particular != null && (
                        <div className="flex justify-between text-[12px]">
                          <span className="text-muted-foreground">Precio particular</span>
                          <span className="font-medium">${horarioCita.precio_particular.toLocaleString('es-AR')}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px] flex items-center gap-1"><Banknote className="w-3 h-3" />Efectivo</Label>
                          <Input type="number" value={montoEfectivo} onChange={(e) => setMontoEfectivo(Number(e.target.value))} placeholder="0" className="h-8 text-[12px]" />
                        </div>
                        <div>
                          <Label className="text-[11px]">Transferencia</Label>
                          <Input type="number" value={montoTransferencia} onChange={(e) => setMontoTransferencia(Number(e.target.value))} placeholder="0" className="h-8 text-[12px]" />
                        </div>
                        <div>
                          <Label className="text-[11px]">Obra social</Label>
                          <Input type="number" value={montoPrepaga} onChange={(e) => setMontoPrepaga(Number(e.target.value))} placeholder="0" className="h-8 text-[12px]" />
                        </div>
                      </div>
                      {(montoEfectivo + montoTransferencia + montoPrepaga) > 0 && (
                        <div className="flex justify-between text-[12px] pt-2 border-t">
                          <span className="font-semibold">Total cobrado</span>
                          <span className="font-semibold">${(montoEfectivo + montoTransferencia + montoPrepaga).toLocaleString('es-AR')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px]">Estado</Label>
                    <Select value={estado} onValueChange={(v) => setEstado(v as TurnoEstado)}>
                      <SelectTrigger className="h-9 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TURNO_ESTADOS).map(([key, val]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: val.color }} />
                              {val.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* ── HISTORIA CLÍNICA ── */}
              {tab === 'historia' && (
                <div className="p-5 space-y-4">
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
                    <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Plus className="w-3.5 h-3.5" /> Nueva entrada para esta cita
                    </div>
                    {hcFichasDisponibles.length > 0 && (
                      <div>
                        <Label className="text-[11px]">Ficha modelo (opcional)</Label>
                        <Select value={hcFichaId || '__none'} onValueChange={handleHcFichaChange}>
                          <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Sin ficha</SelectItem>
                            {hcFichasDisponibles.map(f => <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {hcVariables.length > 0 && (
                      <div className="space-y-2">
                        {hcVariables.map(v => (
                          <div key={v.id}>
                            <Label className="text-[11px]">{v.nombre_variable}</Label>
                            <Input
                              className="h-8 text-[12px]"
                              value={hcValores[v.id] ?? ''}
                              onChange={(e) => setHcValores(prev => ({ ...prev, [v.id]: e.target.value }))}
                              placeholder="Valor..."
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <Label className="text-[11px]">Comentarios / Evolución</Label>
                      <Textarea
                        className="text-[12px] min-h-[80px]"
                        value={hcComentario}
                        onChange={(e) => setHcComentario(e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleGuardarHC}
                      disabled={hcSaving}
                      className="w-full"
                      style={{ backgroundColor: '#00ADBB', borderColor: '#00ADBB' }}
                    >
                      {hcSaving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                      Guardar entrada clínica
                    </Button>
                  </div>
                  {historiaEntradas.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-[13px]">Sin entradas clínicas previas para este paciente</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Historial clínico ({historiaEntradas.length})
                      </p>
                      {historiaEntradas.map(e => (
                        <div key={e.id} className="border rounded-lg overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
                            onClick={() => setHcExpanded(hcExpanded === e.id ? null : e.id)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-[#00ADBB] shrink-0" />
                              <span className="text-[13px] font-medium">{fmt(e.fecha)}</span>
                              {e.ficha_modelo?.nombre && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00ADBB]/10 text-[#00ADBB] font-medium">
                                  {e.ficha_modelo.nombre}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground truncate">
                                {e.profesional ? `${e.profesional.apellido}, ${e.profesional.nombre}` : ''}
                              </span>
                            </div>
                            {hcExpanded === e.id ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                          </button>
                          {hcExpanded === e.id && (
                            <div className="px-3 pb-3 space-y-2 border-t bg-muted/10">
                              {e.variables_json && Object.keys(e.variables_json).length > 0 && (
                                <div className="pt-2 space-y-1">
                                  {Object.entries(e.variables_json).map(([k, v]) => (
                                    <div key={k} className="flex justify-between text-[12px]">
                                      <span className="text-muted-foreground">{k}</span>
                                      <span className="font-medium">{v || '—'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(e.comentarios_extras || e.comentario_evolucion) && (
                                <p className="text-[12px] text-foreground whitespace-pre-wrap pt-1 border-t">
                                  {e.comentarios_extras || e.comentario_evolucion}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TRATAMIENTO ── */}
              {tab === 'tratamiento' && (
                <div className="p-5">
                  {tratamientos.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground text-center py-12">Este paciente no tiene tratamientos registrados</p>
                  ) : (
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Profesional</th>
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Servicio</th>
                          <th className="text-center py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Sesiones</th>
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Desde</th>
                          <th className="text-center py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tratamientos.map(t => (
                          <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30">
                            <td className="py-2.5 px-2 text-foreground">
                              {t.profesional ? `${(t.profesional as any).apellido}, ${(t.profesional as any).nombre}` : '—'}
                            </td>
                            <td className="py-2.5 px-2 text-foreground">{(t.servicio as any)?.nombre ?? '—'}</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className="font-medium">{t.sesiones_consumidas}</span>
                              <span className="text-muted-foreground">/{t.total_sesiones}</span>
                            </td>
                            <td className="py-2.5 px-2 text-muted-foreground">{fmt(t.fecha_inicio)}</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium
                                ${t.estado === 'activo' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                                {t.estado === 'activo' ? 'Activo' : t.estado === 'finalizado' ? 'Finalizado' : t.estado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── PAGOS ── */}
              {tab === 'pagos' && (
                <div className="p-5">
                  {pagos.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground text-center py-12">No hay pagos registrados para este paciente</p>
                  ) : (
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Profesional</th>
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Servicio</th>
                          <th className="text-right py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Importe</th>
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Medio</th>
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagos.flatMap(p => {
                          const prof = (p.turno as any)?.profesional;
                          const profNombre = prof ? `${prof.apellido}, ${prof.nombre}` : '—';
                          const servNombre = (p.turno as any)?.servicio?.nombre ?? '—';
                          const rows: { monto: number; medio: string }[] = [];
                          if (p.monto_efectivo > 0) rows.push({ monto: p.monto_efectivo, medio: 'Efectivo' });
                          if (p.monto_transferencia > 0) rows.push({ monto: p.monto_transferencia, medio: 'Transferencia' });
                          if (p.monto_prepaga > 0) rows.push({ monto: p.monto_prepaga, medio: 'Obra social' });
                          if (rows.length === 0) rows.push({ monto: 0, medio: '—' });
                          return rows.map((r, i) => (
                            <tr key={`${p.id}-${i}`} className="border-b border-border/40 hover:bg-muted/30">
                              <td className="py-2.5 px-2 text-foreground">{i === 0 ? profNombre : ''}</td>
                              <td className="py-2.5 px-2 text-foreground">{i === 0 ? servNombre : ''}</td>
                              <td className="py-2.5 px-2 text-right font-medium text-foreground">
                                {r.monto > 0 ? `$${r.monto.toLocaleString('es-AR')}` : '—'}
                              </td>
                              <td className="py-2.5 px-2">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full
                                  ${r.medio === 'Efectivo' ? 'bg-emerald-50 text-emerald-700'
                                    : r.medio === 'Transferencia' ? 'bg-blue-50 text-blue-700'
                                    : r.medio === 'Obra social' ? 'bg-purple-50 text-purple-700'
                                    : 'bg-muted text-muted-foreground'}`}>
                                  {r.medio}
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-muted-foreground">{i === 0 ? fmt(p.fecha) : ''}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── HISTORIAL DE CITAS ── */}
              {tab === 'historial' && (
                <div className="p-5">
                  {historial.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground text-center py-12">No hay citas previas registradas</p>
                  ) : (
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Fecha</th>
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Hora</th>
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Profesional</th>
                          <th className="text-left py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Servicio</th>
                          <th className="text-center py-2 px-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historial.map(h => {
                          const cfg = TURNO_ESTADOS[h.estado] ?? TURNO_ESTADOS.reservado;
                          const prof = h.profesional as any;
                          return (
                            <tr key={h.id} className={`border-b border-border/40 hover:bg-muted/30 ${h.id === turno?.id ? 'bg-primary/5' : ''}`}>
                              <td className="py-2.5 px-2 text-foreground font-medium">{fmt(h.fecha)}</td>
                              <td className="py-2.5 px-2 text-muted-foreground">{h.hora_inicio?.substring(0, 5)}</td>
                              <td className="py-2.5 px-2 text-foreground">
                                {prof ? `${prof.apellido}, ${prof.nombre}` : '—'}
                              </td>
                              <td className="py-2.5 px-2 text-foreground">{(h.servicio as any)?.nombre ?? '—'}</td>
                              <td className="py-2.5 px-2 text-center">
                                <span
                                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: `${cfg.color}22`, color: cfg.color }}
                                >
                                  {cfg.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {paciente && tab === 'cita' && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t bg-background shrink-0">
            <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
            <Button size="sm" className="bg-[#0F6E56] hover:bg-[#0a5c48] text-white" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        )}
        {paciente && tab !== 'cita' && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t bg-background shrink-0">
            <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
