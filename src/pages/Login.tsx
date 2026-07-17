import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Heart, Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://agendavitalis.lovable.app/reset-password',
    });
    setResetLoading(false);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo enviar el enlace. Verificá el email.', variant: 'destructive' });
    } else {
      toast({ title: 'Enlace enviado', description: 'Revisá tu bandeja de entrada para restablecer tu contraseña.' });
      setForgotMode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setLoginError(error);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Heart className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Vitalis</h1>
          <p className="text-muted-foreground mt-1">Sistema de Gestión de Turnos Médicos</p>
        </div>

        <Card className="shadow-lg border-border/50">
          {forgotMode ? (
            <>
              <CardHeader className="pb-4">
                <h2 className="text-lg font-semibold text-foreground">Recuperar contraseña</h2>
                <p className="text-sm text-muted-foreground">Ingresá tu email para recibir un enlace de recuperación</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input id="reset-email" type="email" placeholder="usuario@vitalis.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={resetLoading}>
                    {resetLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Enviar enlace de recuperación
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setForgotMode(false)}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Volver al inicio de sesión
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="pb-4">
                <h2 className="text-lg font-semibold text-foreground">Iniciar Sesión</h2>
                <p className="text-sm text-muted-foreground">Ingresá tus credenciales para acceder</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="usuario@vitalis.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  {loginError && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                      {loginError}
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Ingresar
                  </Button>
                  <button type="button" className="w-full text-sm text-primary hover:underline" onClick={() => setForgotMode(true)}>
                    ¿Olvidaste tu contraseña?
                  </button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
