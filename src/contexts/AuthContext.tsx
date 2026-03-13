import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface UsuarioPerfil {
  id: string;
  auth_user_id: string;
  centro_id: string | null;
  rol_id: string | null;
  profesional_id: string | null;
  nombre: string;
  mail: string;
  activo: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  perfil: UsuarioPerfil | null;
  loading: boolean;
  perfilError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchPerfil(userId: string): Promise<{ perfil: UsuarioPerfil | null; error: string | null }> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, auth_user_id, centro_id, rol_id, profesional_id, nombre, mail, activo')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (error) return { perfil: null, error: error.message };
  if (!data) return { perfil: null, error: 'Tu cuenta existe en autenticación, pero no tiene perfil asignado en Vitalis.' };
  return { perfil: data as UsuarioPerfil, error: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [perfilError, setPerfilError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPerfil = async (userId: string) => {
    const { perfil, error } = await fetchPerfil(userId);
    setPerfil(perfil);
    setPerfilError(error);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadPerfil(session.user.id);
      } else {
        setPerfil(null);
        setPerfilError(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadPerfil(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No se pudo obtener el usuario autenticado.' };

    const result = await fetchPerfil(user.id);
    setPerfil(result.perfil);
    setPerfilError(result.error);
    return { error: result.error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPerfil(null);
    setPerfilError(null);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, perfil, loading, perfilError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
