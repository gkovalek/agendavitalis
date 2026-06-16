import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Search, Plus, ArrowLeft, FileText, Calendar, User, LayoutTemplate, Trash2, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { PacienteAutocomplete, PacienteOption } from '@/components/PacienteAutocomplete';

/* ─────────────────── Interfaces ─────────────────── */
interface EntradaHistoria {
  id: string;
  fecha: string;
  comentario_evolucion: string;
  comentarios_extras: string | null;
  variables_json: Record<string, string> | null;
  ficha_modelo_id: string | null;
  created_at: string;
  paciente: { id: string; nombre: string; apellido: string; dni: string };
  profesional: { id: string; nombre: string; apellido: string };
  ficha_modelo?: { nombre: string } | null;
}

interface FichaModelo {
  id: string;
  nombre: string;
  variables?: FichaVariable[];
}

interface FichaVariable {
  id: string;
  nombre_variable: string;
  orden: number;
}

interface Profesional { id: string; nombre: string; apellido: string; }
interface Paciente { id: string; nombre: string; apellido: string; dni: string; }

const HOY = new Date().toISOString().split('T')[0];

/* ═══════════════════════════════════════════════════ */
export default function HistoriaClinica() {
  const { centroId } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Lista de entradas
  const [entradas, setEntradas] = useState<EntradaHistoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEntrada, setSelectedEntrada] = useState<EntradaHistoria | null>(null);

  // Dialog nueva entrada
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<PacienteOption | null>(null);
  const [resetAutocomplete, setResetAutocomplete] = useState(0);
  const [profesionalId, setProfesionalId] = useState('');
  const [fecha, setFecha] = useState(HOY);
  const [fichaModeloId, setFichaModeloId] = useState('');
  const [fichasDisponibles, setFichasDisponibles] = useState<FichaModelo[]>([]);
  const [fichaVariables, setFichaVariables] = useState<FichaVariable[]>([]);
  const [valoresVariables, setValoresVariables] = useState<Record<string, string>>({});
  const [comentariosExtras, setComentariosExtras] = useState('');
  const [saving, setSaving] = useState(false);

  // Dialog crear ficha modelo
  const [fichaDialogOpen, setFichaDialogOpen] = useState(false);
  const [fichaForm, setFichaForm] = useState({ nombre: '' });
  const [fichaVarsForm, setFichaVarsForm] = useState<{ nombre: string }[]>([{ nombre: '' }]);
  const [savingFicha, setSavingFicha] = useState(false);


  /* ─── Fetching ─── */
  const fetchEntradas = useCallback(async () => {
    if (!centroId) return;
    setLoading(true);
    const { data } = await supabase
      .from('historia_clinica')
      .select(`
        id, fecha, comentario_evolucion, comentarios_extras, variables_json, ficha_modelo_id, created_at,
        paciente:pacientes(id, nombre, apellido, dni),
        profesional:profesionales(id, nombre, apellido),
        ficha_modelo:fichas_modelo(nombre)
      `)
      .eq('centro_id', centroId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    setEntradas((data ?? []) as unknown as EntradaHistoria[]);
    setLoading(false);
  }, [centroId]);

  const fetchFichas = useCallback(async () => {
    if (!centroId) return;
    const { data } = await supabase
      .from('fichas_modelo')
      .select('id, nombre')
      .eq('centro_id', centroId)
      .order('nombre');
    setFichasDisponibles((data ?? []) as FichaModelo[]);
  }, [centroId]);

  const fetchProfesionales = useCallback(async () => {
    if (!centroId) return;
    const { data } = await supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido');
    setProfesionales(data ?? []);
  }, [centroId]);

  useEffect(() => { fetchEntradas(); }, [fetchEntradas]);
  useEffect(() => { fetchFichas(); }, [fetchFichas]);
  useEffect(() => { fetchProfesionales(); }, [fetchProfesionales]);


  /* ─── Cambio de ficha modelo ─── */
  const handleFichaChange = async (fichaId: string) => {
    setFichaModeloId(fichaId);
    setValoresVariables({});
    if (!fichaId) { setFichaVariables([]); return; }
    const { data } = await supabase
      .from('fichas_modelo_variables')
      .select('id, nombre_variable, orden')
      .eq('ficha_modelo_id', fichaId)
      .order('orden');
    const vars = (data ?? []) as FichaVariable[];
    setFichaVariables(vars);
    const init: Record<string, string> = {};
    vars.forEach(v => { init[v.id] = ''; });
    setValoresVariables(init);
  };

  /* ─── Guardar entrada ─── */
  const resetDialog = () => {
    setPacienteSeleccionado(null);
    setResetAutocomplete(n => n + 1);
    setProfesionalId(''); setFecha(HOY); setFichaModeloId(''); setFichaVariables([]);
    setValoresVariables({}); setComentariosExtras('');
  };

  const handleGuardar = async () => {
    if (!centroId || !profesionalId || !pacienteSeleccionado) {
      toast({ title: 'Campos requeridos', description: 'Seleccioná el paciente y el profesional.', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // Construir variables_json desde los valores ingresados
    const variablesJson: Record<string, string> = {};
    fichaVariables.forEach(v => { if (valoresVariables[v.id]) variablesJson[v.nombre_variable] = valoresVariables[v.id]; });

    const { error } = await supabase.from('historia_clinica').insert({
      centro_id: centroId,
      paciente_id: pacienteSeleccionado.id,
      profesional_id: profesionalId,
      fecha,
      comentario_evolucion: comentariosExtras.trim() || '',
      comentarios_extras: comentariosExtras.trim() || null,
      variables_json: Object.keys(variablesJson).length > 0 ? variablesJson : null,
      ficha_modelo_id: fichaModeloId || null,
    });

    if (error) {
      toast({ title: 'Error', description: 'No se pudo guardar la entrada clínica.', variant: 'destructive' });
    } else {
      toast({ title: 'Entrada guardada' });
      setDialogOpen(false);
      resetDialog();
      fetchEntradas();
    }
    setSaving(false);
  };

  /* ─── Guardar ficha modelo ─── */
  const resetFichaDialog = () => {
    setFichaForm({ nombre: '' });
    setFichaVarsForm([{ nombre: '' }]);
  };

  const handleGuardarFicha = async () => {
    if (!centroId || !fichaForm.nombre.trim()) return;
    const validVars = fichaVarsForm.filter(v => v.nombre.trim());
    if (validVars.length === 0) {
      toast({ title: 'Sin variables', description: 'Agregá al menos una variable a la ficha.', variant: 'destructive' });
      return;
    }
    setSavingFicha(true);

    const { data: fichaData, error: fichaErr } = await supabase
      .from('fichas_modelo')
      .insert({ centro_id: centroId, nombre: fichaForm.nombre.trim() })
      .select('id').single();

    if (fichaErr || !fichaData) {
      toast({ title: 'Error', description: fichaErr?.message, variant: 'destructive' });
      setSavingFicha(false);
      return;
    }

    const varsPayload = validVars.map((v, i) => ({
      ficha_modelo_id: fichaData.id,
      nombre_variable: v.nombre.trim(),
      orden: i,
    }));

    const { error: varErr } = await supabase.from('fichas_modelo_variables').insert(varsPayload);
    if (varErr) {
      toast({ title: 'Error guardando variables', description: varErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'Ficha modelo creada', description: `"${fichaForm.nombre}" disponible al crear entradas.` });
      setFichaDialogOpen(false);
      resetFichaDialog();
      fetchFichas();
    }
    setSavingFicha(false);
  };

  /* ─── Helpers ─── */
  const filtradas = entradas.filter(e => {
    const term = search.toLowerCase();
    if (!term) return true;
    const nombre = `${e.paciente?.apellido} ${e.paciente?.nombre}`.toLowerCase();
    const prof = `${e.profesional?.apellido} ${e.profesional?.nombre}`.toLowerCase();
    return nombre.includes(term) || prof.includes(term);
  });

  const formatFecha = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

  /* ─── Panel detalle ─── */
  const PanelDetalle = () => {
    if (!selectedEntrada) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground gap-3">
          <FileText className="w-10 h-10 opacity-30" />
          <p className="text-sm">Seleccioná una entrada para ver el detalle</p>
        </div>
      );
    }
    const vars = selectedEntrada.variables_json;
    return (
      <div className="space-y-4">
        {isMobile && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedEntrada(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Volver
          </Button>
        )}

        {/* Encabezado */}
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
            <span>{selectedEntrada.profesional?.apellido}, {selectedEntrada.profesional?.nombre}</span>
          </div>
          {selectedEntrada.ficha_modelo?.nombre && (
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4" />
              <span className="text-[#00ADBB] font-medium">{selectedEntrada.ficha_modelo.nombre}</span>
            </div>
          )}
        </div>

        {/* Variables de la ficha */}
        {vars && Object.keys(vars).length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Variables clínicas</p>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(vars).map(([nombre, valor]) => (
                  <div key={nombre} className="flex justify-between items-start gap-3 py-1.5 border-b border-dashed border-zinc-100 last:border-0">
                    <span className="text-sm text-muted-foreground shrink-0 min-w-[140px]">{nombre}</span>
                    <span className="text-sm font-medium text-foreground text-right">{valor || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Comentarios extras / evolución */}
        {(selectedEntrada.comentarios_extras || selectedEntrada.comentario_evolucion) && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Comentarios extras</p>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {selectedEntrada.comentarios_extras || selectedEntrada.comentario_evolucion}
              </p>
            </div>
          </>
        )}
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
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Historia Clínica</h1>
          <p className="text-sm text-muted-foreground">{entradas.length} entradas registradas</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => { resetFichaDialog(); setFichaDialogOpen(true); }}
            className="gap-2"
          >
            <LayoutTemplate className="w-4 h-4" /> Crear ficha modelo
          </Button>
          <Button
            onClick={() => { resetDialog(); setDialogOpen(true); }}
            className="gap-2"
            style={{ backgroundColor: '#00ADBB', borderColor: '#00ADBB' }}
          >
            <Plus className="w-4 h-4" /> Nueva Entrada
          </Button>
        </div>
      </div>

      {/* Lista + detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        <Card className="shadow-sm lg:col-span-2">
          <div className="p-3 sm:p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar paciente o profesional..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#00ADBB]" /></div>
            ) : filtradas.length === 0 ? (
              <p className="text-center py-10 text-muted-foreground text-sm">No se encontraron entradas</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="divide-y">
                  {filtradas.map(e => (
                    <button key={e.id} onClick={() => setSelectedEntrada(e)}
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
                          {e.ficha_modelo?.nombre && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00ADBB]/10 text-[#00ADBB] font-medium mt-0.5 inline-block">
                              {e.ficha_modelo.nombre}
                            </span>
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

      {/* ═══════════════ DIALOG NUEVA ENTRADA ═══════════════ */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) resetDialog(); setDialogOpen(open); }}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader>
            <DialogTitle>Nueva Entrada Clínica</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[78vh] pr-2">
            <div className="space-y-4 pb-2">

              {/* Paciente — autocomplete por DNI, nombre o apellido */}
              <div className="space-y-1.5">
                <Label>Paciente *</Label>
                <PacienteAutocomplete
                  key={resetAutocomplete}
                  onSelect={setPacienteSeleccionado}
                  placeholder="Buscar por apellido, nombre o DNI..."
                />
                {pacienteSeleccionado && (
                  <p className="text-xs text-[#00ADBB]">
                    ✓ {pacienteSeleccionado.apellido}, {pacienteSeleccionado.nombre} — DNI {pacienteSeleccionado.dni}
                  </p>
                )}
              </div>

              {/* Profesional + Fecha en fila */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Profesional *</Label>
                  <Select value={profesionalId} onValueChange={setProfesionalId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {profesionales.map(p => <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Fecha *</Label>
                  <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
                </div>
              </div>

              {/* Ficha modelo */}
              <div className="space-y-1">
                <Label>Ficha modelo</Label>
                <Select value={fichaModeloId} onValueChange={handleFichaChange}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar ficha (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {fichasDisponibles.map(f => <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                {fichasDisponibles.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin fichas creadas aún. Usá "Crear ficha modelo" para definir las variables.</p>
                )}
              </div>

              {/* Variables de la ficha seleccionada */}
              {fichaVariables.length > 0 && (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variables de la ficha</p>
                  {fichaVariables.map(v => (
                    <div key={v.id} className="grid grid-cols-2 gap-3 items-center">
                      <Label className="text-sm font-normal text-foreground">{v.nombre_variable}</Label>
                      <Input
                        value={valoresVariables[v.id] ?? ''}
                        onChange={e => setValoresVariables(prev => ({ ...prev, [v.id]: e.target.value }))}
                        placeholder="Valor..."
                        className="h-8"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Comentarios extras */}
              <div className="space-y-1">
                <Label>Comentarios extras</Label>
                <Textarea
                  placeholder="Escribí libremente observaciones, evolución, indicaciones..."
                  className="min-h-[100px] resize-none"
                  value={comentariosExtras}
                  onChange={e => setComentariosExtras(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleGuardar} disabled={saving || !pacienteSeleccionado || !profesionalId}
                  className="flex-1" style={{ backgroundColor: '#00ADBB', borderColor: '#00ADBB' }}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar
                </Button>
                <Button variant="outline" onClick={() => { resetDialog(); setDialogOpen(false); }} className="flex-1">Cancelar</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ DIALOG CREAR FICHA MODELO ═══════════════ */}
      <Dialog open={fichaDialogOpen} onOpenChange={open => { if (!open) resetFichaDialog(); setFichaDialogOpen(open); }}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-[#00ADBB]" />
              Crear ficha modelo
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[78vh] pr-2">
            <div className="space-y-5 pb-2">

              {/* Nombre */}
              <div className="space-y-1">
                <Label>Nombre de la ficha *</Label>
                <Input
                  placeholder="Ej: Ficha Kinesiología, Ficha RPG, Ficha Respiratoria..."
                  value={fichaForm.nombre}
                  onChange={e => setFichaForm({ nombre: e.target.value })}
                />
              </div>

              {/* Variables */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Variables a evaluar *</Label>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setFichaVarsForm(prev => [...prev, { nombre: '' }])}>
                    <Plus className="w-3 h-3 mr-1" /> Agregar variable
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Definí los campos que el profesional completará en cada sesión.</p>

                <div className="space-y-2">
                  {fichaVarsForm.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                      <div className="flex-1 grid grid-cols-1">
                        <Input
                          placeholder={`Variable ${i + 1} — ej: Dolor (EVA 0-10), ROM flexión, Fuerza...`}
                          value={v.nombre}
                          onChange={e => {
                            const next = [...fichaVarsForm];
                            next[i] = { nombre: e.target.value };
                            setFichaVarsForm(next);
                          }}
                          className="h-9"
                        />
                      </div>
                      {fichaVarsForm.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                          onClick={() => setFichaVarsForm(prev => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {fichaForm.nombre && fichaVarsForm.some(v => v.nombre.trim()) && (
                <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista previa de la ficha</p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground font-medium border-b pb-1">
                      <span>Variable</span><span>Respuesta (en blanco)</span>
                    </div>
                    {fichaVarsForm.filter(v => v.nombre.trim()).map((v, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-foreground">{v.nombre}</span>
                        <span className="text-muted-foreground italic text-xs">campo de texto</span>
                      </div>
                    ))}
                    <div className="border-t pt-2 text-sm">
                      <span className="text-foreground font-medium">Comentarios extras:</span>
                      <span className="text-muted-foreground italic text-xs ml-2">área de texto libre</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button onClick={handleGuardarFicha}
                  disabled={savingFicha || !fichaForm.nombre.trim() || !fichaVarsForm.some(v => v.nombre.trim())}
                  className="flex-1" style={{ backgroundColor: '#00ADBB', borderColor: '#00ADBB' }}>
                  {savingFicha && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Guardar ficha
                </Button>
                <Button variant="outline" onClick={() => { resetFichaDialog(); setFichaDialogOpen(false); }} className="flex-1">Cancelar</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
