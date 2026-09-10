// wa-reagendar-twilio — Flujo multi-paso de reagendado vía WhatsApp Twilio
//
// Paso 1 (step: 'inicio')  → Pide fecha preferida
// Paso 2 (step: 'fecha')   → Parsea fecha, consulta slots reales, ofrece 3 opciones
// Paso 3 (step: 'slot')    → Paciente elige 1/2/3, agenda turno, confirma
//
// Estado guardado en conversaciones_wa.historial como entries type='reagendar_twilio'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const CENTRO_ID_ENV    = Deno.env.get('CENTRO_ID') ?? '';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...cors(), 'Content-Type': 'application/json' } }); }

function diaSemanaATexto(n: number) { return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][n] ?? ''; }

function generarSlots(inicio: string, fin: string, durMin: number): string[] {
  const slots: string[] = [];
  const [hI, mI] = inicio.split(':').map(Number);
  const [hF, mF] = fin.split(':').map(Number);
  let cur = hI * 60 + mI;
  const end = hF * 60 + mF;
  while (cur + durMin <= end) {
    slots.push(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`);
    cur += durMin;
  }
  return slots;
}

// Parsea fecha desde texto libre del paciente → YYYY-MM-DD o null
function parsearFecha(texto: string): string | null {
  const t = texto.toLowerCase().trim();
  const hoy = new Date();
  hoy.setHours(0,0,0,0);

  if (/ma[nñ]ana/.test(t)) {
    const d = new Date(hoy); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0,10);
  }
  if (/pasado/.test(t)) {
    const d = new Date(hoy); d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0,10);
  }

  const diasSemana: Record<string, number> = { lunes:1, martes:2, miercoles:3, miércoles:3, jueves:4, viernes:5, sabado:6, sábado:6, domingo:0 };
  for (const [nombre, numDia] of Object.entries(diasSemana)) {
    if (t.includes(nombre)) {
      const d = new Date(hoy);
      const hoyDia = d.getDay();
      let diff = numDia - hoyDia;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0,10);
    }
  }

  // dd/mm o d/m
  const slashMatch = t.match(/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    const dia = parseInt(slashMatch[1]);
    const mes = parseInt(slashMatch[2]) - 1;
    const anio = mes < hoy.getMonth() || (mes === hoy.getMonth() && dia < hoy.getDate()) ? hoy.getFullYear() + 1 : hoy.getFullYear();
    const d = new Date(anio, mes, dia);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  }

  // d de mes (ej: "15 de septiembre")
  const meses: Record<string,number> = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11 };
  for (const [nombre, num] of Object.entries(meses)) {
    const m = t.match(new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?${nombre}`));
    if (m) {
      const dia = parseInt(m[1]);
      const anio = num < hoy.getMonth() ? hoy.getFullYear() + 1 : hoy.getFullYear();
      const d = new Date(anio, num, dia);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
    }
  }

  return null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: {
    celular:        string;
    mensaje:        string;
    centro_id?:     string;
    // Solo requeridos en el inicio del flujo:
    profesional_id?: string;
    servicio_id?:    string;
    step?:           string; // 'inicio' | 'fecha' | 'slot' (n8n puede ignorarlo, la EF lo detecta del historial)
  };

  try { body = await req.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const { celular, mensaje } = body;
  const centro_id = CENTRO_ID_ENV || body.centro_id || '';

  if (!celular || !mensaje || !centro_id) {
    return json({ error: 'faltan_campos' }, 400);
  }

  // ─── Cargar / crear conversación ─────────────────────────────────────────────
  const { data: convRows } = await sb
    .from('conversaciones_wa')
    .select('*')
    .eq('celular', celular)
    .eq('centro_id', centro_id)
    .order('created_at', { ascending: false })
    .limit(1);

  let conv = convRows?.[0];
  if (!conv) {
    const { data: newConv } = await sb
      .from('conversaciones_wa')
      .insert({ centro_id, celular, historial: [], estado: 'reagendando_twilio' })
      .select().single();
    conv = newConv;
  }

  const historial: Array<{ role: string; content: string; ts: string; type?: string; data?: Record<string,string> }> =
    conv?.historial ?? [];

  // ─── Detectar paso actual del flujo ──────────────────────────────────────────
  const ultimoReagendar = [...historial].reverse().find(h => h.type?.startsWith('reagendar_twilio'));
  const pasoActual = ultimoReagendar?.type ?? 'reagendar_twilio_inicio';
  const dataPendiente = ultimoReagendar?.data ?? {};

  let reply = '';
  let done  = false;
  let nuevoData: Record<string, string> = {};
  let nuevoTipo = '';

  // ─── PASO 1 — inicio: pedir fecha ────────────────────────────────────────────
  if (pasoActual === 'reagendar_twilio_inicio' || body.step === 'inicio') {
    // Guardar prof y servicio del turno cancelado
    nuevoData = {
      profesional_id: body.profesional_id ?? '',
      servicio_id:    body.servicio_id    ?? '',
    };
    nuevoTipo = 'reagendar_twilio_esperando_fecha';

    reply = '📅 ¿Para qué día querés reagendar tu turno? Podés decirme "mañana", "lunes", o una fecha como "15/09".';
  }

  // ─── PASO 2 — recibir fecha, ofrecer 3 slots ─────────────────────────────────
  else if (pasoActual === 'reagendar_twilio_esperando_fecha') {
    const profId = dataPendiente.profesional_id;
    const servId = dataPendiente.servicio_id;
    const fecha  = parsearFecha(mensaje);

    if (!fecha) {
      reply = '🤔 No entendí la fecha. Por favor respondé con algo como "mañana", "lunes" o "15/09".';
      nuevoTipo = 'reagendar_twilio_esperando_fecha';
      nuevoData = dataPendiente;
    } else {
      const fechaObj  = new Date(`${fecha}T00:00:00`);
      const diaSemana = fechaObj.getDay();

      // Buscar PCS y horarios
      const { data: pcsRow } = await sb
        .from('profesional_centro_servicio')
        .select('id')
        .eq('centro_id', centro_id)
        .eq('profesional_id', profId)
        .eq('servicio_id', servId)
        .eq('activo', true)
        .maybeSingle();

      const pcsId = pcsRow?.id;

      const { data: horarios } = pcsId
        ? await sb.from('pcs_horario_dia').select('hora_inicio,hora_fin').eq('pcs_id', pcsId).eq('dia_semana', diaSemana).eq('activo', true)
        : { data: [] };

      const { data: servData } = await sb.from('servicios').select('duracion_minutos,nombre').eq('id', servId).single();
      const duracion  = servData?.duracion_minutos ?? 60;
      const nomServ   = servData?.nombre ?? '';

      let todosSlots: string[] = [];
      for (const h of (horarios ?? [])) {
        todosSlots.push(...generarSlots(h.hora_inicio.slice(0,5), h.hora_fin.slice(0,5), duracion));
      }

      // Descontar ocupados
      const { data: ocupados } = await sb
        .from('turnos')
        .select('hora_inicio')
        .eq('centro_id', centro_id)
        .eq('profesional_id', profId)
        .eq('fecha', fecha)
        .not('estado', 'in', '("cancelado","pendiente_pago")');

      const ocupadas = new Set((ocupados ?? []).map((t: any) => t.hora_inicio.slice(0,5)));
      const disponibles = todosSlots.filter(h => !ocupadas.has(h)).slice(0, 3);

      if (disponibles.length === 0) {
        reply = `😕 No hay turnos disponibles el ${diaSemanaATexto(diaSemana)} ${fecha.split('-').reverse().join('/')} para ${nomServ}. ¿Querés probar otro día? Decime cuándo.`;
        nuevoTipo = 'reagendar_twilio_esperando_fecha';
        nuevoData = dataPendiente;
      } else {
        const lista = disponibles.map((h, i) => `${i+1}. ${h} hs`).join('\n');
        reply = `📅 Para el ${diaSemanaATexto(diaSemana)} ${fecha.split('-').reverse().join('/')} hay estos horarios disponibles:\n\n${lista}\n\nRespondé con el número (1, 2 o 3) para confirmar.`;
        nuevoTipo = 'reagendar_twilio_esperando_slot';
        nuevoData = {
          ...dataPendiente,
          fecha,
          slot1: disponibles[0] ?? '',
          slot2: disponibles[1] ?? '',
          slot3: disponibles[2] ?? '',
        };
      }
    }
  }

  // ─── PASO 3 — selección de slot, agendar ────────────────────────────────────
  else if (pasoActual === 'reagendar_twilio_esperando_slot') {
    const seleccion = mensaje.trim();
    const idx = parseInt(seleccion) - 1;
    const slotElegido = [dataPendiente.slot1, dataPendiente.slot2, dataPendiente.slot3][idx] ?? null;

    if (!slotElegido && !['1','2','3'].includes(seleccion)) {
      reply = `Por favor respondé con 1, 2 o 3 para elegir el horario:\n1. ${dataPendiente.slot1} hs\n2. ${dataPendiente.slot2} hs${dataPendiente.slot3 ? `\n3. ${dataPendiente.slot3} hs` : ''}`;
      nuevoTipo = 'reagendar_twilio_esperando_slot';
      nuevoData = dataPendiente;
    } else if (!slotElegido) {
      reply = `Ese número no está disponible. Por favor elegí entre las opciones ofrecidas.`;
      nuevoTipo = 'reagendar_twilio_esperando_slot';
      nuevoData = dataPendiente;
    } else {
      // Agendar turno
      try {
        const profId = dataPendiente.profesional_id;
        const servId = dataPendiente.servicio_id;
        const fecha  = dataPendiente.fecha;
        const hora   = slotElegido;

        const { data: servData } = await sb.from('servicios').select('duracion_minutos,nombre').eq('id', servId).single();
        const duracion = servData?.duracion_minutos ?? 60;
        const nomServ  = servData?.nombre ?? '';

        const { data: profData } = await sb.from('profesionales').select('titulo,nombre,apellido').eq('id', profId).single();
        const nomProf = profData ? [profData.titulo, profData.nombre, profData.apellido].filter(Boolean).join(' ') : 'el profesional';

        const [hh, mm] = hora.split(':').map(Number);
        const finMin   = hh * 60 + mm + duracion;
        const toTime   = (min: number) => `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}:00`;

        // Obtener paciente_id de la conversación o por celular
        let pacienteId = conv?.paciente_id ?? null;
        if (!pacienteId) {
          const { data: pacs } = await sb.from('pacientes').select('id').eq('celular', celular).eq('centro_id', centro_id).limit(1);
          pacienteId = pacs?.[0]?.id ?? null;
        }

        const { error: turnoError } = await sb.from('turnos').insert({
          centro_id,
          profesional_id: profId,
          servicio_id:    servId,
          paciente_id:    pacienteId,
          fecha,
          hora_inicio:    `${hora}:00`,
          hora_fin:       toTime(finMin),
          estado:         'reservado',
          created_by:     'paciente',
        });

        if (turnoError) throw new Error(turnoError.message);

        const fechaDisplay = new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
        reply = `✅ ¡Listo! Tu nuevo turno quedó confirmado:\n\n📅 ${fechaDisplay} a las ${hora} hs\n👤 ${nomProf}\n🏥 ${nomServ}\n\nUn día antes recibirás un recordatorio. ¡Hasta entonces!`;
        done = true;

        // Cerrar el estado de la conversación
        await sb.from('conversaciones_wa').update({ estado: 'cerrada', updated_at: new Date().toISOString() }).eq('id', conv.id);

      } catch (e: any) {
        console.error('[wa-reagendar-twilio] error book:', e.message);
        reply = 'Hubo un problema al registrar el turno. Por favor contactá directamente al centro.';
        done = true;
      }
    }
  }

  // ─── Guardar estado en historial ─────────────────────────────────────────────
  if (!done) {
    const ts = new Date().toISOString();
    const nuevoHistorial = [
      ...historial.filter(h => !h.type?.startsWith('reagendar_twilio')),
      { role: 'system', type: nuevoTipo, content: reply, ts, data: nuevoData },
      { role: 'user',   content: mensaje, ts, type: 'text' },
      { role: 'assistant', content: reply, ts },
    ].slice(-40);

    await sb.from('conversaciones_wa').update({
      historial: nuevoHistorial,
      estado:    'reagendando_twilio',
      updated_at: ts,
    }).eq('id', conv.id);
  }

  return json({ reply, done });
});
