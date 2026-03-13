import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { CENTRO_ID } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface Movimiento {
  id: string;
  fecha: string;
  monto_efectivo: number;
  monto_transferencia: number;
  monto_prepaga: number;
  total: number;
  paciente?: { nombre: string; apellido: string };
  profesional?: { nombre: string; apellido: string };
}

export default function Caja() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('caja_movimientos')
        .select('*, paciente:pacientes(nombre, apellido), profesional:profesionales(nombre, apellido)')
        .eq('fecha', fecha)
        .eq('centro_id', CENTRO_ID)
        .order('created_at', { ascending: true });
      setMovimientos((data as any[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [fecha]);

  const totals = useMemo(() => {
    return movimientos.reduce(
      (acc, m) => ({
        efectivo: acc.efectivo + (m.monto_efectivo || 0),
        transferencia: acc.transferencia + (m.monto_transferencia || 0),
        prepaga: acc.prepaga + (m.monto_prepaga || 0),
        total: acc.total + (m.total || 0),
      }),
      { efectivo: 0, transferencia: 0, prepaga: 0, total: 0 }
    );
  }, [movimientos]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Caja</h1>
          <p className="text-muted-foreground">Movimientos del día</p>
        </div>
        <div className="space-y-1">
          <Label>Fecha</Label>
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-44" />
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Profesional</TableHead>
                    <TableHead className="text-right">Efectivo</TableHead>
                    <TableHead className="text-right">Transferencia</TableHead>
                    <TableHead className="text-right">Prepaga</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin movimientos para esta fecha</TableCell></TableRow>
                  ) : (
                    <>
                      {movimientos.map(m => (
                        <TableRow key={m.id}>
                          <TableCell>{m.paciente ? `${m.paciente.apellido}, ${m.paciente.nombre}` : '—'}</TableCell>
                          <TableCell>{m.profesional ? `${m.profesional.apellido}, ${m.profesional.nombre}` : '—'}</TableCell>
                          <TableCell className="text-right">${m.monto_efectivo || 0}</TableCell>
                          <TableCell className="text-right">${m.monto_transferencia || 0}</TableCell>
                          <TableCell className="text-right">${m.monto_prepaga || 0}</TableCell>
                          <TableCell className="text-right font-semibold">${m.total || 0}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={2} className="text-right">Totales del día</TableCell>
                        <TableCell className="text-right">${totals.efectivo}</TableCell>
                        <TableCell className="text-right">${totals.transferencia}</TableCell>
                        <TableCell className="text-right">${totals.prepaga}</TableCell>
                        <TableCell className="text-right">${totals.total}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
