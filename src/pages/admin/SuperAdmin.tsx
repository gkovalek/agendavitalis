import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Building2, Users, CreditCard, ShieldAlert, Percent, AlertTriangle, Cpu, DollarSign } from 'lucide-react';
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
    </div>
  );
}
