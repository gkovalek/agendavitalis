import { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ObraSocial {
  id: string;
  codigo: string;
  nombre: string;
  valor_sesion: number;
  profesional_id: string;
}

interface Turno {
  id: string;
  fecha: string;
  profesional_id: string;
  paciente: {
    nombre: string;
    apellido: string;
    obra_social_id: string | null;
    prepaga_id: string | null;
  } | null;
  profesional: { nombre: string; apellido: string } | null;
}

interface FilaLiquidacion {
  obra_social_id: string;
  codigo: string;
  nombre: string;
  profesional: string;
  sesiones: number;
  valor_sesion: number;
  total: number;
  pacientes: Set<string>;
  sin_valor: boolean;
}

interface TurnoSinOS {
  paciente: string;
  fecha: string;
  profesional: string;
}

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

function fmt(n: number) {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LiquidacionOS() {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth()); // 0-indexed
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [profFilter, setProfFilter] = useState<string>('todos');
  const [loading, setLoading] = useState(false);

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [obrasSociales, setObrasSociales] = useState<ObraSocial[]>([]);
  const [profesionales, setProfesionales] = useState<{ id: string; nombre: string; apellido: string }[]>([]);
  const [prepagas, setPrepagas] = useState<{ id: string; nombre: string; codigo: string | null }[]>([]);

  useEffect(() => {
    if (!centroId) return;
    Promise.all([
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
      supabase.from('obras_sociales').select('id, codigo, nombre, valor_sesion, profesional_id').eq('centro_id', centroId).eq('activa', true),
      supabase.from('prepagas').select('id, nombre, codigo'),
    ]).then(([profRes, osRes, prepRes]) => {
      setProfesionales((profRes.data as any[]) ?? []);
      setObrasSociales((osRes.data as ObraSocial[]) ?? []);
      setPrepagas((prepRes.data as any[]) ?? []);
    });
  }, [centroId]);

  useEffect(() => {
    if (!centroId) return;
    fetchTurnos();
  }, [centroId, mes, anio]);

  const fetchTurnos = async () => {
    setLoading(true);
    const desde = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
    const hasta = new Date(anio, mes + 1, 0);
    const hastaStr = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(hasta.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('turnos')
      .select(`
        id, fecha, profesional_id,
        paciente:pacientes(nombre, apellido, obra_social_id, prepaga_id),
        profesional:profesionales(nombre, apellido)
      `)
      .eq('centro_id', centroId!)
      .eq('estado', 'finalizado')
      .gte('fecha', desde)
      .lte('fecha', hastaStr)
      .order('fecha');

    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setTurnos((data as any[]) ?? []);
    setLoading(false);
  };

  // Mapeo prepaga_id → codigo via prepagas table
  const prepagaCodigoMap = useMemo(() => {
    const m: Record<string, string> = {};
    prepagas.forEach(p => { if (p.codigo) m[p.id] = p.codigo; });
    return m;
  }, [prepagas]);

  // Mapeo obra_social_id directo
  const osMap = useMemo(() => {
    const m: Record<string, ObraSocial> = {};
    obrasSociales.forEach(os => { m[os.id] = os; });
    return m;
  }, [obrasSociales]);

  // Buscar OS por codigo + profesional_id (fallback cuando no hay obra_social_id directo)
  const findOS = (codigoOrNombre: string | null, profId: string): ObraSocial | null => {
    if (!codigoOrNombre) return null;
    // intentar por codigo exacto
    const byCode = obrasSociales.find(os => os.codigo === codigoOrNombre && os.profesional_id === profId);
    if (byCode) return byCode;
    // intentar por nombre parcial
    const norm = codigoOrNombre.toLowerCase();
    return obrasSociales.find(os =>
      os.profesional_id === profId &&
      (os.nombre.toLowerCase().includes(norm) || norm.includes(os.nombre.toLowerCase().slice(0, 6)))
    ) ?? null;
  };

  const { filas, sinOS, sinValor } = useMemo(() => {
    const mapa: Record<string, FilaLiquidacion> = {};
    const sinOSList: TurnoSinOS[] = [];
    const sinValorSet = new Set<string>();

    const filtrados = profFilter === 'todos'
      ? turnos
      : turnos.filter(t => t.profesional_id === profFilter);

    filtrados.forEach(t => {
      const pac = t.paciente;
      if (!pac) { sinOSList.push({ paciente: '—', fecha: t.fecha, profesional: '—' }); return; }

      const pacNombre = `${pac.apellido}, ${pac.nombre}`;
      const profNombre = t.profesional ? `${t.profesional.apellido}, ${t.profesional.nombre}` : '—';

      // Resolver la obra social del turno
      let os: ObraSocial | null = null;

      // 1. Si el paciente tiene obra_social_id directo (nueva forma)
      if (pac.obra_social_id && osMap[pac.obra_social_id]) {
        os = osMap[pac.obra_social_id];
      }
      // 2. Fallback: usar prepaga_id → prepagas.codigo → obras_sociales
      else if (pac.prepaga_id) {
        const codigo = prepagaCodigoMap[pac.prepaga_id];
        if (codigo) {
          os = findOS(codigo, t.profesional_id);
        }
        if (!os) {
          // intentar por nombre de prepaga
          const prepaga = prepagas.find(p => p.id === pac.prepaga_id);
          if (prepaga) os = findOS(prepaga.nombre, t.profesional_id);
        }
      }

      if (!os) {
        sinOSList.push({ paciente: pacNombre, fecha: t.fecha, profesional: profNombre });
        return;
      }

      const key = `${os.id}`;
      if (!mapa[key]) {
        mapa[key] = {
          obra_social_id: os.id,
          codigo: os.codigo,
          nombre: os.nombre,
          profesional: profNombre,
          sesiones: 0,
          valor_sesion: os.valor_sesion,
          total: 0,
          pacientes: new Set(),
          sin_valor: os.valor_sesion === 0,
        };
      }
      mapa[key].sesiones += 1;
      mapa[key].total += os.valor_sesion;
      mapa[key].pacientes.add(pacNombre);
      if (os.valor_sesion === 0) sinValorSet.add(os.nombre);
    });

    const filas = Object.values(mapa).sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { filas, sinOS: sinOSList, sinValor: Array.from(sinValorSet) };
  }, [turnos, profFilter, osMap, prepagaCodigoMap, prepagas, obrasSociales]);

  const totales = useMemo(() => ({
    sesiones: filas.reduce((s, f) => s + f.sesiones, 0),
    total: filas.reduce((s, f) => s + f.total, 0),
  }), [filas]);

  const handleExport = () => {
    const profNombre = profFilter === 'todos'
      ? 'Todos los profesionales'
      : (() => { const p = profesionales.find(p => p.id === profFilter); return p ? `${p.apellido} ${p.nombre}` : ''; })();

    const data = filas.map(f => ({
      'Código': f.codigo,
      'Obra Social': f.nombre,
      'Profesional': f.profesional,
      'Pacientes únicos': f.pacientes.size,
      'Sesiones': f.sesiones,
      'Valor x sesión': f.valor_sesion,
      'Total': f.total,
    }));

    // Fila de totales
    data.push({
      'Código': '',
      'Obra Social': 'TOTAL',
      'Profesional': '',
      'Pacientes únicos': 0,
      'Sesiones': totales.sesiones,
      'Valor x sesión': 0,
      'Total': totales.total,
    });

    const ws = XLSX.utils.json_to_sheet(data);

    // Ancho de columnas
    ws['!cols'] = [
      { wch: 8 }, { wch: 40 }, { wch: 25 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidación OS');

    // Hoja de detalle (turnos sin OS)
    if (sinOS.length > 0) {
      const wsSinOS = XLSX.utils.json_to_sheet(sinOS.map(s => ({
        'Paciente': s.paciente, 'Fecha': s.fecha, 'Profesional': s.profesional,
      })));
      XLSX.utils.book_append_sheet(wb, wsSinOS, 'Sin OS asignada');
    }

    const filename = `LiquidacionOS_${MESES[mes]}_${anio}_${profNombre.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast({ title: 'Excel descargado', description: filename });
  };

  const anios = [hoy.getFullYear() - 1, hoy.getFullYear()];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Liquidación de Obras Sociales</h1>
          <p className="text-sm text-muted-foreground">Honorarios del mes según turnos finalizados</p>
        </div>
        <Button
          onClick={handleExport}
          disabled={loading || filas.length === 0}
          className="w-full sm:w-auto bg-[#0F6E56] hover:bg-[#0a5542]"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={String(anio)} onValueChange={v => setAnio(Number(v))}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anios.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={profFilter} onValueChange={setProfFilter}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="Todos los profesionales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los profesionales</SelectItem>
            {profesionales.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Obras sociales</p>
          <p className="text-2xl font-bold">{filas.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total sesiones</p>
          <p className="text-2xl font-bold">{totales.sesiones}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total a cobrar</p>
          <p className="text-2xl font-bold text-[#0F6E56]">{fmt(totales.total)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Sin OS / sin valor</p>
          <p className="text-2xl font-bold text-amber-500">{sinOS.length + sinValor.length}</p>
        </CardContent></Card>
      </div>

      {/* Alertas */}
      {sinValor.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">OS sin valor configurado — sesiones contabilizadas en $0:</p>
            <p className="text-xs mt-0.5">{sinValor.join(' · ')}</p>
            <p className="text-xs mt-1">Editá el valor en <strong>Obras Sociales → Gestión</strong>.</p>
          </div>
        </div>
      )}
      {sinOS.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p><strong>{sinOS.length} turno{sinOS.length > 1 ? 's' : ''}</strong> sin obra social identificada (paciente sin OS o sin coincidir). Se excluyen del cálculo.</p>
        </div>
      )}

      {/* Tabla principal */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filas.length === 0 && !loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
          No hay turnos finalizados con obra social en {MESES[mes]} {anio}.
        </CardContent></Card>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Cód.</TableHead>
                  <TableHead>Obra Social</TableHead>
                  {profFilter === 'todos' && <TableHead>Profesional</TableHead>}
                  <TableHead className="text-center w-24">Pacientes</TableHead>
                  <TableHead className="text-center w-24">Sesiones</TableHead>
                  <TableHead className="text-right w-32">Valor/ses.</TableHead>
                  <TableHead className="text-right w-32">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map(f => (
                  <TableRow key={f.obra_social_id} className={f.sin_valor ? 'opacity-60' : ''}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{f.codigo}</TableCell>
                    <TableCell className="font-medium">
                      {f.nombre}
                      {f.sin_valor && <Badge variant="outline" className="ml-2 text-[10px] text-amber-600 border-amber-300">sin valor</Badge>}
                    </TableCell>
                    {profFilter === 'todos' && <TableCell className="text-sm text-muted-foreground">{f.profesional}</TableCell>}
                    <TableCell className="text-center text-sm">{f.pacientes.size}</TableCell>
                    <TableCell className="text-center font-semibold">{f.sesiones}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{fmt(f.valor_sesion)}</TableCell>
                    <TableCell className="text-right font-semibold text-[#0F6E56]">{fmt(f.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Fila total */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-zinc-50 dark:bg-zinc-900">
              <span className="text-sm font-semibold text-foreground">TOTAL {MESES[mes].toUpperCase()} {anio}</span>
              <div className="flex items-center gap-8">
                <span className="text-sm text-muted-foreground">{totales.sesiones} sesiones</span>
                <span className="text-lg font-bold text-[#0F6E56]">{fmt(totales.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
