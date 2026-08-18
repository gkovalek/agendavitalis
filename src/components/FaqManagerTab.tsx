import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, Pencil, Check, X, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type FaqTable = 'faq_profesional' | 'faq_servicio';
type FaqField = 'profesional_id' | 'servicio_id';

interface Faq {
  id: string;
  pregunta: string;
  respuesta: string;
  activo: boolean;
}

interface Props {
  table: FaqTable;
  field: FaqField;
  entityId: string;
  entityNombre?: string;
}

export function FaqManagerTab({ table, field, entityId, entityNombre }: Props) {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPregunta, setEditPregunta] = useState('');
  const [editRespuesta, setEditRespuesta] = useState('');
  const [newPregunta, setNewPregunta] = useState('');
  const [newRespuesta, setNewRespuesta] = useState('');
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from(table)
      .select('id,pregunta,respuesta,activo')
      .eq(field, entityId)
      .order('created_at', { ascending: true });
    setFaqs((data ?? []) as Faq[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityId]);

  const handleAdd = async () => {
    if (!newPregunta.trim() || !newRespuesta.trim()) return;
    setSaving(true);
    const { error } = await supabase.from(table).insert({
      [field]: entityId,
      pregunta: newPregunta.trim(),
      respuesta: newRespuesta.trim(),
      activo: true,
    });
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      setNewPregunta('');
      setNewRespuesta('');
      await load();
      toast({ title: 'FAQ guardada' });
    }
    setSaving(false);
  };

  const startEdit = (f: Faq) => {
    setEditingId(f.id);
    setEditPregunta(f.pregunta);
    setEditRespuesta(f.respuesta);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPregunta('');
    setEditRespuesta('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editPregunta.trim() || !editRespuesta.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from(table)
      .update({ pregunta: editPregunta.trim(), respuesta: editRespuesta.trim() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      setFaqs(prev => prev.map(f => f.id === id ? { ...f, pregunta: editPregunta.trim(), respuesta: editRespuesta.trim() } : f));
      cancelEdit();
      toast({ title: 'FAQ actualizada' });
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, activo: boolean) => {
    await supabase.from(table).update({ activo }).eq('id', id);
    setFaqs(prev => prev.map(f => f.id === id ? { ...f, activo } : f));
  };

  const handleDelete = async (id: string) => {
    await supabase.from(table).delete().eq('id', id);
    setFaqs(prev => prev.filter(f => f.id !== id));
    if (editingId === id) cancelEdit();
    toast({ title: 'FAQ eliminada' });
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 pt-2">
      {entityNombre && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />
          El asistente IA usará estas respuestas cuando le pregunten sobre <strong>{entityNombre}</strong>
        </p>
      )}

      {faqs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No hay FAQs cargadas todavía</p>
      ) : (
        <div className="space-y-2">
          {faqs.map(f => (
            <div key={f.id} className={`rounded-lg border p-3 space-y-2 ${!f.activo ? 'opacity-50' : ''}`}>
              {editingId === f.id ? (
                /* Modo edición */
                <>
                  <Input
                    value={editPregunta}
                    onChange={e => setEditPregunta(e.target.value)}
                    className="text-sm"
                    placeholder="Pregunta"
                  />
                  <Textarea
                    value={editRespuesta}
                    onChange={e => setEditRespuesta(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                    placeholder="Respuesta"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSaveEdit(f.id)} disabled={saving || !editPregunta.trim() || !editRespuesta.trim()} className="flex-1">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                      Guardar
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit} className="flex-1">
                      <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                /* Modo lectura */
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug flex-1">❓ {f.pregunta}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={f.activo}
                        onCheckedChange={(v) => handleToggle(f.id, v)}
                        className="scale-75"
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEdit(f)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(f.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-snug">💬 {f.respuesta}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Formulario nueva FAQ */}
      <div className="rounded-lg border border-dashed p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nueva pregunta frecuente</p>
        <Input
          placeholder="¿Cuál es la duración de la sesión?"
          value={newPregunta}
          onChange={e => setNewPregunta(e.target.value)}
          className="text-sm"
        />
        <Textarea
          placeholder="Cada sesión dura 45 minutos aproximadamente..."
          value={newRespuesta}
          onChange={e => setNewRespuesta(e.target.value)}
          rows={3}
          className="text-sm resize-none"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={saving || !newPregunta.trim() || !newRespuesta.trim()}
          className="w-full"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Agregar FAQ
        </Button>
      </div>
    </div>
  );
}
