import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';

type Periodo = 'hoy' | 'semana' | 'mes' | 'custom';

interface RangoFechas {
  desde: string;
  hasta: string;
}

interface Movimiento {
  id: string;
  fecha: string;
  monto_efectivo: number;
  monto_transferencia: number;
  monto_prepaga: number;
  monto_total: number;
  profesional_id: string | null;
  profesional?: { nombre: string; apellido: string } | null;
  turno?: { paciente?: { nombre: string; apellido: string } | null } | null;
}

interface Turno {
  id: string;
  estado: string;
}

const ESTADO_COLORES: Record<string, string> = {
  reservado: '#FCD34D',
  confirmado: '#4ADE80',
  en_sala: '#C084FC',
  siendo_atendido: '#60A5FA',
  finalizado: '#7DD3FC',
  cancelado: '#F87171',
};

const ESTADO_LABELS: Record<string, string> = {
  reservado: 'Reservado',
  confirmado: 'Confirmado',
  en_sala: 'En sala',
  siendo_atendido: 'Siendo atendido',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getRango(periodo: Periodo, customDesde: string, customHasta: string): RangoFechas {
  const hoy = new Date();
  if (periodo === 'hoy') {
    const s = toDateStr(hoy);
    return { desde: s, hasta: s };
  }
  if (periodo === 'semana') {
    const day = hoy.getDay();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((day + 6) % 7));
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    return { desde: toDateStr(lunes), hasta: toDateStr(domingo) };
  }
  if (periodo === 'mes') {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return { desde: toDateStr(desde), hasta: toDateStr(hasta) };
  }
  return { desde: customDesde, hasta: customHasta };
}

