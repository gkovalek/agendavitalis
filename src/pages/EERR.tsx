import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Categoria = 'fijo' | 'variable' | 'gasto';

interface Costo {
  id: string;
  categoria: Categoria;
  nombre: string;
  monto: number;
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function toMesStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function FilaResultado({ label, valor, bold, color, separador }: {
  label: string; valor: number; bold?: boolean; color?: string; separador?: boolean;
}) {
  return (
    <>
      {separador && <tr><td colSpan={2}><div className="border-t border-border my-1" /></td></tr>}
      <tr>
        <td className={`py-1.5 text-[13px] ${bold ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</td>
        <td className={`py-1.5 text-[13px] text-right tabular-nums ${bold ? 'font-semibold' : ''}`} style={{ color }}>
          {fmt(valor)}
        </td>
      </tr>
    </>
  );
}

function SeccionCostos({
  titulo, categoria, costos, onAdd, onDelete, saving,
}: {
  titulo: string;
  categoria: Categoria;
  costos: Costo[];
  onAdd: (cat: Categoria, nombre: string, monto: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');

  const handleAdd = async () => {
    const m = parseFloat(monto);
    if (!nombre.trim() || isNaN(m) || m <= 0) return;
    await onAdd(categoria, nombre.trim(), m);
    setNombre('');
    setMonto('');
  };

  const items = costos.filter(c => c.categoria === categoria);
  const total = items.reduce((s, c) => s + c.monto, 0);

  const colorHeader: Record<Categoria, string> = {
    fijo: 'text-blue-700 dark:text-blue-400',
    variable: 'text-amber-700 dark:text-amber-400',
    gasto: 'text-red-600 dark:text-red-400',
  };

  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={`text-[12px] font-semibold uppercase tracking-wide ${colorHeader[categoria]}`}>{titulo}</h3>
          <span className="text-[12px] font-semibold text-foreground">{fmt(total)}</span>
        </div>

        {items.length > 0 && (
          <div className="space-y-1">
            {items.map(c => (
              <div key={c.id} className="flex items-center gap-2 group">
                <span className="flex-1 text-[13px] text-foreground truncate">{c.nombre}</span>
                <span className="text-[13px] tabular-nums text-muted-foreground shrink-0">{fmt(c.monto)}</span>
                <button
                  onClick={() => onDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <p className="text-[12px] text-muted-foreground/60 italic">Sin ítems cargados</p>
        )}

        {/* Formulario inline */}
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Concepto"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="h-8 text-[12px] flex-1 min-w-0"
            disabled={saving}
          />
          <Input
            type="number" min="0" placeholder="$"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="h-8 text-[12px] w-24 text-right"
            disabled={saving}
          />
          <Button size="sm" className="h-8 px-2 shrink-0" onClick={handleAdd} disabled={saving || !nombre.trim() || !monto}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EERR() {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const hoy = new Date();
  const [year, setYear] = useState(hoy.getFullYear());
  const [month, setMonth] = useState(hoy.getMonth() + 1);

  const mes = useMemo(() => toMesStr(year, month), [year, month]);

  const [costos, setCostos] = useState<Costo[]>([]);
  const [ingresos, setIngresos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!centroId) return;
    setLoading(true);

    const desde = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const hasta = `${mes}-${String(lastDay).padStart(2, '0')}`;

    const [costosRes, movRes] = await Promise.all([
      supabase.from('eerr_costos').select('id, categoria, nombre, monto')
        .eq('centro_id', centroId).eq('mes', mes).order('created_at'),
      supabase.from('caja_movimientos').select('monto_total')
        .eq('centro_id', centroId).gte('fecha', desde).lte('fecha', hasta),
    ]);

    setCostos((costosRes.data as Costo[]) ?? []);
    const total = ((movRes.data as any[]) ?? []).reduce((s, m) => s + (m.monto_total || 0), 0);
    setIngresos(total);
    setLoading(false);
  }, [centroId, mes, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async (categoria: Categoria, nombre: string, monto: number) => {
    setSaving(true);
    const { error } = await supabase.from('eerr_costos').insert({
      centro_id: centroId, mes, categoria, nombre, monto,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('eerr_costos').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } else {
      setCostos(prev => prev.filter(c => c.id !== id));
    }
  };

  const totalFijos = useMemo(() => costos.filter(c => c.categoria === 'fijo').reduce((s, c) => s + c.monto, 0), [costos]);
  const totalVariables = useMemo(() => costos.filter(c => c.categoria === 'variable').reduce((s, c) => s + c.monto, 0), [costos]);
  const totalGastos = useMemo(() => costos.filter(c => c.categoria === 'gasto').reduce((s, c) => s + c.monto, 0), [costos]);
  const totalEgresos = totalFijos + totalVariables + totalGastos;
  const resultado = ingresos - totalEgresos;

  const years = Array.from({ length: 3 }, (_, i) => hoy.getFullYear() - i);

  return (
    <div className="space-y-5 p-4 sm:p-6 animate-fade-in max-w-5xl mx-auto">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Estado de Resultados</h1>
          <p className="text-sm text-muted-foreground">{MESES[month - 1]} {year}</p>
        </div>
        {/* Selector mes/año */}
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="h-9 px-3 text-[13px] border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="h-9 px-3 text-[13px] border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Secciones de carga */}
          <div className="flex flex-col lg:flex-row gap-4">
            <SeccionCostos titulo="Costos Fijos" categoria="fijo" costos={costos} onAdd={handleAdd} onDelete={handleDelete} saving={saving} />
            <SeccionCostos titulo="Costos Variables" categoria="variable" costos={costos} onAdd={handleAdd} onDelete={handleDelete} saving={saving} />
            <SeccionCostos titulo="Gastos" categoria="gasto" costos={costos} onAdd={handleAdd} onDelete={handleDelete} saving={saving} />
          </div>

          {/* EERR */}
          <Card>
            <CardContent className="p-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Resultado del mes — {MESES[month - 1]} {year}
              </h2>
              <table className="w-full max-w-sm">
                <tbody>
                  <FilaResultado label="Ingresos" valor={ingresos} bold color="#0F6E56" />
                  <FilaResultado label="(-) Costos fijos" valor={totalFijos} separador />
                  <FilaResultado label="(-) Costos variables" valor={totalVariables} />
                  <FilaResultado label="(-) Gastos" valor={totalGastos} />
                  <FilaResultado label="Total egresos" valor={totalEgresos} bold separador />
                  <tr><td colSpan={2}><div className="border-t-2 border-foreground/20 my-1" /></td></tr>
                  <tr>
                    <td className="py-2 text-[15px] font-bold">Resultado</td>
                    <td className="py-2 text-right">
                      <span className={`inline-flex items-center gap-1.5 text-[15px] font-bold ${resultado >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {resultado >= 0
                          ? <TrendingUp className="w-4 h-4" />
                          : <TrendingDown className="w-4 h-4" />
                        }
                        {fmt(resultado)}
                      </span>
                    </td>
                  </tr>
                  {resultado < 0 && (
                    <tr>
                      <td colSpan={2} className="pb-1">
                        <p className="text-[11px] text-red-500">Los egresos superan los ingresos del mes.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Barra visual */}
              {ingresos > 0 && (
                <div className="mt-4 space-y-1.5 max-w-sm">
                  <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wide">
                    <span>Composición de egresos</span>
                    <span>{ingresos > 0 ? `${Math.round((totalEgresos / ingresos) * 100)}% de ingresos` : ''}</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden flex">
                    {totalFijos > 0 && (
                      <div className="h-full bg-blue-500" style={{ width: `${(totalFijos / ingresos) * 100}%` }} title={`Fijos: ${fmt(totalFijos)}`} />
                    )}
                    {totalVariables > 0 && (
                      <div className="h-full bg-amber-400" style={{ width: `${(totalVariables / ingresos) * 100}%` }} title={`Variables: ${fmt(totalVariables)}`} />
                    )}
                    {totalGastos > 0 && (
                      <div className="h-full bg-red-400" style={{ width: `${(totalGastos / ingresos) * 100}%` }} title={`Gastos: ${fmt(totalGastos)}`} />
                    )}
                  </div>
                  <div className="flex gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Fijos</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Variables</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Gastos</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
