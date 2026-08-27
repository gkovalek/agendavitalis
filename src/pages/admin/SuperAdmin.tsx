import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2, Users, CreditCard, ShieldAlert, Percent, AlertTriangle, Cpu, DollarSign, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SUPERADMIN_EMAIL = 'gkovalek@hotmail.com';

interface Centro {
  id: string;
  nombre: string;
  plan: string;
  activo: boolean;
  suscripcion_estado: string;
  trial_hasta: string | null;
  suscripcion_vence: string | null;
  billing_email: string | null;
  mp_fee_pct: number;
  created_at: string;
  _usuarios: number;
  _profesionales: number;
}

interface PagoResumen {
  centro_id: string;
  centro_nombre: string;
  total_pagos: number;
  monto_total: number;
  monto_vitalis: number;
  monto_centro: number;
}

interface TokenResumen {
  centro_id: string;
  centro_nombre: string;
  total_llamadas: number;
  total_input: number;
  total_output: number;
  total_tokens: number;
  costo_usd: number;
}

interface UsuarioCentro {
  id: string;
  auth_user_id: string;
  nombre: string;
  apellido?: string;
  mail: string;
  activo: boolean;
  rol_id: string;
  _rol_nombre?: string;
}

interface FacturacionCentro {
  plan: string;
  suscripcion_estado: string;
  suscripcion_vence: string | null;
  billing_email: string | null;
  mp_preapproval_id: string | null;
  mp_preapproval_status: string | null;
  agendas_count: number;
}

interface ErrorLog {
  id: string;
  centro_id: string | null;
  funcion: string;
  nivel: string;
  mensaje: string;
  detalle: Record<string, unknown>;
  created_at: string;
  _centro_nombre?: string;
}

const PLAN_COLOR: Record<string, string> = {
  basico: 'bg-slate-100 text-slate-700',
  intermedio: 'bg-blue-100 text-blue-700',
  premium: 'bg-purple-100 text-purple-700',
};

const ESTADO_COLOR: Record<string, string> = {
  trial: 'bg-yellow-100 text-yellow-700',
  activo: 'bg-green-100 text-green-700',
  vencido: 'bg-red-100 text-red-700',
  suspendido: 'bg-gray-100 text-gray-700',
};

const NIVEL_COLOR: Record<string, string> = {
  warn: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  critical: 'bg-red-200 text-red-900',
};

