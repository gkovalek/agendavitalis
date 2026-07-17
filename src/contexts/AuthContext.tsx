import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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
  rol_nombre: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  perfil: UsuarioPerfil | null;
  centroId: string | null;
  loading: boolean;
  perfilError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface FetchPerfilResult {
  perfil: UsuarioPerfil | null;
  error: string | null;
  shouldSignOut?: boolean;
}

async function fetchPerfil(userId: string): Promise<FetchPerfilResult> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, auth_user_id, centro_id, rol_id, profesional_id, nombre, mail, activo, rol:roles(nombre)')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (error) return { perfil: null, error: 'No se pudo cargar tu perfil. Intentá de nuevo.' };
  if (!data) return { perfil: null, error: 'Tu cuenta existe en autenticación, pero no tiene perfil asignado en Vitalis.' };

  const rolData = data.rol as any;
  const perfil: UsuarioPerfil = {
    id: data.id,
    auth_user_id: data.auth_user_id,
    centro_id: data.centro_id,
    rol_id: data.rol_id,
    profesional_id: data.profesional_id,
    nombre: data.nombre,
    mail: data.mail,
    activo: data.activo,
    rol_nombre: rolData?.nombre ?? null,
  };

  if (!perfil.activo) {
    return { perfil: null, error: 'Tu cuenta está desactivada. Contactá al administrador.', shouldSignOut: true };
  }

  if (!perfil.centro_id) {
    return { perfil, error: 'Tu usuario no está asociado a ningún centro. Contactá al administrador.' };
  }

  return { perfil, error: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [perfilError, setPerfilError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPerfil = async (userId: string) => {
    const result = await fetchPerfil(userId);
    if (result.shouldSignOut) await supabase.auth.signOut();
    setPerfil(result.perfil);
    setPerfilError(result.error);
  };

  useEffect(() => {
    // Carga inicial: getSession es la fuente de verdad para el primer render
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) await loadPerfil(session.user.id);
      setLoading(false);
    });

    // Cambios posteriores: login, logout, refresh de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await loadPerfil(session.user.id);
      } else {
        setPerfil(null);
        setPerfilError(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No se pudo obtener el usuario autenticado.' };

    const result = await fetchPerfil(user.id);
    if (result.shouldSignOut) await supabase.auth.signOut();
    setPerfil(result.perfil);
    setPerfilError(result.error);
    return { error: result.error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPerfil(null);
    setPerfilError(null);
  };

  const centroId = perfil?.centro_id ?? null;

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, perfil, centroId, loading, perfilError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
