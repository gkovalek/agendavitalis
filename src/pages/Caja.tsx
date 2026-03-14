import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface Movimiento {
  id: string;
  fecha: string;
  monto_efectivo: number;
  monto_transferencia: number;
  monto_prepaga: number;
  monto_total: number;
  paciente?: { nombre: string; apellido: string };
  profesional?: { nombre: string; apellido: string };
}

export default function Caja() {
  const { centroId } = useAuth();
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const isMobile = useIsMobile();

  useEffect(() => {
    const fetch = async () => {
      if (!centroId) return;
      setLoading(true);
      const { data } = await supabase.from('caja_movimientos')
        .select('*, paciente:pacientes(nombre, apellido), profesional:profesionales(nombre, apellido)')
        .eq('fecha', fecha).eq('centro_id', centroId).order('created_at', { ascending: true });
      setMovimientos((data as any[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [fecha, centroId]);

  const totals = useMemo(() => movimientos.reduce(
    (acc, m) => ({ efectivo: acc.efectivo + (m.monto_efectivo || 0), transferencia: acc.transferencia + (m.monto_transferencia || 0), prepaga: acc.prepaga + (m.monto_prepaga || 0), total: acc.total + (m.monto_total || 0) }),
    { efectivo: 0, transferencia: 0, prepaga: 0, total: 0 }
  ), [movimientos]);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-xl sm:text-2xl font-bold text-foreground">Caja</h1><p className="text-sm text-muted-foreground">Movimientos del día</p></div>
        <div className="space-y-1"><Label>Fecha</Label><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full sm:w-44" /></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Efectivo</p><p className="text-lg font-bold text-foreground">${totals.efectivo}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Transferencia</p><p className="text-lg font-bold text-foreground">${totals.transferencia}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Prepaga</p><p className="text-lg font-bold text-foreground">${totals.prepaga}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-bold text-primary">${totals.total}</p></CardContent></Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : movimientos.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Sin movimientos para esta fecha</p>
          ) : isMobile ? (
            <div className="divide-y">
              {movimientos.map(m => (
                <div key={m.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground text-sm">{m.paciente ? `${m.paciente.apellido}, ${m.paciente.nombre}` : '—'}</p>
                    <p className="font-semibold text-foreground">${m.monto_total || 0}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {m.profesional && <span>{m.profesional.apellido}</span>}
                    {(m.monto_efectivo > 0) && <span>Efec: ${m.monto_efectivo}</span>}
                    {(m.monto_transferencia > 0) && <span>Transf: ${m.monto_transferencia}</span>}
                    {(m.monto_prepaga > 0) && <span>Prep: ${m.monto_prepaga}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>Profesional</TableHead><TableHead className="text-right">Efectivo</TableHead><TableHead className="text-right">Transferencia</TableHead><TableHead className="text-right">Prepaga</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {movimientos.map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{m.paciente ? `${m.paciente.apellido}, ${m.paciente.nombre}` : '—'}</TableCell>
                      <TableCell>{m.profesional ? `${m.profesional.apellido}, ${m.profesional.nombre}` : '—'}</TableCell>
                      <TableCell className="text-right">${m.monto_efectivo || 0}</TableCell>
                      <TableCell className="text-right">${m.monto_transferencia || 0}</TableCell>
                      <TableCell className="text-right">${m.monto_prepaga || 0}</TableCell>
                      <TableCell className="text-right font-semibold">${m.monto_total || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