export default function SuperAdmin() {
  const { perfil, loading } = useAuth();
  const { toast } = useToast();

  const [centros, setCentros]     = useState<Centro[]>([]);
  const [pagos, setPagos]         = useState<PagoResumen[]>([]);
  const [tokens, setTokens]       = useState<TokenResumen[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [analizando, setAnalizando]         = useState<Record<string, boolean>>({});
  const [analisisResultado, setAnalisisResultado] = useState<Record<string, { causa: string; solucion: string }>>({});
  const [usuariosModal, setUsuariosModal] = useState<{ centroId: string; centroNombre: string } | null>(null);

  const esSuperAdmin = perfil?.mail === SUPERADMIN_EMAIL;

  useEffect(() => {
    if (!esSuperAdmin) return;
    cargarTodo();
  }, [esSuperAdmin]);

  async function cargarTodo() {
    setCargando(true);
    await Promise.all([cargarCentros(), cargarPagos(), cargarTokens(), cargarErrorLogs()]);
    setCargando(false);
  }

  async function cargarCentros() {
    const { data } = await supabase
      .from('centros')
      .select('id, nombre, plan, activo, suscripcion_estado, trial_hasta, suscripcion_vence, billing_email, mp_fee_pct, created_at')
      .order('created_at', { ascending: false });

    const centrosConUsuarios = await Promise.all((data ?? []).map(async (c) => {
      const [{ count: cUsuarios }, { count: cProfesionales }] = await Promise.all([
        supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('centro_id', c.id).eq('activo', true),
        supabase.from('profesionales').select('id', { count: 'exact', head: true }).eq('centro_id', c.id).eq('activo', true),
      ]);
      return { ...c, _usuarios: cUsuarios ?? 0, _profesionales: cProfesionales ?? 0 };
    }));

    setCentros(centrosConUsuarios);
  }

  async function cargarPagos() {
    const { data: centrosData } = await supabase.from('centros').select('id, nombre');
    const nombrePorId: Record<string, string> = {};
    for (const c of centrosData ?? []) nombrePorId[c.id] = c.nombre;

    const { data } = await supabase
      .from('mp_pagos')
      .select('centro_id, monto_total, monto_vitalis, monto_centro')
      .eq('estado', 'approved');

    const mapa: Record<string, PagoResumen> = {};
    for (const p of data ?? []) {
      if (!mapa[p.centro_id]) {
        mapa[p.centro_id] = { centro_id: p.centro_id, centro_nombre: nombrePorId[p.centro_id] ?? p.centro_id, total_pagos: 0, monto_total: 0, monto_vitalis: 0, monto_centro: 0 };
      }
      mapa[p.centro_id].total_pagos++;
      mapa[p.centro_id].monto_total    += Number(p.monto_total);
      mapa[p.centro_id].monto_vitalis  += Number(p.monto_vitalis);
      mapa[p.centro_id].monto_centro   += Number(p.monto_centro);
    }
    setPagos(Object.values(mapa).sort((a, b) => b.monto_vitalis - a.monto_vitalis));
  }

  async function cargarTokens() {
    const { data: centrosData } = await supabase.from('centros').select('id, nombre');
    const nombrePorId: Record<string, string> = {};
    for (const c of centrosData ?? []) nombrePorId[c.id] = c.nombre;

    const { data } = await supabase
      .from('ia_uso_tokens')
      .select('centro_id, input_tokens, output_tokens, costo_usd');

    const mapa: Record<string, TokenResumen> = {};
    for (const r of data ?? []) {
      if (!mapa[r.centro_id]) {
        mapa[r.centro_id] = { centro_id: r.centro_id, centro_nombre: nombrePorId[r.centro_id] ?? r.centro_id, total_llamadas: 0, total_input: 0, total_output: 0, total_tokens: 0, costo_usd: 0 };
      }
      mapa[r.centro_id].total_llamadas++;
      mapa[r.centro_id].total_input   += Number(r.input_tokens);
      mapa[r.centro_id].total_output  += Number(r.output_tokens);
      mapa[r.centro_id].total_tokens  += Number(r.input_tokens) + Number(r.output_tokens);
      mapa[r.centro_id].costo_usd     += Number(r.costo_usd ?? 0);
    }
    setTokens(Object.values(mapa).sort((a, b) => b.total_tokens - a.total_tokens));
  }

  async function cargarErrorLogs() {
    const { data: centrosData } = await supabase.from('centros').select('id, nombre');
    const nombrePorId: Record<string, string> = {};
    for (const c of centrosData ?? []) nombrePorId[c.id] = c.nombre;

    const { data } = await supabase
      .from('error_logs')
      .select('id, centro_id, funcion, nivel, mensaje, detalle, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    setErrorLogs((data ?? []).map(e => ({ ...e, _centro_nombre: e.centro_id ? nombrePorId[e.centro_id] : '—' })));
  }

  async function toggleActivo(centroId: string, activo: boolean) {
    const { error } = await supabase.from('centros').update({ activo: !activo }).eq('id', centroId);
    if (error) { toast({ title: 'Error al actualizar', variant: 'destructive' }); return; }
    setCentros(prev => prev.map(c => c.id === centroId ? { ...c, activo: !activo } : c));
    toast({ title: `Centro ${!activo ? 'activado' : 'suspendido'}` });
  }

  async function setFeePct(centroId: string, pct: number) {
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    const { error } = await supabase.from('centros').update({ mp_fee_pct: pct }).eq('id', centroId);
    if (error) { toast({ title: 'Error al actualizar comisión', variant: 'destructive' }); return; }
    setCentros(prev => prev.map(c => c.id === centroId ? { ...c, mp_fee_pct: pct } : c));
    toast({ title: `Comisión MP → ${pct}%` });
  }

  async function setEstado(centroId: string, estado: string) {
    const { error } = await supabase.from('centros').update({ suscripcion_estado: estado }).eq('id', centroId);
    if (error) { toast({ title: 'Error al actualizar estado', variant: 'destructive' }); return; }
    setCentros(prev => prev.map(c => c.id === centroId ? { ...c, suscripcion_estado: estado } : c));
    toast({ title: `Estado → ${estado}` });
  }

  async function analizarError(e: ErrorLog) {
    setAnalizando(prev => ({ ...prev, [e.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('analizar-error', {
        body: { funcion: e.funcion, nivel: e.nivel, mensaje: e.mensaje, centro_id: e.centro_id ?? undefined },
      });
      if (error || !data?.ok) {
        toast({ title: 'Error al analizar', description: data?.error ?? error?.message, variant: 'destructive' });
      } else {
        setAnalisisResultado(prev => ({ ...prev, [e.id]: { causa: data.causa, solucion: data.solucion } }));
      }
    } catch (err: unknown) {
      toast({ title: 'Error inesperado', description: String(err), variant: 'destructive' });
    } finally {
      setAnalizando(prev => ({ ...prev, [e.id]: false }));
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!esSuperAdmin) return <Navigate to="/dashboard" replace />;

  const totales = {
    centros: centros.length,
    activos: centros.filter(c => c.activo).length,
    trial: centros.filter(c => c.suscripcion_estado === 'trial').length,
    vencidos: centros.filter(c => c.suscripcion_estado === 'vencido').length,
  };

  const totalVitalis = pagos.reduce((s, p) => s + p.monto_vitalis, 0);
  const totalTokens  = tokens.reduce((s, t) => s + t.total_tokens, 0);
  const totalCosto   = tokens.reduce((s, t) => s + t.costo_usd, 0);

  const fmt = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#080E1A] flex items-center justify-center">
          <ShieldAlert className="w-5 h-5 text-[#21C8C0]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Panel Superadmin</h1>
          <p className="text-sm text-muted-foreground">Vitalis — solo para uso interno</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Centros totales', value: totales.centros,   icon: Building2 },
          { label: 'Activos',         value: totales.activos,   icon: Users },
          { label: 'Comisiones MP',   value: fmt(totalVitalis), icon: DollarSign },
          { label: 'Tokens IA',       value: totalTokens.toLocaleString('es-AR'), icon: Cpu },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />{label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="centros">
        <TabsList>
          <TabsTrigger value="centros" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> Centros</TabsTrigger>
          <TabsTrigger value="pagos"   className="gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Ingresos MP</TabsTrigger>
          <TabsTrigger value="tokens"  className="gap-1.5"><Cpu className="w-3.5 h-3.5" /> Tokens IA</TabsTrigger>
          <TabsTrigger value="errores" className="gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Errores {errorLogs.length > 0 && <Badge className="ml-1 h-4 px-1 text-[10px]">{errorLogs.length}</Badge>}</TabsTrigger>
        </TabsList>

        {/* ── Centros ── */}
        <TabsContent value="centros">
          <Card>
            <CardContent className="p-0">
              {cargando ? <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Centro</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Usuarios</TableHead>
                        <TableHead>Profesionales</TableHead>
                        <TableHead>Vence</TableHead>
                        <TableHead>Billing email</TableHead>
                        <TableHead>% MP</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {centros.map(c => (
                        <TableRow key={c.id} className={!c.activo ? 'opacity-50' : ''}>
                          <TableCell>
                            <p className="font-medium text-sm">{c.nombre}</p>
                            <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString('es-AR')}</p>
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLOR[c.plan] ?? ''}`}>{c.plan}</span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[c.suscripcion_estado] ?? ''}`}>{c.suscripcion_estado}</span>
                          </TableCell>
                          <TableCell className="text-sm">{c._usuarios}</TableCell>
                          <TableCell className="text-sm">{c._profesionales}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.suscripcion_estado === 'trial' && c.trial_hasta
                              ? new Date(c.trial_hasta).toLocaleDateString('es-AR')
                              : c.suscripcion_vence ? new Date(c.suscripcion_vence).toLocaleDateString('es-AR') : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.billing_email ?? '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <input
                                type="number" min={0} max={100} step={0.5}
                                defaultValue={c.mp_fee_pct ?? 3}
                                className="w-14 h-7 text-xs border border-border rounded px-2 bg-background text-foreground"
                                onBlur={e => setFeePct(c.id, parseFloat(e.target.value))}
                              />
                              <Percent className="w-3 h-3 text-muted-foreground" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1.5 flex-wrap">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleActivo(c.id, c.activo)}>
                                {c.activo ? 'Suspender' : 'Activar'}
                              </Button>
                              {c.suscripcion_estado !== 'activo' && (
                                <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-200" onClick={() => setEstado(c.id, 'activo')}>→ Activo</Button>
                              )}
                              {c.suscripcion_estado !== 'trial' && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstado(c.id, 'trial')}>→ Trial</Button>
                              )}
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setUsuariosModal({ centroId: c.id, centroNombre: c.nombre })}>
                                <Users className="w-3 h-3" /> Usuarios
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Ingresos MP ── */}
        <TabsContent value="pagos">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Comisiones cobradas por Vitalis (pagos aprobados)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {cargando ? <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : pagos.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">Sin pagos aprobados aún.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Centro</TableHead>
                        <TableHead className="text-right">Pagos</TableHead>
                        <TableHead className="text-right">Total facturado</TableHead>
                        <TableHead className="text-right">Comisión Vitalis</TableHead>
                        <TableHead className="text-right">Neto centro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagos.map(p => (
                        <TableRow key={p.centro_id}>
                          <TableCell className="font-medium text-sm">{p.centro_nombre}</TableCell>
                          <TableCell className="text-right text-sm">{p.total_pagos}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(p.monto_total)}</TableCell>
                          <TableCell className="text-right text-sm font-semibold text-green-600">{fmt(p.monto_vitalis)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{fmt(p.monto_centro)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{pagos.reduce((s, p) => s + p.total_pagos, 0)}</TableCell>
                        <TableCell className="text-right">{fmt(pagos.reduce((s, p) => s + p.monto_total, 0))}</TableCell>
                        <TableCell className="text-right text-green-600">{fmt(totalVitalis)}</TableCell>
                        <TableCell className="text-right">{fmt(pagos.reduce((s, p) => s + p.monto_centro, 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tokens IA ── */}
        <TabsContent value="tokens">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex justify-between">
                <span>Consumo IA por centro (wa-asistente)</span>
                <span className="text-muted-foreground font-normal">Costo total: <strong className="text-foreground">${totalCosto.toFixed(4)} USD</strong></span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {cargando ? <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : tokens.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">Sin registros de tokens aún.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Centro</TableHead>
                        <TableHead className="text-right">Llamadas</TableHead>
                        <TableHead className="text-right">Input tokens</TableHead>
                        <TableHead className="text-right">Output tokens</TableHead>
                        <TableHead className="text-right">Total tokens</TableHead>
                        <TableHead className="text-right">Costo USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokens.map(t => (
                        <TableRow key={t.centro_id}>
                          <TableCell className="font-medium text-sm">{t.centro_nombre}</TableCell>
                          <TableCell className="text-right text-sm">{t.total_llamadas.toLocaleString('es-AR')}</TableCell>
                          <TableCell className="text-right text-sm">{t.total_input.toLocaleString('es-AR')}</TableCell>
                          <TableCell className="text-right text-sm">{t.total_output.toLocaleString('es-AR')}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{t.total_tokens.toLocaleString('es-AR')}</TableCell>
                          <TableCell className="text-right text-sm text-orange-600">${t.costo_usd.toFixed(4)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{tokens.reduce((s, t) => s + t.total_llamadas, 0).toLocaleString('es-AR')}</TableCell>
                        <TableCell className="text-right">{tokens.reduce((s, t) => s + t.total_input, 0).toLocaleString('es-AR')}</TableCell>
                        <TableCell className="text-right">{tokens.reduce((s, t) => s + t.total_output, 0).toLocaleString('es-AR')}</TableCell>
                        <TableCell className="text-right">{totalTokens.toLocaleString('es-AR')}</TableCell>
                        <TableCell className="text-right text-orange-600">${totalCosto.toFixed(4)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Error Logs ── */}
        <TabsContent value="errores">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">Últimos 100 errores</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cargarErrorLogs}>Actualizar</Button>
            </CardHeader>
            <CardContent className="p-0">
              {cargando ? <div className="flex items-center justify-center h-40"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : errorLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">Sin errores registrados. ✅</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Centro</TableHead>
                        <TableHead>Función</TableHead>
                        <TableHead>Nivel</TableHead>
                        <TableHead>Mensaje</TableHead>
                        <TableHead>IA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errorLogs.map(e => (
                        <>
                          <TableRow key={e.id}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(e.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </TableCell>
                            <TableCell className="text-xs">{e._centro_nombre}</TableCell>
                            <TableCell className="text-xs font-mono">{e.funcion}</TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${NIVEL_COLOR[e.nivel] ?? ''}`}>{e.nivel}</span>
                            </TableCell>
                            <TableCell className="text-xs max-w-xs truncate" title={e.mensaje}>{e.mensaje}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={analizando[e.id]}
                                onClick={() => analizarError(e)}
                              >
                                {analizando[e.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                Analizar
                              </Button>
                            </TableCell>
                          </TableRow>
                          {analisisResultado[e.id] && (
                            <TableRow key={`${e.id}-analisis`} className="bg-muted/30">
                              <TableCell colSpan={6} className="py-3 px-4">
                                <div className="space-y-1.5 text-xs">
                                  <p><span className="font-semibold text-orange-600">Causa probable:</span> {analisisResultado[e.id].causa}</p>
                                  <p><span className="font-semibold text-green-600">Solución sugerida:</span> {analisisResultado[e.id].solucion}</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog Gestión de Usuarios ── */}
      {usuariosModal && (
        <GestionUsuariosDialog
          centroId={usuariosModal.centroId}
          centroNombre={usuariosModal.centroNombre}
          onClose={() => setUsuariosModal(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: GestionUsuariosDialog
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_MONTO: Record<string, number> = {
  start:       40000,
  starter:     40000,
  basico:      40000,
  intermedio:  50000,
  profesional: 50000,
  premium:     80000,
};

function GestionUsuariosDialog({ centroId, centroNombre, onClose }: {
  centroId: string;
  centroNombre: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioCentro[]>([]);
  const [facturacion, setFacturacion] = useState<FacturacionCentro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [resetPassId, setResetPassId] = useState<string | null>(null);
  const [nuevaPass, setNuevaPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [generandoDebito, setGenerandoDebito] = useState(false);
  const [initPoint, setInitPoint] = useState<string | null>(null);

  const [form, setForm] = useState({ nombre: '', apellido: '', mail: '', password: '', rol: 'secretaria' });

  useEffect(() => { cargarDatos(); }, [centroId]);

  async function cargarDatos() {
    setCargando(true);
    const [{ data: uData }, { data: cData }, { count: aCount }] = await Promise.all([
      supabase
        .from('usuarios')
        .select('id, auth_user_id, nombre, apellido, mail, activo, rol_id, roles(nombre)')
        .eq('centro_id', centroId)
        .order('activo', { ascending: false }),
      supabase
        .from('centros')
        .select('plan, suscripcion_estado, suscripcion_vence, billing_email, mp_preapproval_id, mp_preapproval_status')
        .eq('id', centroId)
        .single(),
      supabase
        .from('agendas')
        .select('id', { count: 'exact', head: true })
        .eq('centro_id', centroId),
    ]);

    setUsuarios((uData ?? []).map((u: { id: string; auth_user_id: string; nombre: string; apellido?: string; mail: string; activo: boolean; rol_id: string; roles?: { nombre: string } | { nombre: string }[] }) => ({
      ...u,
      _rol_nombre: Array.isArray(u.roles) ? u.roles[0]?.nombre : (u.roles as { nombre: string })?.nombre ?? '—',
    })));

    if (cData) {
      setFacturacion({ ...cData, agendas_count: aCount ?? 0 });
    }
    setCargando(false);
  }

  function cargarUsuarios() { cargarDatos(); }

  async function crearUsuario() {
    if (!form.nombre.trim() || !form.mail.trim() || !form.password) {
      toast({ title: 'Completá nombre, mail y contraseña', variant: 'destructive' }); return;
    }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('admin-gestionar-usuario', {
      body: { action: 'crear', ...form, centro_id: centroId },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    setSaving(false);
    if (error || !data?.ok) {
      const msg = data?.error === 'email_already_exists' ? 'El mail ya está registrado' : (data?.error ?? error?.message);
      toast({ title: 'Error al crear usuario', description: msg, variant: 'destructive' });
    } else {
      toast({ title: 'Usuario creado' });
      setForm({ nombre: '', apellido: '', mail: '', password: '', rol: 'secretaria' });
      setMostrarForm(false);
      cargarUsuarios();
    }
  }

  async function resetPass(authUserId: string) {
    if (!nuevaPass || nuevaPass.length < 6) {
      toast({ title: 'Mínimo 6 caracteres', variant: 'destructive' }); return;
    }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('admin-gestionar-usuario', {
      body: { action: 'resetear_pass', auth_user_id: authUserId, nueva_password: nuevaPass },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    setSaving(false);
    if (error || !data?.ok) {
      toast({ title: 'Error al resetear', description: data?.error ?? error?.message, variant: 'destructive' });
    } else {
      toast({ title: 'Contraseña actualizada' });
      setResetPassId(null);
      setNuevaPass('');
    }
  }

  async function toggleUsuario(u: UsuarioCentro) {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const action = u.activo ? 'desactivar' : 'reactivar';
    const { data, error } = await supabase.functions.invoke('admin-gestionar-usuario', {
      body: { action, auth_user_id: u.auth_user_id, usuario_id: u.id },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    setSaving(false);
    if (error || !data?.ok) {
      toast({ title: 'Error', description: data?.error ?? error?.message, variant: 'destructive' });
    } else {
      toast({ title: u.activo ? 'Usuario desactivado' : 'Usuario reactivado' });
      cargarUsuarios();
    }
  }

  const ROL_COLOR: Record<string, string> = {
    administrador: 'bg-purple-100 text-purple-700',
    secretaria:    'bg-blue-100 text-blue-700',
    profesional:   'bg-green-100 text-green-700',
  };

  async function generarDebito() {
    if (!facturacion) return;
    setGenerandoDebito(true);
    const { data: { session } } = await supabase.auth.getSession();
    const monto = PLAN_MONTO[facturacion.plan?.toLowerCase()] ?? 40000;
    const { data, error } = await supabase.functions.invoke('admin-cobro-centro', {
      body: {
        action: 'crear_preapproval',
        centro_id: centroId,
        centro_nombre: centroNombre,
        plan: facturacion.plan,
        monto,
        payer_email: facturacion.billing_email ?? '',
      },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    setGenerandoDebito(false);
    if (error || !data?.ok) {
      toast({ title: 'Error al generar débito', description: data?.error ?? error?.message, variant: 'destructive' });
    } else {
      toast({ title: 'Débito generado', description: 'Enviá el link al responsable del centro.' });
      setInitPoint(data.init_point);
      cargarDatos();
    }
  }

  async function consultarDebito() {
    if (!facturacion?.mp_preapproval_id) return;
    setGenerandoDebito(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('admin-cobro-centro', {
      body: { action: 'consultar_preapproval', centro_id: centroId },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    setGenerandoDebito(false);
    if (error || !data?.ok) {
      toast({ title: 'Error al consultar', description: data?.error ?? error?.message, variant: 'destructive' });
    } else {
      toast({ title: `Estado: ${data.status}` });
      cargarDatos();
    }
  }

  const PREAPPROVAL_COLOR: Record<string, string> = {
    authorized: 'bg-green-100 text-green-700',
    pending:    'bg-yellow-100 text-yellow-700',
    paused:     'bg-orange-100 text-orange-700',
    cancelled:  'bg-red-100 text-red-700',
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> {centroNombre}
          </DialogTitle>
        </DialogHeader>

        {cargando ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="usuarios">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="usuarios" className="flex-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Usuarios ({usuarios.length})
              </TabsTrigger>
              <TabsTrigger value="facturacion" className="flex-1 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Facturación
              </TabsTrigger>
            </TabsList>

            {/* ── Tab Usuarios ── */}
            <TabsContent value="usuarios" className="space-y-4">
              <div className="space-y-2">
                {usuarios.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin usuarios creados aún.</p>
                )}
                {usuarios.map(u => (
                  <div key={u.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${!u.activo ? 'opacity-50 bg-muted/30' : 'bg-card'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{u.nombre}{u.apellido ? ` ${u.apellido}` : ''}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROL_COLOR[u._rol_nombre ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                          {u._rol_nombre}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{u.mail}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {resetPassId === u.id ? (
                        <div className="flex gap-1 items-center">
                          <Input
                            className="h-7 w-32 text-xs"
                            placeholder="nueva pass"
                            value={nuevaPass}
                            onChange={e => setNuevaPass(e.target.value)}
                          />
                          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => resetPass(u.auth_user_id)}>
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setResetPassId(null); setNuevaPass(''); }}>
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setResetPassId(u.id)}>
                          Resetear pass
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 text-xs ${u.activo ? 'text-red-600 border-red-200' : 'text-green-600 border-green-200'}`}
                        disabled={saving}
                        onClick={() => toggleUsuario(u)}
                      >
                        {u.activo ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                  onClick={() => setMostrarForm(f => !f)}
                >
                  <span className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> Agregar usuario</span>
                  {mostrarForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {mostrarForm && (
                  <div className="p-4 space-y-3 bg-card">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nombre *</Label>
                        <Input className="h-8 text-sm" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Apellido</Label>
                        <Input className="h-8 text-sm" value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Mail *</Label>
                        <Input className="h-8 text-sm" type="email" value={form.mail} onChange={e => setForm(f => ({ ...f, mail: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Contraseña inicial *</Label>
                        <Input className="h-8 text-sm" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-1 max-w-[200px]">
                      <Label className="text-xs">Rol *</Label>
                      <Select value={form.rol} onValueChange={v => setForm(f => ({ ...f, rol: v }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="secretaria">Secretaria</SelectItem>
                          <SelectItem value="profesional">Profesional</SelectItem>
                          <SelectItem value="administrador">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="h-8 text-sm w-full" disabled={saving} onClick={crearUsuario}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Crear usuario
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Tab Facturación ── */}
            <TabsContent value="facturacion" className="space-y-4">
              {facturacion && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-card p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="text-sm font-semibold capitalize">{facturacion.plan ?? '—'}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Estado suscripción</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[facturacion.suscripcion_estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {facturacion.suscripcion_estado ?? '—'}
                      </span>
                    </div>
                    <div className="rounded-lg border bg-card p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Agendas activas</p>
                      <p className="text-sm font-semibold">{facturacion.agendas_count}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Monto mensual</p>
                      <p className="text-sm font-semibold">
                        {(PLAN_MONTO[facturacion.plan?.toLowerCase()] ?? 40000).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    {facturacion.billing_email && (
                      <div className="col-span-2 rounded-lg border bg-card p-3 space-y-1">
                        <p className="text-xs text-muted-foreground">Email de facturación</p>
                        <p className="text-sm">{facturacion.billing_email}</p>
                      </div>
                    )}
                    {facturacion.suscripcion_vence && (
                      <div className="col-span-2 rounded-lg border bg-card p-3 space-y-1">
                        <p className="text-xs text-muted-foreground">Vencimiento</p>
                        <p className="text-sm">{new Date(facturacion.suscripcion_vence).toLocaleDateString('es-AR')}</p>
                      </div>
                    )}
                  </div>

                  {/* Estado débito automático */}
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Débito automático MercadoPago</p>
                      {facturacion.mp_preapproval_status ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PREAPPROVAL_COLOR[facturacion.mp_preapproval_status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {facturacion.mp_preapproval_status}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Sin configurar</span>
                      )}
                    </div>

                    {initPoint && (
                      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 space-y-1">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Link de aprobación generado</p>
                        <a href={initPoint} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 underline break-all">
                          {initPoint}
                        </a>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        className="flex-1 h-9 text-sm"
                        disabled={generandoDebito}
                        onClick={generarDebito}
                      >
                        {generandoDebito ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        {facturacion.mp_preapproval_id ? 'Regenerar débito' : 'Generar débito automático'}
                      </Button>
                      {facturacion.mp_preapproval_id && (
                        <Button variant="outline" className="h-9 text-sm" disabled={generandoDebito} onClick={consultarDebito}>
                          Actualizar estado
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
