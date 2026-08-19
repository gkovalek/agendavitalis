import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Bot, CalendarDays, Check, ChevronRight, Clock3, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';

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

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
        <svg width="25" height="25" viewBox="0 0 80 80" fill="none" aria-hidden="true">
          <path d="M14 66 Q28 44 40 32 Q53 18 68 16" stroke="#60A5FA" strokeWidth="9" strokeLinecap="round"/>
          <path d="M14 50 Q30 32 44 22 Q56 13 70 11" stroke="#2563EB" strokeWidth="6" strokeLinecap="round" opacity=".95"/>
        </svg>
      </div>
      <span className="text-lg font-extrabold tracking-[.14em] text-[#0F172A]">VITALIS</span>
    </div>
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
  return (
    <div className="min-h-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#producto" className="transition hover:text-slate-950">Producto</a>
            <a href="#funciones" className="transition hover:text-slate-950">Funciones</a>
            <a href="#como-funciona" className="transition hover:text-slate-950">Cómo funciona</a>
            <a href="#precios" className="transition hover:text-slate-950">Precios</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 sm:inline-flex">Ingresar</Link>
            <Link to="/registro" className="btn-primary-glow inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Comenzar gratis <ArrowRight className="h-4 w-4"/></Link>
          </div>
        </div>
      </header>

      <main>
        <section id="producto" className="relative isolate px-5 pb-20 pt-16 sm:pt-24 lg:px-8 lg:pb-28 lg:pt-28">
          <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_70%_15%,rgba(96,165,250,.18),transparent_35%),radial-gradient(circle_at_20%_20%,rgba(37,99,235,.08),transparent_30%)]"/>
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[.92fr_1.08fr]">
            <div className="vitalis-fade-up">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm"><Sparkles className="h-3.5 w-3.5"/> Gestión inteligente para centros de salud</div>
              <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.06] tracking-[-.045em] sm:text-5xl lg:text-6xl">Tu centro, <span className="vitalis-gradient-text">más simple.</span><br/>Tu equipo, más enfocado.</h1>
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

        <section id="precios" className="bg-[#0F172A] px-5 py-20 text-white lg:px-8"><div className="mx-auto max-w-4xl text-center"><span className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">Empezá hoy</span><h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Tu centro puede funcionar mejor.</h2><p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Probá una nueva forma de gestionar. Empezá simple y sumá capacidades a medida que tu centro crece.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link to="/registro" className="btn-primary-glow inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white">Crear mi cuenta gratis <ArrowRight className="h-4 w-4"/></Link><Link to="/login" className="inline-flex items-center justify-center rounded-xl border border-white/10 px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-white/5">Ya tengo una cuenta</Link></div><div className="mt-8 flex flex-wrap justify-center gap-5 text-xs text-slate-400"><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-blue-300"/> Datos protegidos</span><span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-blue-300"/> Diseño simple</span></div></div></section>
      </main>

      <footer className="border-t bg-white px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><Logo/><div>© {new Date().getFullYear()} Vitalis. Gestión que impulsa tu centro.</div></div></footer>
    </div>
  );
}
