import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Send, MessageSquare, ChevronDown, ChevronUp, Check, X, Plus, LogOut, RefreshCw, Lock } from 'lucide-react';
import { usePlan } from '@/hooks/use-plan';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MsgItem {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  type?: string;
}

interface Conversacion {
  id: string;
  celular: string;
  estado: 'activa' | 'derivada' | 'cerrada';
  historial: MsgItem[];
  updated_at: string;
}

interface FAQ {
  id: string;
  pregunta: string;
  respuesta: string;
  origen: 'manual' | 'aprendida';
  activo: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'ahora';
  if (min < 60)  return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function celularInitials(cel: string) {
  const digits = cel.replace(/\D/g, '');
  return digits.slice(-2);
}

function formatHour(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Estado badge ─────────────────────────────────────────────────────────────
const ESTADO_COLOR: Record<string, string> = {
  derivada: 'bg-red-500 text-white',
  activa:   'bg-green-500 text-white',
  cerrada:  'bg-slate-400 text-white',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SecretariaWhatsApp() {
  const { session, loading: authLoading, perfil } = useAuth();
  const { tiene, planMinimoPara } = usePlan();

  const [convs, setConvs]           = useState<Conversacion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<'derivada' | 'activa' | 'cerrada'>('derivada');
  const [reply, setReply]           = useState('');
  const [sending, setSending]       = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);

  // FAQ state
  const [faqs, setFaqs]             = useState<FAQ[]>([]);
  const [faqOpen, setFaqOpen]       = useState(false);
  const [newPregunta, setNewPregunta] = useState('');
  const [newRespuesta, setNewRespuesta] = useState('');
  const [savingFaq, setSavingFaq]   = useState(false);

  const centroId  = perfil?.centro_id as string | undefined;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ─── Load conversations ─────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    if (!centroId) return;
    const { data } = await supabase
      .from('conversaciones_wa')
      .select('id, celular, estado, historial, updated_at')
      .eq('centro_id', centroId)
      .order('updated_at', { ascending: false });
    setConvs((data as Conversacion[]) ?? []);
    setLoadingConvs(false);
  }, [centroId]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // ─── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!centroId) return;
    const ch = supabase
      .channel('conv-wa')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversaciones_wa',
        filter: `centro_id=eq.${centroId}`,
      }, () => { loadConvs(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [centroId, loadConvs]);

  // ─── Load FAQs ─────────────────────────────────────────────────────────────
  const loadFaqs = useCallback(async () => {
    if (!centroId) return;
    const { data } = await supabase
      .from('faq')
      .select('*')
      .eq('centro_id', centroId)
      .order('created_at', { ascending: false });
    setFaqs((data as FAQ[]) ?? []);
  }, [centroId]);

  useEffect(() => { if (faqOpen) loadFaqs(); }, [faqOpen, loadFaqs]);

  // ─── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedId, convs]);

  // ─── Auth redirect DESPUÉS de todos los hooks (evita violación de Rules of Hooks) ──
  if (!authLoading && !session) return <Navigate to="/login" replace />;

  if (!tiene('whatsapp_bot')) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
      <Lock className="w-8 h-8 opacity-40" />
      <p className="text-sm font-medium">Secretaría WhatsApp requiere plan {planMinimoPara('whatsapp_bot')}</p>
    </div>
  );

  // ─── Derived data ───────────────────────────────────────────────────────────
  const filtered   = convs.filter(c => c.estado === activeTab);
  const selected   = convs.find(c => c.id === selectedId) ?? null;
  const derivCount = convs.filter(c => c.estado === 'derivada').length;

  // ─── Send reply ─────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    const text = reply.trim();
    setReply('');

    // 1. Enviar via wa-send EF (autenticado con JWT de sesión)
    try {
      await supabase.functions.invoke('wa-send', {
        body: { number: selected.celular, text },
      });
    } catch (e) { console.error('Send error', e); }

    // 2. Actualizar historial en Supabase
    const ts = new Date().toISOString();
    const nuevoHistorial: MsgItem[] = [
      ...selected.historial,
      { role: 'assistant', content: text, ts, type: 'secretary' },
    ];
    await supabase
      .from('conversaciones_wa')
      .update({ historial: nuevoHistorial, updated_at: ts })
      .eq('id', selected.id);

