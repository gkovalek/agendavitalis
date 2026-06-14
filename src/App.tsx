import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Pacientes from "@/pages/Pacientes";
import NuevoPaciente from "@/pages/NuevoPaciente";
import Profesionales from "@/pages/Profesionales";
import Equipos from "@/pages/Equipos";
import Servicios from "@/pages/Servicios";
import GestionAgendas from "@/pages/GestionAgendas";
import ObrasSociales from "@/pages/ObrasSociales";
import LiquidacionOS from "@/pages/LiquidacionOS";
import Caja from "@/pages/Caja";
import Tratamientos from "@/pages/Tratamientos";
import Recordatorios from "@/pages/Recordatorios";
import HistoriaClinica from "@/pages/HistoriaClinica";
import Reportes from "@/pages/Reportes";
import PedidosMedicos from "@/pages/PedidosMedicos";
import Configuracion from "@/pages/Configuracion";
import PortalPublico from "@/pages/PortalPublico";
import NotFound from "@/pages/NotFound";
import ResetPassword from "@/pages/ResetPassword";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return <AppLayout>{children}</AppLayout>;
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
    <Routes>
      {/* Rutas públicas */}
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/reservar/:centroId" element={<PortalPublico />} />

      {/* Rutas protegidas */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
      <Route path="/pedidos-medicos" element={<ProtectedRoute><PedidosMedicos /></ProtectedRoute>} />
      <Route path="/configuracion" element={<ProtectedRoute><Configuracion /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
