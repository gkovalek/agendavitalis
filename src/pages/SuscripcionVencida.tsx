import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CreditCard, LogOut } from 'lucide-react';
import { PLAN_PRECIO_USD } from '@/hooks/use-plan';

export default function SuscripcionVencida() {
  const { perfil, signOut } = useAuth();
  const plan = perfil?.plan ?? 'basico';
  const precio = PLAN_PRECIO_USD[plan];

  const handleContacto = () => {
    const msg = encodeURIComponent(`Hola, quiero renovar mi suscripción de Vitalis. Centro: ${perfil?.centro_id ?? ''}`);
    window.open(`https://wa.me/543624075957?text=${msg}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-[#080E1A] flex items-center justify-center">
            <svg width="38" height="38" viewBox="0 0 80 80" fill="none">
              <path d="M14 66 Q28 44 40 32 Q53 18 68 16" stroke="#234A73" strokeWidth="9" strokeLinecap="round" fill="none"/>
              <path d="M14 50 Q30 32 44 22 Q56 13 70 11" stroke="#21C8C0" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.9"/>
            </svg>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">VITALIS</h1>
          <Badge variant="destructive" className="mt-2">Suscripción vencida</Badge>
        </div>

        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 space-y-3">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-foreground font-medium">Tu período de prueba terminó</p>
          <p className="text-muted-foreground text-sm">
            Para seguir usando Vitalis necesitás activar tu suscripción.
            Tu plan actual es <strong>{plan}</strong> — ${precio.toLocaleString('es-AR')} ARS/prof/mes.
          </p>
        </div>

        <div className="space-y-3">
          <Button className="w-full gap-2" size="lg" onClick={handleContacto}>
            <CreditCard className="w-4 h-4" />
            Activar suscripción por WhatsApp
          </Button>
          <p className="text-xs text-muted-foreground">
            Escribinos y en minutos te activamos el acceso
          </p>
        </div>

        <button
          onClick={signOut}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mx-auto transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