function formatMonto(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Reportes() {
  const { centroId } = useAuth();

  const hoyStr = toDateStr(new Date());
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [customDesde, setCustomDesde] = useState(hoyStr);
  const [customHasta, setCustomHasta] = useState(hoyStr);

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [pacientesNuevos, setPacientesNuevos] = useState(0);
  const [loading, setLoading] = useState(true);

  const rango = useMemo(() => getRango(periodo, customDesde, customHasta), [periodo, customDesde, customHasta]);

  useEffect(() => {
    if (!centroId) return;
    if (periodo === 'custom' && (!customDesde || !customHasta)) return;

    const load = async () => {
      setLoading(true);

      const [turnosRes, movRes, pacRes] = await Promise.all([
        supabase
          .from('turnos')
          .select('id, estado')
          .eq('centro_id', centroId)
          .gte('fecha', rango.desde)
          .lte('fecha', rango.hasta),
        supabase
          .from('caja_movimientos')
          .select('id, fecha, monto_efectivo, monto_transferencia, monto_prepaga, monto_total, profesional_id, profesional:profesionales(nombre, apellido), turno:turnos(paciente:pacientes(nombre, apellido))')
          .eq('centro_id', centroId)
          .gte('fecha', rango.desde)
          .lte('fecha', rango.hasta)
          .order('fecha', { ascending: false })
          .limit(50),
        supabase
          .from('pacientes')
          .select('id', { count: 'exact', head: true })
          .eq('centro_id', centroId)
          .gte('created_at', rango.desde)
          .lte('created_at', rango.hasta + 'T23:59:59'),
      ]);

      setTurnos((turnosRes.data as Turno[]) ?? []);
      setMovimientos((movRes.data as any[]) ?? []);
      setPacientesNuevos(pacRes.count ?? 0);
      setLoading(false);
    };

    load();
  }, [centroId, rango]);

  const kpis = useMemo(() => {
    const total = turnos.length;
    const finalizados = turnos.filter(t => t.estado === 'finalizado').length;
    const cancelados = turnos.filter(t => t.estado === 'cancelado').length;
    const ingresos = movimientos.reduce((s, m) => s + (m.monto_total || 0), 0);
    const efectivo = movimientos.reduce((s, m) => s + (m.monto_efectivo || 0), 0);
    const transferencia = movimientos.reduce((s, m) => s + (m.monto_transferencia || 0), 0);
    const prepaga = movimientos.reduce((s, m) => s + (m.monto_prepaga || 0), 0);
    return { total, finalizados, cancelados, ingresos, efectivo, transferencia, prepaga };
  }, [turnos, movimientos]);

  const ingresoPorDia = useMemo(() => {
    const map: Record<string, number> = {};
    movimientos.forEach(m => {
      map[m.fecha] = (map[m.fecha] || 0) + (m.monto_total || 0);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, total]) => ({
        fecha: fecha.slice(5),
        total,
      }));
  }, [movimientos]);

  const turnosPorEstado = useMemo(() => {
    const map: Record<string, number> = {};
    turnos.forEach(t => { map[t.estado] = (map[t.estado] || 0) + 1; });
    return Object.entries(map).map(([estado, value]) => ({
      name: ESTADO_LABELS[estado] ?? estado,
      value,
      color: ESTADO_COLORES[estado] ?? '#94A3B8',
    }));
  }, [turnos]);

  const top5Profesionales = useMemo(() => {
    const map: Record<string, { nombre: string; total: number }> = {};
    movimientos.forEach(m => {
      if (!m.profesional_id) return;
      const nombre = m.profesional ? `${m.profesional.apellido}, ${m.profesional.nombre}` : m.profesional_id;
      if (!map[m.profesional_id]) map[m.profesional_id] = { nombre, total: 0 };
      map[m.profesional_id].total += m.monto_total || 0;
    });
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [movimientos]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Reportes</h1>
        <p className="text-sm text-muted-foreground">Estadísticas e ingresos del centro</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <Tabs value={periodo} onValueChange={v => setPeriodo(v as Periodo)}>
          <TabsList>
            <TabsTrigger value="hoy">Hoy</TabsTrigger>
            <TabsTrigger value="semana">Esta semana</TabsTrigger>
            <TabsTrigger value="mes">Este mes</TabsTrigger>
            <TabsTrigger value="custom">Personalizado</TabsTrigger>
          </TabsList>
        </Tabs>

        {periodo === 'custom' && (
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={customDesde} onChange={e => setCustomDesde(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={customHasta} onChange={e => setCustomHasta(e.target.value)} className="w-40" />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <KpiCard label="Total turnos" value={String(kpis.total)} />
            <KpiCard label="Finalizados" value={String(kpis.finalizados)} />
            <KpiCard label="Cancelados" value={String(kpis.cancelados)} />
            <KpiCard label="Pacientes nuevos" value={String(pacientesNuevos)} />
            <KpiCard label="Ingresos totales" value={formatMonto(kpis.ingresos)} />
            <KpiCard label="Efectivo" value={formatMonto(kpis.efectivo)} />
            <KpiCard label="Transferencia" value={formatMonto(kpis.transferencia)} />
            <KpiCard label="Obra social" value={formatMonto(kpis.prepaga)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-4">Ingresos por día</p>
                {ingresoPorDia.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={ingresoPorDia} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} width={60} />
                      <Tooltip formatter={(v: number) => formatMonto(v)} labelFormatter={l => `Día: ${l}`} />
                      <Bar dataKey="total" fill="#60A5FA" radius={[3, 3, 0, 0]} name="Ingresos" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-foreground mb-4">Turnos por estado</p>
                {turnosPorEstado.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={turnosPorEstado}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {turnosPorEstado.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-foreground mb-4">Top 5 profesionales por ingresos</p>
              {top5Profesionales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
              ) : (
                <ResponsiveContainer width="100%" height={top5Profesionales.length * 52 + 32}>
                  <BarChart
                    data={top5Profesionales}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip formatter={(v: number) => formatMonto(v)} />
                    <Bar dataKey="total" fill="#4ADE80" radius={[0, 3, 3, 0]} name="Ingresos" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <p className="text-sm font-semibold text-foreground p-4 pb-2">Movimientos de caja</p>
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
                        <TableHead className="text-right">Efectivo</TableHead>
                        <TableHead className="text-right">Transferencia</TableHead>
                        <TableHead className="text-right">Obra social</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movimientos.map(m => {
                        const paciente = (m.turno as any)?.paciente;
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="text-sm whitespace-nowrap">{m.fecha}</TableCell>
                            <TableCell className="text-sm">
                              {paciente ? `${paciente.apellido}, ${paciente.nombre}` : '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {m.profesional ? `${m.profesional.apellido}, ${m.profesional.nombre}` : '—'}
                            </TableCell>
                            <TableCell className="text-right text-sm">{formatMonto(m.monto_efectivo || 0)}</TableCell>
                            <TableCell className="text-right text-sm">{formatMonto(m.monto_transferencia || 0)}</TableCell>
                            <TableCell className="text-right text-sm">{formatMonto(m.monto_prepaga || 0)}</TableCell>
                            <TableCell className="text-right text-sm font-semibold">{formatMonto(m.monto_total || 0)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
