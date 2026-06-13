import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Heart, Users, UserPlus, FileText, ClipboardList,
  Calendar, Stethoscope, Wrench, Activity,
  DollarSign, PlusCircle, BarChart2,
  Building2, Bell, ShieldCheck,
  Settings, LogOut, ChevronDown,
} from 'lucide-react';

interface NavItem {
  label: string;
  href?: string;
  disabled?: boolean;
}

interface NavGroup {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  disabled?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Pacientes',
    icon: Users,
    items: [
      { label: 'Base de pacientes', href: '/pacientes' },
      { label: 'Nuevo paciente', href: '/pacientes/nuevo' },
      { label: 'Historias clínicas', href: '/historia-clinica' },
      { label: 'Pedidos médicos', href: '/pedidos-medicos' },
    ],
  },
  {
    label: 'Agendas',
    icon: Calendar,
    items: [
      { label: 'Panel principal', href: '/dashboard' },
      { label: 'Profesionales', href: '/profesionales' },
      { label: 'Servicios', href: '/servicios' },
      { label: 'Tratamientos', href: '/tratamientos' },
    ],
  },
  {
    label: 'Caja',
    icon: DollarSign,
    items: [
      { label: 'Crear caja', href: '/caja/crear' },
      { label: 'Caja del día', href: '/caja' },
      { label: 'Dashboard financiero', href: '/reportes' },
    ],
  },
  {
    label: 'Obras sociales',
    icon: Building2,
    disabled: false,
    items: [
      { label: 'Gestión de obras sociales', href: '/obras-sociales' },
    ],
  },
  {
    label: 'Recordatorios',
    icon: Bell,
    disabled: true,
    items: [
      { label: 'Recordatorios de turnos', href: '/recordatorios', disabled: true },
    ],
  },
  {
    label: 'Autorizaciones',
    icon: ShieldCheck,
    disabled: true,
    items: [
      { label: 'Gestión de autorizaciones', href: '/autorizaciones', disabled: true },
    ],
  },
];

function DropdownMenu({ group, onNavigate }: { group: NavGroup; onNavigate: (href: string) => void }) {
  const location = useLocation();
  const isActive = group.items.some(i => i.href && location.pathname === i.href);

  return (
    <div className="relative group">
      <button
        className={`flex items-center gap-1.5 px-3 h-11 text-[13px] transition-colors whitespace-nowrap border-none bg-transparent cursor-pointer
          ${group.disabled
            ? 'text-white/40 cursor-not-allowed'
            : isActive
              ? 'text-white bg-white/15'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        disabled={group.disabled}
      >
        <group.icon className="w-[15px] h-[15px]" />
        <span>{group.label}</span>
        {!group.disabled && <ChevronDown className="w-3 h-3 opacity-60" />}
      </button>

      {!group.disabled && (
        <div className="absolute top-full left-0 z-50 hidden group-hover:block pt-1">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg min-w-[210px] py-1.5 overflow-hidden">
            {group.items.map((item, i) => (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => item.href && !item.disabled && onNavigate(item.href)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors
                  ${item.disabled
                    ? 'text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                    : location.pathname === item.href
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
              >
                {item.label}
                {item.disabled && <span className="ml-auto text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">Próximamente</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopNavbar() {
  const navigate = useNavigate();
  const { perfil, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = perfil?.nombre
    ? perfil.nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <header className="h-11 flex items-center bg-[#0F6E56] shrink-0 z-40 relative">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 pr-5 border-r border-white/20 h-full shrink-0">
        <Heart className="w-4 h-4 text-white" />
        <span className="text-white font-semibold text-[14px]">Vitalis</span>
      </div>

      {/* Nav groups */}
      <nav className="flex items-center h-full overflow-x-auto scrollbar-none">
        {NAV_GROUPS.map((group, i) => (
          <DropdownMenu key={i} group={group} onNavigate={navigate} />
        ))}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-1 px-3 shrink-0">
        <button
          onClick={() => navigate('/configuracion')}
          className="flex items-center justify-center w-8 h-8 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 px-2 py-1 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-semibold text-white">
              {initials}
            </div>
            <span className="text-[13px] hidden sm:block">{perfil?.nombre?.split(' ')[0]}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg min-w-[180px] py-1.5 z-50">
              <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{perfil?.nombre}</p>
                <p className="text-[11px] text-zinc-400 truncate">{perfil?.mail}</p>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/configuracion'); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
              >
                <Settings className="w-4 h-4" /> Configuración
              </button>
              <button
                onClick={() => { setUserMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
              >
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
