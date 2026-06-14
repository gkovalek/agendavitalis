import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TURNO_ESTADOS, TurnoEstado } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Profesional {
  id: string;
  nombre: string;
  apellido: string;
}

interface Movimiento {
  id: string;
  fecha: string;
  turno_id: string | null;
  monto_efectivo: number;
  monto_transferencia: number;
  monto_prepaga: number;
  paciente?: { nombre: string; apellido: string } | null;
  profesional?: { nombre: string; apellido: string } | null;
  turno?: { id: string; estado: TurnoEstado; servicio?: { nombre: string } | null } | null;
}

export default function Caja() {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [profFiltro, setProfFiltro] = useState<string>('todos');

  useEffect(() => {
    if (!centroId) return;
    supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido')
      .then(({ data }) => setProfesionales((data as Profesional[]) ?? []));
  }, [centroId]);

  useEffect(() => {
    if (!centroId) return;
    setLoading(true);
    let q = supabase.from('caja_movimientos')
      .select('id, fecha, turno_id, monto_efectivo, monto_transferencia, monto_prepaga, paciente:pacientes(nombre, apellido), profesional:profesionales(nombre, apellido), turno:turnos(id, estado, servicio:servicios(nombre))')
      .eq('fecha', fecha)
      .eq('centro_id', centroId)
      .order('created_at', { ascending: true });

    if (profFiltro !== 'todos') q = q.eq('profesional_id', profFiltro);

    q.then(({ data }) => {
      setMovimientos((data as any[]) ?? []);
      setLoading(false);
    });
  }, [fecha, centroId, profFiltro]);

  const handleEstadoChange = async (mov: Movimiento, nuevoEstado: TurnoEstado) => {
    if (!mov.turno_id) return;
    setUpdatingId(mov.id);
    const { error } = await supabase.from('turnos').update({ estado: nuevoEstado }).eq('id', mov.turno_id);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado', variant: 'destructive' });
    } else {
      setMovimientos(prev => prev.map(m =>
        m.id === mov.id && m.turno ? { ...m, turno: { ...m.turno, estado: nuevoEstado } } : m
      ));
    }
    setUpdatingId(null);
  };

  const fmt = (n: number) => `$${n.toLocaleString('es-AR')}`;

  const totals = useMemo(() => movimientos.reduce(
    (acc, m) => ({
      efectivo: acc.efectivo + (m.monto_efectivo || 0),
      transferencia: acc.transferencia + (m.monto_transferencia || 0),
      prepaga: acc.prepaga + (m.monto_prepaga || 0),
    }),
    { efectivo: 0, transferencia: 0, prepaga: 0 }
  ), [movimientos]);

  const totalGeneral = totals.efectivo + totals.transferencia + totals.prepaga;

  return (
    <div className="space-y-4 p-4 sm:p-6 animate-fade-in">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Caja del día</h1>
          <p className="text-sm text-muted-foreground">Movimientos y cobros registrados</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Fecha</Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-44 h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">Profesional</Label>
            <Select value={profFiltro} onValueChange={setProfFiltro}>
              <SelectTrigger className="w-52 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los profesionales</SelectItem>
                {profesionales.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Efectivo', value: totals.efectivo, color: 'text-emerald-700' },
          { label: 'Transferencia', value: totals.transferencia, color: 'text-blue-700' },
          { label: 'Obra social', value: totals.prepaga, color: 'text-purple-700' },
          { label: 'Total', value: totalGeneral, color: 'text-[#0F6E56]' },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="p-3 sm:p-4 text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{c.label}</p>
              <p className={`text-lg sm:text-xl font-bold mt-0.5 ${c.color}`}>{fmt(c.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabla */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : movimientos.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Sin movimientos para esta fecha</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-[11px] uppercase tracking-wide">Paciente</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide">Profesional</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide">Servicio</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-right">Efectivo</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-right">Transferencia</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-right">Obra social</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide text-right">Total</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wide">Estado turno</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.map(m => {
                    const total = (m.monto_efectivo || 0) + (m.monto_transferencia || 0) + (m.monto_prepaga || 0);
                    const estadoActual = m.turno?.estado ?? 'reservado';
                    const estadoCfg = TURNO_ESTADOS[estadoActual] ?? TURNO_ESTADOS.reservado;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-[13px]">
                          {m.paciente ? `${m.paciente.apellido}, ${m.paciente.nombre}` : '—'}
                        </TableCell>
                        <TableCell className="text-[13px]">
                          {m.profesional ? `${m.profesional.apellido}, ${m.profesional.nombre}` : '—'}
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">
                          {(m.turno as any)?.servicio?.nombre ?? '—'}
                        </TableCell>
                        <TableCell className="text-right text-[13px]">
                          {m.monto_efectivo > 0 ? fmt(m.monto_efectivo) : <span className="text-muted-foreground">$0</span>}
                        </TableCell>
                        <TableCell className="text-right text-[13px]">
                          {m.monto_transferencia > 0 ? fmt(m.monto_transferencia) : <span className="text-muted-foreground">$0</span>}
                        </TableCell>
                        <TableCell className="text-right text-[13px]">
                          {m.monto_prepaga > 0 ? fmt(m.monto_prepaga) : <span className="text-muted-foreground">$0</span>}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-[13px] text-[#0F6E56]">
                          {fmt(total)}
                        </TableCell>
                        <TableCell>
                          {m.turno_id ? (
                            <div className="relative">
                              {updatingId === m.id && (
                                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground z-10" />
                              )}
                              <Select
                                value={estadoActual}
                                onValueChange={v => handleEstadoChange(m, v as TurnoEstado)}
                                disabled={updatingId === m.id}
                              >
                                <SelectTrigger className="h-7 text-[11px] min-w-[130px]" style={{ borderColor: `${estadoCfg.color}60` }}>
                                  <SelectValue>
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: estadoCfg.color }} />
                                      {estadoCfg.label}
                                    </span>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(TURNO_ESTADOS).map(([key, val]) => (
                                    <SelectItem key={key} value={key}>
                                      <span className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: val.color }} />
                                        {val.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[12px]">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
