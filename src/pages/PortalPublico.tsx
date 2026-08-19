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
interface Centro      { id: string; nombre: string; direccion: string | null; telefono: string | null; mp_user_id: string | null; }
interface Profesional { id: string; titulo: string | null; nombre: string; apellido: string; mp_user_id: string | null; }
interface Servicio    { id: string; nombre: string; duracion_minutos: number; agenda_id: string | null; }
interface PCS         { profesional_id: string; servicio_id: string; dias_trabajo: string[]; hora_inicio: string; hora_fin: string; capacidad_simultanea: number; agenda_id: string | null; cobro_anticipado: string; }
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
  const { centroId: centroIdParam, slug } = useParams<{ centroId?: string; slug?: string }>();
  const [resolvedCentroId, setResolvedCentroId] = useState<string | null>(null);

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
  const [turnoId, setTurnoId]     = useState<string | null>(null);
  const [pagando, setPagando]     = useState(false);

  // 14 días hacia adelante para el date strip
  const dateStripDates = useMemo(() => {
    const dates: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, []);

  // ── Resolver centroId desde slug o param directo ─────────────────────────
  useEffect(() => {
    if (centroIdParam) { setResolvedCentroId(centroIdParam); return; }
    if (!slug) { setLoadingInit(false); return; }
    supabase.from('centros').select('id').eq('slug', slug).single()
      .then(({ data }) => {
        if (!data?.id) setLoadingInit(false);
        else setResolvedCentroId(data.id);
      })
      .catch(() => setLoadingInit(false));
  }, [centroIdParam, slug]);

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!resolvedCentroId) return;
    Promise.all([
      supabase.from('centros').select('id, nombre, direccion, telefono, mp_user_id').eq('id', resolvedCentroId).single(),
      supabase.from('profesionales').select('id, titulo, nombre, apellido, mp_user_id').eq('centro_id', resolvedCentroId).eq('activo', true).order('apellido'),
      supabase.from('profesional_centro_servicio').select('profesional_id, servicio_id, dias_trabajo, hora_inicio, hora_fin, capacidad_simultanea, agenda_id, cobro_anticipado').eq('centro_id', resolvedCentroId).eq('activo', true),
    ]).then(([cRes, pRes, pcsRes]) => {
      setCentro(cRes.data);
      setProfesionales(pRes.data ?? []);
      setPcsRecords(((pcsRes.data as PCS[]) ?? []).map(r => ({ ...r, dias_trabajo: normalizeDiasTrabajo(r.dias_trabajo) })));
      setLoadingInit(false);
    }).catch(() => {
      setLoadingInit(false);
    });
  }, [resolvedCentroId]);

  // ── Servicios del profesional ────────────────────────────────────────────
  const serviciosDelProf = useMemo(() => {
    if (!selectedProfId) return [];
    return [...new Set(pcsRecords.filter(p => p.profesional_id === selectedProfId && p.servicio_id).map(p => p.servicio_id))];
  }, [selectedProfId, pcsRecords]);

  const [servicios, setServicios] = useState<Servicio[]>([]);
  useEffect(() => {
    if (serviciosDelProf.length === 0) { setServicios([]); return; }
    supabase.from('servicios').select('id, nombre, duracion_minutos, agenda_id').in('id', serviciosDelProf).eq('activo', true)
      .then(({ data }) => setServicios(data ?? []));
  }, [serviciosDelProf]);

  // ── Slots disponibles ────────────────────────────────────────────────────
  const fetchSlots = async () => {
    if (!selectedProfId || !selectedServicioId || !resolvedCentroId) return;
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

    // Capacidad: leer sesiones_por_bloque de la agenda del servicio, fallback a capacidad_simultanea
    const agendaIds = [...new Set([servicio?.agenda_id, ...pcsActivos.map(p => p.agenda_id)].filter(Boolean))] as string[];
    let capacidad = Math.max(...pcsActivos.map(p => p.capacidad_simultanea ?? 1));
    if (agendaIds.length > 0) {
      const { data: agendas } = await supabase
        .from('agendas').select('sesiones_por_bloque').in('id', agendaIds);
      const maxSesiones = Math.max(...(agendas ?? []).map(a => a.sesiones_por_bloque ?? 1));
      if (maxSesiones > capacidad) capacidad = maxSesiones;
    }

    const allSlots = new Set<string>();
    pcsActivos.forEach(pcs => generateSlots(pcs.hora_inicio, pcs.hora_fin, intervalo).forEach(s => allSlots.add(s)));

    // Filtrar por servicio_id para no contar turnos de otros servicios del mismo profesional.
    // Excluir 'cancelado' y 'pendiente_pago' (expirados o no confirmados) para no bloquear slots.
    const { data: turnosExistentes } = await supabase
      .from('turnos').select('hora_inicio')
      .eq('centro_id', resolvedCentroId)
      .eq('profesional_id', selectedProfId)
      .eq('servicio_id', selectedServicioId)
      .eq('fecha', dateStr)
      .in('estado', ['reservado', 'confirmado', 'en_sala', 'siendo_atendido', 'finalizado']);

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

  useEffect(() => { if (step === 'fecha_hora') fetchSlots(); }, [selectedDate, step, selectedProfId, selectedServicioId]);

  // ── Confirmar reserva ────────────────────────────────────────────────────
  const handleConfirmarReserva = async () => {
    if (!resolvedCentroId) return;
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

    const { data: pacienteIdResult, error: rpcError } = await supabase.rpc('buscar_o_crear_paciente', {
      p_centro_id: resolvedCentroId,
      p_nombre:    data.nombre,
      p_apellido:  data.apellido,
      p_dni:       data.dni    || null,
      p_celular:   data.celular || null,
      p_email:     data.email  || null,
    });
    const pacienteId = rpcError ? null : (pacienteIdResult as string | null);
    if (!pacienteId) { setSaving(false); return; }

    const horaFin = (() => {
      const [hh, mm] = selectedHora.split(':').map(Number);
      const end = hh * 60 + mm + (servicio?.duracion_minutos ?? 30);
      return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    })();

    const capacidad = slots.find(s => s.hora === selectedHora)?.capacidad ?? 1;

    const requierePago = cobroAnticipado !== 'ninguno';
    const expiraAt = requierePago
      ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
      : null;

    const { data: turnoData, error: turnoError } = await supabase
      .from('turnos')
      .insert({
        centro_id:      resolvedCentroId,
        profesional_id: selectedProfId,
        servicio_id:    selectedServicioId,
        paciente_id:    pacienteId,
        fecha:          dateStr,
        hora_inicio:    selectedHora,
        hora_fin:       horaFin,
        estado:         requierePago ? 'pendiente_pago' : 'reservado',
        created_by:     'paciente',
        ...(expiraAt ? { pago_expira_at: expiraAt } : {}),
      })
      .select('id')
      .single();

    setSaving(false);
    if (turnoError) {
      setFormErrors({ _general: 'No se pudo confirmar el turno. Intentá de nuevo.' });
      return;
    }
    if (turnoData?.id) {
      setTurnoId(turnoData.id);
      setStep('confirmado');
    }
  };

  const prof     = profesionales.find(p => p.id === selectedProfId);
  const servicio = servicios.find(s => s.id === selectedServicioId);
  const stepNum  = step !== 'confirmado' ? STEP_NUM[step] : null;

  const cobroAnticipado = useMemo(() => {
    if (!selectedProfId || !selectedServicioId) return 'ninguno';
    const raw = pcsRecords.find(p => p.profesional_id === selectedProfId && p.servicio_id === selectedServicioId)?.cobro_anticipado ?? 'ninguno';
    if (raw === 'ninguno') return 'ninguno';
    // Solo aplicar cobro anticipado si hay MP configurado (profesional o centro)
    const profMp = profesionales.find(p => p.id === selectedProfId)?.mp_user_id ?? null;
    const centroMp = centro?.mp_user_id ?? null;
    if (!profMp && !centroMp) return 'ninguno';
    return raw;
  }, [selectedProfId, selectedServicioId, pcsRecords, profesionales, centro]);

  // ── Loading / Error ──────────────────────────────────────────────────────
  if (loadingInit) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
            <svg width="32" height="32" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 66 Q28 44 40 32 Q53 18 68 16" stroke="#234A73" strokeWidth="9" strokeLinecap="round" fill="none"/>
              <path d="M14 50 Q30 32 44 22 Q56 13 70 11" stroke="#21C8C0" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.9"/>
            </svg>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '.09em', color: '#234A73' }}>VITALIS</span>
          </div>
          <Loader2 style={{ width: 22, height: 22, color: '#21C8C0', margin: '0 auto' }} className="kine-spin" />
        </div>
      </div>
    );
  }

  if (!centro) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#64748B' }}>Centro no encontrado.</p>
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
        .kine-card:hover  { border-color:#21C8C0 !important; box-shadow:0 4px 16px rgba(33,200,192,.12) !important; }
        .kine-svc:hover   { border-color:#21C8C0 !important; }
        .kine-date:hover:not(:disabled) { border-color:#21C8C0 !important; }
        .kine-slot:hover:not(:disabled) { border-color:#21C8C0 !important; }
        .kine-btn:hover:not(:disabled)  { transform:translateY(-1px); box-shadow:0 6px 24px rgba(33,200,192,.44) !important; }
        .kine-btn:active:not(:disabled) { transform:scale(.98); }
        .kine-btn-new:hover { border-color:#21C8C0 !important; }
        .kine-input:focus   { outline:none; border-color:#21C8C0 !important; box-shadow:0 0 0 3px rgba(33,200,192,.15) !important; }
        .kine-date-strip { display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; scrollbar-width:none; }
        .kine-date-strip::-webkit-scrollbar { display:none; }
        @media (max-width:768px) {
          .kine-portal  { grid-template-columns:1fr !important; }
          .kine-brand   { position:relative !important; height:auto !important; padding:24px 24px 20px !important; }
          .kine-brand-body { display:none !important; }
          .kine-booking { padding:24px 16px 48px !important; }
        }
      `}</style>

      <div className="kine-portal" style={{ display: 'grid', gridTemplateColumns: '380px 1fr', minHeight: '100vh', fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif" }}>

        {/* ═══════════════════════════════════════ LEFT PANEL ══ */}
        <aside className="kine-brand" style={{ background: 'linear-gradient(155deg,#060D18 0%,#0B1628 45%,#0F2040 100%)', display: 'flex', flexDirection: 'column', padding: '48px 40px', position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>

          {/* Subtle glow */}
          <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(33,200,192,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -40, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle,rgba(109,94,245,.1) 0%,transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ marginBottom: 36, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="32" height="32" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 66 Q28 44 40 32 Q53 18 68 16" stroke="#234A73" strokeWidth="9" strokeLinecap="round" fill="none"/>
                <path d="M14 50 Q30 32 44 22 Q56 13 70 11" stroke="#21C8C0" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.9"/>
              </svg>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '.09em', color: '#fff' }}>VITALIS</span>
            </div>
          </div>

          <div className="kine-brand-body" style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 10, letterSpacing: '-.03em' }}>
              Tu turno,<br />sin llamadas.
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', lineHeight: 1.65, marginBottom: 44 }}>
              Reservá en minutos. Elegí profesional, servicio y horario directamente desde acá.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {([
                ['📅', 'Confirmación inmediata',    'Tu turno queda reservado al instante'],
                ['💬', 'Recordatorio automático',   'Te avisamos por WhatsApp el día previo'],
                ['🔒', 'Datos seguros',             'Tu información está protegida'],
              ] as const).map(([icon, title, sub]) => (
                <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(33,200,192,.12)', border: '1px solid rgba(33,200,192,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.42)' }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.08)', position: 'relative', zIndex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.8)' }}>{centro.nombre}</p>
            {centro.direccion && <p style={{ fontSize: 12, color: 'rgba(255,255,255,.36)', marginTop: 3 }}>{centro.direccion}</p>}
          </div>
        </aside>

        {/* ═══════════════════════════════════════ RIGHT PANEL ══ */}
        <main className="kine-booking" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px 60px', overflowY: 'auto', background: '#F8FAFC' }}>
          <div style={{ width: '100%', maxWidth: 520 }}>

            {/* Progress dots */}
            {step !== 'confirmado' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ height: 8, borderRadius: 4, width: i === stepNum ? 24 : 8, background: i < (stepNum ?? 0) ? 'rgba(33,200,192,.4)' : i === stepNum ? '#21C8C0' : '#E2E8F0', transition: 'all .35s cubic-bezier(.34,1.56,.64,1)' }} />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Paso {stepNum} de 4</span>
              </div>
            )}

            {/* ─── STEP 1: Profesional ─── */}
            {step === 'profesional' && (
              <div className="kine-step-in">
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#21C8C0', marginBottom: 6 }}>Empezar</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-.4px' }}>¿Con quién querés atenderte?</h2>
                  <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>Elegí el profesional de tu preferencia</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {profesionales.map(p => (
                    <div
                      key={p.id}
                      className="kine-card"
                      onClick={() => { setSelectedProfId(p.id); setSelectedServicioId(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: 14, border: `2px solid ${selectedProfId === p.id ? '#21C8C0' : '#E2E8F0'}`, background: '#fff', cursor: 'pointer', boxShadow: selectedProfId === p.id ? '0 0 0 3px rgba(33,200,192,.18)' : 'none', transition: 'all .22s ease' }}
                    >
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#234A73,#21C8C0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {getInitials(p.nombre, p.apellido)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{p.titulo ? `${p.titulo} ` : ''}{p.apellido}, {p.nombre}</div>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${selectedProfId === p.id ? '#21C8C0' : '#E2E8F0'}`, background: selectedProfId === p.id ? '#21C8C0' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s', flexShrink: 0 }}>
                        {selectedProfId === p.id && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 28 }}>
                  <button disabled={!selectedProfId} onClick={() => setStep('servicio')} className="kine-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#21C8C0,#1aada6)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: selectedProfId ? 'pointer' : 'default', opacity: selectedProfId ? 1 : .4, boxShadow: '0 4px 16px rgba(33,200,192,.3)', transition: 'all .22s ease' }}>
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
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#21C8C0', marginBottom: 6 }}>Servicio</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-.4px' }}>¿Qué sesión necesitás?</h2>
                  <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>Seleccioná el tipo de atención</p>
                </div>

                {servicios.length === 0
                  ? <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748B', fontSize: 14 }}><Loader2 style={{ width: 24, height: 24, margin: '0 auto 8px', color: '#21C8C0' }} className="kine-spin" />Cargando...</div>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {servicios.map(s => (
                        <button key={s.id} className="kine-svc" onClick={() => setSelectedServicioId(s.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: 16, borderRadius: 14, border: `2px solid ${selectedServicioId === s.id ? '#21C8C0' : '#E2E8F0'}`, background: selectedServicioId === s.id ? 'rgba(33,200,192,.08)' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all .22s ease' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>{s.nombre}</span>
                          <span style={{ fontSize: 11, color: '#64748B' }}>{s.duracion_minutos} min{s.costo_base > 0 ? ` · $${s.costo_base}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
                  <button onClick={() => setStep('profesional')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#64748B', padding: '12px 16px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>Volver
                  </button>
                  <button disabled={!selectedServicioId} onClick={() => { setSelectedDate(new Date()); setSelectedHora(''); setStep('fecha_hora'); }} className="kine-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#21C8C0,#1aada6)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: selectedServicioId ? 'pointer' : 'default', opacity: selectedServicioId ? 1 : .4, boxShadow: '0 4px 16px rgba(33,200,192,.3)', transition: 'all .22s ease' }}>
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
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#21C8C0', marginBottom: 6 }}>Horario</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-.4px' }}>Elegí día y hora</h2>
                  <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>Turnos disponibles para las próximas semanas</p>
                </div>

                {/* Date strip */}
                <div className="kine-date-strip" style={{ marginBottom: 24 }}>
                  {dateStripDates.map((d, i) => {
                    const working    = isDayWorking(d, pcsRecords, selectedProfId, selectedServicioId);
                    const isSelected = formatDate(d) === formatDate(selectedDate);
                    return (
                      <button key={i} disabled={!working} className="kine-date" onClick={() => { setSelectedDate(d); setSelectedHora(''); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52, padding: '10px 8px', borderRadius: 12, border: `2px solid ${isSelected ? '#21C8C0' : '#E2E8F0'}`, background: isSelected ? '#21C8C0' : '#fff', cursor: working ? 'pointer' : 'default', flexShrink: 0, opacity: working ? 1 : .35, transition: 'all .22s ease' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.04em', color: isSelected ? '#fff' : '#64748B', textTransform: 'uppercase' }}>{DAYS_ES[d.getDay()]}</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: isSelected ? '#fff' : '#0F172A', lineHeight: 1.2 }}>{d.getDate()}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Slots */}
                <p style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 10 }}>Horarios disponibles</p>
                {loadingSlots
                  ? <div style={{ textAlign: 'center', padding: '32px 0' }}><Loader2 style={{ width: 24, height: 24, color: '#21C8C0', margin: '0 auto' }} className="kine-spin" /></div>
                  : slots.length === 0
                    ? <div style={{ textAlign: 'center', padding: '28px 0', color: '#64748B', fontSize: 14, background: '#fff', borderRadius: 14, border: '1.5px solid #E2E8F0' }}>No hay turnos disponibles para este día.</div>
                    : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 8 }}>
                        {slots.map(slot => (
                          <button key={slot.hora} disabled={!slot.disponible} className="kine-slot" onClick={() => setSelectedHora(slot.hora)} style={{ padding: '10px 6px', borderRadius: 10, border: `1.5px solid ${selectedHora === slot.hora ? '#234A73' : '#E2E8F0'}`, background: selectedHora === slot.hora ? '#234A73' : '#fff', color: selectedHora === slot.hora ? '#fff' : slot.disponible ? '#0F172A' : '#64748B', fontSize: 13, fontWeight: 500, cursor: slot.disponible ? 'pointer' : 'default', opacity: slot.disponible ? 1 : .4, textDecoration: slot.disponible ? 'none' : 'line-through', transition: 'all .2s ease' }}>
                            {slot.hora}
                          </button>
                        ))}
                      </div>
                    )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
                  <button onClick={() => setStep('servicio')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#64748B', padding: '12px 16px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>Volver
                  </button>
                  <button disabled={!selectedHora} onClick={() => setStep('datos')} className="kine-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#21C8C0,#1aada6)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: selectedHora ? 'pointer' : 'default', opacity: selectedHora ? 1 : .4, boxShadow: '0 4px 16px rgba(33,200,192,.3)', transition: 'all .22s ease' }}>
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
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#21C8C0', marginBottom: 6 }}>Tus datos</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-.4px' }}>Completá tu información</h2>
                  <p style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>Necesitamos tus datos para confirmar el turno</p>
                </div>

                {/* Resumen */}
                <div style={{ padding: '16px 18px', borderRadius: 14, border: '1.5px solid rgba(33,200,192,.3)', background: 'rgba(0,201,177,.06)', marginBottom: 20 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>{prof?.titulo ? `${prof.titulo} ` : ''}{prof?.apellido}, {prof?.nombre}</p>
                  <p style={{ fontSize: 13, color: '#64748B', marginBottom: 6 }}>{servicio?.nombre}</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#234A73' }}>
                    {selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · {selectedHora} hs
                  </p>
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {(['nombre', 'apellido'] as const).map(field => (
                      <div key={field}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }}>{field === 'nombre' ? 'Nombre *' : 'Apellido *'}</label>
                        <Input className="kine-input" value={form[field]} maxLength={60} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={field === 'nombre' ? 'Tu nombre' : 'Tu apellido'} style={{ borderColor: formErrors[field] ? '#E05252' : '#E2E8F0' }} />
                        {formErrors[field] && <p style={{ fontSize: 11, color: '#E05252', marginTop: 4 }}>{formErrors[field]}</p>}
                      </div>
                    ))}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }}>Teléfono / WhatsApp</label>
                    <Input className="kine-input" value={form.celular} maxLength={20} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))} placeholder="+54 9 11 0000 0000" style={{ borderColor: formErrors.celular ? '#E05252' : '#E2E8F0' }} />
                    {formErrors.celular && <p style={{ fontSize: 11, color: '#E05252', marginTop: 4 }}>{formErrors.celular}</p>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }}>Email</label>
                    <Input className="kine-input" type="email" value={form.email} maxLength={120} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tu@email.com" style={{ borderColor: formErrors.email ? '#E05252' : '#E2E8F0' }} />
                    {formErrors.email && <p style={{ fontSize: 11, color: '#E05252', marginTop: 4 }}>{formErrors.email}</p>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }}>DNI</label>
                    <Input className="kine-input" value={form.dni} maxLength={8} inputMode="numeric" onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} placeholder="12345678" style={{ borderColor: formErrors.dni ? '#E05252' : '#E2E8F0' }} />
                    {formErrors.dni && <p style={{ fontSize: 11, color: '#E05252', marginTop: 4 }}>{formErrors.dni}</p>}
                  </div>
                </div>

                {formErrors._general && (
                  <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginTop: 8 }}>
                    {formErrors._general}
                  </div>
                )}

                {cobroAnticipado !== 'ninguno' && (
                  <div style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: 12, padding: '14px 16px', marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>💳</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#9A3412', marginBottom: 4 }}>Pago anticipado requerido</p>
                      <p style={{ fontSize: 12, color: '#C2410C', lineHeight: 1.6 }}>
                        Para confirmar tu turno es necesario abonar el <strong>{cobroAnticipado}</strong> del valor de la consulta mediante Mercado Pago.
                        Una vez que hagás clic en "Confirmar turno", tenés <strong>30 minutos</strong> para completar el pago o el turno se libera automáticamente.
                      </p>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
                  <button onClick={() => setStep('fecha_hora')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#64748B', padding: '12px 16px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>Volver
                  </button>
                  <button disabled={saving || !form.nombre || !form.apellido} onClick={handleConfirmarReserva} className="kine-btn" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#21C8C0,#1aada6)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 12, border: 'none', cursor: (saving || !form.nombre || !form.apellido) ? 'default' : 'pointer', opacity: (saving || !form.nombre || !form.apellido) ? .4 : 1, boxShadow: '0 4px 16px rgba(33,200,192,.3)', transition: 'all .22s ease' }}>
                    {saving && <Loader2 style={{ width: 16, height: 16 }} className="kine-spin" />}
                    Confirmar turno
                    {!saving && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>}
                  </button>
                </div>
              </div>
            )}

            {/* ─── CONFIRMADO ─── */}
            {step === 'confirmado' && (() => {
              const esPendientePago = cobroAnticipado !== 'ninguno';

              const handlePagarOnline = async () => {
                if (!turnoId || !servicio) return;
                setPagando(true);
                // Calcular monto según porcentaje
                const pcs = pcsRecords.find(p => p.profesional_id === selectedProfId && p.servicio_id === selectedServicioId);
                // Buscar precio desde pcs_horario_dia — necesitamos el pcs_id
                // Como simplificación usamos precio del primer horario disponible
                // (precio_particular ya cargado en slots si se implementó, sino 0)
                // Llamamos a la edge function con monto 0 si no hay precio — el backend validará
                const { data: pcsRow } = await supabase
                  .from('profesional_centro_servicio')
                  .select('id')
                  .eq('profesional_id', selectedProfId)
                  .eq('servicio_id', selectedServicioId)
                  .eq('centro_id', resolvedCentroId)
                  .single();

                let precio = 0;
                if (pcsRow?.id) {
                  const { data: horarios } = await supabase
                    .from('pcs_horario_dia')
                    .select('precio_particular')
                    .eq('pcs_id', pcsRow.id)
                    .eq('activo', true)
                    .limit(1);
                  precio = horarios?.[0]?.precio_particular ?? 0;
                }

                const pct = cobroAnticipado === '50%' ? 0.5 : 1;
                const monto = Math.round(precio * pct * 100) / 100;

                if (monto <= 0) {
                  alert('No hay precio configurado para este servicio. Contactá al centro.');
                  setPagando(false);
                  return;
                }

                const { data, error: fnError } = await supabase.functions.invoke('mp-pago-portal', {
                  body: {
                    turno_id: turnoId,
                    monto,
                    descripcion: `${cobroAnticipado} de consulta — ${servicio.nombre}`,
                  },
                });
                setPagando(false);
                if (fnError || !data?.checkout_url) {
                  alert('No se pudo iniciar el pago. Intentá de nuevo.');
                } else {
                  window.location.href = data.checkout_url;
                }
              };

              return (
              <div className="kine-step-in" style={{ textAlign: 'center', padding: '20px 0 40px' }}>
                <div style={{ width: 80, height: 80, margin: '0 auto 28px', position: 'relative' }}>
                  <div className="kine-ring" style={{ width: 80, height: 80, borderRadius: '50%', border: `3px solid ${esPendientePago ? 'rgba(251,146,60,.25)' : 'rgba(33,200,192,.25)'}`, position: 'absolute' }} />
                  <div className="kine-icon-pop" style={{ width: 80, height: 80, borderRadius: '50%', background: esPendientePago ? 'linear-gradient(135deg,#FB923C,#F97316)' : 'linear-gradient(135deg,#21C8C0,#1aada6)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, boxShadow: esPendientePago ? '0 8px 24px rgba(251,146,60,.35)' : '0 8px 24px rgba(33,200,192,.35)' }}>
                    {esPendientePago
                      ? <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                      : <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    }
                  </div>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                  {esPendientePago ? '¡Turno reservado!' : '¡Turno confirmado!'}
                </h2>
                <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, marginBottom: esPendientePago ? 16 : 28 }}>
                  {esPendientePago
                    ? <>{form.nombre}, tu turno está reservado.<br /><strong style={{ color: '#C2410C' }}>Tenés 30 minutos para completar el pago</strong> o el turno se liberará automáticamente.</>
                    : <>{form.nombre}, tu turno está confirmado.<br />Te avisamos por WhatsApp el día anterior.</>
                  }
                </p>
                <div style={{ borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#fff', padding: 20, textAlign: 'left', marginBottom: 28 }}>
                  {([
                    ['Profesional', `${prof?.titulo ? prof.titulo + ' ' : ''}${prof?.apellido}, ${prof?.nombre}`],
                    ['Servicio',    servicio?.nombre ?? ''],
                    ['Fecha y hora', `${selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${selectedHora} hs`],
                    ['Paciente',   `${form.nombre} ${form.apellido}`],
                  ] as const).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: 12, color: '#64748B' }}>{key}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{val}</span>
                    </div>
                  ))}
                </div>

                {esPendientePago && (
                  <button
                    onClick={handlePagarOnline}
                    disabled={pagando}
                    className="kine-btn"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', background: 'linear-gradient(135deg,#009EE3,#0070B3)', color: '#fff', fontSize: 16, fontWeight: 700, padding: '16px 28px', borderRadius: 14, border: 'none', cursor: pagando ? 'default' : 'pointer', opacity: pagando ? .6 : 1, boxShadow: '0 4px 16px rgba(0,112,179,.3)', transition: 'all .22s ease', marginBottom: 14 }}
                  >
                    {pagando
                      ? <><Loader2 style={{ width: 18, height: 18 }} className="kine-spin" /> Procesando...</>
                      : <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Pagar con Mercado Pago</>
                    }
                  </button>
                )}

                <button
                  className="kine-btn-new"
                  onClick={() => { setStep('profesional'); setSelectedProfId(''); setSelectedServicioId(''); setSelectedHora(''); setTurnoId(null); setForm({ nombre: '', apellido: '', dni: '', celular: '', email: '' }); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '2px solid #E2E8F0', background: '#fff', color: '#0F172A', fontSize: 14, fontWeight: 600, padding: '12px 20px', borderRadius: 12, cursor: 'pointer', transition: 'all .2s ease' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.5" /></svg>
                  Reservar otro turno
                </button>
              </div>
              );
            })()}

          </div>
        </main>
      </div>
    </>
  );
}
