import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCentroConfig } from '@/hooks/use-centro-config';
import { Heart, Settings, LogOut, ChevronDown } from 'lucide-react';

interface NavItem {
  label: string;
  href?: string;
  disabled?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  disabled?: boolean;
}

const BASE_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Pacientes',
    items: [
      { label: 'Base de pacientes', href: '/pacientes' },
      { label: 'Nuevo paciente', href: '/pacientes/nuevo' },
      { label: 'Historias clínicas', href: '/historia-clinica' },
    ],
  },
  {
    label: 'Agendas',
    items: [
      { label: 'Gestión de Agendas', href: '/agendas' },
      { label: 'Profesionales', href: '/profesionales' },
      { label: 'Servicios', href: '/servicios' },
      { label: 'Tratamientos', href: '/tratamientos' },
    ],
  },
  {
    label: 'Caja',
    items: [
      { label: 'Caja del día', href: '/caja' },
      { label: 'Dashboard financiero', href: '/reportes' },
    ],
  },
  {
    label: 'Obras sociales',
    items: [
      { label: 'Gestión de obras sociales', href: '/obras-sociales' },
      { label: 'Liquidación mensual', href: '/liquidacion-os' },
    ],
  },
  {
    label: 'Recordatorios',
    items: [{ label: 'Recordatorios de turno', href: '/recordatorios' }],
  },
  {
    label: 'Autorizaciones',
    disabled: true,
    items: [{ label: 'Próximamente', disabled: true }],
  },
];

function DropdownMenu({ group, onNavigate }: { group: NavGroup; onNavigate: (href: string) => void }) {
  const location = useLocation();
  const isActive = group.items.some(i => i.href && location.pathname.startsWith(i.href));

  return (
    <div className="relative group h-full flex items-center">
      <button
        disabled={group.disabled}
        className={`
          flex items-center gap-0.5 px-2.5 h-full text-[12px] font-medium
          transition-colors whitespace-nowrap border-none bg-transparent
          ${group.disabled
            ? 'text-white/30 cursor-default'
            : isActive
              ? 'text-white bg-white/15'
              : 'text-white/75 hover:text-white hover:bg-white/10 cursor-pointer'
          }
        `}
      >
        {group.label}
        {!group.disabled && <ChevronDown className="w-3 h-3 ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity" />}
      </button>

      {!group.disabled && (
        <div className="absolute top-full left-0 z-[100] pt-0 hidden group-hover:block">
          {/* bridge invisible para no perder el hover */}
          <div className="h-1 w-full" />
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl min-w-[200px] py-1 overflow-hidden">
            {group.items.map((item, i) => (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => item.href && !item.disabled && onNavigate(item.href)}
                className={`
                  w-full text-left px-4 py-2.5 text-[13px] transition-colors
                  ${item.disabled
                    ? 'text-zinc-300 dark:text-zinc-600 cursor-default'
                    : location.pathname === item.href
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-[#0F6E56] dark:text-emerald-400 font-medium'
                      : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }
                `}
              >
                {item.label}
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
  const { perfil, centroId, signOut } = useAuth();
  const { get } = useCentroConfig(centroId);
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const rol = perfil?.rol_nombre ?? 'admin';
  const esAdmin = rol === 'admin' || !perfil?.rol_nombre;
  const esSecretario = rol === 'secretario';
  const esProfesional = rol === 'profesional';

  const navGroups = useMemo(() => {
    return BASE_NAV_GROUPS
      .map(group => {
        let items = group.items;

        // Profesional: no ve gestión de profesionales ni servicios
        if (esProfesional) {
          items = items.filter(i => i.href !== '/profesionales' && i.href !== '/servicios');
        }

        // Secretario: filtra según config
        if (esSecretario) {
          const verCaja = get('secretario_ver_caja') !== 'false';
          const verLiquidacion = get('secretario_ver_liquidacion') !== 'false';
          if (!verCaja && group.label === 'Caja') return null;
          if (!verLiquidacion) {
            items = items.filter(i => i.href !== '/liquidacion-os');
          }
        }

        if (items.length === 0) return null;
        return { ...group, items };
      })
      .filter(Boolean) as NavGroup[];
  }, [rol, esSecretario, esProfesional, get]);

  const mostrarConfig = esAdmin;

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
    ? perfil.nombre.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <header className="h-10 flex items-stretch bg-[#0F6E56] shrink-0 z-40 relative select-none">
      {/* Brand */}
      <div className="flex items-center gap-1.5 px-3 border-r border-white/20 shrink-0">
        <Heart className="w-3.5 h-3.5 text-white" />
        <span className="text-white font-semibold text-[13px] tracking-tight">Vitalis</span>
      </div>

      {/* Nav — flex sin overflow */}
      <nav className="flex items-stretch flex-1 min-w-0">
        <button
          onClick={() => navigate('/dashboard')}
          className={`
            flex items-center px-3 h-full text-[12px] font-semibold
            transition-colors whitespace-nowrap border-none shrink-0 cursor-pointer
            ${location.pathname === '/dashboard'
              ? 'bg-white text-[#0F6E56]'
              : 'bg-white/90 text-[#0F6E56] hover:bg-white'
            }
          `}
        >
          Panel principal
        </button>
        {navGroups.map((group, i) => (
          <DropdownMenu key={i} group={group} onNavigate={navigate} />
        ))}
      </nav>

      {/* Right */}
      <div className="flex items-center gap-0.5 px-2 shrink-0 border-l border-white/20">
        {mostrarConfig && (
          <button
            onClick={() => navigate('/configuracion')}
            className="p-1.5 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Configuración"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-bold text-white">
              {initials}
            </div>
            <span className="text-[12px] hidden sm:block">{perfil?.nombre?.split(' ')[0]}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl min-w-[200px] py-1 z-[100]">
              <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-100">{perfil?.nombre}</p>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">{perfil?.mail}</p>
              </div>
              {mostrarConfig && (
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/configuracion'); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left"
                >
                  <Settings className="w-3.5 h-3.5 opacity-60" /> Configuración
                </button>
              )}
              <button
                onClick={() => { setUserMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
              >
                <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
