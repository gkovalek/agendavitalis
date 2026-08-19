import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Check, X, Bot, BookOpen, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePlan } from '@/hooks/use-plan';

interface FAQ {
  id: string;
  pregunta: string;
  respuesta: string;
  origen: 'manual' | 'aprendida';
  activo: boolean;
  created_at: string;
}

const EMPTY: Omit<FAQ, 'id' | 'created_at'> = {
  pregunta: '',
  respuesta: '',
  origen: 'manual',
  activo: true,
};

export default function FaqManager() {
  const { centroId } = useAuth();
  const { toast } = useToast();
  const { tiene, planMinimoPara } = usePlan();
  const [faqs, setFaqs]       = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ ...EMPTY });
  const [editId, setEditId]   = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('faq')
      .select('*')
      .eq('centro_id', centroId)
      .order('created_at', { ascending: false });
    setFaqs(data ?? []);
    setLoading(false);
  }

  useEffect(() => { if (centroId) load(); }, [centroId]);

  function startEdit(faq: FAQ) {
    setEditId(faq.id);
    setForm({ pregunta: faq.pregunta, respuesta: faq.respuesta, origen: faq.origen, activo: faq.activo });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelForm() {
    setEditId(null);
    setForm({ ...EMPTY });
    setShowForm(false);
  }

  async function handleSave() {
    if (!form.pregunta.trim() || !form.respuesta.trim()) return;
    setSaving(true);
    let error: any;
    if (editId) {
      ({ error } = await supabase.from('faq').update({ pregunta: form.pregunta.trim(), respuesta: form.respuesta.trim(), origen: form.origen, activo: form.activo }).eq('id', editId));
    } else {
      ({ error } = await supabase.from('faq').insert({ centro_id: centroId, pregunta: form.pregunta.trim(), respuesta: form.respuesta.trim(), origen: 'manual', activo: true }));
    }
    if (error) { toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' }); setSaving(false); return; }
    cancelForm();
    await load();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta FAQ?')) return;
    const { error } = await supabase.from('faq').delete().eq('id', id);
    if (error) { toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' }); return; }
    setFaqs(prev => prev.filter(f => f.id !== id));
  }

  async function toggleActivo(faq: FAQ) {
    const { error } = await supabase.from('faq').update({ activo: !faq.activo }).eq('id', faq.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, activo: !f.activo } : f));
  }

  async function aprobarSugerida(faq: FAQ) {
    const { error } = await supabase.from('faq').update({ activo: true }).eq('id', faq.id);
    if (error) { toast({ title: 'Error al aprobar', description: error.message, variant: 'destructive' }); return; }
    setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, activo: true } : f));
  }

  async function descartarSugerida(id: string) {
    const { error } = await supabase.from('faq').delete().eq('id', id);
    if (error) { toast({ title: 'Error al descartar', description: error.message, variant: 'destructive' }); return; }
    setFaqs(prev => prev.filter(f => f.id !== id));
  }

  const q = search.toLowerCase();
  const activas    = faqs.filter(f => f.origen === 'manual' && f.activo    && (!q || f.pregunta.toLowerCase().includes(q) || f.respuesta.toLowerCase().includes(q)));
  const inactivas  = faqs.filter(f => f.origen === 'manual' && !f.activo   && (!q || f.pregunta.toLowerCase().includes(q) || f.respuesta.toLowerCase().includes(q)));
  const sugeridas  = faqs.filter(f => f.origen === 'aprendida' && !f.activo);

  if (!tiene('whatsapp_bot')) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
      <Lock className="w-8 h-8 opacity-40" />
      <p className="text-sm font-medium">Base de conocimiento FAQ requiere plan {planMinimoPara('whatsapp_bot')}</p>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Base de Conocimiento FAQ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            El asistente IA usa estas preguntas y respuestas para atender pacientes por WhatsApp.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva FAQ
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="border rounded-xl p-5 bg-card shadow-sm space-y-4">
          <h2 className="font-semibold text-base">{editId ? 'Editar FAQ' : 'Nueva pregunta y respuesta'}</h2>
          <div className="space-y-2">
            <label className="text-sm font-medium">Pregunta</label>
            <Input
              placeholder="Ej: ¿Atienden con INSEP?"
              value={form.pregunta}
              onChange={e => setForm(p => ({ ...p, pregunta: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Respuesta</label>
            <Textarea
              placeholder="Ej: Sí, trabajamos con INSEP AMB. El paciente debe presentar la orden médica al momento del turno."
              rows={4}
              value={form.respuesta}
              onChange={e => setForm(p => ({ ...p, respuesta: e.target.value }))}
              className="resize-none"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={cancelForm}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.pregunta.trim() || !form.respuesta.trim()}>
              {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Agregar FAQ'}
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <Input
        placeholder="Buscar en FAQs..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Tabs */}
      <Tabs defaultValue="activas">
        <TabsList>
          <TabsTrigger value="activas">
            Activas <Badge variant="secondary" className="ml-2">{activas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="inactivas">
            Inactivas <Badge variant="secondary" className="ml-2">{inactivas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sugeridas">
            Sugeridas por IA
            {sugeridas.length > 0 && (
              <Badge className="ml-2 bg-amber-500">{sugeridas.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activas" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Cargando...</p>
          ) : activas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay FAQs activas todavía.</p>
              <p className="text-xs mt-1">Agregá preguntas frecuentes para que el bot pueda responderlas.</p>
            </div>
          ) : (
            activas.map(faq => <FaqCard key={faq.id} faq={faq} onEdit={startEdit} onDelete={handleDelete} onToggle={toggleActivo} />)
          )}
        </TabsContent>

        <TabsContent value="inactivas" className="mt-4 space-y-3">
          {inactivas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No hay FAQs desactivadas.</p>
          ) : (
            inactivas.map(faq => <FaqCard key={faq.id} faq={faq} onEdit={startEdit} onDelete={handleDelete} onToggle={toggleActivo} />)
          )}
        </TabsContent>

        <TabsContent value="sugeridas" className="mt-4 space-y-3">
          {sugeridas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay FAQs sugeridas pendientes.</p>
              <p className="text-xs mt-1">Cuando el asistente aprende de conversaciones cerradas, aparecen aquí para aprobar.</p>
            </div>
          ) : (
            sugeridas.map(faq => (
              <div key={faq.id} className="border rounded-xl p-4 bg-amber-50 dark:bg-amber-950/20 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <p className="font-medium text-sm">{faq.pregunta}</p>
                    </div>
                    <p className="text-sm text-muted-foreground pl-6">{faq.respuesta}</p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => descartarSugerida(faq.id)} className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10">
                    <X className="w-3 h-3" /> Descartar
                  </Button>
                  <Button size="sm" onClick={() => aprobarSugerida(faq)} className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                    <Check className="w-3 h-3" /> Aprobar
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FaqCard({ faq, onEdit, onDelete, onToggle }: {
  faq: FAQ;
  onEdit: (f: FAQ) => void;
  onDelete: (id: string) => void;
  onToggle: (f: FAQ) => void;
}) {
  return (
    <div className={`border rounded-xl p-4 space-y-2 transition-opacity ${faq.activo ? 'bg-card' : 'bg-muted/30 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1 min-w-0">
          <p className="font-medium text-sm leading-snug">{faq.pregunta}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{faq.respuesta}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onToggle(faq)} title={faq.activo ? 'Desactivar' : 'Activar'}>
            {faq.activo ? <X className="w-4 h-4 text-muted-foreground" /> : <Check className="w-4 h-4 text-emerald-600" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(faq)}>
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onDelete(faq.id)}>
            <Trash2 className="w-4 h-4 text-destructive/70" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={faq.activo ? 'default' : 'secondary'} className="text-xs">
          {faq.activo ? 'Activa' : 'Inactiva'}
        </Badge>
        {faq.origen === 'aprendida' && (
          <Badge variant="outline" className="text-xs gap-1">
            <Bot className="w-3 h-3" /> Sugerida por IA
          </Badge>
        )}
      </div>
    </div>
  );
}
