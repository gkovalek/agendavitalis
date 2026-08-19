import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TutorialProvider, useTutorialContext } from "@/contexts/TutorialContext";
import { AppLayout } from "@/components/AppLayout";
import { Tutorial } from "@/components/Tutorial";
import { Loader2 } from "lucide-react";

const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Pacientes = lazy(() => import("@/pages/Pacientes"));
const NuevoPaciente = lazy(() => import("@/pages/NuevoPaciente"));
const Profesionales = lazy(() => import("@/pages/Profesionales"));
const Equipos = lazy(() => import("@/pages/Equipos"));
const Servicios = lazy(() => import("@/pages/Servicios"));
const GestionAgendas = lazy(() => import("@/pages/GestionAgendas"));
const ObrasSociales = lazy(() => import("@/pages/ObrasSociales"));
const LiquidacionOS = lazy(() => import("@/pages/LiquidacionOS"));
const Caja = lazy(() => import("@/pages/Caja"));
const Tratamientos = lazy(() => import("@/pages/Tratamientos"));
const Recordatorios = lazy(() => import("@/pages/Recordatorios"));
const HistoriaClinica = lazy(() => import("@/pages/HistoriaClinica"));
const Reportes = lazy(() => import("@/pages/Reportes"));
const EERR = lazy(() => import("@/pages/EERR"));
const Configuracion = lazy(() => import("@/pages/Configuracion"));
const PortalPublico = lazy(() => import("@/pages/PortalPublico"));
const PagoResultado = lazy(() => import("@/pages/PagoResultado"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const SecretariaWhatsApp = lazy(() => import("@/pages/SecretariaWhatsApp"));
const FaqManager = lazy(() => import("@/pages/FaqManager"));
const MiPerfil = lazy(() => import("@/pages/MiPerfil"));
const Landing = lazy(() => import("@/pages/Landing"));
const Registro = lazy(() => import("@/pages/Registro"));
const SuscripcionVencida = lazy(() => import("@/pages/SuscripcionVencida"));
const SuperAdmin = lazy(() => import("@/pages/admin/SuperAdmin"));
const Ayuda = lazy(() => import("@/pages/Ayuda"));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, perfil, perfilError, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (perfil && (perfil.suscripcion_estado === 'vencido' || perfil.suscripcion_estado === 'suspendido')) {
    return <SuscripcionVencida />;
  }

  if (perfilError && !perfil) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-destructive font-medium">{perfilError}</p>
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => window.location.href = '/login'}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return <AppLayout>{children}</AppLayout>;
}

function AppRoutesWithTutorial() {
  const { session } = useAuth();
  const { startTutorial, tutorialActive, stopTutorial } = useTutorialContext();

  useEffect(() => {
    if (session && localStorage.getItem('vitalis_tutorial_done') !== '1') {
      const timer = setTimeout(() => startTutorial(), 800);
      return () => clearTimeout(timer);
    }
  }, [session, startTutorial]);

  return (
    <>
      <Tutorial active={tutorialActive} onClose={stopTutorial} />
      <AppRoutes />
    </>
  );
}

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <Routes>
        {/* Rutas públicas */}
        <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reservar/:centroId" element={<PortalPublico />} />
        <Route path="/reservas/:slug" element={<PortalPublico />} />
        <Route path="/pago/success" element={<PagoResultado tipo="success" />} />
        <Route path="/pago/failure" element={<PagoResultado tipo="failure" />} />
        <Route path="/pago/pending" element={<PagoResultado tipo="pending" />} />
        <Route path="/secretaria" element={<SecretariaWhatsApp />} />

        <Route path="/landing" element={<Landing />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/suscripcion-vencida" element={<SuscripcionVencida />} />

        {/* Rutas protegidas */}
        <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <Landing />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/pacientes" element={<ProtectedRoute><Pacientes /></ProtectedRoute>} />
        <Route path="/pacientes/nuevo" element={<ProtectedRoute><NuevoPaciente /></ProtectedRoute>} />
        <Route path="/profesionales" element={<ProtectedRoute><Profesionales /></ProtectedRoute>} />
        <Route path="/agendas" element={<ProtectedRoute><GestionAgendas /></ProtectedRoute>} />
        <Route path="/equipos" element={<ProtectedRoute><Equipos /></ProtectedRoute>} />
        <Route path="/servicios" element={<ProtectedRoute><Servicios /></ProtectedRoute>} />
        <Route path="/obras-sociales" element={<ProtectedRoute><ObrasSociales /></ProtectedRoute>} />
        <Route path="/liquidacion-os" element={<ProtectedRoute><LiquidacionOS /></ProtectedRoute>} />
        <Route path="/caja" element={<ProtectedRoute><Caja /></ProtectedRoute>} />
        <Route path="/caja/crear" element={<ProtectedRoute><Caja /></ProtectedRoute>} />
        <Route path="/tratamientos" element={<ProtectedRoute><Tratamientos /></ProtectedRoute>} />
        <Route path="/recordatorios" element={<ProtectedRoute><Recordatorios /></ProtectedRoute>} />
        <Route path="/historia-clinica" element={<ProtectedRoute><HistoriaClinica /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute><Reportes /></ProtectedRoute>} />
        <Route path="/eerr" element={<ProtectedRoute><EERR /></ProtectedRoute>} />
        <Route path="/configuracion" element={<ProtectedRoute><Configuracion /></ProtectedRoute>} />
        <Route path="/faq" element={<ProtectedRoute><FaqManager /></ProtectedRoute>} />
        <Route path="/mi-perfil" element={<ProtectedRoute><MiPerfil /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
        <Route path="/ayuda" element={<ProtectedRoute><Ayuda /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TutorialProvider>
            <AppRoutesWithTutorial />
          </TutorialProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