    // 3. Guardar en aprendizaje_log si hay mensaje previo del usuario
    const lastUser = [...selected.historial].reverse().find(m => m.role === 'user');
    if (lastUser && centroId) {
      await supabase.from('aprendizaje_log').insert({
        centro_id:        centroId,
        conversacion_id:  selected.id,
        pregunta:         lastUser.content,
        respuesta_humana: text,
        categoria:        'respuesta_secretaria',
        usado_en_prompts: false,
      });
    }

    setSending(false);
    loadConvs();
  }

  // ─── Update conversation state ───────────────────────────────────────────────
  async function updateEstado(id: string, estado: 'activa' | 'derivada' | 'cerrada') {
    await supabase.from('conversaciones_wa').update({ estado }).eq('id', id);
    if (id === selectedId) setSelectedId(null);
    loadConvs();
  }

  // ─── FAQ actions ─────────────────────────────────────────────────────────────
  async function saveFaq() {
    if (!newPregunta.trim() || !newRespuesta.trim() || !centroId) return;
    setSavingFaq(true);
    await supabase.from('faq').insert({
      centro_id: centroId,
      pregunta:  newPregunta.trim(),
      respuesta: newRespuesta.trim(),
      origen:    'manual',
      activo:    true,
    });
    setNewPregunta('');
    setNewRespuesta('');
    setSavingFaq(false);
    loadFaqs();
  }

  async function toggleFaq(id: string, activo: boolean) {
    await supabase.from('faq').update({ activo }).eq('id', id);
    loadFaqs();
  }

  async function deleteFaq(id: string) {
    await supabase.from('faq').delete().eq('id', id);
    loadFaqs();
  }

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-green-400" />
      </div>
    );
  }

  // ─── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 font-sans">

      {/* ── LEFT PANEL — Conversation list ──────────────────────────────────── */}
      <aside className="w-80 flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-700">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-green-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">V</span>
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-none">Vitalis</p>
              <p className="text-slate-400 text-[10px] leading-none mt-0.5">Bandeja WhatsApp</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={loadConvs}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          {(['derivada', 'activa', 'cerrada'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
                activeTab === tab
                  ? 'text-green-400 border-b-2 border-green-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="capitalize">{tab === 'derivada' ? 'Derivadas' : tab === 'activa' ? 'Activas' : 'Cerradas'}</span>
              {tab === 'derivada' && derivCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {derivCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500">
              <MessageSquare className="w-6 h-6 mb-2 opacity-40" />
              <p className="text-xs">Sin conversaciones</p>
            </div>
          ) : (
            filtered.map(conv => {
              const lastMsg = conv.historial[conv.historial.length - 1];
              const isSelected = conv.id === selectedId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-800 transition-colors flex items-start gap-3 ${
                    isSelected
                      ? 'bg-slate-700 border-l-2 border-l-green-400'
                      : 'hover:bg-slate-800'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0 text-slate-200 text-xs font-bold">
                    {celularInitials(conv.celular)}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-slate-200 text-xs font-medium truncate">+{conv.celular}</span>
                      <span className="text-slate-500 text-[10px] flex-shrink-0 ml-1">
                        {relativeTime(conv.updated_at)}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] truncate leading-snug">
                      {lastMsg?.content ?? 'Sin mensajes'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {selected ? (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
                  {celularInitials(selected.celular)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">+{selected.celular}</p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ESTADO_COLOR[selected.estado]}`}>
                    {selected.estado}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected.estado !== 'cerrada' && (
                  <button
                    onClick={() => updateEstado(selected.id, 'cerrada')}
                    className="text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Marcar cerrada
                  </button>
                )}
                {selected.estado === 'cerrada' && (
                  <button
                    onClick={() => updateEstado(selected.id, 'activa')}
                    className="text-xs px-3 py-1.5 rounded-md border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
                  >
                    Reabrir
                  </button>
                )}
                {selected.estado === 'derivada' && (
                  <button
                    onClick={() => updateEstado(selected.id, 'activa')}
                    className="text-xs px-3 py-1.5 rounded-md bg-green-500 text-white hover:bg-green-600 transition-colors"
                  >
                    Tomar conversación
                  </button>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50">
              {selected.historial.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  Sin mensajes aún
                </div>
              ) : (
                selected.historial.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        msg.role === 'user'
                          ? 'bg-white text-slate-700 shadow-sm rounded-tl-sm'
                          : 'bg-green-100 text-green-900 shadow-sm rounded-tr-sm'
                      }`}
                    >
                      {msg.type && msg.type !== 'text' && (
                        <p className="text-[10px] font-medium opacity-50 mb-1 uppercase tracking-wide">
                          {msg.type === 'secretary' ? 'Secretaria' : msg.type}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-slate-400' : 'text-green-600'} text-right`}>
                        {formatHour(msg.ts)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            {selected.estado !== 'cerrada' && (
              <div className="px-5 py-3 bg-white border-t border-slate-200">
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    placeholder="Escribí tu respuesta… (Enter para enviar, Shift+Enter nueva línea)"
                    className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent min-h-[44px] max-h-32"
                    rows={1}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    className="w-10 h-10 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* ── FAQ SECTION ─────────────────────────────────────────────── */}
            <div className="bg-white border-t border-slate-200">
              <button
                onClick={() => setFaqOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span>Base de conocimiento (FAQ)</span>
                  {faqs.filter(f => !f.activo && f.origen === 'aprendida').length > 0 && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      {faqs.filter(f => !f.activo && f.origen === 'aprendida').length} sugeridas
                    </span>
                  )}
                </span>
                {faqOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>

              {faqOpen && (
                <div className="px-5 pb-4 space-y-4 max-h-72 overflow-y-auto">

                  {/* Suggested FAQs */}
                  {faqs.filter(f => !f.activo && f.origen === 'aprendida').length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-2">
                        Sugeridas por el asistente
                      </p>
                      <div className="space-y-2">
                        {faqs.filter(f => !f.activo && f.origen === 'aprendida').map(faq => (
                          <div key={faq.id} className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                            <p className="text-xs font-medium text-slate-700 mb-1">P: {faq.pregunta}</p>
                            <p className="text-xs text-slate-500 mb-2">R: {faq.respuesta}</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => toggleFaq(faq.id, true)}
                                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-green-500 text-white hover:bg-green-600 transition-colors"
                              >
                                <Check className="w-3 h-3" /> Aprobar
                              </button>
                              <button
                                onClick={() => deleteFaq(faq.id)}
                                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                              >
                                <X className="w-3 h-3" /> Descartar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active FAQs */}
                  {faqs.filter(f => f.activo).length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
                        Activas ({faqs.filter(f => f.activo).length})
                      </p>
                      <div className="space-y-1.5">
                        {faqs.filter(f => f.activo).map(faq => (
                          <div key={faq.id} className="flex items-start gap-2 group">
                            <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                              <p className="text-xs font-medium text-slate-700">P: {faq.pregunta}</p>
                              <p className="text-xs text-slate-500 mt-0.5">R: {faq.respuesta}</p>
                            </div>
                            <button
                              onClick={() => toggleFaq(faq.id, false)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                              title="Desactivar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add new FAQ */}
                  <div className="border border-dashed border-slate-200 rounded-lg p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Nueva pregunta frecuente
                    </p>
                    <input
                      value={newPregunta}
                      onChange={e => setNewPregunta(e.target.value)}
                      placeholder="Pregunta"
                      className="w-full text-xs border border-slate-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                    <textarea
                      value={newRespuesta}
                      onChange={e => setNewRespuesta(e.target.value)}
                      placeholder="Respuesta"
                      rows={2}
                      className="w-full text-xs border border-slate-200 rounded-md px-3 py-1.5 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                    <button
                      onClick={saveFaq}
                      disabled={!newPregunta.trim() || !newRespuesta.trim() || savingFaq}
                      className="text-xs px-3 py-1.5 rounded-md bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      {savingFaq ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Guardar FAQ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">Seleccioná una conversación</p>
              <p className="text-xs text-slate-400 mt-1">
                {derivCount > 0
                  ? `Hay ${derivCount} conversación${derivCount > 1 ? 'es' : ''} derivada${derivCount > 1 ? 's' : ''} esperando atención`
                  : 'No hay conversaciones derivadas'}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
