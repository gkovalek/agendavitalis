import { useEffect, useState, useCallback, useRef } from 'react';
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
import { Loader2, Search, Plus, ArrowLeft, FileText, Calendar, User, LayoutTemplate, Trash2, GripVertical, Paperclip, ImageIcon, FileIcon, ExternalLink, X, Pencil, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { exportarHistoriaPDF } from '@/components/ExportarHistoriaPDF';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { PacienteAutocomplete, PacienteOption } from '@/components/PacienteAutocomplete';
import { usePlan } from '@/hooks/use-plan';

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

interface Adjunto {
  id: string;
  nombre: string;
  tipo_mime: string | null;
  storage_path: string;
  created_at: string;
}

const HOY = new Date().toISOString().split('T')[0];
const BUCKET = 'historia-clinica';
const MAX_MB = 20;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/* ─────────────────── AdjuntoIcon (fuera del render) ─── */
function AdjuntoIcon({ mime }: { mime: string | null }) {
  if (mime?.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-[#00ADBB] shrink-0" />;
  return <FileIcon className="w-4 h-4 text-orange-400 shrink-0" />;
}

/* ─────────────────── PanelDetalle (fuera del render para evitar remount) ─── */
interface PanelDetalleProps {
  selectedEntrada: EntradaHistoria | null;
  adjuntos: Adjunto[];
  loadingAdjuntos: boolean;
  uploading: boolean;
  isMobile: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAbrirAdjunto: (adj: Adjunto) => void;
  handleEliminarAdjunto: (adj: Adjunto) => void;
  onBack: () => void;
}

function formatFechaPanel(fecha: string) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function PanelDetalle({
  selectedEntrada, adjuntos, loadingAdjuntos, uploading,
  isMobile, fileInputRef, handleFileSelect, handleAbrirAdjunto, handleEliminarAdjunto, onBack,
}: PanelDetalleProps) {
  const { tiene } = usePlan();
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
        <Button variant="ghost" size="sm" onClick={onBack}>
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
          <span>{formatFechaPanel(selectedEntrada.fecha)}</span>
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
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Archivos adjuntos
            {adjuntos.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#00ADBB]/10 text-[#00ADBB] text-[10px] font-bold">{adjuntos.length}</span>
            )}
          </p>
          <div>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileSelect} />
            {tiene('adjuntos_hc') ? (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Subiendo...</> : <><Plus className="w-3 h-3" /> Adjuntar</>}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 opacity-50 cursor-not-allowed" disabled title="Disponible en plan Premium">
                <Plus className="w-3 h-3" /> Adjuntar
              </Button>
            )}
          </div>
        </div>
        {loadingAdjuntos ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-[#00ADBB]" /></div>
        ) : adjuntos.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Sin archivos adjuntos. Podés adjuntar recetas, radiografías, informes (PDF, JPG, PNG · máx. {MAX_MB}MB).
          </p>
        ) : (
          <div className="space-y-1.5">
            {adjuntos.map(adj => (
              <div key={adj.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors group">
                <AdjuntoIcon mime={adj.tipo_mime} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{adj.nombre}</p>
                  <p className="text-[10px] text-muted-foreground">{formatFechaPanel(adj.created_at.split('T')[0])}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Abrir" onClick={() => handleAbrirAdjunto(adj)}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Eliminar" onClick={() => handleEliminarAdjunto(adj)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
export default function HistoriaClinica() {
  const { centroId, perfil } = useAuth();
  const { tiene } = usePlan();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lista de entradas
  const [entradas, setEntradas] = useState<EntradaHistoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEntrada, setSelectedEntrada] = useState<EntradaHistoria | null>(null);

  // Adjuntos
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [loadingAdjuntos, setLoadingAdjuntos] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  // Dialog gestión fichas modelo
  const [gestionFichasOpen, setGestionFichasOpen] = useState(false);
  const [fichaDialogOpen, setFichaDialogOpen] = useState(false);
  const [fichaForm, setFichaForm] = useState({ nombre: '' });
  const [fichaVarsForm, setFichaVarsForm] = useState<{ nombre: string }[]>([{ nombre: '' }]);
  const [savingFicha, setSavingFicha] = useState(false);
  const [editFichaId, setEditFichaId] = useState<string | null>(null);
  const [expandedFicha, setExpandedFicha] = useState<string | null>(null);
  const [fichasConVars, setFichasConVars] = useState<(FichaModelo & { variables: FichaVariable[] })[]>([]);

  /* ─── Fetching ─── */
  const fetchEntradas = useCallback(async () => {
    if (!centroId) return;
    setLoading(true);
    let q = supabase
      .from('historia_clinica')
      .select(`
        id, fecha, comentario_evolucion, comentarios_extras, variables_json, ficha_modelo_id, created_at,
        paciente:pacientes(id, nombre, apellido, dni),
        profesional:profesionales(id, nombre, apellido),
        ficha_modelo:fichas_modelo(nombre)
      `)
      .eq('centro_id', centroId);
    if (perfil?.rol_nombre === 'profesional' && perfil?.profesional_id) {
      q = q.eq('profesional_id', perfil.profesional_id);
    }
    const { data } = await q
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    setEntradas((data ?? []) as unknown as EntradaHistoria[]);
    setLoading(false);
  }, [centroId, perfil?.rol_nombre, perfil?.profesional_id]);

  const fetchFichas = useCallback(async () => {
    if (!centroId) return;
    const { data } = await supabase
      .from('fichas_modelo')
      .select('id, nombre, fichas_modelo_variables(id, nombre_variable, orden)')
      .eq('centro_id', centroId)
      .order('nombre');
    const rows = (data ?? []) as any[];
    setFichasDisponibles(rows.map(r => ({ id: r.id, nombre: r.nombre })));
    setFichasConVars(rows.map(r => ({
      id: r.id,
      nombre: r.nombre,
      variables: (r.fichas_modelo_variables ?? []).sort((a: any, b: any) => a.orden - b.orden),
    })));
  }, [centroId]);

  const fetchProfesionales = useCallback(async () => {
    if (!centroId) return;
    const { data } = await supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido');
    setProfesionales(data ?? []);
  }, [centroId]);

  const fetchAdjuntos = useCallback(async (historiaId: string) => {
    setLoadingAdjuntos(true);
    const { data } = await supabase
      .from('historia_adjuntos')
      .select('id, nombre, tipo_mime, storage_path, created_at')
      .eq('historia_id', historiaId)
      .order('created_at', { ascending: false });
    setAdjuntos((data ?? []) as Adjunto[]);
    setLoadingAdjuntos(false);
  }, []);

  useEffect(() => { fetchEntradas(); }, [fetchEntradas]);
  useEffect(() => { fetchFichas(); }, [fetchFichas]);
  useEffect(() => { fetchProfesionales(); }, [fetchProfesionales]);

  useEffect(() => {
    if (selectedEntrada) {
      fetchAdjuntos(selectedEntrada.id);
    } else {
      setAdjuntos([]);
    }
  }, [selectedEntrada, fetchAdjuntos]);

  /* ─── Adjuntos: subir ─── */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEntrada || !centroId) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: 'Tipo no permitido', description: 'Solo se admiten PDF, JPG, PNG y WebP.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: 'Archivo muy grande', description: `Máximo ${MAX_MB}MB.`, variant: 'destructive' });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${centroId}/${selectedEntrada.id}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (uploadErr) {
      toast({ title: 'Error al subir', description: uploadErr.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    let subidoPor: string | null = null;
    if (user?.id) {
      const { data: usuarioRow } = await supabase
        .from('usuarios')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      subidoPor = usuarioRow?.id ?? null;
    }

    const { error: dbErr } = await supabase.from('historia_adjuntos').insert({
      centro_id: centroId,
      historia_id: selectedEntrada.id,
      nombre: file.name,
      tipo_mime: file.type,
      storage_path: path,
      subido_por: subidoPor,
    });

    if (dbErr) {
      toast({ title: 'Error al registrar adjunto', description: dbErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'Archivo adjuntado' });
      fetchAdjuntos(selectedEntrada.id);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ─── Adjuntos: abrir ─── */
  const handleAbrirAdjunto = async (adjunto: Adjunto) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(adjunto.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast({ title: 'Error al abrir archivo', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  /* ─── Adjuntos: eliminar ─── */
  const handleEliminarAdjunto = async (adjunto: Adjunto) => {
    if (!confirm(`¿Eliminar "${adjunto.nombre}"?`)) return;
    await supabase.storage.from(BUCKET).remove([adjunto.storage_path]);
    await supabase.from('historia_adjuntos').delete().eq('id', adjunto.id);
    setAdjuntos(prev => prev.filter(a => a.id !== adjunto.id));
    toast({ title: 'Adjunto eliminado' });
  };

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

  /* ─── Fichas modelo: gestión ─── */
  const resetFichaDialog = () => {
    setFichaForm({ nombre: '' });
    setFichaVarsForm([{ nombre: '' }]);
    setEditFichaId(null);
  };

  const handleEditFicha = (ficha: FichaModelo & { variables: FichaVariable[] }) => {
    setEditFichaId(ficha.id);
    setFichaForm({ nombre: ficha.nombre });
    setFichaVarsForm(ficha.variables.length > 0
      ? ficha.variables.map(v => ({ nombre: v.nombre_variable }))
      : [{ nombre: '' }]);
    setFichaDialogOpen(true);
  };

  const handleDeleteFicha = async (fichaId: string, nombre: string) => {
    if (!confirm(`¿Eliminar la ficha "${nombre}"? Las entradas que la usen no se verán afectadas.`)) return;
    await supabase.from('fichas_modelo_variables').delete().eq('ficha_modelo_id', fichaId);
    await supabase.from('fichas_modelo').delete().eq('id', fichaId);
    toast({ title: 'Ficha eliminada' });
    fetchFichas();
  };

  const handleGuardarFicha = async () => {
    if (!centroId || !fichaForm.nombre.trim()) return;
    const validVars = fichaVarsForm.filter(v => v.nombre.trim());
    if (validVars.length === 0) {
      toast({ title: 'Sin variables', description: 'Agregá al menos una variable a la ficha.', variant: 'destructive' });
      return;
    }
    setSavingFicha(true);

    let fichaId = editFichaId;

    if (editFichaId) {
      // Editar existente
      await supabase.from('fichas_modelo').update({ nombre: fichaForm.nombre.trim() }).eq('id', editFichaId);
      await supabase.from('fichas_modelo_variables').delete().eq('ficha_modelo_id', editFichaId);
    } else {
      // Crear nueva
      const { data: fichaData, error: fichaErr } = await supabase
        .from('fichas_modelo')
        .insert({ centro_id: centroId, nombre: fichaForm.nombre.trim() })
        .select('id').single();
      if (fichaErr || !fichaData) {
        toast({ title: 'Error', description: fichaErr?.message, variant: 'destructive' });
        setSavingFicha(false);
        return;
      }
      fichaId = fichaData.id;
    }

    const varsPayload = validVars.map((v, i) => ({
      ficha_modelo_id: fichaId!,
      nombre_variable: v.nombre.trim(),
      orden: i,
    }));

    const { error: varErr } = await supabase.from('fichas_modelo_variables').insert(varsPayload);
    if (varErr) {
      toast({ title: 'Error guardando variables', description: varErr.message, variant: 'destructive' });
    } else {
      toast({ title: editFichaId ? 'Ficha actualizada' : 'Ficha creada', description: `"${fichaForm.nombre.trim()}" disponible al crear entradas.` });
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

  const panelProps: PanelDetalleProps = {
    selectedEntrada,
    adjuntos,
    loadingAdjuntos,
    uploading,
    isMobile,
    fileInputRef,
    handleFileSelect,
    handleAbrirAdjunto,
    handleEliminarAdjunto,
    onBack: () => setSelectedEntrada(null),
  };

  if (isMobile && selectedEntrada) {
    return (
      <div className="space-y-4 animate-fade-in px-1 py-2">
        <PanelDetalle {...panelProps} />
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
            onClick={() => setGestionFichasOpen(true)}
            className="gap-2"
          >
            <LayoutTemplate className="w-4 h-4" /> Fichas modelo
            {fichasConVars.length > 0 && (
              <span className="ml-1 text-xs bg-[#00ADBB]/15 text-[#00ADBB] rounded-full px-1.5 py-0.5 font-semibold">{fichasConVars.length}</span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedEntrada && exportarHistoriaPDF(
              selectedEntrada.paciente,
              filtradas.filter(e => e.paciente?.id === selectedEntrada.paciente?.id)
            )}
            disabled={!selectedEntrada}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF
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
                <PanelDetalle {...panelProps} />
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

      {/* ═══════════════ DIALOG GESTIÓN FICHAS MODELO ═══════════════ */}
      <Dialog open={gestionFichasOpen} onOpenChange={setGestionFichasOpen}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-[#00ADBB]" />
              Fichas modelo
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-1">
            <div className="space-y-3 pb-2">
              {fichasConVars.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No hay fichas modelo creadas todavía.
                </p>
              ) : (
                fichasConVars.map(ficha => (
                  <div key={ficha.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                      <button
                        className="flex items-center gap-2 flex-1 text-left"
                        onClick={() => setExpandedFicha(expandedFicha === ficha.id ? null : ficha.id)}
                      >
                        {expandedFicha === ficha.id
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        <span className="font-medium text-sm">{ficha.nombre}</span>
                        <span className="text-xs text-muted-foreground">({ficha.variables.length} var.)</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => { setGestionFichasOpen(false); handleEditFicha(ficha); }}>
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => handleDeleteFicha(ficha.id, ficha.nombre)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                        </Button>
                      </div>
                    </div>
                    {expandedFicha === ficha.id && ficha.variables.length > 0 && (
                      <div className="px-4 py-3 space-y-1.5 border-t bg-background">
                        {ficha.variables.map((v, i) => (
                          <div key={v.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="w-5 text-xs text-muted-foreground/50 font-mono">{i + 1}.</span>
                            <span>{v.nombre_variable}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
              <Button
                className="w-full gap-2 mt-2"
                style={{ backgroundColor: '#00ADBB', borderColor: '#00ADBB' }}
                onClick={() => { setGestionFichasOpen(false); resetFichaDialog(); setFichaDialogOpen(true); }}
              >
                <Plus className="w-4 h-4" /> Nueva ficha modelo
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ DIALOG CREAR / EDITAR FICHA MODELO ═══════════════ */}
      <Dialog open={fichaDialogOpen} onOpenChange={open => { if (!open) resetFichaDialog(); setFichaDialogOpen(open); }}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-[#00ADBB]" />
              {editFichaId ? 'Editar ficha modelo' : 'Nueva ficha modelo'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[78vh] pr-2">
            <div className="space-y-5 pb-2">

              <div className="space-y-1">
                <Label>Nombre de la ficha *</Label>
                <Input
                  placeholder="Ej: Ficha Kinesiología, Ficha RPG, Ficha Respiratoria..."
                  value={fichaForm.nombre}
                  onChange={e => setFichaForm({ nombre: e.target.value })}
                />
              </div>

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
                  {savingFicha && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {editFichaId ? 'Guardar cambios' : 'Crear ficha'}
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
