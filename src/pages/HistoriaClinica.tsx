import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Search, Plus, ArrowLeft, FileText, Calendar, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

interface EntradaHistoria {
  id: string;
  fecha: string;
  comentario_evolucion: string;
  created_at: string;
  paciente: { id: string; nombre: string; apellido: string; dni: string };
  profesional: { id: string; nombre: string; apellido: string; profesion_id: string | null };
}

interface VariablePlantilla {
  id: string;
  nombre_variable: string;
  tipo: 'texto' | 'numero' | 'lista' | 'booleano' | 'fecha';
  opciones: string[] | null;
  orden: number;
}

interface VariableValor {
  variable_id: string;
  nombre_variable: string;
  tipo: string;
  valor: string;
}

interface Profesional {
  id: string;
  nombre: string;
  apellido: string;
  profesion_id: string | null;
}

interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
}

const HOY = new Date().toISOString().split('T')[0];

export default function HistoriaClinica() {
  const { centroId } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [entradas, setEntradas] = useState<EntradaHistoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEntrada, setSelectedEntrada] = useState<EntradaHistoria | null>(null);
  const [variablesDetalle, setVariablesDetalle] = useState<VariableValor[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [pacientesSearch, setPacientesSearch] = useState('');
  const [pacientesSugeridos, setPacientesSugeridos] = useState<Paciente[]>([]);
  const [loadingPacientes, setLoadingPacientes] = useState(false);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [profesionalId, setProfesionalId] = useState('');
  const [fecha, setFecha] = useState(HOY);
  const [comentario, setComentario] = useState('');
  const [variables, setVariables] = useState<VariablePlantilla[]>([]);
  const [valoresVariables, setValoresVariables] = useState<Record<string, string>>({});
  const [loadingVariables, setLoadingVariables] = useState(false);
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchEntradas = useCallback(async () => {
    if (!centroId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('historia_clinica')
      .select(`
        id, fecha, comentario_evolucion, created_at,
        paciente:pacientes(id, nombre, apellido, dni),
        profesional:profesionales(id, nombre, apellido, profesion_id)
      `)
      .eq('centro_id', centroId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar las entradas clínicas.', variant: 'destructive' });
    } else {
      setEntradas((data ?? []) as unknown as EntradaHistoria[]);
    }
    setLoading(false);
  }, [centroId]);

  const fetchProfesionales = useCallback(async () => {
    if (!centroId) return;
    const { data } = await supabase
      .from('profesionales')
      .select('id, nombre, apellido, profesion_id')
      .eq('centro_id', centroId)
      .order('apellido');
    setProfesionales(data ?? []);
  }, [centroId]);

  useEffect(() => { fetchEntradas(); }, [fetchEntradas]);
  useEffect(() => { fetchProfesionales(); }, [fetchProfesionales]);

  const buscarPacientes = useCallback(async (term: string) => {
    if (!centroId || term.trim().length < 2) { setPacientesSugeridos([]); return; }
    setLoadingPacientes(true);
    const { data } = await supabase
      .from('pacientes')
      .select('id, nombre, apellido, dni')
      .eq('centro_id', centroId)
      .or(`nombre.ilike.%${term}%,apellido.ilike.%${term}%,dni.ilike.%${term}%`)
      .limit(8);
    setPacientesSugeridos(data ?? []);
    setLoadingPacientes(false);
  }, [centroId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { buscarPacientes(pacientesSearch); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [pacientesSearch, buscarPacientes]);

  const cargarVariables = async (profId: string) => {
    const prof = profesionales.find(p => p.id === profId);
    if (!prof?.profesion_id || !centroId) { setVariables([]); setValoresVariables({}); return; }
    setLoadingVariables(true);
    const { data } = await supabase
      .from('variables_clinicas_plantilla')
      .select('id, nombre_variable, tipo, opciones, orden')
      .eq('centro_id', centroId)
      .eq('profesion_id', prof.profesion_id)
      .eq('activo', true)
      .order('orden');
    const vars = (data ?? []) as VariablePlantilla[];
    setVariables(vars);
    const initVals: Record<string, string> = {};
    vars.forEach(v => { initVals[v.id] = v.tipo === 'booleano' ? 'false' : ''; });
    setValoresVariables(initVals);
    setLoadingVariables(false);
  };

  const handleProfesionalChange = (id: string) => {
    setProfesionalId(id);
    cargarVariables(id);
  };

  const cargarVariablesDetalle = async (entradaId: string) => {
    setLoadingDetalle(true);
    const { data } = await supabase
      .from('historia_clinica_variables')
      .select(`
        variable_id, valor,
        variable:variables_clinicas_plantilla(nombre_variable, tipo)
      `)
      .eq('historia_clinica_id', entradaId);

    const vars: VariableValor[] = (data ?? []).map((d: any) => ({
      variable_id: d.variable_id,
      nombre_variable: d.variable?.nombre_variable ?? '',
      tipo: d.variable?.tipo ?? '',
      valor: d.valor,
    }));
    setVariablesDetalle(vars);
    setLoadingDetalle(false);
  };

  const handleSeleccionarEntrada = (entrada: EntradaHistoria) => {
    setSelectedEntrada(entrada);
    setVariablesDetalle([]);
    cargarVariablesDetalle(entrada.id);
  };

  const resetDialog = () => {
    setPacientesSearch('');
    setPacientesSugeridos([]);
    setPacienteSeleccionado(null);
    setProfesionalId('');
    setFecha(HOY);
    setComentario('');
    setVariables([]);
    setValoresVariables({});
  };

  const handleOpenDialog = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const handleGuardar = async () => {
    if (!centroId || !pacienteSeleccionado || !profesionalId || !comentario.trim()) {
      toast({ title: 'Campos requeridos', description: 'Completá paciente, profesional y comentario de evolución.', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const { data: hc, error: hcErr } = await supabase
      .from('historia_clinica')
      .insert({
        centro_id: centroId,
        paciente_id: pacienteSeleccionado.id,
        profesional_id: profesionalId,
        fecha,
        comentario_evolucion: comentario.trim(),
      })
      .select('id')
      .single();

    if (hcErr || !hc) {
      toast({ title: 'Error', description: 'No se pudo guardar la entrada clínica.', variant: 'destructive' });
      setSaving(false);
      return;
    }

    const variablesAInsertar = variables
      .filter(v => valoresVariables[v.id] !== '' && valoresVariables[v.id] !== undefined)
      .map(v => ({
        historia_clinica_id: hc.id,
        variable_id: v.id,
        valor: valoresVariables[v.id],
      }));

    if (variablesAInsertar.length > 0) {
      const { error: varErr } = await supabase.from('historia_clinica_variables').insert(variablesAInsertar);
      if (varErr) {
        toast({ title: 'Advertencia', description: 'La entrada se guardó pero hubo un error con las variables clínicas.', variant: 'destructive' });
      }
    }

    toast({ title: 'Entrada guardada', description: 'La historia clínica fue registrada correctamente.' });
    setSaving(false);
    setDialogOpen(false);
    fetchEntradas();
  };

  const filtradas = entradas.filter(e => {
    const term = search.toLowerCase();
    if (!term) return true;
    const nombrePaciente = `${e.paciente?.apellido} ${e.paciente?.nombre}`.toLowerCase();
    const nombreProf = `${e.profesional?.apellido} ${e.profesional?.nombre}`.toLowerCase();
    return nombrePaciente.includes(term) || nombreProf.includes(term);
  });

  const formatFecha = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const renderValorVariable = (v: VariableValor) => {
    if (v.tipo === 'booleano') return v.valor === 'true' ? 'Sí' : 'No';
    if (v.tipo === 'fecha' && v.valor) return formatFecha(v.valor);
    return v.valor || '—';
  };

  const renderCampoVariable = (v: VariablePlantilla) => {
    const val = valoresVariables[v.id] ?? '';
    const set = (newVal: string) => setValoresVariables(prev => ({ ...prev, [v.id]: newVal }));

    switch (v.tipo) {
      case 'texto':
        return <Input value={val} onChange={e => set(e.target.value)} placeholder={v.nombre_variable} />;
      case 'numero':
        return <Input type="number" value={val} onChange={e => set(e.target.value)} placeholder={v.nombre_variable} />;
      case 'fecha':
        return <Input type="date" value={val} onChange={e => set(e.target.value)} />;
      case 'booleano':
        return (
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={val === 'true'} onCheckedChange={checked => set(checked ? 'true' : 'false')} />
            <span className="text-sm text-muted-foreground">{val === 'true' ? 'Sí' : 'No'}</span>
          </div>
        );
      case 'lista':
        return (
          <Select value={val} onValueChange={set}>
            <SelectTrigger><SelectValue placeholder="Seleccioná una opción" /></SelectTrigger>
            <SelectContent>
              {(v.opciones ?? []).map(op => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return <Input value={val} onChange={e => set(e.target.value)} />;
    }
  };

  const PanelDetalle = () => {
    if (!selectedEntrada) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground gap-3">
          <FileText className="w-10 h-10 opacity-30" />
          <p className="text-sm">Seleccioná una entrada para ver el detalle</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {isMobile && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedEntrada(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver
          </Button>
        )}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-lg font-bold text-foreground">
            <User className="w-5 h-5 text-[#00ADBB]" />
            {selectedEntrada.paciente?.apellido}, {selectedEntrada.paciente?.nombre}
          </div>
          {selectedEntrada.paciente?.dni && (
            <p className="text-xs text-muted-foreground ml-7">DNI {selectedEntrada.paciente.dni}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>{formatFecha(selectedEntrada.fecha)}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span>
              {selectedEntrada.profesional?.apellido}, {selectedEntrada.profesional?.nombre}
            </span>
          </div>
        </div>
        <Separator />
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Evolución</p>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {selectedEntrada.comentario_evolucion}
          </p>
        </div>
        {loadingDetalle ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[#00ADBB]" /></div>
        ) : variablesDetalle.length > 0 ? (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Variables clínicas</p>
              <div className="space-y-1">
                {variablesDetalle.map(v => (
                  <div key={v.variable_id} className="flex justify-between text-sm gap-2">
                    <span className="text-muted-foreground shrink-0">{v.nombre_variable}</span>
                    <span className="font-medium text-foreground text-right">{renderValorVariable(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  };

  if (isMobile && selectedEntrada) {
    return (
      <div className="space-y-4 animate-fade-in px-1 py-2">
        <PanelDetalle />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Historia Clínica</h1>
          <p className="text-sm text-muted-foreground">{entradas.length} entradas registradas</p>
        </div>
        <Button
          onClick={handleOpenDialog}
          className="w-full sm:w-auto"
          style={{ backgroundColor: '#00ADBB', borderColor: '#00ADBB' }}
        >
          <Plus className="w-4 h-4 mr-2" /> Nueva Entrada
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        <Card className="shadow-sm lg:col-span-2">
          <div className="p-3 sm:p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar paciente o profesional..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#00ADBB]" />
              </div>
            ) : filtradas.length === 0 ? (
              <p className="text-center py-10 text-muted-foreground text-sm">No se encontraron entradas</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="divide-y">
                  {filtradas.map(e => (
                    <button
                      key={e.id}
                      onClick={() => handleSeleccionarEntrada(e)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selectedEntrada?.id === e.id ? 'bg-muted' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm truncate">
                            {e.paciente?.apellido}, {e.paciente?.nombre}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {e.profesional?.apellido}, {e.profesional?.nombre}
                          </p>
                          {e.comentario_evolucion && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                              {e.comentario_evolucion}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                          {formatFecha(e.fecha)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {!isMobile && (
          <Card className="shadow-sm lg:col-span-3">
            <CardContent className="p-4 sm:p-6">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <PanelDetalle />
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) resetDialog(); setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-lg w-full">
          <DialogHeader>
            <DialogTitle>Nueva Entrada Clínica</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-2">
            <div className="space-y-4 pb-2">
              <div className="space-y-1">
                <Label>Paciente *</Label>
                {pacienteSeleccionado ? (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/50">
                    <span className="text-sm font-medium">
                      {pacienteSeleccionado.apellido}, {pacienteSeleccionado.nombre}
                      {pacienteSeleccionado.dni ? ` · DNI ${pacienteSeleccionado.dni}` : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground"
                      onClick={() => { setPacienteSeleccionado(null); setPacientesSearch(''); setPacientesSugeridos([]); }}
                    >
                      Cambiar
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nombre o DNI..."
                        className="pl-9"
                        value={pacientesSearch}
                        onChange={e => setPacientesSearch(e.target.value)}
                      />
                      {loadingPacientes && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {pacientesSugeridos.length > 0 && (
                      <div className="border rounded-md divide-y shadow-sm bg-background">
                        {pacientesSugeridos.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                            onClick={() => { setPacienteSeleccionado(p); setPacientesSearch(''); setPacientesSugeridos([]); }}
                          >
                            <span className="font-medium">{p.apellido}, {p.nombre}</span>
                            {p.dni && <span className="text-muted-foreground ml-2 text-xs">DNI {p.dni}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {pacientesSearch.length >= 2 && !loadingPacientes && pacientesSugeridos.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1">No se encontraron pacientes.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label>Profesional *</Label>
                <Select value={profesionalId} onValueChange={handleProfesionalChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná un profesional" />
                  </SelectTrigger>
                  <SelectContent>
                    {profesionales.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.apellido}, {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Fecha *</Label>
                <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Comentario de evolución *</Label>
                <Textarea
                  placeholder="Describí la evolución del paciente..."
                  className="min-h-[100px] resize-none"
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                />
              </div>

              {loadingVariables ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-[#00ADBB]" />
                </div>
              ) : variables.length > 0 ? (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-sm font-medium text-foreground">Variables clínicas</p>
                  {variables.map(v => (
                    <div key={v.id} className="space-y-1">
                      <Label className="text-sm">{v.nombre_variable}</Label>
                      {renderCampoVariable(v)}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleGuardar}
                  disabled={saving || !pacienteSeleccionado || !profesionalId || !comentario.trim()}
                  className="flex-1"
                  style={{ backgroundColor: '#00ADBB', borderColor: '#00ADBB' }}
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
                <Button variant="outline" onClick={() => { resetDialog(); setDialogOpen(false); }} className="flex-1">
                  Cancelar
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
