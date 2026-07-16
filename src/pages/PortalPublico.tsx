import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { normalizeDiasTrabajo, getDayName } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

// ── Validación ──────────────────────────────────────────────────────────────
const reservaSchema = z.object({
  nombre:   z.string().trim().min(1, 'El nombre es obligatorio').max(60).regex(/^[\p{L}\s'.-]+$/u, 'Nombre inválido'),
  apellido: z.string().trim().min(1, 'El apellido es obligatorio').max(60).regex(/^[\p{L}\s'.-]+$/u, 'Apellido inválido'),
  dni:      z.string().trim().regex(/^\d{7,8}$/, 'DNI inválido (7-8 dígitos)').optional().or(z.literal('')),
  celular:  z.string().trim().regex(/^[\d\s+()-]{8,20}$/, 'Teléfono inválido').optional().or(z.literal('')),
  email:    z.string().trim().email('Email inválido').max(120).optional().or(z.literal('')),
});

// ── Interfaces ───────────────────────────────────────────────────────────────
interface Centro      { id: string; nombre: string; direccion: string | null; telefono: string | null; }
interface Profesional { id: string; nombre: string; apellido: string; }
interface Servicio    { id: string; nombre: string; duracion_minutos: number; costo_base: number; }
interface PCS         { profesional_id: string; servicio_id: string; dias_trabajo: string[]; hora_inicio: string; hora_fin: string; capacidad_simultanea: number; agenda_id: string | null; }
interface SlotInfo    { hora: string; disponible: boolean; ocupados: number; capacidad: number; }

type Step = 'profesional' | 'servicio' | 'fecha_hora' | 'datos' | 'confirmado';
const STEP_NUM: Record<Exclude<Step, 'confirmado'>, number> = { profesional: 1, servicio: 2, fecha_hora: 3, datos: 4 };

// ── Helpers ──────────────────────────────────────────────────────────────────
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const formatDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function generateSlots(inicio: string, fin: string, intervalo: number): string[] {
  const slots: string[] = [];
  const [hI, mI] = inicio.split(':').map(Number);
  const [hF, mF] = fin.split(':').map(Number);
  let total = hI * 60 + mI;
  const end = hF * 60 + mF;
  while (total < end) {
    slots.push(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
    total += intervalo;
  }
  return slots;
}

function getInitials(nombre: string, apellido: string) {
  return `${(apellido[0] ?? '').toUpperCase()}${(nombre[0] ?? '').toUpperCase()}`;
}

function isDayWorking(date: Date, pcsRecords: PCS[], profId: string, servicioId: string): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (date < today) return false;
  const dayName = getDayName(date.getDay());
  return pcsRecords.some(p =>
    p.profesional_id === profId &&
    p.servicio_id === servicioId &&
    p.dias_trabajo.includes(dayName),
  );
}

// ── Componente ───────────────────────────────────────────────────────────────
export default function PortalPublico() {
  const { centroId } = useParams<{ centroId: string }>();

  const [centro, setCentro]             = useState<Centro | null>(null);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [pcsRecords, setPcsRecords]     = useState<PCS[]>([]);
  const [loadingInit, setLoadingInit]   = useState(true);

  const [step, setStep]                       = useState<Step>('profesional');
  const [selectedProfId, setSelectedProfId]   = useState('');
  const [selectedServicioId, setSelectedServicioId] = useState('');
  const [selectedDate, setSelectedDate]       = useState<Date>(new Date());
  const [selectedHora, setSelectedHora]       = useState('');
  const [slots, setSlots]                     = useState<SlotInfo[]>([]);
  const [loadingSlots, setLoadingSlots]       = useState(false);

  const [form, setForm]           = useState({ nombre: '', apellido: '', dni: '', celular: '', email: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState(false);

  // 14 días hacia adelante para el date strip
  const dateStripDates = useMemo(() => {
    const dates: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, []);

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!centroId) return;
    Promise.all([
      supabase.from('centros').select('id, nombre, direccion, telefono').eq('id', centroId).single(),
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
      supabase.from('profesional_centro_servicio').select('profesional_id, servicio_id, dias_trabajo, hora_inicio, hora_fin, capacidad_simultanea, agenda_id').eq('centro_id', centroId).eq('activo', true),
    ]).then(([cRes, pRes, pcsRes]) => {
      setCentro(cRes.data);
      setProfesionales(pRes.data ?? []);
      setPcsRecords(((pcsRes.data as PCS[]) ?? []).map(r => ({ ...r, dias_trabajo: normalizeDiasTrabajo(r.dias_trabajo) })));
      setLoadingInit(false);
    });
  }, [centroId]);

  // ── Servicios del profesional ────────────────────────────────────────────
  const serviciosDelProf = useMemo(() => {
    if (!selectedProfId) return [];
    return [...new Set(pcsRecords.filter(p => p.profesional_id === selectedProfId).map(p => p.servicio_id))];
  }, [selectedProfId, pcsRecords]);

  const [servicios, setServicios] = useState<Servicio[]>([]);
  useEffect(() => {
    if (serviciosDelProf.length === 0) { setServicios([]); return; }
    supabase.from('servicios').select('id, nombre, duracion_minutos, costo_base').in('id', serviciosDelProf).eq('activo', true)
      .then(({ data }) => setServicios(data ?? []));
  }, [serviciosDelProf]);

  // ── Slots disponibles ────────────────────────────────────────────────────
  const fetchSlots = async () => {
    if (!selectedProfId || !selectedServicioId || !centroId) return;
    setLoadingSlots(true);

    const dateStr = formatDate(selectedDate);
    const dayName = getDayName(selectedDate.getDay());

    const pcsActivos = pcsRecords.filter(p =>
      p.profesional_id === selectedProfId &&
      p.servicio_id === selectedServicioId &&
      normalizeDiasTrabajo(p.dias_trabajo).includes(dayName),
    );

    if (pcsActivos.length === 0) { setSlots([]); setLoadingSlots(false); return; }

    const servicio  = servicios.find(s => s.id === selectedServicioId);
    const intervalo = servicio?.duracion_minutos ?? 30;

    // Capacidad: leer sesiones_por_bloque de la agenda vinculada, fallback a capacidad_simultanea
    const agendaIds = [...new Set(pcsActivos.map(p => p.agenda_id).filter(Boolean))] as string[];
    let capacidad = Math.max(...pcsActivos.map(p => p.capacidad_simultanea ?? 1));
    if (agendaIds.length > 0) {
      const { data: agendas } = await supabase
        .from('agendas').select('sesiones_por_bloque').in('id', agendaIds);
      const maxSesiones = Math.max(...(agendas ?? []).map(a => a.sesiones_por_bloque ?? 1));
      if (maxSesiones > capacidad) capacidad = maxSesiones;
    }

    const allSlots = new Set<string>();
    pcsActivos.forEach(pcs => generateSlots(pcs.hora_inicio, pcs.hora_fin, intervalo).forEach(s => allSlots.add(s)));

    // Filtrar por servicio_id para no contar turnos de otros servicios del mismo profesional
    const { data: turnosExistentes } = await supabase
      .from('turnos').select('hora_inicio')
      .eq('centro_id', centroId)
      .eq('profesional_id', selectedProfId)
      .eq('servicio_id', selectedServicioId)
      .eq('fecha', dateStr)
      .neq('estado', 'cancelado');

    const ocupadoMap: Record<string, number> = {};
    (turnosExistentes ?? []).forEach(t => {
      const h = t.hora_inicio?.substring(0, 5);
      ocupadoMap[h] = (ocupadoMap[h] ?? 0) + 1;
    });

    const now        = new Date();
    const isToday    = dateStr === formatDate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    setSlots([...allSlots].sort().map(hora => {
      const [hh, mm] = hora.split(':').map(Number);
      const ocupados = ocupadoMap[hora] ?? 0;
      return {
        hora,
        disponible: ocupados < capacidad && (!isToday || hh * 60 + mm > nowMinutes),
        ocupados,
        capacidad,
      };
    }));
    setLoadingSlots(false);
  };

  useEffect(() => { if (step === 'fecha_hora') fetchSlots(); }, [selectedDate, step]);

  // ── Confirmar reserva ────────────────────────────────────────────────────
  const handleConfirmarReserva = async () => {
    if (!centroId) return;
    const parsed = reservaSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach(i => { errs[i.path[0] as string] = i.message; });
      setFormErrors(errs); return;
    }
    setFormErrors({});
    const data = parsed.data;
    setSaving(true);

    const dateStr  = formatDate(selectedDate);
    const servicio = servicios.find(s => s.id === selectedServicioId);

    let pacienteId: string | null = null;
    if (data.dni) {
      const { data: existing } = await supabase
        .from('pacientes').select('id').eq('centro_id', centroId).eq('dni', data.dni).maybeSingle();
      pacienteId = existing?.id ?? null;
    }
    if (!pacienteId) {
      const { data: newPac } = await supabase
        .from('pacientes')
        .insert({ centro_id: centroId, nombre: data.nombre, apellido: data.apellido, dni: data.dni || null, celular: data.celular || null, email: data.email || null })
        .select('id').single();
      pacienteId = newPac?.id ?? null;
    }
    if (!pacienteId) { setSaving(false); return; }

    const horaFin = (() => {
      const [hh, mm] = selectedHora.split(':').map(Number);
      const end = hh * 60 + mm + (servicio?.duracion_minutos ?? 30);
      return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    })();

    const { data: turno } = await supabase
      .from('turnos')
      .insert({ centro_id: centroId, paciente_id: pacienteId, profesional_id: selectedProfId, servicio_id: selectedServicioId, fecha: dateStr, hora_inicio: selectedHora, hora_fin: horaFin, estado: 'reservado', created_by: 'paciente' })
      .select('id').single();

    setSaving(false);
    if (turno?.id) setStep('confirmado');
  };

  const prof     = profesionales.find(p => p.id === selectedProfId);
  const servicio = servicios.find(s => s.id === selectedServicioId);
  const stepNum  = step !== 'confirmado' ? STEP_NUM[step] : null;

  // ── Loading / Error ──────────────────────────────────────────────────────
  if (loadingInit) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDF6F4' }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/logo-kineplus.png" alt="KINE+" style={{ height: 60, marginBottom: 24, opacity: .7 }} />
          <Loader2 style={{ width: 28, height: 28, color: '#00C9B1', margin: '0 auto' }} className="kine-spin" />
        </div>
      </div>
    );
  }

  if (!centro) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#5A7080' }}>Centro no encontrado.</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes kineStepIn   { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        @keyframes kineRingPulse{ 0%   { transform:scale(1); opacity:.8 } 100% { transform:scale(1.6); opacity:0 } }
        @keyframes kineIconPop  { from { transform:scale(0); opacity:0 } to { transform:scale(1); opacity:1 } }
        @keyframes kineSpin     { to   { transform:rotate(360deg) } }
        .kine-step-in  { animation: kineStepIn .38s cubic-bezier(.34,1.56,.64,1) both; }
        .kine-ring     { animation: kineRingPulse 1.8s ease infinite; }
        .kine-icon-pop { animation: kineIconPop .5s cubic-bezier(.34,1.56,.64,1) .1s both; }
        .kine-spin     { animation: kineSpin 1s linear infinite; }
        .kine-card:hover  { border-color:#00C9B1 !important; box-shadow:0 2px 10px rgba(52,75,99,.08) !important; }
        .kine-svc:hover   { border-color:#00C9B1 !important; }
        .kine-date:hover:not(:disabled) { border-color:#00C9B1 !important; }
        .kine-slot:hover:not(:disabled) { border-color:#00C9B1 !important; }
        .kine-btn:hover:not(:disabled)  { transform:translateY(-1px); box-shadow:0 6px 24px rgba(0,201,177,.44) !important; }
        .kine-btn:active:not(:disabled) { transform:scale(.98); }
        .kine-btn-new:hover { border-color:#00C9B1 !important; }
        .kine-input:focus   { outline:none; border-color:#00C9B1 !important; box-shadow:0 0 0 3px rgba(0,201,177,.15) !important; }
        .kine-date-strip { display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; }
        .kine-date-strip::-webkit-scrollbar { display:none; }
        @media (max-width:768px) {
          .kine-portal  { grid-template-columns:1fr !important; }
          .kine-brand   { position:relative !important; height:auto !important; padding:24px 24px 20px !important; }
          .kine-brand-body { display:none !important; }
          .kine-booking { padding:24px 16px 48px !important; }
        }
      `}</style>

      <div className="kine-portal" style={{ display: 'grid', gridTemplateColumns: '380px 1fr', minHeight: '100vh', fontFamily: "ui-rounded,'SF Pro Rounded',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>

        {/* ═══════════════════════════════════════ LEFT PANEL ══ */}
        <aside className="kine-brand" style={{ background: 'linear-gradient(155deg,#213040 0%,#344B63 55%,#3D5A78 100%)', display: 'flex', flexDirection: 'column', padding: '48px 40px', position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>

          <div style={{ marginBottom: 36 }}>
            <img src="/logo-kineplus.png" alt="KINE+" style={{ height: 80, width: 'auto', display: 'block' }} />
          </div>

          <div className="kine-brand-body">
            <p style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.25, marginBottom: 10, letterSpacing: '-.5px' }}>
              Tu bienestar,<br />a un clic.
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', lineHeight: 1.6, marginBottom: 44 }}>
              Reservá tu turno en minutos. Elegí tu profesional, servicio y horario sin llamadas ni filas.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {([
                ['📅', 'Confirmación inmediata',    'Tu turno queda reservado al instante'],
                ['💬', 'Recordatorio automático',   'Te avisamos por WhatsApp el día previo'],
                ['🔒', 'Datos seguros',             'Tu información está protegida'],
              ] as const).map(([icon, title, sub]) => (
                <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(0,201,177,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.75)' }}>{centro.nombre}</p>
            {centro.direccion && <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{centro.direccion}</p>}
          </div>
        </aside>

        {/* ═══════════════════════════════════════ RIGHT PANEL ══ */}
        <main className="kine-booking" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px 60px', overflowY: 'auto', background: '#EDF6F4' }}>
          <div style={{ width: '100%', maxWidth: 520 }}>

            {/* Progress dots */}
            {step !== 'confirmado' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ height: 8, borderRadius: 4, width: i === stepNum ? 24 : 8, background: i < (stepNum ?? 0) ? 'rgba(0,201,177,.4)' : i === stepNum ? '#00C9B1' : '#C8E8E2', transition: 'all .35s cubic-bezier(.34,1.56,.64,1)' }} />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: '#5A7080', fontWeight: 500 }}>Paso {stepNum} de 4</span>
              </div>
            )}

            {/* ─── STEP 1: Profesional ─── */}
            {step === 'profesional' && (
              <div className="kine-step-in">
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#00C9B1', marginBottom: 6 }}>Empezar</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C2B3A', letterSpacing: '-.4px' }}>¿Con quién querés atenderte?</h2>
                  <p style={{ fontSize: 13, color: '#5A7080', marginTop: 6 }}>Elegí el profesional de tu preferencia</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {profesionales.map(p => (
                    <div
                      key={p.id}
                      className="kine-card"
                      onClick={() => { setSelectedProfId(p.id); setSelectedServicioId(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: 14, border: `2px solid ${selectedProfId === p.id ? '#00C9B1' : '#D0E8E4'}`, background: '#fff', cursor: 'pointer', boxShadow: selectedProfId === p.id ? '0 0 0 3px rgba(0,201,177,.18)' : 'none', transition: 'all .22s ease' }}
                    >
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#009E8E,#00C9B1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {getInitials(p.nombre, p.apellido)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#1C2B3A' }}>Lic. {p.apellido}, {p.nombre}</div>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${selectedProfId === p.id ? '#00C9B1' : '#D0E8E4'}`, background: selectedProfId === p.id ? '#00C9B1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s', flexShrink: 0 }}>
                        {selectedProfId === p.id && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28 }}>
                  <button disabled={!selectedProfId} onClick={() => setStep('servicio')} className="kine-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#00C9B1,#009E8E)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: selectedProfId ? 'pointer' : 'default', opacity: selectedProfId ? 1 : .4, boxShadow: '0 4px 16px rgba(0,201,177,.3)', transition: 'all .22s ease' }}>
                    Continuar
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 2: Servicio ─── */}
            {step === 'servicio' && (
              <div className="kine-step-in">
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#00C9B1', marginBottom: 6 }}>Servicio</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C2B3A', letterSpacing: '-.4px' }}>¿Qué sesión necesitás?</h2>
                  <p style={{ fontSize: 13, color: '#5A7080', marginTop: 6 }}>Seleccioná el tipo de atención</p>
                </div>

                {servicios.length === 0
                  ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#5A7080', fontSize: 14 }}><Loader2 style={{ width: 24, height: 24, margin: '0 auto 8px', color: '#00C9B1' }} className="kine-spin" />Cargando...</div>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {servicios.map(s => (
                        <button key={s.id} className="kine-svc" onClick={() => setSelectedServicioId(s.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 16, borderRadius: 14, border: `2px solid ${selectedServicioId === s.id ? '#00C9B1' : '#D0E8E4'}`, background: selectedServicioId === s.id ? 'rgba(0,201,177,.08)' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all .22s ease' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1C2B3A', marginBottom: 4 }}>{s.nombre}</span>
                          <span style={{ fontSize: 11, color: '#5A7080' }}>{s.duracion_minutos} min{s.costo_base > 0 ? ` · $${s.costo_base}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
                  <button onClick={() => setStep('profesional')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#5A7080', padding: '12px 16px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>Volver
                  </button>
                  <button disabled={!selectedServicioId} onClick={() => { setSelectedDate(new Date()); setSelectedHora(''); setStep('fecha_hora'); }} className="kine-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#00C9B1,#009E8E)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: selectedServicioId ? 'pointer' : 'default', opacity: selectedServicioId ? 1 : .4, boxShadow: '0 4px 16px rgba(0,201,177,.3)', transition: 'all .22s ease' }}>
                    Continuar
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 3: Fecha y hora ─── */}
            {step === 'fecha_hora' && (
              <div className="kine-step-in">
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#00C9B1', marginBottom: 6 }}>Horario</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C2B3A', letterSpacing: '-.4px' }}>Elegí día y hora</h2>
                  <p style={{ fontSize: 13, color: '#5A7080', marginTop: 6 }}>Turnos disponibles para las próximas semanas</p>
                </div>

                {/* Date strip */}
                <div className="kine-date-strip" style={{ marginBottom: 24 }}>
                  {dateStripDates.map((d, i) => {
                    const working    = isDayWorking(d, pcsRecords, selectedProfId, selectedServicioId);
                    const isSelected = formatDate(d) === formatDate(selectedDate);
                    return (
                      <button key={i} disabled={!working} className="kine-date" onClick={() => { setSelectedDate(d); setSelectedHora(''); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52, padding: '10px 8px', borderRadius: 12, border: `2px solid ${isSelected ? '#00C9B1' : '#D0E8E4'}`, background: isSelected ? '#00C9B1' : '#fff', cursor: working ? 'pointer' : 'default', flexShrink: 0, opacity: working ? 1 : .35, transition: 'all .22s ease' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.04em', color: isSelected ? '#fff' : '#5A7080', textTransform: 'uppercase' }}>{DAYS_ES[d.getDay()]}</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: isSelected ? '#fff' : '#1C2B3A', lineHeight: 1.2 }}>{d.getDate()}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Slots */}
                <p style={{ fontSize: 12, fontWeight: 600, color: '#5A7080', marginBottom: 10 }}>Horarios disponibles</p>
                {loadingSlots
                  ? <div style={{ textAlign: 'center', padding: '32px 0' }}><Loader2 style={{ width: 24, height: 24, color: '#00C9B1', margin: '0 auto' }} className="kine-spin" /></div>
                  : slots.length === 0
                    ? <div style={{ textAlign: 'center', padding: '28px 0', color: '#5A7080', fontSize: 14, background: '#fff', borderRadius: 14, border: '1.5px solid #D0E8E4' }}>No hay turnos disponibles para este día.</div>
                    : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 8 }}>
                        {slots.map(slot => (
                          <button key={slot.hora} disabled={!slot.disponible} className="kine-slot" onClick={() => setSelectedHora(slot.hora)} style={{ padding: '10px 6px', borderRadius: 10, border: `1.5px solid ${selectedHora === slot.hora ? '#344B63' : '#D0E8E4'}`, background: selectedHora === slot.hora ? '#344B63' : '#fff', color: selectedHora === slot.hora ? '#fff' : slot.disponible ? '#1C2B3A' : '#5A7080', fontSize: 13, fontWeight: 500, cursor: slot.disponible ? 'pointer' : 'default', opacity: slot.disponible ? 1 : .4, textDecoration: slot.disponible ? 'none' : 'line-through', transition: 'all .2s ease' }}>
                            {slot.hora}
                          </button>
                        ))}
                      </div>
                    )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
                  <button onClick={() => setStep('servicio')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#5A7080', padding: '12px 16px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>Volver
                  </button>
                  <button disabled={!selectedHora} onClick={() => setStep('datos')} className="kine-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#00C9B1,#009E8E)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: selectedHora ? 'pointer' : 'default', opacity: selectedHora ? 1 : .4, boxShadow: '0 4px 16px rgba(0,201,177,.3)', transition: 'all .22s ease' }}>
                    Continuar
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 4: Datos del paciente ─── */}
            {step === 'datos' && (
              <div className="kine-step-in">
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#00C9B1', marginBottom: 6 }}>Tus datos</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C2B3A', letterSpacing: '-.4px' }}>Completá tu información</h2>
                  <p style={{ fontSize: 13, color: '#5A7080', marginTop: 6 }}>Necesitamos tus datos para confirmar el turno</p>
                </div>

                {/* Resumen */}
                <div style={{ padding: '16px 18px', borderRadius: 14, border: '1.5px solid rgba(0,201,177,.3)', background: 'rgba(0,201,177,.06)', marginBottom: 20 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1C2B3A', marginBottom: 4 }}>Lic. {prof?.apellido}, {prof?.nombre}</p>
                  <p style={{ fontSize: 13, color: '#5A7080', marginBottom: 6 }}>{servicio?.nombre}</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#344B63' }}>
                    {selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · {selectedHora} hs
                  </p>
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {(['nombre', 'apellido'] as const).map(field => (
                      <div key={field}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#5A7080', marginBottom: 6 }}>{field === 'nombre' ? 'Nombre *' : 'Apellido *'}</label>
                        <Input className="kine-input" value={form[field]} maxLength={60} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={field === 'nombre' ? 'Tu nombre' : 'Tu apellido'} style={{ borderColor: formErrors[field] ? '#E05252' : '#D0E8E4' }} />
                        {formErrors[field] && <p style={{ fontSize: 11, color: '#E05252', marginTop: 4 }}>{formErrors[field]}</p>}
                      </div>
                    ))}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#5A7080', marginBottom: 6 }}>Teléfono / WhatsApp</label>
                    <Input className="kine-input" value={form.celular} maxLength={20} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))} placeholder="+54 9 11 0000 0000" style={{ borderColor: formErrors.celular ? '#E05252' : '#D0E8E4' }} />
                    {formErrors.celular && <p style={{ fontSize: 11, color: '#E05252', marginTop: 4 }}>{formErrors.celular}</p>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#5A7080', marginBottom: 6 }}>Email</label>
                    <Input className="kine-input" type="email" value={form.email} maxLength={120} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tu@email.com" style={{ borderColor: formErrors.email ? '#E05252' : '#D0E8E4' }} />
                    {formErrors.email && <p style={{ fontSize: 11, color: '#E05252', marginTop: 4 }}>{formErrors.email}</p>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#5A7080', marginBottom: 6 }}>DNI</label>
                    <Input className="kine-input" value={form.dni} maxLength={8} inputMode="numeric" onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} placeholder="12345678" style={{ borderColor: formErrors.dni ? '#E05252' : '#D0E8E4' }} />
                    {formErrors.dni && <p style={{ fontSize: 11, color: '#E05252', marginTop: 4 }}>{formErrors.dni}</p>}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
                  <button onClick={() => setStep('fecha_hora')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#5A7080', padding: '12px 16px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>Volver
                  </button>
                  <button disabled={saving || !form.nombre || !form.apellido} onClick={handleConfirmarReserva} className="kine-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#00C9B1,#009E8E)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: (saving || !form.nombre || !form.apellido) ? 'default' : 'pointer', opacity: (saving || !form.nombre || !form.apellido) ? .4 : 1, boxShadow: '0 4px 16px rgba(0,201,177,.3)', transition: 'all .22s ease' }}>
                    {saving && <Loader2 style={{ width: 16, height: 16 }} className="kine-spin" />}
                    Confirmar turno
                    {!saving && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>}
                  </button>
                </div>
              </div>
            )}

            {/* ─── CONFIRMADO ─── */}
            {step === 'confirmado' && (
              <div className="kine-step-in" style={{ textAlign: 'center', padding: '20px 0 40px' }}>
                <div style={{ width: 80, height: 80, margin: '0 auto 28px', position: 'relative' }}>
                  <div className="kine-ring" style={{ width: 80, height: 80, borderRadius: '50%', border: '3px solid rgba(0,201,177,.25)', position: 'absolute' }} />
                  <div className="kine-icon-pop" style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#00C9B1,#00E5D0)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, boxShadow: '0 8px 24px rgba(0,201,177,.35)' }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C2B3A', marginBottom: 8 }}>¡Turno confirmado!</h2>
                <p style={{ fontSize: 14, color: '#5A7080', lineHeight: 1.6, marginBottom: 28 }}>
                  {form.nombre}, tu turno está confirmado.<br />Te avisamos por WhatsApp el día anterior.
                </p>
                <div style={{ borderRadius: 14, border: '1.5px solid #D0E8E4', background: '#fff', padding: 20, textAlign: 'left', marginBottom: 28 }}>
                  {([
                    ['Profesional', `Lic. ${prof?.apellido}, ${prof?.nombre}`],
                    ['Servicio',    servicio?.nombre ?? ''],
                    ['Fecha y hora', `${selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${selectedHora} hs`],
                    ['Paciente',   `${form.nombre} ${form.apellido}`],
                  ] as const).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #EDF6F4' }}>
                      <span style={{ fontSize: 12, color: '#5A7080' }}>{key}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1C2B3A' }}>{val}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="kine-btn-new"
                  onClick={() => { setStep('profesional'); setSelectedProfId(''); setSelectedServicioId(''); setSelectedHora(''); setForm({ nombre: '', apellido: '', dni: '', celular: '', email: '' }); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '2px solid #D0E8E4', background: '#fff', color: '#1C2B3A', fontSize: 14, fontWeight: 600, padding: '12px 20px', borderRadius: 12, cursor: 'pointer', transition: 'all .2s ease' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.5" /></svg>
                  Reservar otro turno
                </button>
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  );
}
