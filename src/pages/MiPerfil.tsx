import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, XCircle, User, CreditCard, Lock, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { FaqManagerTab } from '@/components/FaqManagerTab';

const MP_APP_ID   = import.meta.env.VITE_MP_APP_ID as string | undefined;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface Servicio { id: string; nombre: string; }

export default function MiPerfil() {
  const { perfil } = useAuth();
  const { toast } = useToast();

  // ── Servicios del profesional ─────────────────────────────────────────────
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [openProfFaq, setOpenProfFaq] = useState(true);
  const [openServFaq, setOpenServFaq] = useState(false);

  useEffect(() => {
    if (!perfil?.profesional_id) return;
    supabase
      .from('profesional_centro_servicio')
      .select('servicio_id, servicios(id, nombre)')
      .eq('profesional_id', perfil.profesional_id)
      .eq('activo', true)
      .then(({ data }) => {
        const items: Servicio[] = (data ?? [])
          .map((r: any) => r.servicios)
          .filter(Boolean)
          .filter((s: Servicio, i: number, arr: Servicio[]) => arr.findIndex(x => x.id === s.id) === i);
        setServicios(items);
      });
  }, [perfil?.profesional_id]);

  // ── Mercado Pago ─────────────────────────────────────────────────────────────
  const [mpUserId, setMpUserId]           = useState<string | null>(null);
  const [mpLoading, setMpLoading]         = useState(false);
  const [mpConnecting, setMpConnecting]   = useState(false);
  const [mpDisconnecting, setMpDisconnecting] = useState(false);

  // Cargar estado MP del profesional actual
  useEffect(() => {
    if (!perfil?.profesional_id) return;
    setMpLoading(true);
    supabase
      .from('profesionales')
      .select('mp_user_id')
      .eq('id', perfil.profesional_id)
      .single()
      .then(({ data }) => {
        setMpUserId(data?.mp_user_id ?? null);
        setMpLoading(false);
      });
  }, [perfil?.profesional_id]);

  // Detectar redirect de MP con ?code=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    // Limpiar query params inmediatamente
    window.history.replaceState({}, '', window.location.pathname);

    const profesionalId = params.get('state') ?? perfil?.profesional_id ?? undefined;
    if (!profesionalId) return;

    const exchangeCode = async () => {
      setMpConnecting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/mp-oauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ code, profesional_id: profesionalId, redirect_uri: window.location.origin + '/mi-perfil' }),
      });
      const json = await res.json();
      setMpConnecting(false);
      if (json.ok) {
        setMpUserId(json.mp_user_id);
        toast({ title: '¡Mercado Pago conectado!', description: `Cuenta ${json.mp_user_id} vinculada correctamente.` });
      } else {
        toast({ title: 'Error al conectar MP', description: json.error ?? 'Intentá de nuevo.', variant: 'destructive' });
      }
    };

    exchangeCode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMpConnect = () => {
    if (!MP_APP_ID) {
      toast({ title: 'MP_APP_ID no configurado', variant: 'destructive' });
      return;
    }
    if (!perfil?.profesional_id) return;
    const redirectUri = encodeURIComponent(window.location.origin + '/mi-perfil');
    const state = encodeURIComponent(perfil.profesional_id);
    const url = `https://auth.mercadopago.com/authorization?client_id=${MP_APP_ID}&response_type=code&platform_id=mp&redirect_uri=${redirectUri}&state=${state}`;
    window.location.href = url;
  };

  const handleMpDisconnect = async () => {
    if (!perfil?.profesional_id) return;
    setMpDisconnecting(true);
    await supabase
      .from('profesionales')
      .update({ mp_access_token: null, mp_public_key: null, mp_user_id: null, mp_refresh_token: null })
      .eq('id', perfil.profesional_id);
    setMpUserId(null);
    setMpDisconnecting(false);
    toast({ title: 'Mercado Pago desconectado' });
  };

  // ── Cambiar contraseña ───────────────────────────────────────────────────────
  const [sendingReset, setSendingReset] = useState(false);

  const handleResetPassword = async () => {
    if (!perfil?.mail) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.mail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) {
      toast({ title: 'Error al enviar el correo', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Correo enviado', description: `Revisá tu casilla ${perfil.mail} para restablecer tu contraseña.` });
    }
  };

  if (!perfil) return null;

  const planLabel: Record<string, string> = {
    basico: 'Básico',
    intermedio: 'Intermedio',
    premium: 'Premium',
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <User className="h-6 w-6" />
        Mi perfil
      </h1>

      {/* ── Datos personales ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos personales</CardTitle>
          <CardDescription>Información de tu cuenta en Vitalis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nombre</span>
            <span className="font-medium">{perfil.nombre}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{perfil.mail}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rol</span>
            <span className="font-medium">{perfil.rol_nombre ?? '—'}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Plan del centro</span>
            <Badge variant="secondary">{planLabel[perfil.plan] ?? perfil.plan}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Mercado Pago (solo profesionales) ── */}
      {perfil.profesional_id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Mi cuenta de Mercado Pago
            </CardTitle>
            <CardDescription>
              Conectá tu cuenta personal de Mercado Pago para recibir pagos online de tus pacientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mpLoading || mpConnecting ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {mpConnecting ? 'Conectando con Mercado Pago…' : 'Cargando estado…'}
              </div>
            ) : mpUserId ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Cuenta conectada:</span>
                  <span className="font-mono font-medium">{mpUserId}</span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleMpDisconnect}
                  disabled={mpDisconnecting}
                >
                  {mpDisconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                  Desconectar
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <XCircle className="h-4 w-4" />
                  No tenés ninguna cuenta conectada
                </div>
                <Button size="sm" onClick={handleMpConnect}>
                  Conectar Mercado Pago
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── FAQ IA (solo profesionales) ── */}
      {perfil.profesional_id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Preguntas frecuentes — Asistente IA
            </CardTitle>
            <CardDescription>
              El bot de WhatsApp usará estas respuestas para contestar consultas de tus pacientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">

            {/* Desplegable: Preguntas sobre el profesional */}
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setOpenProfFaq(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
              >
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Preguntas sobre el profesional
                </span>
                {openProfFaq ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
              {openProfFaq && (
                <div className="px-4 pb-4 pt-2 border-t border-border">
                  <FaqManagerTab
                    table="faq_profesional"
                    field="profesional_id"
                    entityId={perfil.profesional_id}
                    entityNombre={perfil.nombre}
                  />
                </div>
              )}
            </div>

            {/* Desplegable: Preguntas sobre los servicios */}
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setOpenServFaq(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Preguntas sobre los servicios
                </span>
                {openServFaq ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
              {openServFaq && (
                <div className="px-4 pb-4 pt-2 border-t border-border space-y-4">
                  {servicios.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No tenés servicios asignados todavía.</p>
                  ) : (
                    servicios.map(s => (
                      <div key={s.id}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{s.nombre}</p>
                        <FaqManagerTab
                          table="faq_servicio"
                          field="servicio_id"
                          entityId={s.id}
                          entityNombre={s.nombre}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      )}

      {/* ── Cambiar contraseña ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Contraseña
          </CardTitle>
          <CardDescription>
            Te enviaremos un enlace a {perfil.mail} para que puedas cambiar tu contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetPassword}
            disabled={sendingReset}
          >
            {sendingReset && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Enviar enlace de recuperación
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
