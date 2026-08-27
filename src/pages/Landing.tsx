import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Bot, CalendarDays, Check, ChevronRight, Clock3, Menu, ShieldCheck, Sparkles, Users, X, Zap } from 'lucide-react';
import { VitalisLogo } from '@/components/VitalisLogo';

const features = [
  { icon: CalendarDays, title: 'Agenda inteligente', text: 'Organizá profesionales, servicios y turnos desde una vista clara y rápida.' },
  { icon: Users, title: 'Pacientes en un solo lugar', text: 'Información, historias y seguimiento sin saltar entre sistemas.' },
  { icon: Bot, title: 'Automatizaciones e IA', text: 'Recordatorios y procesos que trabajan por tu centro mientras vos atendés.' },
  { icon: BarChart3, title: 'Control del negocio', text: 'Caja, reportes y resultados para decidir con información real.' },
];

const demoRows = [
  ['09:00', 'María González', 'Kinesiología', 'Confirmado'],
  ['10:00', 'Juan Pérez', 'Evaluación', 'Pendiente'],
  ['11:30', 'Lucía Fernández', 'Tratamiento', 'Confirmado'],
];


const WA_ASESORAMIENTO = 'https://wa.me/5493624075957';

const PLANES = [
  {
    key: 'starter',
    nombre: 'Starter',
    precio: 40000,
    descripcion: 'Para centros que arrancan o quieren ordenar su operación.',
    destacado: false,
    features: [
      { label: 'Portal público personalizado', ok: true },
      { label: 'Cobro con Mercado Pago', ok: true },
      { label: 'Hasta 3 agendas', ok: true },
      { label: 'Múltiples servicios', ok: true },
      { label: 'Recordatorios por mail', ok: true },
      { label: 'Recordatorios por WhatsApp', ok: true, detalle: '200/mes' },
      { label: 'Caja del día', ok: true },
      { label: 'Agente IA WhatsApp', ok: false },
      { label: 'Historias clínicas', ok: false },
      { label: 'Módulo Obras Sociales', ok: false },
      { label: 'Módulo Financiero', ok: false },
      { label: 'Tableros de indicadores', ok: false },
    ],
  },
  {
    key: 'profesional',
    nombre: 'Profesional',
    precio: 50000,
    descripcion: 'Para centros en crecimiento que necesitan más herramientas.',
    destacado: true,
    features: [
      { label: 'Portal público personalizado', ok: true },
      { label: 'Cobro con Mercado Pago', ok: true },
      { label: 'Hasta 6 agendas', ok: true },
      { label: 'Múltiples servicios', ok: true },
      { label: 'Recordatorios por mail', ok: true },
      { label: 'Recordatorios por WhatsApp', ok: true, detalle: '350/mes' },
      { label: 'Caja del día', ok: true },
      { label: 'Agente IA WhatsApp', ok: true },
      { label: 'Historias clínicas', ok: true },
      { label: 'Módulo Obras Sociales', ok: true },
      { label: 'Módulo Financiero', ok: true },
      { label: 'Tableros de indicadores', ok: false },
    ],
  },
  {
    key: 'premium',
    nombre: 'Premium',
    precio: 80000,
    descripcion: 'Para centros consolidados que quieren control total.',
    destacado: false,
    features: [
      { label: 'Portal público personalizado', ok: true },
      { label: 'Cobro con Mercado Pago', ok: true },
      { label: 'Agendas ilimitadas', ok: true },
      { label: 'Múltiples servicios', ok: true },
      { label: 'Recordatorios por mail', ok: true },
      { label: 'Recordatorios por WhatsApp', ok: true, detalle: '500/mes' },
      { label: 'Caja del día', ok: true },
      { label: 'Agente IA WhatsApp', ok: true },
      { label: 'Historias clínicas + adjuntos 500 MB', ok: true },
      { label: 'Módulo Obras Sociales', ok: true },
      { label: 'Módulo Financiero', ok: true },
      { label: 'Tableros de indicadores', ok: true },
    ],
  },
];

