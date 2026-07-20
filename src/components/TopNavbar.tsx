import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCentroConfig } from '@/hooks/use-centro-config';
import { usePlan, type Feature } from '@/hooks/use-plan';
import { useToast } from '@/hooks/use-toast';
import { Heart, Settings, LogOut, ChevronDown, Lock } from 'lucide-react';

interface NavItem {
  label: string;
  href?: string;
  disabled?: boolean;
  requiere?: Feature;
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
      { label: 'Historias clínicas', href: '/historia-clinica', requiere: 'historia_clinica' },
    ],
  },
  {
    label: 'Agendas',
    items: [
      { label: 'Gestión de Agendas', href: '/agendas' },
      { label: 'Profesionales', href: '/profesionales' },
      { label: 'Servicios', href: '/servicios' },
      { label: 'Tratamientos', href: '/tratamientos', requiere: 'tratamientos' },
    ],
  },
  {
    label: 'Caja',
    items: [
      { label: 'Caja del día', href: '/caja' },
      { label: 'Dashboard financiero', href: '/reportes', requiere: 'reportes' },
      { label: 'Estado de Resultados', href: '/eerr', requiere: 'eerr' },
    ],
  },
  {
    label: 'Obras sociales',
    items: [
      { label: 'Gestión de obras sociales', href: '/obras-sociales', requiere: 'obras_sociales' },
      { label: 'Liquidación mensual', href: '/liquidacion-os', requiere: 'liquidacion_os' },
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

function DropdownMenu({
  group, onNavigate, tieneFeature, planMinimoPara, onLocked,
}: {
  group: NavGroup;
  onNavigate: (href: string) => void;
  tieneFeature: (f: Feature) => boolean;
  planMinimoPara: (f: Feature) => string;
  onLocked: (planNombre: string) => void;
}) {
  const location = useLocation();
  const isActive = group.items.some(i => i.href && location.pathname.startsWith(i.href));

  return (
    <div className="relative group h-full flex items-center">
      <button
        disabled={group.disabled}
        className={`
          flex items-center gap-0.5 px-3 h-full text-[13px] font-medium
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
        {!group.disabled && <ChevronDown className="w-3 h-3 ml-1 opacity-60 group-hover:opacity-100 transition-opacity" />}
      </button>

      {!group.disabled && (
        <div className="absolute top-full left-0 z-[100] pt-0 hidden group-hover:block">
          <div className="h-1 w-full" />
          <div className="bg-popover border border-border rounded-lg shadow-xl min-w-[210px] py-1 overflow-hidden">
            {group.items.map((item, i) => {
              const bloqueado = item.requiere ? !tieneFeature(item.requiere) : false;
              return (
                <button
                  key={i}
                  disabled={item.disabled}
                  onClick={() => {
                    if (bloqueado) { onLocked(planMinimoPara(item.requiere!)); return; }
                    if (item.href && !item.disabled) onNavigate(item.href);
                  }}
                  className={`
                    w-full text-left px-4 py-2.5 text-[13px] transition-colors flex items-center justify-between
                    ${item.disabled
                      ? 'text-muted-foreground/40 cursor-default'
                      : bloqueado
                        ? 'text-muted-foreground/50 cursor-pointer hover:bg-accent/50'
                        : location.pathname === item.href
                          ? 'bg-accent text-primary font-medium'
                          : 'text-popover-foreground hover:bg-accent'
                    }
                  `}
                >
                  <span>{item.label}</span>
                  {bloqueado && <Lock className="w-3 h-3 shrink-0 ml-2 opacity-60" />}
                </button>
              );
            })}
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
  const { tiene, planMinimoPara } = usePlan();
  const { toast } = useToast();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const rol = perfil?.rol_nombre ?? 'admin';
  const esAdmin = rol === 'admin' || rol === 'administrador' || !perfil?.rol_nombre;
  const esSecretario = rol === 'secretario';
  const esProfesional = rol === 'profesional';

  const navGroups = useMemo(() => {
    return BASE_NAV_GROUPS
      .map(group => {
        let items = group.items;

        if (esProfesional) {
          items = items.filter(i => i.href !== '/profesionales' && i.href !== '/servicios');
        }

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
    <header className="h-12 flex items-stretch bg-primary shrink-0 z-40 relative select-none">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 border-r border-white/20 shrink-0">
        <Heart className="w-4 h-4 text-white" />
        <span className="text-white font-semibold text-[14px] tracking-tight">Vitalis</span>
      </div>

      {/* Nav */}
      <nav className="flex items-stretch flex-1 min-w-0">
        <button
          onClick={() => navigate('/dashboard')}
          className={`
            flex items-center px-4 h-full text-[13px] font-semibold
            transition-colors whitespace-nowrap border-none shrink-0 cursor-pointer
            ${location.pathname === '/dashboard'
              ? 'bg-white text-primary'
              : 'bg-white/90 text-primary hover:bg-white'
            }
          `}
        >
          Panel principal
        </button>
        {navGroups.map((group, i) => (
          <DropdownMenu
            key={i}
            group={group}
            onNavigate={navigate}
            tieneFeature={tiene}
            planMinimoPara={planMinimoPara}
            onLocked={(planNombre) => toast({
              title: `Disponible en plan ${planNombre}`,
              description: 'Actualizá tu plan para acceder a este módulo.',
            })}
          />
        ))}
      </nav>

      {/* Right */}
      <div className="flex items-center gap-1 px-3 shrink-0 border-l border-white/20">
        {mostrarConfig && (
          <button
            onClick={() => navigate('/configuracion')}
            className="p-2 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Configuración"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center text-[11px] font-bold text-white">
              {initials}
            </div>
            <span className="text-[13px] hidden sm:block">{perfil?.nombre?.split(' ')[0]}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] bg-popover border border-border rounded-lg shadow-xl min-w-[210px] py-1 z-[100]">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[13px] font-semibold text-foreground">{perfil?.nombre}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{perfil?.mail}</p>
              </div>
              {mostrarConfig && (
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/configuracion'); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-popover-foreground hover:bg-accent text-left transition-colors"
                >
                  <Settings className="w-4 h-4 opacity-60" /> Configuración
                </button>
              )}
              <button
                onClick={() => { setUserMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-destructive hover:bg-destructive/10 text-left transition-colors"
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
