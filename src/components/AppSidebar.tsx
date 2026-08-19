import { LayoutDashboard, Users, UserPlus, LogOut, Stethoscope, Building2, DollarSign, FileText, Wrench, UsersRound, Activity, Bell, BarChart2, Settings, Lock, BookOpen, UserCircle, Bot, CalendarDays } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan, type Feature } from '@/hooks/use-plan';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, SidebarHeader, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

function VitalisIsotipo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 66 Q28 44 40 32 Q53 18 68 16" stroke="#60A5FA" strokeWidth="9" strokeLinecap="round" fill="none"/>
      <path d="M14 50 Q30 32 44 22 Q56 13 70 11" stroke="#2563EB" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".95"/>
    </svg>
  );
}

interface MenuItem { title: string; url: string; icon: React.ElementType; requiere?: Feature; soloNoSecretario?: boolean; }

const menuItems: MenuItem[] = [
  { title: 'Panel Principal', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Agenda', url: '/agendas', icon: CalendarDays },
  { title: 'Pacientes', url: '/pacientes', icon: Users },
  { title: 'Nuevo Paciente', url: '/pacientes/nuevo', icon: UserPlus },
  { title: 'Profesionales', url: '/profesionales', icon: Stethoscope, soloNoSecretario: true },
  { title: 'Equipos', url: '/equipos', icon: UsersRound, soloNoSecretario: true },
  { title: 'Servicios', url: '/servicios', icon: Wrench, soloNoSecretario: true },
  { title: 'Tratamientos', url: '/tratamientos', icon: Activity, requiere: 'tratamientos' },
  { title: 'Historia Clínica', url: '/historia-clinica', icon: FileText, requiere: 'historia_clinica' },
  { title: 'Recordatorios', url: '/recordatorios', icon: Bell },
  { title: 'Obras Sociales', url: '/obras-sociales', icon: Building2, requiere: 'obras_sociales' },
  { title: 'Caja', url: '/caja', icon: DollarSign },
  { title: 'Reportes', url: '/reportes', icon: BarChart2, requiere: 'reportes' },
  { title: 'Automatizaciones', url: '/faq', icon: Bot },
  { title: 'Configuración', url: '/configuracion', icon: Settings, soloNoSecretario: true },
  { title: 'Mi perfil', url: '/mi-perfil', icon: UserCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, perfil } = useAuth();
  const { tiene, planMinimoPara } = usePlan();
  const { toast } = useToast();
  const esSecretario = perfil?.rol_nombre === 'secretario';

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[.06] ring-1 ring-white/[.08]">
            <VitalisIsotipo size={26} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold tracking-[.16em] text-white">VITALIS</h2>
              <p className="mt-0.5 text-[11px] text-sidebar-foreground/50">Gestión que impulsa tu centro</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-sidebar-foreground/40">Gestión</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.filter(item => !(item.soloNoSecretario && esSecretario)).map((item) => {
                const bloqueado = item.requiere ? !tiene(item.requiere) : false;
                if (bloqueado) {
                  return <SidebarMenuItem key={item.title}><SidebarMenuButton asChild><button className="w-full opacity-35 transition hover:opacity-60" onClick={() => toast({ title: `Disponible en plan ${planMinimoPara(item.requiere!)}`, description: 'Actualizá tu plan para acceder a este módulo.' })}><item.icon className="mr-2 h-4 w-4 shrink-0" />{!collapsed && <><span className="flex-1 text-left">{item.title}</span><Lock className="ml-1 h-3 w-3" /></>}</button></SidebarMenuButton></SidebarMenuItem>;
                }
                return <SidebarMenuItem key={item.title}><SidebarMenuButton asChild><NavLink to={item.url} end={item.url === '/dashboard'} className="rounded-xl px-3 py-2.5 text-sidebar-foreground/70 transition-all duration-200 hover:bg-white/[.06] hover:text-white" activeClassName="bg-primary/15 text-white shadow-[inset_3px_0_0_#2563EB] font-semibold"><item.icon className="mr-2 h-4 w-4" />{!collapsed && <span>{item.title}</span>}</NavLink></SidebarMenuButton></SidebarMenuItem>;
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && perfil && <div className="mb-2 rounded-xl bg-white/[.04] px-3 py-2"><p className="truncate text-xs font-medium text-white/85">{perfil.nombre}</p><p className="mt-0.5 truncate text-[10px] text-sidebar-foreground/45">{perfil.mail}</p></div>}
        <Button variant="ghost" className="w-full justify-start rounded-xl text-sidebar-foreground/60 hover:bg-white/[.06] hover:text-white" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />{!collapsed && 'Cerrar sesión'}</Button>
      </SidebarFooter>
    </Sidebar>
  );
}
