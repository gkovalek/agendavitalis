import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCentroConfig } from '@/hooks/use-centro-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Send, CheckCircle, Clock, AlertCircle, Phone, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/* ─── Interfaces ─── */
interface TurnoRecordatorio {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
  paciente?: { id: string; nombre: string; apellido: string; celular: string | null } | null;
  profesional?: { id: string; nombre: string; apellido: string } | null;
  servicio?: { id: string; nombre: string } | null;
}

interface RecordatorioLog {
  id: string;
  turno_id: string;
  tipo_mensaje: string;
  estado: string;
  fecha_envio: string;
  created_at: string;
}

interface Profesional { id: string; nombre: string; apellido: string; }
interface Servicio { id: string; nombre: string; }

const ESTADOS_VALIDOS = ['reservado', 'confirmado', 'en_sala'];

function getMesActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getManana() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function formatFecha(iso: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatHora(h: string) {
  return h?.substring(0, 5) ?? '—';
}

/* ═══════════════════════════════════════════════════ */
export default function Recordatorios() {
  const { centroId } = useAuth();
  const { toast } = useToast();
  const { get } = useCentroConfig(centroId);

  const webhookUrl = get('n8n_webhook_recordatorios');

  /* ─── Datos ─── */
  const [turnos, setTurnos] = useState<TurnoRecordatorio[]>([]);
  const [logs, setLogs] = useState<RecordatorioLog[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [planMensual, setPlanMensual] = useState<number>(200);

  /* ─── Filtros ─── */
  const manana = getManana();
  const [fechaDesde, setFechaDesde] = useState(manana);
  const [fechaHasta, setFechaHasta] = useState(manana);
  const [filtroProfesional, setFiltroProfesional] = useState('todos');
  const [filtroServicio, setFiltroServicio] = useState('todos');

  /* ─── Loading / enviando ─── */
  const [loading, setLoading] = useState(true);
  const [enviandoAll, setEnviandoAll] = useState(false);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  /* ─── Fetch profesionales y servicios para filtros ─── */
  useEffect(() => {
    if (!centroId) return;
    supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido')
      .then(({ data }) => setProfesionales((data ?? []) as Profesional[]));
    supabase.from('servicios').select('id, nombre').eq('centro_id', centroId).order('nombre')
      .then(({ data }) => setServicios((data ?? []) as Servicio[]));
    // Cargar config del plan desde centros
    supabase.from('centros').select('recordatorios_plan_mensual').eq('id', centroId).single()
      .then(({ data }) => { if ((data as any)?.recordatorios_plan_mensual) setPlanMensual((data as any).recordatorios_plan_mensual); });
  }, [centroId]);

  /* ─── Fetch logs del mes actual ─── */
  const fetchLogs = useCallback(async () => {
    if (!centroId) return;
    const mesActual = getMesActual();
    const { data } = await supabase
      .from('recordatorios_log')
      .select('id, turno_id, tipo_mensaje, estado, fecha_envio, created_at')
      .eq('centro_id', centroId)
      .gte('created_at', `${mesActual}-01T00:00:00`)
      .order('created_at', { ascending: false });
    setLogs((data ?? []) as RecordatorioLog[]);
  }, [centroId]);

  /* ─── Fetch turnos ─── */
  const fetchTurnos = useCallback(async () => {
    if (!centroId || !fechaDesde) return;
    setLoading(true);
    let q = supabase
      .from('turnos')
      .select('id, fecha, hora_inicio, estado, paciente:pacientes(id, nombre, apellido, celular), profesional:profesionales(id, nombre, apellido), servicio:servicios(id, nombre)')
      .eq('centro_id', centroId)
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta || fechaDesde)
      .in('estado', ESTADOS_VALIDOS)
      .order('fecha')
      .order('hora_inicio');

    if (filtroProfesional !== 'todos') q = q.eq('profesional_id', filtroProfesional);
    if (filtroServicio !== 'todos') q = q.eq('servicio_id', filtroServicio);

    const { data } = await q;
    setTurnos((data as any[]) ?? []);
    setLoading(false);
  }, [centroId, fechaDesde, fechaHasta, filtroProfesional, filtroServicio]);

  useEffect(() => { fetchTurnos(); fetchLogs(); }, [fetchTurnos, fetchLogs]);

  /* ─── Computed ─── */
  const logsByTurnoId = useMemo(() => {
    const map: Record<string, RecordatorioLog> = {};
    logs.forEach(l => { if (!map[l.turno_id]) map[l.turno_id] = l; });
    return map;
  }, [logs]);

  const hoy = new Date().toISOString().split('T')[0];
  const usadosMes = logs.length;
  const enviadosHoy = logs.filter(l => l.created_at?.startsWith(hoy)).length;
  const disponibles = Math.max(0, planMensual - usadosMes);

  const turnosPendientes = useMemo(() =>
    turnos.filter(t => !!t.paciente?.celular && !logsByTurnoId[t.id]),
    [turnos, logsByTurnoId]
  );

  /* ─── Enviar un turno ─── */
  const enviarUno = async (turno: TurnoRecordatorio) => {
    if (!webhookUrl) {
      toast({ title: 'Webhook no configurado', description: 'Configuralo en Ajustes del centro.', variant: 'destructive' });
      return;
    }
    if (!turno.paciente?.celular) {
      toast({ title: 'Sin número de celular', variant: 'destructive' });
      return;
    }
    if (disponibles <= 0) {
      toast({ title: 'Límite del plan alcanzado', description: `Usaste ${usadosMes} de ${planMensual} recordatorios este mes.`, variant: 'destructive' });
      return;
    }
    setEnviandoId(turno.id);
    try {
      const payload = {
        centro_id: centroId,
        turnos: [{
          turno_id: turno.id,
          fecha: turno.fecha,
          hora: turno.hora_inicio,
          paciente_nombre: `${turno.paciente?.nombre}`,
          paciente_apellido: `${turno.paciente?.apellido}`,
          celular: turno.paciente?.celular,
          profesional: `${turno.profesional?.apellido}, ${turno.profesional?.nombre}`,
          servicio: turno.servicio?.nombre ?? '',
        }],
      };
      const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await supabase.from('recordatorios_log').insert({
        centro_id: centroId,
        turno_id: turno.id,
        paciente_id: turno.paciente?.id ?? null,
        telefono: turno.paciente?.celular,
        tipo_mensaje: 'recordatorio_cita',
        estado: 'enviado',
        fecha_cita: turno.fecha,
        fecha_envio: new Date().toISOString(),
      });

      toast({ title: '✓ Recordatorio enviado', description: `${turno.paciente?.apellido}, ${turno.paciente?.nombre}` });
      fetchLogs();
    } catch (err: any) {
      toast({ title: 'Error al enviar', description: err.message, variant: 'destructive' });
    }
    setEnviandoId(null);
  };

  /* ─── Enviar todos ─── */
  const enviarTodos = async () => {
    if (!webhookUrl) {
      toast({ title: 'Webhook no configurado', variant: 'destructive' });
      return;
    }
    if (turnosPendientes.length === 0) {
      toast({ title: 'No hay recordatorios pendientes' });
      return;
    }
    const aEnviar = turnosPendientes.slice(0, disponibles);
    if (aEnviar.length < turnosPendientes.length) {
      toast({ title: `Límite del plan`, description: `Solo se enviarán ${aEnviar.length} de ${turnosPendientes.length} (límite mensual).`, variant: 'destructive' });
    }
    setEnviandoAll(true);
    try {
      const payload = {
        centro_id: centroId,
        turnos: aEnviar.map(t => ({
          turno_id: t.id,
          fecha: t.fecha,
          hora: t.hora_inicio,
          paciente_nombre: `${t.paciente?.nombre}`,
          paciente_apellido: `${t.paciente?.apellido}`,
          celular: t.paciente?.celular,
          profesional: `${t.profesional?.apellido}, ${t.profesional?.nombre}`,
          servicio: t.servicio?.nombre ?? '',
        })),
      };
      const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const logRows = aEnviar.map(t => ({
        centro_id: centroId,
        turno_id: t.id,
        paciente_id: t.paciente?.id ?? null,
        telefono: t.paciente?.celular,
        tipo_mensaje: 'recordatorio_cita',
        estado: 'enviado',
        fecha_cita: t.fecha,
        fecha_envio: new Date().toISOString(),
      }));
      await supabase.from('recordatorios_log').insert(logRows);

      toast({ title: `${aEnviar.length} recordatorios enviados` });
      fetchLogs();
    } catch (err: any) {
      toast({ title: 'Error al enviar', description: err.message, variant: 'destructive' });
    }
    setEnviandoAll(false);
  };

  /* ─── Render ─── */
  return (
    <div className="space-y-5 animate-fade-in">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Recordatorios</h1>
          <p className="text-sm text-muted-foreground">Enviá recordatorios de turno por WhatsApp</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { fetchTurnos(); fetchLogs(); }} className="self-start sm:self-auto">
          <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
        </Button>
      </div>

      {/* ── KPI Cards plan ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Plan mensual</p>
          <p className="text-2xl font-bold text-foreground">{planMensual}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">recordatorios asignados</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Utilizados este mes</p>
          <p className="text-2xl font-bold text-foreground">{usadosMes}</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (usadosMes / planMensual) * 100)}%`,
                backgroundColor: usadosMes / planMensual > 0.85 ? '#E24B4A' : '#1D9E75',
              }}
            />
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Disponibles</p>
          <p className={`text-2xl font-bold ${disponibles < 20 ? 'text-red-500' : 'text-foreground'}`}>{disponibles}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">se resetean el 1° de cada mes</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Enviados hoy</p>
          <p className="text-2xl font-bold text-foreground">{enviadosHoy}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{turnosPendientes.length} pendientes en vista</p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-card border rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Fecha desde */}
          <div className="space-y-1 min-w-[140px]">
            <Label className="text-[12px]">Fecha desde</Label>
            <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-9 text-[13px]" />
          </div>
          {/* Fecha hasta */}
          <div className="space-y-1 min-w-[140px]">
            <Label className="text-[12px]">Hasta</Label>
            <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-9 text-[13px]" />
          </div>
          {/* Profesional */}
          {profesionales.length > 1 && (
            <div className="space-y-1 min-w-[180px]">
              <Label className="text-[12px]">Profesional</Label>
              <Select value={filtroProfesional} onValueChange={setFiltroProfesional}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {profesionales.map(p => <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Servicio */}
          {servicios.length > 1 && (
            <div className="space-y-1 min-w-[180px]">
              <Label className="text-[12px]">Servicio / Agenda</Label>
              <Select value={filtroServicio} onValueChange={setFiltroServicio}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Enviar todos */}
          <Button
            onClick={enviarTodos}
            disabled={enviandoAll || turnosPendientes.length === 0 || !webhookUrl}
            className="ml-auto h-9 gap-2"
            style={{ backgroundColor: '#0F6E56', borderColor: '#0F6E56' }}
          >
            {enviandoAll
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
            Enviar todos ({turnosPendientes.length})
          </Button>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="bg-card border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : turnos.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground text-sm">No hay turnos para el período seleccionado</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-[12px] font-semibold">Nombre</TableHead>
                <TableHead className="text-[12px] font-semibold">Teléfono</TableHead>
                <TableHead className="text-[12px] font-semibold">Fecha de cita</TableHead>
                <TableHead className="text-[12px] font-semibold">Tipo de mensaje</TableHead>
                <TableHead className="text-[12px] font-semibold">Fecha de envío</TableHead>
                <TableHead className="text-[12px] font-semibold">Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {turnos.map(t => {
                const tieneCelular = !!t.paciente?.celular?.trim();
                const log = logsByTurnoId[t.id];
                const isEnviando = enviandoId === t.id;
                const yaEnviado = !!log;

                return (
                  <TableRow key={t.id} className={!tieneCelular ? 'opacity-40' : ''}>
                    {/* Nombre */}
                    <TableCell className="font-medium text-[13px]">
                      {t.paciente?.apellido}, {t.paciente?.nombre}
                    </TableCell>

                    {/* Teléfono */}
                    <TableCell className="text-[13px]">
                      {tieneCelular ? (
                        <span className="flex items-center gap-1 text-foreground">
                          <Phone className="h-3 w-3 text-[#1D9E75]" />
                          {t.paciente?.celular}
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1 text-[12px]">
                          <AlertCircle className="h-3 w-3 text-amber-500" /> Sin celular
                        </span>
                      )}
                    </TableCell>

                    {/* Fecha de cita */}
                    <TableCell className="text-[13px]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="bg-muted px-2 py-0.5 rounded text-[12px] font-medium">{formatFecha(t.fecha)}</span>
                        <span className="text-muted-foreground text-[11px]">{formatHora(t.hora_inicio)} hs</span>
                      </span>
                    </TableCell>

                    {/* Tipo de mensaje */}
                    <TableCell className="text-[13px] text-muted-foreground">
                      {yaEnviado ? log.tipo_mensaje.replace(/_/g, ' ') : '—'}
                    </TableCell>

                    {/* Fecha de envío */}
                    <TableCell className="text-[13px]">
                      {yaEnviado ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="bg-muted px-2 py-0.5 rounded text-[12px]">{formatFecha(log.fecha_envio?.split('T')[0])}</span>
                          <span className="text-muted-foreground text-[11px]">{log.fecha_envio?.substring(11, 16)} hs</span>
                        </span>
                      ) : '—'}
                    </TableCell>

                    {/* Estado */}
                    <TableCell>
                      {!tieneCelular ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[11px]">Sin datos</Badge>
                      ) : yaEnviado ? (
                        <Badge variant="outline" className="text-[#0F6E56] border-[#9FE1CB] bg-[#E1F5EE] text-[11px] gap-1">
                          <CheckCircle className="h-3 w-3" /> Enviado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[11px] gap-1">
                          <Clock className="h-3 w-3" /> Pendiente
                        </Badge>
                      )}
                    </TableCell>

                    {/* Botón enviar */}
                    <TableCell>
                      <Button
                        size="sm"
                        variant={yaEnviado ? 'outline' : 'default'}
                        disabled={!tieneCelular || isEnviando || !webhookUrl || disponibles <= 0}
                        onClick={() => enviarUno(t)}
                        className="h-7 text-[12px] px-3"
                        style={!yaEnviado && tieneCelular ? { backgroundColor: '#0F6E56', borderColor: '#0F6E56' } : {}}
                      >
                        {isEnviando
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <><Send className="h-3 w-3 mr-1" />{yaEnviado ? 'Reenviar' : 'Enviar'}</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Aviso webhook */}
      {!webhookUrl && (
        <div className="flex items-center gap-2 text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Webhook no configurado. Configuralo en <a href="/configuracion" className="underline font-medium ml-1">Configuración del centro</a>.
        </div>
      )}
    </div>
  );
}
