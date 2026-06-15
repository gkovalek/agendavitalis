import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, TrendingUp, Users, Calendar, Banknote, Building2, Activity } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
} from 'recharts';

type Periodo = 'hoy' | 'semana' | 'mes' | 'custom';

interface RangoFechas { desde: string; hasta: string; }

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
    paciente?: { nombre: string; apellido: string; obra_social?: { nombre: string } | null } | null;
    servicio?: { nombre: string } | null;
  } | null;
}

interface Turno { id: string; estado: string; }

const ESTADO_COLORES: Record<string, string> = {
  reservado: '#FCD34D', confirmado: '#4ADE80', en_sala: '#C084FC',
  siendo_atendido: '#60A5FA', finalizado: '#1D9E75', cancelado: '#F87171',
};
const ESTADO_LABELS: Record<string, string> = {
  reservado: 'Reservado', confirmado: 'Confirmado', en_sala: 'En sala',
  siendo_atendido: 'Siendo atendido', finalizado: 'Finalizado', cancelado: 'Cancelado',
};

const CHART_COLORS = ['#0F6E56', '#378ADD', '#EF9F27', '#7F77DD', '#E24B4A', '#1D9E75', '#C084FC', '#F87171'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getRango(periodo: Periodo, customDesde: string, customHasta: string): RangoFechas {
  const hoy = new Date();
  if (periodo === 'hoy') { const s = toDateStr(hoy); return { desde: s, hasta: s }; }
  if (periodo === 'semana') {
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { desde: toDateStr(lunes), hasta: toDateStr(domingo) };
  }
  if (periodo === 'mes') {
    return { desde: toDateStr(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: toDateStr(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)) };
  }
  return { desde: customDesde, hasta: customHasta };
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function KpiCard({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon?: React.ReactNode; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: color ?? 'inherit' }}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
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

export default function Reportes() {
  const { centroId } = useAuth();

  const hoyStr = toDateStr(new Date());
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [customDesde, setCustomDesde] = useState(hoyStr);
  const [customHasta, setCustomHasta] = useState(hoyStr);
  const [loading, setLoading] = useState(true);

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [pacientesNuevos, setPacientesNuevos] = useState(0);
  const [historico, setHistorico] = useState<{ mes: string; ingresos: number; turnos: number }[]>([]);

  const rango = useMemo(() => getRango(periodo, customDesde, customHasta), [periodo, customDesde, customHasta]);

  useEffect(() => {
    if (!centroId) return;
    if (periodo === 'custom' && (!customDesde || !customHasta)) return;

    const load = async () => {
      setLoading(true);

      // Últimos 6 meses para el histórico
      const hoy = new Date();
      const hace6Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
      const desde6 = toDateStr(hace6Meses);
      const hasta6 = toDateStr(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));

      const [turnosRes, movRes, pacRes, histMovRes, histTurnosRes] = await Promise.all([
        supabase.from('turnos').select('id, estado').eq('centro_id', centroId).gte('fecha', rango.desde).lte('fecha', rango.hasta),
        supabase.from('caja_movimientos')
          .select(`id, fecha, monto_efectivo, monto_transferencia, monto_prepaga, monto_total, profesional_id,
            profesional:profesionales(nombre, apellido),
            turno:turnos(
              paciente:pacientes(nombre, apellido, obra_social:obras_sociales(nombre)),
              servicio:servicios(nombre)
            )`)
          .eq('centro_id', centroId).gte('fecha', rango.desde).lte('fecha', rango.hasta).order('fecha', { ascending: false }),
        supabase.from('pacientes').select('id', { count: 'exact', head: true }).eq('centro_id', centroId).gte('created_at', rango.desde).lte('created_at', rango.hasta + 'T23:59:59'),
        supabase.from('caja_movimientos').select('fecha, monto_total').eq('centro_id', centroId).gte('fecha', desde6).lte('fecha', hasta6),
        supabase.from('turnos').select('fecha, estado').eq('centro_id', centroId).eq('estado', 'finalizado').gte('fecha', desde6).lte('fecha', hasta6),
      ]);

      setTurnos((turnosRes.data as Turno[]) ?? []);
      setMovimientos((movRes.data as any[]) ?? []);
      setPacientesNuevos(pacRes.count ?? 0);

      // Agrupar por mes para histórico
      const mesMap: Record<string, { ingresos: number; turnos: number }> = {};
      for (let i = 0; i < 6; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        mesMap[key] = { ingresos: 0, turnos: 0 };
      }
      ((histMovRes.data as any[]) ?? []).forEach((m: any) => {
        const key = m.fecha.substring(0, 7);
        if (mesMap[key]) mesMap[key].ingresos += m.monto_total || 0;
      });
      ((histTurnosRes.data as any[]) ?? []).forEach((t: any) => {
        const key = t.fecha.substring(0, 7);
        if (mesMap[key]) mesMap[key].turnos += 1;
      });
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      setHistorico(Object.entries(mesMap).sort(([a],[b]) => a.localeCompare(b)).map(([key, val]) => ({
        mes: meses[parseInt(key.split('-')[1]) - 1],
        ...val,
      })));

      setLoading(false);
    };

    load();
  }, [centroId, rango]);

  // ── Cálculos derivados ──
  const kpis = useMemo(() => {
    const total = turnos.length;
    const finalizados = turnos.filter(t => t.estado === 'finalizado').length;
    const cancelados = turnos.filter(t => t.estado === 'cancelado').length;
    const ausentismo = total > 0 ? Math.round((cancelados / total) * 100) : 0;
    const ingresos = movimientos.reduce((s, m) => s + (m.monto_total || 0), 0);
    const efectivo = movimientos.reduce((s, m) => s + (m.monto_efectivo || 0), 0);
    const transferencia = movimientos.reduce((s, m) => s + (m.monto_transferencia || 0), 0);
    const prepaga = movimientos.reduce((s, m) => s + (m.monto_prepaga || 0), 0);
    const ticketProm = finalizados > 0 ? Math.round(ingresos / finalizados) : 0;
    return { total, finalizados, cancelados, ausentismo, ingresos, efectivo, transferencia, prepaga, ticketProm };
  }, [turnos, movimientos]);

  const ingresoPorDia = useMemo(() => {
    const map: Record<string, number> = {};
    movimientos.forEach(m => { map[m.fecha] = (map[m.fecha] || 0) + (m.monto_total || 0); });
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([fecha, total]) => ({ fecha: fecha.slice(5), total }));
  }, [movimientos]);

  const turnosPorEstado = useMemo(() => {
    const map: Record<string, number> = {};
    turnos.forEach(t => { map[t.estado] = (map[t.estado] || 0) + 1; });
    return Object.entries(map).map(([estado, value]) => ({ name: ESTADO_LABELS[estado] ?? estado, value, color: ESTADO_COLORES[estado] ?? '#94A3B8' }));
  }, [turnos]);

  const ingresoPorProfesional = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; sesiones: number }> = {};
    movimientos.forEach(m => {
      if (!m.profesional_id) return;
      const nombre = m.profesional ? `${m.profesional.apellido}, ${m.profesional.nombre}` : '—';
      if (!map[m.profesional_id]) map[m.profesional_id] = { nombre, total: 0, sesiones: 0 };
      map[m.profesional_id].total += m.monto_total || 0;
      map[m.profesional_id].sesiones += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [movimientos]);

  const ingresoPorOS = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; sesiones: number }> = {};
    movimientos.forEach(m => {
      const os = (m.turno as any)?.paciente?.obra_social;
      const nombre = os?.nombre ?? 'Particular / Sin OS';
      const monto = m.monto_total || 0;
      if (!map[nombre]) map[nombre] = { nombre, total: 0, sesiones: 0 };
      map[nombre].total += monto;
      map[nombre].sesiones += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [movimientos]);

  const ingresoPorServicio = useMemo(() => {
    const map: Record<string, { nombre: string; total: number; sesiones: number }> = {};
    movimientos.forEach(m => {
      const srv = (m.turno as any)?.servicio;
      const nombre = srv?.nombre ?? 'Sin servicio';
      if (!map[nombre]) map[nombre] = { nombre, total: 0, sesiones: 0 };
      map[nombre].total += m.monto_total || 0;
      map[nombre].sesiones += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [movimientos]);

  const periodoLabel = periodo === 'hoy' ? 'Hoy' : periodo === 'semana' ? 'Esta semana' : periodo === 'mes' ? 'Este mes' : `${customDesde} → ${customHasta}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Reportes financieros</h1>
          <p className="text-sm text-muted-foreground">{periodoLabel}</p>
        </div>
      </div>

      {/* Filtro período */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <Tabs value={periodo} onValueChange={v => setPeriodo(v as Periodo)}>
          <TabsList>
            <TabsTrigger value="hoy">Hoy</TabsTrigger>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="mes">Mes</TabsTrigger>
            <TabsTrigger value="custom">Personalizado</TabsTrigger>
          </TabsList>
        </Tabs>
        {periodo === 'custom' && (
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" value={customDesde} onChange={e => setCustomDesde(e.target.value)} className="w-40" /></div>
            <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" value={customHasta} onChange={e => setCustomHasta(e.target.value)} className="w-40" /></div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-8">

          {/* ── KPIs ── */}
          <section className="space-y-3">
            <SectionTitle>Resumen del período</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Ingresos totales" value={fmt(kpis.ingresos)} icon={<Banknote className="w-6 h-6" />} color="#0F6E56" />
              <KpiCard label="Sesiones realizadas" value={String(kpis.finalizados)} sub={`de ${kpis.total} turnos`} icon={<Calendar className="w-6 h-6" />} />
              <KpiCard label="Ticket promedio" value={fmt(kpis.ticketProm)} sub="por sesión finalizada" icon={<TrendingUp className="w-6 h-6" />} />
              <KpiCard label="Pacientes nuevos" value={String(pacientesNuevos)} icon={<Users className="w-6 h-6" />} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Efectivo" value={fmt(kpis.efectivo)} sub={kpis.ingresos > 0 ? `${Math.round((kpis.efectivo/kpis.ingresos)*100)}% del total` : ''} />
              <KpiCard label="Transferencia" value={fmt(kpis.transferencia)} sub={kpis.ingresos > 0 ? `${Math.round((kpis.transferencia/kpis.ingresos)*100)}% del total` : ''} />
              <KpiCard label="Obra social" value={fmt(kpis.prepaga)} sub={kpis.ingresos > 0 ? `${Math.round((kpis.prepaga/kpis.ingresos)*100)}% del total` : ''} />
              <KpiCard label="Tasa de cancelación" value={`${kpis.ausentismo}%`} sub={`${kpis.cancelados} de ${kpis.total} turnos`} color={kpis.ausentismo > 20 ? '#E24B4A' : undefined} icon={<Activity className="w-6 h-6" />} />
            </div>
          </section>

          {/* ── Histórico 6 meses ── */}
          <section className="space-y-3">
            <SectionTitle>Evolución últimos 6 meses</SectionTitle>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-[12px] font-medium text-muted-foreground mb-3">Ingresos mensuales</p>
                  {historico.every(h => h.ingresos === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={historico} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={55} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Bar dataKey="ingresos" fill="#0F6E56" radius={[3,3,0,0]} name="Ingresos" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[12px] font-medium text-muted-foreground mb-3">Sesiones finalizadas por mes</p>
                  {historico.every(h => h.turnos === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={historico} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={35} />
                        <Tooltip />
                        <Line type="monotone" dataKey="turnos" stroke="#378ADD" strokeWidth={2} dot={{ r: 4 }} name="Sesiones" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Ingresos por Obra Social ── */}
          <section className="space-y-3">
            <SectionTitle>Ingresos por Obra Social</SectionTitle>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  {ingresoPorOS.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(ingresoPorOS.length * 44 + 32, 200)}>
                      <BarChart data={ingresoPorOS} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={160} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Bar dataKey="total" fill="#0F6E56" radius={[0,3,3,0]} name="Ingresos">
                          {ingresoPorOS.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
                      {ingresoPorOS.map((os, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[12px]">{os.nombre}</TableCell>
                          <TableCell className="text-right text-[12px]">{os.sesiones}</TableCell>
                          <TableCell className="text-right text-[12px] font-medium">{fmt(os.total)}</TableCell>
                          <TableCell className="text-right text-[12px] text-muted-foreground">
                            {kpis.ingresos > 0 ? `${Math.round((os.total/kpis.ingresos)*100)}%` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Ingresos por Servicio ── */}
          <section className="space-y-3">
            <SectionTitle>Ingresos por Servicio</SectionTitle>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  {ingresoPorServicio.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(ingresoPorServicio.length * 44 + 32, 200)}>
                      <BarChart data={ingresoPorServicio} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={140} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Bar dataKey="total" radius={[0,3,3,0]} name="Ingresos">
                          {ingresoPorServicio.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
                        <TableHead className="text-right">Sesiones</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Ticket prom.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ingresoPorServicio.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[12px]">{s.nombre}</TableCell>
                          <TableCell className="text-right text-[12px]">{s.sesiones}</TableCell>
                          <TableCell className="text-right text-[12px] font-medium">{fmt(s.total)}</TableCell>
                          <TableCell className="text-right text-[12px] text-muted-foreground">{fmt(Math.round(s.total / s.sesiones))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Por profesional + Estado ── */}
          <section className="space-y-3">
            <SectionTitle>Por profesional y estado de turnos</SectionTitle>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-[12px] font-medium text-muted-foreground mb-3">Ingresos por profesional</p>
                  {ingresoPorProfesional.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(ingresoPorProfesional.length * 44 + 32, 150)}>
                      <BarChart data={ingresoPorProfesional} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={140} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Bar dataKey="total" fill="#378ADD" radius={[0,3,3,0]} name="Ingresos" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[12px] font-medium text-muted-foreground mb-3">Turnos por estado</p>
                  {turnosPorEstado.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={turnosPorEstado} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                          {turnosPorEstado.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Movimientos ── */}
          <section className="space-y-3">
            <SectionTitle>Detalle de movimientos ({movimientos.length})</SectionTitle>
            <Card>
              <CardContent className="p-0">
                {movimientos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin movimientos en el período</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Profesional</TableHead>
                          <TableHead>Servicio</TableHead>
                          <TableHead className="text-right">Efectivo</TableHead>
                          <TableHead className="text-right">Transfer.</TableHead>
                          <TableHead className="text-right">OS</TableHead>
                          <TableHead className="text-right font-semibold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movimientos.map(m => {
                          const pac = (m.turno as any)?.paciente;
                          const srv = (m.turno as any)?.servicio;
                          return (
                            <TableRow key={m.id}>
                              <TableCell className="text-[12px] whitespace-nowrap">{m.fecha}</TableCell>
                              <TableCell className="text-[12px]">{pac ? `${pac.apellido}, ${pac.nombre}` : '—'}</TableCell>
                              <TableCell className="text-[12px]">{m.profesional ? `${m.profesional.apellido}, ${m.profesional.nombre}` : '—'}</TableCell>
                              <TableCell className="text-[12px] text-muted-foreground">{srv?.nombre ?? '—'}</TableCell>
                              <TableCell className="text-right text-[12px]">{m.monto_efectivo > 0 ? fmt(m.monto_efectivo) : '—'}</TableCell>
                              <TableCell className="text-right text-[12px]">{m.monto_transferencia > 0 ? fmt(m.monto_transferencia) : '—'}</TableCell>
                              <TableCell className="text-right text-[12px]">{m.monto_prepaga > 0 ? fmt(m.monto_prepaga) : '—'}</TableCell>
                              <TableCell className="text-right text-[12px] font-semibold text-[#0F6E56]">{fmt(m.monto_total || 0)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

        </div>
      )}
    </div>
  );
}
