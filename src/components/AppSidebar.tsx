import { LayoutDashboard, Users, UserPlus, LogOut, Heart, Stethoscope, Building2, DollarSign, FileText, Wrench, UsersRound, Activity, Bell, BarChart2, Settings, Lock } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan, type Feature } from '@/hooks/use-plan';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface MenuItem {
  title: string;
  url: string;
  icon: React.ElementType;
  requiere?: Feature;
}

const menuItems: MenuItem[] = [
  { title: 'Panel Principal',  url: '/dashboard',       icon: LayoutDashboard },
  { title: 'Pacientes',        url: '/pacientes',        icon: Users },
  { title: 'Nuevo Paciente',   url: '/pacientes/nuevo',  icon: UserPlus },
  { title: 'Profesionales',    url: '/profesionales',    icon: Stethoscope },
  { title: 'Equipos',          url: '/equipos',          icon: UsersRound },
  { title: 'Servicios',        url: '/servicios',        icon: Wrench },
  { title: 'Tratamientos',     url: '/tratamientos',     icon: Activity,   requiere: 'tratamientos' },
  { title: 'Historia Clínica', url: '/historia-clinica', icon: FileText,   requiere: 'historia_clinica' },
  { title: 'Recordatorios',    url: '/recordatorios',    icon: Bell },
  { title: 'Obras Sociales',   url: '/obras-sociales',   icon: Building2,  requiere: 'obras_sociales' },
  { title: 'Caja',             url: '/caja',             icon: DollarSign },
  { title: 'Reportes',         url: '/reportes',         icon: BarChart2,  requiere: 'reportes' },
  { title: 'Configuración',    url: '/configuracion',    icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, perfil } = useAuth();
  const { tiene, planMinimoPara } = usePlan();
  const { toast } = useToast();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sidebar-accent">
            <Heart className="w-5 h-5 text-sidebar-accent-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-base font-bold text-sidebar-foreground tracking-tight">Vitalis</h2>
              <p className="text-xs text-sidebar-foreground/60">Gestión Médica</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">Menú</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const bloqueado = item.requiere ? !tiene(item.requiere) : false;

                if (bloqueado) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <button
                          className="w-full flex items-center opacity-40 cursor-pointer hover:opacity-60 transition-opacity"
                          onClick={() => toast({
                            title: `Disponible en plan ${planMinimoPara(item.requiere!)}`,
                            description: 'Actualizá tu plan para acceder a este módulo.',
                          })}
                        >
                          <item.icon className="mr-2 h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <>
                              <span className="flex-1 text-left">{item.title}</span>
                              <Lock className="h-3 w-3 ml-1 shrink-0" />
                            </>
                          )}
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === '/dashboard'}
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && perfil && (
          <p className="text-xs text-sidebar-foreground/50 truncate mb-2 px-2">{perfil.nombre} — {perfil.mail}</p>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && 'Cerrar Sesión'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
