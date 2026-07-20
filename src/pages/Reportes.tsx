import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, TrendingDown, Minus, Users, Calendar, Banknote, Building2, Activity } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from 'recharts';

type Periodo = 'semana' | 'mes' | 'custom';
type TabId = 'turnos' | 'servicios' | 'facturacion' | 'obras_sociales';

interface RangoFechas { desde: string; hasta: string; }

interface Profesional { id: string; nombre: string; apellido: string; }
interface Servicio { id: string; nombre: string; }
interface ObrasSocial { id: string; nombre: string; }

interface Movimiento {
  id: string;
  fecha: string;
  monto_efectivo: number;
  monto_transferencia: number;
  monto_prepaga: number;
  monto_total: number;
  profesional_id: string | null;
  profesional?: { nombre: string; apellido: string } | null;
  turno?: {
    servicio_id?: string | null;
    paciente?: { obra_social?: { id: string; nombre: string } | null } | null;
    servicio?: { nombre: string } | null;
  } | null;
}

interface TurnoItem {
  id: string;
  fecha: string;
  estado: string;
  profesional_id: string | null;
  servicio_id: string | null;
  servicio?: { nombre: string } | null;
}

interface CompData { ingresos: number; turnosFinalizados: number; ingresosOS: number; }

const ESTADO_COLORES: Record<string, string> = {
  reservado: '#FCD34D', confirmado: '#4ADE80', en_sala: '#C084FC',
  siendo_atendido: '#60A5FA', finalizado: '#1D9E75', cancelado: '#F87171', ausente: '#FB923C',
};
const ESTADO_LABELS: Record<string, string> = {
  reservado: 'Reservado', confirmado: 'Confirmado', en_sala: 'En sala',
  siendo_atendido: 'Siendo atendido', finalizado: 'Finalizado', cancelado: 'Cancelado', ausente: 'Ausente',
};
const CHART_COLORS = ['#0F6E56', '#378ADD', '#EF9F27', '#7F77DD', '#E24B4A', '#1D9E75', '#C084FC', '#F87171'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getRango(periodo: Periodo, customDesde: string, customHasta: string): RangoFechas {
  const hoy = new Date();
  if (periodo === 'semana') {
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { desde: toDateStr(lunes), hasta: toDateStr(domingo) };
  }
  if (periodo === 'mes') {
    return {
      desde: toDateStr(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
      hasta: toDateStr(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
    };
  }
  return { desde: customDesde, hasta: customHasta };
}

function shiftDias(rango: RangoFechas, dias: number): RangoFechas {
  const d = new Date(rango.desde + 'T00:00:00'); d.setDate(d.getDate() - dias);
  const h = new Date(rango.hasta + 'T00:00:00'); h.setDate(h.getDate() - dias);
  return { desde: toDateStr(d), hasta: toDateStr(h) };
}

function shiftMes(rango: RangoFechas): RangoFechas {
  const shiftOneMonth = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const targetMonth = d.getMonth() - 1;
    d.setDate(1); // evitar overflow antes de cambiar mes
    d.setMonth(targetMonth);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const origDay = parseInt(dateStr.slice(8), 10);
    d.setDate(Math.min(origDay, lastDay));
    return toDateStr(d);
  };
  return { desde: shiftOneMonth(rango.desde), hasta: shiftOneMonth(rango.hasta) };
}

function shiftAño(rango: RangoFechas): RangoFechas {
  const d = new Date(rango.desde + 'T00:00:00'); d.setFullYear(d.getFullYear() - 1);
  const h = new Date(rango.hasta + 'T00:00:00'); h.setFullYear(h.getFullYear() - 1);
  return { desde: toDateStr(d), hasta: toDateStr(h) };
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

function DeltaBadge({ current, prev, label, invert = false }: { current: number; prev: number; label: string; invert?: boolean }) {
  const delta = pct(current, prev);
  if (delta === null) return <span className="text-[10px] text-muted-foreground">{label}: sin datos ant.</span>;
  const positivo = invert ? delta < 0 : delta > 0;
  const color = delta === 0 ? 'text-muted-foreground' : positivo ? 'text-emerald-600' : 'text-red-500';
  const Icon = delta === 0 ? Minus : positivo ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {delta > 0 ? '+' : ''}{delta}% vs {label}
    </span>
  );
}

function KpiCard({ label, value, sub, icon, color, deltas }: {
  label: string; value: string; sub?: string; icon?: React.ReactNode; color?: string;
  deltas?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: color ?? 'inherit' }}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
            {deltas && <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">{deltas}</div>}
          </div>
          {icon && <div className="text-muted-foreground opacity-40 shrink-0">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wide border-b pb-2">{children}</h2>;
}

function EmptyChart() {
  return <p className="text-sm text-muted-foreground text-center py-10">Sin datos en el período</p>;
}

export default function Reportes() {
  const { centroId } = useAuth();
  const hoyStr = toDateStr(new Date());

  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [customDesde, setCustomDesde] = useState(hoyStr);
  const [customHasta, setCustomHasta] = useState(hoyStr);
  const [profFiltro, setProfFiltro] = useState('todos');
  const [servicioFiltro, setServicioFiltro] = useState('todos');
  const [osFiltro, setOsFiltro] = useState('todos');
  const [activeTab, setActiveTab] = useState<TabId>('turnos');
  const [loading, setLoading] = useState(true);

  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [obrasS, setObrasS] = useState<ObrasSocial[]>([]);
  const [turnos, setTurnos] = useState<TurnoItem[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [compSemana, setCompSemana] = useState<CompData>({ ingresos: 0, turnosFinalizados: 0, ingresosOS: 0 });
  const [compMes, setCompMes] = useState<CompData>({ ingresos: 0, turnosFinalizados: 0, ingresosOS: 0 });
  const [compAño, setCompAño] = useState<CompData>({ ingresos: 0, turnosFinalizados: 0, ingresosOS: 0 });

  const rango = useMemo(() => getRango(periodo, customDesde, customHasta), [periodo, customDesde, customHasta]);
  const rangoSem = useMemo(() => shiftDias(rango, 7), [rango]);
  const rangoMes = useMemo(() => shiftMes(rango), [rango]);
  const rangoAño = useMemo(() => shiftAño(rango), [rango]);

  // One-time: cargar listas para filtros
  useEffect(() => {
    if (!centroId) return;
    Promise.all([
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
      supabase.from('servicios').select('id, nombre').eq('centro_id', centroId).eq('activo', true).order('nombre'),
      supabase.from('obras_sociales').select('id, nombre').eq('centro_id', centroId).order('nombre'),
    ]).then(([pRes, sRes, osRes]) => {
      setProfesionales((pRes.data as Profesional[]) ?? []);
      setServicios((sRes.data as Servicio[]) ?? []);
      setObrasS((osRes.data as ObrasSocial[]) ?? []);
    });
  }, [centroId]);

  // Fetch datos del período + comparativos
  useEffect(() => {
    if (!centroId) return;
    if (periodo === 'custom' && (!customDesde || !customHasta)) return;

    const fetchComp = async (r: RangoFechas): Promise<CompData> => {
      let mQ = supabase.from('caja_movimientos')
        .select('monto_total, monto_prepaga')
        .eq('centro_id', centroId).gte('fecha', r.desde).lte('fecha', r.hasta);
      let tQ = supabase.from('turnos')
        .select('id', { count: 'exact', head: true })
        .eq('centro_id', centroId).eq('estado', 'finalizado').gte('fecha', r.desde).lte('fecha', r.hasta);
      if (profFiltro !== 'todos') {
        mQ = mQ.eq('profesional_id', profFiltro);
        tQ = tQ.eq('profesional_id', profFiltro);
      }
      const [mRes, tRes] = await Promise.all([mQ, tQ]);
      const movs = (mRes.data as any[]) ?? [];
      return {
        ingresos: movs.reduce((s, m) => s + (m.monto_total || 0), 0),
        ingresosOS: movs.reduce((s, m) => s + (m.monto_prepaga || 0), 0),
        turnosFinalizados: tRes.count ?? 0,
      };
    };

    const load = async () => {
      setLoading(true);

      let turnosQ = supabase.from('turnos')
        .select('id, fecha, estado, profesional_id, servicio_id, servicio:servicios(nombre)')
        .eq('centro_id', centroId).gte('fecha', rango.desde).lte('fecha', rango.hasta);
      let movQ = supabase.from('caja_movimientos')
        .select(`id, fecha, monto_efectivo, monto_transferencia, monto_prepaga, monto_total, profesional_id,
          profesional:profesionales(nombre, apellido),
          turno:turnos(servicio_id, servicio:servicios(nombre), paciente:pacientes(obra_social:obras_sociales(id, nombre)))`)
        .eq('centro_id', centroId).gte('fecha', rango.desde).lte('fecha', rango.hasta).order('fecha', { ascending: true });
      if (profFiltro !== 'todos') {
        turnosQ = turnosQ.eq('profesional_id', profFiltro);
        movQ = movQ.eq('profesional_id', profFiltro);
      }

      const [turnosRes, movRes, cSem, cMes, cAño] = await Promise.all([
        turnosQ, movQ,
        fetchComp(rangoSem), fetchComp(rangoMes), fetchComp(rangoAño),
      ]);

      setTurnos(((turnosRes.data as any[]) ?? []).map((t: any) => ({
        ...t,
        servicio: Array.isArray(t.servicio) ? (t.servicio[0] ?? null) : t.servicio,
      })) as TurnoItem[]);
      setMovimientos((movRes.data as any[]) ?? []);
      setCompSemana(cSem);
      setCompMes(cMes);
      setCompAño(cAño);
      setLoading(false);
    };

    load();
  }, [centroId, rango, profFiltro]);

  // ── Cómputos globales ──
  const kpis = useMemo(() => {
    const total = turnos.length;
    const finalizados = turnos.filter(t => t.estado === 'finalizado').length;
    const cancelados = turnos.filter(t => ['cancelado', 'ausente'].includes(t.estado)).length;
    const ingresos = movimientos.reduce((s, m) => s + (m.monto_total || 0), 0);
    const efectivo = movimientos.reduce((s, m) => s + (m.monto_efectivo || 0), 0);
    const transferencia = movimientos.reduce((s, m) => s + (m.monto_transferencia || 0), 0);
    const prepaga = movimientos.reduce((s, m) => s + (m.monto_prepaga || 0), 0);
    return { total, finalizados, cancelados, ingresos, efectivo, transferencia, prepaga };
  }, [turnos, movimientos]);

  // ── Tab: Turnos ──
  const turnosPorDia = useMemo(() => {
    const map: Record<string, { fecha: string; total: number; finalizados: number; cancelados: number }> = {};
    turnos.forEach(t => {
      if (!map[t.fecha]) map[t.fecha] = { fecha: t.fecha.slice(5), total: 0, finalizados: 0, cancelados: 0 };
      map[t.fecha].total++;
      if (t.estado === 'finalizado') map[t.fecha].finalizados++;
      if (['cancelado', 'ausente'].includes(t.estado)) map[t.fecha].cancelados++;
    });
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [turnos]);

  const turnosPorEstado = useMemo(() => {
    const map: Record<string, number> = {};
    turnos.forEach(t => { map[t.estado] = (map[t.estado] || 0) + 1; });
    return Object.entries(map).map(([estado, value]) => ({ name: ESTADO_LABELS[estado] ?? estado, value, color: ESTADO_COLORES[estado] ?? '#94A3B8' }));
  }, [turnos]);

  const turnosPorProfesional = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; finalizados: number }> = {};
    turnos.forEach(t => {
      const id = t.profesional_id ?? '__sin__';
      if (!map[id]) map[id] = { nombre: id === '__sin__' ? 'Sin profesional' : id, total: 0, finalizados: 0 };
      map[id].total++;
      if (t.estado === 'finalizado') map[id].finalizados++;
    });
    // Enriquecer con nombre real
    return Object.entries(map).map(([id, v]) => {
      const p = profesionales.find(p => p.id === id);
      return { ...v, nombre: p ? `${p.apellido}, ${p.nombre}` : v.nombre };
    }).sort((a, b) => b.total - a.total);
  }, [turnos, profesionales]);

  // ── Tab: Servicios ──
  const turnosFiltrados = useMemo(() => {
    if (servicioFiltro === 'todos') return turnos;
    return turnos.filter(t => t.servicio_id === servicioFiltro);
  }, [turnos, servicioFiltro]);

  const serviciosPorDia = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    turnosFiltrados.forEach(t => {
      const nombre = (t.servicio as any)?.nombre ?? 'Sin servicio';
      if (!map[t.fecha]) map[t.fecha] = {};
      map[t.fecha][nombre] = (map[t.fecha][nombre] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, srvs]) => ({
      fecha: fecha.slice(5), ...srvs,
    }));
  }, [turnosFiltrados]);

  const resumenServicios = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; finalizados: number }> = {};
    turnosFiltrados.forEach(t => {
      const nombre = (t.servicio as any)?.nombre ?? 'Sin servicio';
      if (!map[nombre]) map[nombre] = { nombre, total: 0, finalizados: 0 };
      map[nombre].total++;
      if (t.estado === 'finalizado') map[nombre].finalizados++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [turnosFiltrados]);

  const serviciosKeys = useMemo(() => {
    const set = new Set<string>();
    serviciosPorDia.forEach(d => Object.keys(d).filter(k => k !== 'fecha').forEach(k => set.add(k)));
    return Array.from(set);
  }, [serviciosPorDia]);

  // ── Tab: Facturación ──
  const movsFiltrados = useMemo(() => {
    if (servicioFiltro === 'todos') return movimientos;
    return movimientos.filter(m => (m.turno as any)?.servicio_id === servicioFiltro);
  }, [movimientos, servicioFiltro]);

  const facturacionPorDia = useMemo(() => {
    const map: Record<string, { fecha: string; ingresos: number; efectivo: number; transferencia: number; os: number }> = {};
    movsFiltrados.forEach(m => {
      if (!map[m.fecha]) map[m.fecha] = { fecha: m.fecha.slice(5), ingresos: 0, efectivo: 0, transferencia: 0, os: 0 };
      map[m.fecha].ingresos += m.monto_total || 0;
      map[m.fecha].efectivo += m.monto_efectivo || 0;
      map[m.fecha].transferencia += m.monto_transferencia || 0;
      map[m.fecha].os += m.monto_prepaga || 0;
    });
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [movsFiltrados]);

  const facturacionPorProfesional = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; sesiones: number }> = {};
    movsFiltrados.forEach(m => {
      const id = m.profesional_id ?? '__sin__';
      const nombre = m.profesional ? `${m.profesional.apellido}, ${m.profesional.nombre}` : 'Sin profesional';
      if (!map[id]) map[id] = { nombre, total: 0, sesiones: 0 };
      map[id].total += m.monto_total || 0;
      map[id].sesiones++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [movsFiltrados]);

  const facturacionPorServicio = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; sesiones: number }> = {};
    movsFiltrados.forEach(m => {
      const nombre = (m.turno as any)?.servicio?.nombre ?? 'Sin servicio';
      if (!map[nombre]) map[nombre] = { nombre, total: 0, sesiones: 0 };
      map[nombre].total += m.monto_total || 0;
      map[nombre].sesiones++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [movsFiltrados]);

  const facKpis = useMemo(() => {
    const ingresos = movsFiltrados.reduce((s, m) => s + (m.monto_total || 0), 0);
    const efectivo = movsFiltrados.reduce((s, m) => s + (m.monto_efectivo || 0), 0);
    const transferencia = movsFiltrados.reduce((s, m) => s + (m.monto_transferencia || 0), 0);
    const prepaga = movsFiltrados.reduce((s, m) => s + (m.monto_prepaga || 0), 0);
    const sesiones = movsFiltrados.length;
    const ticket = sesiones > 0 ? Math.round(ingresos / sesiones) : 0;
    return { ingresos, efectivo, transferencia, prepaga, sesiones, ticket };
  }, [movsFiltrados]);

  // ── Tab: Obras Sociales ──
  const movsOSFiltrados = useMemo(() => {
    let base = movimientos.filter(m => (m.monto_prepaga || 0) > 0);
    if (osFiltro !== 'todos') {
      base = base.filter(m => (m.turno as any)?.paciente?.obra_social?.id === osFiltro);
    }
    return base;
  }, [movimientos, osFiltro]);

  const osPorDia = useMemo(() => {
    const map: Record<string, { fecha: string; ingresosOS: number; sesiones: number }> = {};
    movsOSFiltrados.forEach(m => {
      if (!map[m.fecha]) map[m.fecha] = { fecha: m.fecha.slice(5), ingresosOS: 0, sesiones: 0 };
      map[m.fecha].ingresosOS += m.monto_prepaga || 0;
      map[m.fecha].sesiones++;
    });
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [movsOSFiltrados]);

  const resumenOS = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; sesiones: number }> = {};
    movsOSFiltrados.forEach(m => {
      const os = (m.turno as any)?.paciente?.obra_social;
      const nombre = os?.nombre ?? 'Sin OS identificada';
      if (!map[nombre]) map[nombre] = { nombre, total: 0, sesiones: 0 };
      map[nombre].total += m.monto_prepaga || 0;
      map[nombre].sesiones++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [movsOSFiltrados]);

  const osKpis = useMemo(() => {
    const ingresosOS = movsOSFiltrados.reduce((s, m) => s + (m.monto_prepaga || 0), 0);
    const sesiones = movsOSFiltrados.length;
    const pctOS = kpis.ingresos > 0 ? Math.round((ingresosOS / kpis.ingresos) * 100) : 0;
    return { ingresosOS, sesiones, pctOS };
  }, [movsOSFiltrados, kpis.ingresos]);

  const periodoLabel = periodo === 'semana' ? 'Esta semana' : periodo === 'mes' ? 'Este mes' : `${customDesde} → ${customHasta}`;

  // ── Filtros globales ──
  const FiltrosGlobales = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Período</Label>
        <Tabs value={periodo} onValueChange={v => setPeriodo(v as Periodo)}>
          <TabsList className="h-9">
            <TabsTrigger value="semana" className="text-[12px]">Semana</TabsTrigger>
            <TabsTrigger value="mes" className="text-[12px]">Mes</TabsTrigger>
            <TabsTrigger value="custom" className="text-[12px]">Personalizado</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {periodo === 'custom' && (
        <>
          <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" value={customDesde} onChange={e => setCustomDesde(e.target.value)} className="w-40 h-9" /></div>
          <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" value={customHasta} onChange={e => setCustomHasta(e.target.value)} className="w-40 h-9" /></div>
        </>
      )}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Profesional</Label>
        <Select value={profFiltro} onValueChange={setProfFiltro}>
          <SelectTrigger className="w-52 h-9 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los profesionales</SelectItem>
            {profesionales.map(p => <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 p-4 sm:p-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Reportes</h1>
        <p className="text-sm text-muted-foreground">{periodoLabel}</p>
      </div>

      {FiltrosGlobales}

      {/* Tabs de sección */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabId)}>
        <TabsList className="h-9 grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="turnos" className="text-[12px]">Turnos</TabsTrigger>
          <TabsTrigger value="servicios" className="text-[12px]">Servicios</TabsTrigger>
          <TabsTrigger value="facturacion" className="text-[12px]">Facturación</TabsTrigger>
          <TabsTrigger value="obras_sociales" className="text-[12px]">Obras Sociales</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════
              TAB: TURNOS
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'turnos' && (
            <div className="space-y-6">
              <section className="space-y-3">
                <SectionTitle>Resumen de turnos</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard
                    label="Turnos totales" value={String(kpis.total)} icon={<Calendar className="w-6 h-6" />}
                    deltas={<>
                      <DeltaBadge current={kpis.total} prev={compSemana.turnosFinalizados} label="sem. ant." />
                      <DeltaBadge current={kpis.total} prev={compMes.turnosFinalizados} label="mes ant." />
                      <DeltaBadge current={kpis.total} prev={compAño.turnosFinalizados} label="año ant." />
                    </>}
                  />
                  <KpiCard
                    label="Finalizados" value={String(kpis.finalizados)} sub={`de ${kpis.total} totales`}
                    color="#1D9E75" icon={<Activity className="w-6 h-6" />}
                    deltas={<>
                      <DeltaBadge current={kpis.finalizados} prev={compSemana.turnosFinalizados} label="sem. ant." />
                      <DeltaBadge current={kpis.finalizados} prev={compMes.turnosFinalizados} label="mes ant." />
                      <DeltaBadge current={kpis.finalizados} prev={compAño.turnosFinalizados} label="año ant." />
                    </>}
                  />
                  <KpiCard
                    label="Cancelados / Ausentes" value={String(kpis.cancelados)}
                    color={kpis.cancelados > kpis.total * 0.2 ? '#E24B4A' : undefined}
                  />
                  <KpiCard
                    label="Tasa cancelación"
                    value={kpis.total > 0 ? `${Math.round((kpis.cancelados / kpis.total) * 100)}%` : '—'}
                    color={kpis.total > 0 && (kpis.cancelados / kpis.total) > 0.2 ? '#E24B4A' : undefined}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle>Variación en el período</SectionTitle>
                <Card>
                  <CardContent className="p-4">
                    {turnosPorDia.length <= 1 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={turnosPorDia} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradFin" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Area type="monotone" dataKey="total" stroke="#378ADD" fill="none" strokeWidth={2} dot={false} name="Total" />
                          <Area type="monotone" dataKey="finalizados" stroke="#1D9E75" fill="url(#gradFin)" strokeWidth={2} dot={false} name="Finalizados" />
                          <Area type="monotone" dataKey="cancelados" stroke="#F87171" fill="none" strokeWidth={1.5} dot={false} name="Cancelados" strokeDasharray="4 4" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </section>

              <section className="space-y-3">
                <SectionTitle>Por profesional</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      {turnosPorProfesional.length === 0 ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={Math.max(turnosPorProfesional.length * 44 + 32, 160)}>
                          <BarChart data={turnosPorProfesional} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={140} />
                            <Tooltip />
                            <Bar dataKey="total" fill="#378ADD" radius={[0, 3, 3, 0]} name="Total" />
                            <Bar dataKey="finalizados" fill="#1D9E75" radius={[0, 3, 3, 0]} name="Finalizados" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[12px] font-medium text-muted-foreground mb-3">Distribución por estado</p>
                      {turnosPorEstado.length === 0 ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={turnosPorEstado} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                              {turnosPorEstado.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB: SERVICIOS
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'servicios' && (
            <div className="space-y-6">
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Servicio</Label>
                  <Select value={servicioFiltro} onValueChange={setServicioFiltro}>
                    <SelectTrigger className="w-52 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los servicios</SelectItem>
                      {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <section className="space-y-3">
                <SectionTitle>Resumen de servicios</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <KpiCard label="Turnos totales" value={String(turnosFiltrados.length)} icon={<Calendar className="w-6 h-6" />}
                    deltas={<>
                      <DeltaBadge current={turnosFiltrados.length} prev={compSemana.turnosFinalizados} label="sem. ant." />
                      <DeltaBadge current={turnosFiltrados.length} prev={compMes.turnosFinalizados} label="mes ant." />
                      <DeltaBadge current={turnosFiltrados.length} prev={compAño.turnosFinalizados} label="año ant." />
                    </>}
                  />
                  <KpiCard label="Finalizados" value={String(turnosFiltrados.filter(t => t.estado === 'finalizado').length)} color="#1D9E75" />
                  <KpiCard label="Servicios activos" value={String(resumenServicios.length)} icon={<Activity className="w-6 h-6" />} />
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle>Variación en el período</SectionTitle>
                <Card>
                  <CardContent className="p-4">
                    {serviciosPorDia.length <= 1 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={serviciosPorDia} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {serviciosKeys.slice(0, 6).map((key, i) => (
                            <Bar key={key} dataKey={key} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === serviciosKeys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </section>

              <section className="space-y-3">
                <SectionTitle>Detalle por servicio</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      {resumenServicios.length === 0 ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={Math.max(resumenServicios.length * 44 + 32, 160)}>
                          <BarChart data={resumenServicios} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={150} />
                            <Tooltip />
                            <Bar dataKey="total" radius={[0, 3, 3, 0]} name="Total">
                              {resumenServicios.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Servicio</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Finalizados</TableHead>
                            <TableHead className="text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resumenServicios.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-[12px]">{s.nombre}</TableCell>
                              <TableCell className="text-right text-[12px]">{s.total}</TableCell>
                              <TableCell className="text-right text-[12px] text-emerald-700">{s.finalizados}</TableCell>
                              <TableCell className="text-right text-[12px] text-muted-foreground">
                                {turnosFiltrados.length > 0 ? `${Math.round((s.total / turnosFiltrados.length) * 100)}%` : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB: FACTURACIÓN
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'facturacion' && (
            <div className="space-y-6">
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Servicio</Label>
                  <Select value={servicioFiltro} onValueChange={setServicioFiltro}>
                    <SelectTrigger className="w-52 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los servicios</SelectItem>
                      {servicios.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <section className="space-y-3">
                <SectionTitle>Resumen de facturación</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Ingresos totales" value={fmt(facKpis.ingresos)} color="#0F6E56" icon={<Banknote className="w-6 h-6" />}
                    deltas={<>
                      <DeltaBadge current={facKpis.ingresos} prev={compSemana.ingresos} label="sem. ant." />
                      <DeltaBadge current={facKpis.ingresos} prev={compMes.ingresos} label="mes ant." />
                      <DeltaBadge current={facKpis.ingresos} prev={compAño.ingresos} label="año ant." />
                    </>}
                  />
                  <KpiCard label="Ticket promedio" value={fmt(facKpis.ticket)} sub="por movimiento" icon={<TrendingUp className="w-6 h-6" />} />
                  <KpiCard label="Sesiones cobradas" value={String(facKpis.sesiones)} />
                  <KpiCard label="Obra social" value={fmt(facKpis.prepaga)}
                    sub={facKpis.ingresos > 0 ? `${Math.round((facKpis.prepaga / facKpis.ingresos) * 100)}% del total` : ''}
                    color="#7F77DD"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <KpiCard label="Efectivo" value={fmt(facKpis.efectivo)} sub={facKpis.ingresos > 0 ? `${Math.round((facKpis.efectivo / facKpis.ingresos) * 100)}%` : ''} />
                  <KpiCard label="Transferencia" value={fmt(facKpis.transferencia)} sub={facKpis.ingresos > 0 ? `${Math.round((facKpis.transferencia / facKpis.ingresos) * 100)}%` : ''} />
                  <KpiCard label="Obra social" value={fmt(facKpis.prepaga)} sub={facKpis.ingresos > 0 ? `${Math.round((facKpis.prepaga / facKpis.ingresos) * 100)}%` : ''} />
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle>Variación en el período</SectionTitle>
                <Card>
                  <CardContent className="p-4">
                    {facturacionPorDia.length <= 1 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={facturacionPorDia} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0F6E56" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#0F6E56" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={50} />
                          <Tooltip formatter={(v: number) => fmt(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Area type="monotone" dataKey="ingresos" stroke="#0F6E56" fill="url(#gradIngresos)" strokeWidth={2} dot={false} name="Total" />
                          <Area type="monotone" dataKey="efectivo" stroke="#1D9E75" fill="none" strokeWidth={1.5} dot={false} name="Efectivo" strokeDasharray="4 2" />
                          <Area type="monotone" dataKey="transferencia" stroke="#378ADD" fill="none" strokeWidth={1.5} dot={false} name="Transferencia" strokeDasharray="4 2" />
                          <Area type="monotone" dataKey="os" stroke="#7F77DD" fill="none" strokeWidth={1.5} dot={false} name="OS" strokeDasharray="4 2" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </section>

              <section className="space-y-3">
                <SectionTitle>Por profesional y servicio</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-0">
                      <p className="text-[12px] font-medium text-muted-foreground px-4 pt-3 pb-2">Por profesional</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Profesional</TableHead>
                            <TableHead className="text-right">Sesiones</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Ticket</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {facturacionPorProfesional.map((p, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-[12px]">{p.nombre}</TableCell>
                              <TableCell className="text-right text-[12px]">{p.sesiones}</TableCell>
                              <TableCell className="text-right text-[12px] font-medium text-[#0F6E56]">{fmt(p.total)}</TableCell>
                              <TableCell className="text-right text-[12px] text-muted-foreground">{fmt(Math.round(p.total / p.sesiones))}</TableCell>
                            </TableRow>
                          ))}
                          {facturacionPorProfesional.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">Sin datos</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-0">
                      <p className="text-[12px] font-medium text-muted-foreground px-4 pt-3 pb-2">Por servicio</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Servicio</TableHead>
                            <TableHead className="text-right">Sesiones</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Ticket</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {facturacionPorServicio.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-[12px]">{s.nombre}</TableCell>
                              <TableCell className="text-right text-[12px]">{s.sesiones}</TableCell>
                              <TableCell className="text-right text-[12px] font-medium text-[#0F6E56]">{fmt(s.total)}</TableCell>
                              <TableCell className="text-right text-[12px] text-muted-foreground">{fmt(Math.round(s.total / s.sesiones))}</TableCell>
                            </TableRow>
                          ))}
                          {facturacionPorServicio.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">Sin datos</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </section>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB: OBRAS SOCIALES
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'obras_sociales' && (
            <div className="space-y-6">
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Obra social</Label>
                  <Select value={osFiltro} onValueChange={setOsFiltro}>
                    <SelectTrigger className="w-60 h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas las obras sociales</SelectItem>
                      {obrasS.map(os => <SelectItem key={os.id} value={os.id}>{os.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <section className="space-y-3">
                <SectionTitle>Resumen obras sociales</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <KpiCard label="Ingresos OS" value={fmt(osKpis.ingresosOS)} color="#7F77DD" icon={<Building2 className="w-6 h-6" />}
                    deltas={<>
                      <DeltaBadge current={osKpis.ingresosOS} prev={compSemana.ingresosOS} label="sem. ant." />
                      <DeltaBadge current={osKpis.ingresosOS} prev={compMes.ingresosOS} label="mes ant." />
                      <DeltaBadge current={osKpis.ingresosOS} prev={compAño.ingresosOS} label="año ant." />
                    </>}
                  />
                  <KpiCard label="Sesiones OS" value={String(osKpis.sesiones)} />
                  <KpiCard
                    label="% sobre facturación total"
                    value={`${osKpis.pctOS}%`}
                    color={osKpis.pctOS > 50 ? '#7F77DD' : undefined}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle>Variación en el período</SectionTitle>
                <Card>
                  <CardContent className="p-4">
                    {osPorDia.length <= 1 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={osPorDia} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradOS" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#7F77DD" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#7F77DD" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={50} />
                          <Tooltip formatter={(v: number) => fmt(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Area type="monotone" dataKey="ingresosOS" stroke="#7F77DD" fill="url(#gradOS)" strokeWidth={2} dot={false} name="Ingresos OS" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </section>

              <section className="space-y-3">
                <SectionTitle>Por obra social</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      {resumenOS.length === 0 ? <EmptyChart /> : (
                        <ResponsiveContainer width="100%" height={Math.max(resumenOS.length * 44 + 32, 160)}>
                          <BarChart data={resumenOS} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={160} />
                            <Tooltip formatter={(v: number) => fmt(v)} />
                            <Bar dataKey="total" radius={[0, 3, 3, 0]} name="Ingresos OS">
                              {resumenOS.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Obra social</TableHead>
                            <TableHead className="text-right">Sesiones</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resumenOS.map((os, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-[12px]">{os.nombre}</TableCell>
                              <TableCell className="text-right text-[12px]">{os.sesiones}</TableCell>
                              <TableCell className="text-right text-[12px] font-medium text-[#7F77DD]">{fmt(os.total)}</TableCell>
                              <TableCell className="text-right text-[12px] text-muted-foreground">
                                {osKpis.ingresosOS > 0 ? `${Math.round((os.total / osKpis.ingresosOS) * 100)}%` : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                          {resumenOS.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">Sin datos de obras sociales</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