function PreciosSection() {
  const [semestral, setSemestral] = useState(false);

  function precioMostrar(base: number) {
    if (!semestral) return base;
    return Math.round(base * 0.85);
  }

  return (
    <section id="precios" className="bg-[#0B1120] px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-[.18em] text-blue-400">Planes y precios</span>
          <h2 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">Elegí el plan para tu centro</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">Todos los planes incluyen 14 días de prueba gratis. Sin tarjeta requerida.</p>

          {/* Toggle mensual/semestral */}
          <div className="mt-7 inline-flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5">
            <span className={`text-sm font-medium transition-colors ${!semestral ? 'text-white' : 'text-slate-400'}`}>Mensual</span>
            <button
              onClick={() => setSemestral(s => !s)}
              className={`relative h-6 w-11 rounded-full transition-colors ${semestral ? 'bg-primary' : 'bg-white/20'}`}
              aria-checked={semestral}
              role="switch"
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${semestral ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className={`text-sm font-medium transition-colors ${semestral ? 'text-white' : 'text-slate-400'}`}>
              Semestral
              <span className="ml-2 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">-15%</span>
            </span>
          </div>
        </div>

        {/* Cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {PLANES.map(plan => (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl border p-7 transition ${
                plan.destacado
                  ? 'border-primary bg-gradient-to-b from-primary/20 to-primary/5 shadow-[0_0_40px_rgba(37,99,235,0.2)]'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              {plan.destacado && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
                  Más elegido
                </div>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-400">{plan.nombre}</p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    ${precioMostrar(plan.precio).toLocaleString('es-AR')}
                  </span>
                  <span className="mb-1 text-sm text-slate-400">/mes</span>
                </div>
                {semestral && (
                  <p className="mt-1 text-xs text-slate-500">
                    Equivale a ${(precioMostrar(plan.precio) * 6).toLocaleString('es-AR')} por 6 meses
                  </p>
                )}
                <p className="mt-3 text-sm leading-6 text-slate-400">{plan.descripcion}</p>
              </div>

              <ul className="mt-7 flex-1 space-y-3">
                {plan.features.map(f => (
                  <li key={f.label} className={`flex items-start gap-3 text-sm ${f.ok ? 'text-slate-200' : 'text-slate-600'}`}>
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${f.ok ? 'bg-primary/20 text-blue-400' : 'bg-white/5'}`}>
                      {f.ok
                        ? <Check className="h-2.5 w-2.5" />
                        : <span className="text-[10px] leading-none">✕</span>
                      }
                    </span>
                    <span>
                      {f.label}
                      {'detalle' in f && f.detalle && (
                        <span className="ml-1.5 text-[11px] text-slate-500">({f.detalle})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-col gap-2.5">
                <Link
                  to="/registro"
                  className={`inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition ${
                    plan.destacado
                      ? 'btn-primary-glow bg-primary text-white hover:bg-primary/90'
                      : 'border border-white/15 text-white hover:bg-white/10'
                  }`}
                >
                  Quiero una demo <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <a
                  href={WA_ASESORAMIENTO}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-white/8 px-5 py-2.5 text-sm font-medium text-slate-400 transition hover:text-white hover:border-white/20"
                >
                  Quiero asesoramiento
                </a>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate-500">
          Todos los precios en ARS. Sin cargos ocultos. Podés cambiar de plan cuando quieras.
        </p>
      </div>
    </section>
  );
}

const FAQS = [
  {
    pregunta: '¿Sirve para cualquier profesión de la salud?',
    respuesta: 'Sí. Vitalis está diseñado para trabajar con cualquier profesional del área de la salud: kinesiólogos, médicos, psicólogos, nutricionistas, odontólogos y más. La plataforma se adapta a los servicios y obras sociales de cada especialidad.',
  },
  {
    pregunta: '¿Está preparado para centros con más de un profesional?',
    respuesta: 'Sí. Vitalis permite gestionar múltiples profesionales de forma independiente: cada uno puede tener sus propios servicios, aranceles, horarios y obras sociales asignadas. Todo dentro del mismo centro.',
  },
  {
    pregunta: 'Tengo un sistema actual. ¿Puedo pasarme a Vitalis sin perder información?',
    respuesta: 'Completamente. Podés solicitar la base de datos de tus pacientes a tu sistema actual y nuestro equipo se encarga de configurar tu agenda o centro para que tengas toda la información disponible desde el primer día.',
  },
  {
    pregunta: 'Si necesito más mensajes de WhatsApp, ¿cómo lo gestiono?',
    respuesta: 'Vitalis está conectado al servicio oficial de WhatsApp Business de Meta. Si necesitás más mensajes de los incluidos en tu plan, podés adquirir paquetes adicionales a través del soporte de Vitalis, sin necesidad de cambiar de plan.',
  },
  {
    pregunta: '¿Puedo asociar mi propio número de WhatsApp para trabajar de forma exclusiva?',
    respuesta: 'Sí. En el Plan Premium podemos configurar un número exclusivo para tu centro con un cargo único de configuración de USD 200. Esto te permite operar con tu propia línea de WhatsApp Business de manera independiente.',
  },
];

function FaqSection() {
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-white px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-[.18em] text-primary">Dudas frecuentes</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">Preguntas frecuentes</h2>
          <p className="mt-4 text-sm leading-6 text-slate-500">¿No encontrás lo que buscás? <a href={WA_ASESORAMIENTO} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">Escribinos por WhatsApp.</a></p>
        </div>

        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white">
              <button
                onClick={() => setAbierto(abierto === i ? null : i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left gap-4 hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-semibold text-[#0F172A] leading-snug">{faq.pregunta}</span>
                <span className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-transform ${abierto === i ? 'rotate-45' : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </span>
              </button>
              {abierto === i && (
                <div className="px-6 pb-5">
                  <p className="text-sm leading-7 text-slate-500">{faq.respuesta}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgendaDemo() {
  return (
    <div className="vitalis-float relative overflow-hidden rounded-[28px] border border-white/70 bg-white p-3 shadow-[0_35px_90px_rgba(15,23,42,.16)] sm:p-4">
      <div className="rounded-[22px] border bg-[#F8FAFC] p-4 sm:p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Agenda</div>
            <div className="mt-1 text-lg font-bold text-[#0F172A]">Martes 19 de agosto</div>
          </div>
          <button className="btn-primary-glow rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white">+ Nuevo turno</button>
        </div>
        <div className="mb-3 grid grid-cols-[70px_1fr_100px] gap-3 border-b pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Hora</span><span>Paciente</span><span>Estado</span>
        </div>
        <div className="space-y-2">
          {demoRows.map(([time, patient, service, status], index) => (
            <div key={patient} className="vitalis-demo-row grid grid-cols-[70px_1fr_100px] items-center gap-3 rounded-2xl border bg-white px-3 py-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]"><Clock3 className="h-3.5 w-3.5 text-primary"/>{time}</div>
              <div className="min-w-0"><div className="truncate text-xs font-semibold text-[#0F172A]">{patient}</div><div className="truncate text-[10px] text-muted-foreground">{service}</div></div>
              <div className="flex items-center gap-1.5 text-[10px] font-medium"><span className={`h-1.5 w-1.5 rounded-full ${status === 'Confirmado' ? 'bg-emerald-500' : 'bg-amber-400'}`}/>{status}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#EFF6FF] px-3 py-3">
          <div className="flex items-center gap-2"><span className="vitalis-pulse-dot h-2 w-2 rounded-full bg-primary"/><span className="text-[11px] font-medium text-blue-900">Automatización activa</span></div>
          <span className="text-[10px] font-semibold text-primary">Recordatorio WhatsApp →</span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="min-h-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <VitalisLogo variant="landing" />
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#producto" className="transition hover:text-slate-950">Producto</a>
            <a href="#funciones" className="transition hover:text-slate-950">Funciones</a>
            <a href="#como-funciona" className="transition hover:text-slate-950">Cómo funciona</a>
            <a href="#precios" className="transition hover:text-slate-950">Precios</a>
            <a href="#faq" className="transition hover:text-slate-950">Preguntas frecuentes</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 sm:inline-flex">Ingresar</Link>
            <Link to="/registro" className="btn-primary-glow inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Comenzar gratis <ArrowRight className="h-4 w-4"/></Link>
            <button onClick={() => setMobileMenuOpen(o => !o)} className="ml-1 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 md:hidden" aria-label="Menú">
              {mobileMenuOpen ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-slate-100 bg-white/95 px-5 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              {[['#producto','Producto'],['#funciones','Funciones'],['#como-funciona','Cómo funciona'],['#precios','Precios'],['#faq','Preguntas frecuentes']].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950">{label}</a>
              ))}
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950">Ingresar</Link>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section id="producto" className="relative isolate px-5 pb-20 pt-16 sm:pt-24 lg:px-8 lg:pb-28 lg:pt-28">
          <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_70%_15%,rgba(96,165,250,.18),transparent_35%),radial-gradient(circle_at_20%_20%,rgba(37,99,235,.08),transparent_30%)]"/>
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[.92fr_1.08fr]">
            <div className="vitalis-fade-up">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm"><Sparkles className="h-3.5 w-3.5"/> Gestión inteligente para centros de salud</div>
              <h1 className="max-w-2xl text-2xl font-extrabold leading-[1.06] tracking-[-.045em] sm:text-4xl lg:text-6xl">Tu centro, <span className="vitalis-gradient-text">más simple.</span><br/>Tu equipo, más enfocado.</h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">Vitalis conecta agenda, pacientes, caja y automatizaciones en una experiencia diseñada para que tu centro crezca sin sumar complejidad.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/registro" className="btn-primary-glow inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-white">Probar Vitalis gratis <ArrowRight className="h-4 w-4"/></Link>
                <a href="#como-funciona" className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">Ver cómo funciona <ChevronRight className="h-4 w-4"/></a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500"/> Sin tarjeta</span><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500"/> Implementación simple</span><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500"/> Crece con vos</span></div>
            </div>
            <div className="vitalis-fade-up vitalis-delay-2 relative lg:pl-4"><AgendaDemo/><div className="absolute -bottom-6 -left-2 hidden rounded-2xl border bg-white p-3 shadow-xl sm:flex sm:items-center sm:gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50"><Zap className="h-4 w-4 text-emerald-600"/></div><div><div className="text-xs font-bold">12 automatizaciones</div><div className="text-[10px] text-muted-foreground">trabajando por tu centro</div></div></div></div>
          </div>
        </section>

        <section id="funciones" className="border-y bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl"><div className="max-w-2xl"><span className="text-xs font-bold uppercase tracking-[.18em] text-primary">Todo conectado</span><h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Menos administración. Más tiempo para atender.</h2><p className="mt-4 text-slate-600">Una sola plataforma para ordenar la operación diaria y automatizar lo repetitivo.</p></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{features.map(({icon: Icon,title,text})=><div key={title} className="group rounded-2xl border bg-[#F8FAFC] p-6 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-xl"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-primary transition group-hover:bg-primary group-hover:text-white"><Icon className="h-5 w-5"/></div><h3 className="mt-5 text-base font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div>
        </section>

        <section id="como-funciona" className="px-5 py-20 lg:px-8 lg:py-28"><div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><span className="text-xs font-bold uppercase tracking-[.18em] text-primary">Una experiencia pensada para el día a día</span><h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">La información que necesitás, cuando la necesitás.</h2><p className="mt-5 leading-7 text-slate-600">Desde la agenda hasta el cierre de caja. Vitalis organiza cada parte del centro con una interfaz simple, rápida y consistente.</p><div className="mt-7 space-y-4"><div className="flex gap-3"><div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary"><Check className="h-3.5 w-3.5"/></div><div><div className="text-sm font-bold">Turnos y pacientes sincronizados</div><div className="mt-1 text-sm text-slate-500">El equipo trabaja sobre la misma información.</div></div></div><div className="flex gap-3"><div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary"><Check className="h-3.5 w-3.5"/></div><div><div className="text-sm font-bold">Automatizaciones que no se olvidan</div><div className="mt-1 text-sm text-slate-500">Recordatorios y tareas repetitivas salen del trabajo manual.</div></div></div><div className="flex gap-3"><div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary"><Check className="h-3.5 w-3.5"/></div><div><div className="text-sm font-bold">Datos para decidir</div><div className="mt-1 text-sm text-slate-500">Reportes y caja convertidos en información accionable.</div></div></div></div></div><div className="relative"><div className="rounded-[28px] bg-[#0F172A] p-3 shadow-2xl sm:p-5"><div className="rounded-[20px] bg-[#F8FAFC] p-4 sm:p-6"><div className="flex items-center justify-between border-b pb-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Automatizaciones</div><div className="mt-1 text-base font-bold">Tu centro trabajando</div></div><div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600">Activas</div></div><div className="mt-5 space-y-3">{['Recordar turno 24 h antes','Confirmar asistencia por WhatsApp','Resumen diario para dirección'].map((label,i)=><div key={label} className="vitalis-demo-row flex items-center justify-between rounded-xl border bg-white p-3"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-primary"><Bot className="h-4 w-4"/></div><div><div className="text-xs font-semibold">{label}</div><div className="text-[10px] text-slate-400">Ejecutándose automáticamente</div></div></div><div className="h-2 w-2 rounded-full bg-emerald-500"/></div>)}</div></div></div></div></div></section>

        <PreciosSection />
        <FaqSection />
      </main>

      <footer className="border-t bg-white px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><VitalisLogo variant="landing" /><div>© {new Date().getFullYear()} Vitalis. Gestión que impulsa tu centro.</div></div></footer>
    </div>
  );
}
