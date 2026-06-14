import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { normalizeDiasTrabajo, getDayName } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Heart, CheckCircle, Clock, User, ChevronLeft } from 'lucide-react';

const reservaSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(60).regex(/^[\p{L}\s'.-]+$/u, 'Nombre inválido'),
  apellido: z.string().trim().min(1, 'El apellido es obligatorio').max(60).regex(/^[\p{L}\s'.-]+$/u, 'Apellido inválido'),
  dni: z.string().trim().regex(/^\d{7,8}$/, 'DNI inválido (7-8 dígitos)').optional().or(z.literal('')),
  celular: z.string().trim().regex(/^[\d\s+()-]{8,20}$/, 'Teléfono inválido').optional().or(z.literal('')),
  email: z.string().trim().email('Email inválido').max(120).optional().or(z.literal('')),
});

interface Centro { id: string; nombre: string; direccion: string | null; telefono: string | null; }
interface Profesional { id: string; nombre: string; apellido: string; }
interface Servicio { id: string; nombre: string; duracion_minutos: number; costo_base: number; }
interface PCS { profesional_id: string; servicio_id: string; dias_trabajo: string[]; hora_inicio: string; hora_fin: string; capacidad_simultanea: number; }
interface SlotInfo { hora: string; disponible: boolean; ocupados: number; capacidad: number; }

type Step = 'profesional' | 'fecha_hora' | 'datos' | 'confirmado';

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

export default function PortalPublico() {
  const { centroId } = useParams<{ centroId: string }>();

  const [centro, setCentro] = useState<Centro | null>(null);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [pcsRecords, setPcsRecords] = useState<PCS[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const [step, setStep] = useState<Step>('profesional');
  const [selectedProfId, setSelectedProfId] = useState('');
  const [selectedServicioId, setSelectedServicioId] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHora, setSelectedHora] = useState('');
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [form, setForm] = useState({ nombre: '', apellido: '', dni: '', celular: '', email: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [turnoId, setTurnoId] = useState('');

  useEffect(() => {
    if (!centroId) return;
    Promise.all([
      supabase.from('centros').select('id, nombre, direccion, telefono').eq('id', centroId).single(),
      supabase.from('profesionales').select('id, nombre, apellido').eq('centro_id', centroId).eq('activo', true).order('apellido'),
      supabase.from('profesional_centro_servicio').select('profesional_id, servicio_id, dias_trabajo, hora_inicio, hora_fin, capacidad_simultanea').eq('centro_id', centroId).eq('activo', true),
    ]).then(([cRes, pRes, pcsRes]) => {
      setCentro(cRes.data);
      setProfesionales(pRes.data ?? []);
      setPcsRecords(((pcsRes.data as PCS[]) ?? []).map(r => ({ ...r, dias_trabajo: normalizeDiasTrabajo(r.dias_trabajo) })));
      setLoadingInit(false);
    });
  }, [centroId]);

  const serviciosDelProf = useMemo(() => {
    if (!selectedProfId) return [];
    const pcsDeProf = pcsRecords.filter(p => p.profesional_id === selectedProfId);
    const ids = [...new Set(pcsDeProf.map(p => p.servicio_id))];
    return ids;
  }, [selectedProfId, pcsRecords]);

  const [servicios, setServicios] = useState<Servicio[]>([]);
  useEffect(() => {
    if (serviciosDelProf.length === 0) { setServicios([]); return; }
    supabase.from('servicios').select('id, nombre, duracion_minutos, costo_base').in('id', serviciosDelProf).eq('activo', true)
      .then(({ data }) => setServicios(data ?? []));
  }, [serviciosDelProf]);

  const fetchSlots = async () => {
    if (!selectedProfId || !selectedServicioId || !centroId) return;
    setLoadingSlots(true);

    const dateStr = formatDate(selectedDate);
    const dayName = getDayName(selectedDate.getDay());

    const pcsActivos = pcsRecords.filter(p =>
      p.profesional_id === selectedProfId &&
      p.servicio_id === selectedServicioId &&
      normalizeDiasTrabajo(p.dias_trabajo).includes(dayName)
    );

    if (pcsActivos.length === 0) { setSlots([]); setLoadingSlots(false); return; }

    const servicio = servicios.find(s => s.id === selectedServicioId);
    const intervalo = servicio?.duracion_minutos ?? 30;
    const capacidad = Math.max(...pcsActivos.map(p => p.capacidad_simultanea ?? 1));

    const allSlots = new Set<string>();
    pcsActivos.forEach(pcs => generateSlots(pcs.hora_inicio, pcs.hora_fin, intervalo).forEach(s => allSlots.add(s)));

    const { data: turnosExistentes } = await supabase
      .from('turnos')
      .select('hora_inicio')
      .eq('centro_id', centroId)
      .eq('profesional_id', selectedProfId)
      .eq('fecha', dateStr)
      .neq('estado', 'cancelado');

    const ocupadoMap: Record<string, number> = {};
    (turnosExistentes ?? []).forEach(t => {
      const h = t.hora_inicio?.substring(0, 5);
      ocupadoMap[h] = (ocupadoMap[h] ?? 0) + 1;
    });

    const now = new Date();
    const isToday = dateStr === formatDate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    setSlots(
      [...allSlots].sort().map(hora => {
        const [hh, mm] = hora.split(':').map(Number);
        const slotMinutes = hh * 60 + mm;
        const ocupados = ocupadoMap[hora] ?? 0;
        return {
          hora,
          disponible: ocupados < capacidad && (!isToday || slotMinutes > nowMinutes + 30),
          ocupados,
          capacidad,
        };
      })
    );
    setLoadingSlots(false);
  };

  useEffect(() => { if (step === 'fecha_hora') fetchSlots(); }, [selectedDate, step]);

  const handleConfirmarReserva = async () => {
    if (!centroId) return;

    const parsed = reservaSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach(i => { errs[i.path[0] as string] = i.message; });
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    const data = parsed.data;
    setSaving(true);

    const dateStr = formatDate(selectedDate);
    const servicio = servicios.find(s => s.id === selectedServicioId);

    // Buscar o crear paciente
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
      .insert({
        centro_id: centroId,
        paciente_id: pacienteId,
        profesional_id: selectedProfId,
        servicio_id: selectedServicioId,
        fecha: dateStr,
        hora_inicio: selectedHora,
        hora_fin: horaFin,
        estado: 'reservado',
        created_by: 'paciente',
      })
      .select('id').single();

    setSaving(false);
    if (turno?.id) { setTurnoId(turno.id); setStep('confirmado'); }
  };

  const prof = profesionales.find(p => p.id === selectedProfId);
  const servicio = servicios.find(s => s.id === selectedServicioId);

  if (loadingInit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!centro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Centro no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary">
            <Heart className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">{centro.nombre}</h1>
            {centro.direccion && <p className="text-xs text-muted-foreground">{centro.direccion}</p>}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Indicador de pasos */}
        {step !== 'confirmado' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {(['profesional', 'fecha_hora', 'datos'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${step === s ? 'bg-primary text-primary-foreground' : ['profesional', 'fecha_hora', 'datos'].indexOf(step) > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                {i < 2 && <div className="h-px w-6 bg-border" />}
              </div>
            ))}
          </div>
        )}

        {/* Paso 1: Elegir profesional y servicio */}
        {step === 'profesional' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Elegí tu turno</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Profesional</Label>
                <Select value={selectedProfId} onValueChange={v => { setSelectedProfId(v); setSelectedServicioId(''); }}>
                  <SelectTrigger><SelectValue placeholder="Seleccioná un profesional" /></SelectTrigger>
                  <SelectContent>
                    {profesionales.map(p => <SelectItem key={p.id} value={p.id}>{p.apellido}, {p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedProfId && (
                <div className="space-y-1.5">
                  <Label>Servicio</Label>
                  <Select value={selectedServicioId} onValueChange={setSelectedServicioId}>
                    <SelectTrigger><SelectValue placeholder="Seleccioná un servicio" /></SelectTrigger>
                    <SelectContent>
                      {servicios.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre} — {s.duracion_minutos} min
                          {s.costo_base > 0 && <span className="text-muted-foreground ml-2">${s.costo_base}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                className="w-full"
                disabled={!selectedProfId || !selectedServicioId}
                onClick={() => setStep('fecha_hora')}
              >
                Continuar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Paso 2: Fecha y hora */}
        {step === 'fecha_hora' && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('profesional')}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Volver
            </Button>
            <Card>
              <CardContent className="p-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={d => { if (d) { setSelectedDate(d); setSelectedHora(''); } }}
                  disabled={d => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="pointer-events-auto w-full"
                />
              </CardContent>
            </Card>

            {loadingSlots ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : slots.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No hay turnos disponibles para esta fecha.</CardContent></Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Horarios disponibles</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slots.map(slot => (
                      <Button
                        key={slot.hora}
                        variant={selectedHora === slot.hora ? 'default' : 'outline'}
                        size="sm"
                        disabled={!slot.disponible}
                        className={`h-9 text-sm ${!slot.disponible ? 'opacity-40' : ''}`}
                        onClick={() => setSelectedHora(slot.hora)}
                      >
                        {slot.hora}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Button className="w-full" disabled={!selectedHora} onClick={() => setStep('datos')}>
              Continuar con {selectedHora}
            </Button>
          </div>
        )}

        {/* Paso 3: Datos del paciente */}
        {step === 'datos' && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('fecha_hora')}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Volver
            </Button>

            {/* Resumen */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 space-y-1 text-sm">
                <p className="font-semibold">{prof?.apellido}, {prof?.nombre}</p>
                <p className="text-muted-foreground">{servicio?.nombre}</p>
                <div className="flex items-center gap-4 pt-1">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {selectedHora}</span>
                  <span>{selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Tus datos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Nombre *</Label><Input value={form.nombre} maxLength={60} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />{formErrors.nombre && <p className="text-xs text-destructive">{formErrors.nombre}</p>}</div>
                  <div className="space-y-1"><Label>Apellido *</Label><Input value={form.apellido} maxLength={60} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} />{formErrors.apellido && <p className="text-xs text-destructive">{formErrors.apellido}</p>}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>DNI</Label><Input value={form.dni} maxLength={8} inputMode="numeric" onChange={e => setForm(f => ({ ...f, dni: e.target.value }))} />{formErrors.dni && <p className="text-xs text-destructive">{formErrors.dni}</p>}</div>
                  <div className="space-y-1"><Label>Celular</Label><Input value={form.celular} maxLength={20} onChange={e => setForm(f => ({ ...f, celular: e.target.value }))} />{formErrors.celular && <p className="text-xs text-destructive">{formErrors.celular}</p>}</div>
                </div>
                <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} maxLength={120} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />{formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}</div>
                <Button
                  className="w-full"
                  disabled={saving || !form.nombre || !form.apellido}
                  onClick={handleConfirmarReserva}
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirmar turno
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Confirmación */}
        {step === 'confirmado' && (
          <div className="text-center py-8 space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold">¡Turno reservado!</h2>
              <p className="text-muted-foreground mt-1">Tu turno fue registrado con éxito.</p>
            </div>
            <Card>
              <CardContent className="p-4 text-sm space-y-2">
                <p><strong>Profesional:</strong> {prof?.apellido}, {prof?.nombre}</p>
                <p><strong>Servicio:</strong> {servicio?.nombre}</p>
                <p><strong>Fecha:</strong> {selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p><strong>Hora:</strong> {selectedHora}</p>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">Recibirás un recordatorio por WhatsApp el día anterior.</p>
            <Button variant="outline" onClick={() => { setStep('profesional'); setSelectedProfId(''); setSelectedServicioId(''); setSelectedHora(''); setForm({ nombre: '', apellido: '', dni: '', celular: '', email: '' }); }}>
              Reservar otro turno
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
