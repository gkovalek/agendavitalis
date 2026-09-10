// wa-asistente-audio — GPT-4o procesa audio/voz de WhatsApp
// Mismo contexto y acciones que wa-asistente, pero el input es audio en base64

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')      ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const OPENAI_KEY       = Deno.env.get('OPENAI_API_KEY')    ?? '';
const CENTRO_ID_ENV    = Deno.env.get('CENTRO_ID')         ?? '';
const EVOLUTION_URL    = Deno.env.get('EVOLUTION_URL')     ?? '';
const EVOLUTION_INST   = Deno.env.get('EVOLUTION_INSTANCE')    ?? '';
const EVOLUTION_KEY    = Deno.env.get('EVOLUTION_KEY')     ?? '';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}

async function logError(centro_id: string, contexto: string, mensaje: string, meta?: unknown) {
  try {
    await sb.from('error_logs').insert({ centro_id, contexto, mensaje, meta });
  } catch { /* silent */ }
}

function diaSemanaATexto(dia: number): string {
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dia] ?? '';
}

function generarSlots(horaInicio: string, horaFin: string, duracionMin: number): string[] {
  const slots: string[] = [];
  const [hI, mI] = horaInicio.split(':').map(Number);
  const [hF, mF] = horaFin.split(':').map(Number);
  let cur = hI * 60 + mI;
  const fin = hF * 60 + mF;
  while (cur + duracionMin <= fin) {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    cur += duracionMin;
  }
  return slots;
}

// Determinar formato de audio para GPT-4o desde mimetype
function audioFormat(mimetype: string): string {
  if (mimetype.includes('ogg'))  return 'ogg';
  if (mimetype.includes('mp4'))  return 'mp4';
  if (mimetype.includes('mpeg') || mimetype.includes('mp3')) return 'mp3';
  if (mimetype.includes('wav'))  return 'wav';
  if (mimetype.includes('webm')) return 'webm';
  return 'ogg'; // WhatsApp ptt es ogg por defecto
}

async function callGPT(
  messages: Array<{ role: string; content: unknown }>,
  systemPrompt: string,
): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:      'gpt-4o-audio-preview',
      modalities: ['text'],
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 1024,
    }),
  });
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? '{"action":"escalate","reply":"No pude procesar el audio. Un asesor te responderá en breve."}';
}

function parsearRespuesta(raw: string): { action: string; reply: string; data: Record<string, string> } {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    return {
      action: parsed.action ?? 'message',
      reply:  parsed.reply  ?? raw,
      data:   parsed.data   ?? {},
    };
  } catch {
    return { action: 'message', reply: raw, data: {} };
  }
}

async function sendWhatsApp(celular: string, mensaje: string): Promise<void> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY || !EVOLUTION_INST) return;
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INST}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
      body: JSON.stringify({ number: celular, text: mensaje }),
    });
  } catch (e) {
    console.error('[sendWhatsApp] error:', e);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: {
    celular:        string;
    audioBase64:    string;
    audioMimetype?: string;
    centro_id?:     string;
  };

  try { body = await req.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const { celular, audioBase64, audioMimetype = 'audio/ogg' } = body;
  const centro_id = CENTRO_ID_ENV || body.centro_id || '';

  if (!celular || !audioBase64 || !centro_id) {
    return json({ error: 'faltan_campos', required: ['celular', 'audioBase64', 'centro_id o env CENTRO_ID'] }, 400);
  }

  const resultado = await procesarAudio({ celular, audioBase64, audioMimetype, centro_id });
  return json({ ok: true, reply: resultado.reply, action: resultado.action, convId: resultado.convId });
});

// ─── Procesamiento ────────────────────────────────────────────────────────────

async function procesarAudio(params: {
  celular:       string;
  audioBase64:   string;
  audioMimetype: string;
  centro_id:     string;
}) {
  const { celular, audioBase64, audioMimetype, centro_id } = params;

  // ─── Cargar / crear conversación ─────────────────────────────────────────────
  const { data: convRows } = await sb
    .from('conversaciones_wa')
    .select('*')
    .eq('celular', celular)
    .eq('centro_id', centro_id)
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1);

  let conv = convRows?.[0];

  if (!conv) {
    const { data: newConv } = await sb
      .from('conversaciones_wa')
      .insert({ centro_id, celular, historial: [], estado: 'activa' })
      .select()
      .single();
    conv = newConv;
  }

  const historial: Array<{ role: string; content: string; ts: string; type?: string; data?: Record<string,string> }> =
    conv?.historial ?? [];

  // ─── Cargar contexto completo (paralelo) ─────────────────────────────────────
  const [centroRes, profesRes, servRes, faqRes, pcsRes, pcsHorarioRes] = await Promise.all([
    sb.from('centros').select('id,nombre,mp_user_id').eq('id', centro_id).single(),
    sb.from('profesionales').select('id,titulo,nombre,apellido,mp_user_id').eq('centro_id', centro_id).eq('activo', true),
    sb.from('servicios').select('id,nombre,duracion_minutos').eq('centro_id', centro_id).eq('activo', true),
    sb.from('faq').select('pregunta,respuesta').eq('centro_id', centro_id).eq('activo', true).limit(50),
    sb.from('profesional_centro_servicio')
      .select('id,profesional_id,servicio_id,cobro_anticipado')
      .eq('centro_id', centro_id)
      .eq('activo', true),
    sb.from('pcs_horario_dia')
      .select('pcs_id,dia_semana,hora_inicio,hora_fin,acepta_os,precio_particular,activo')
      .eq('centro_id', centro_id)
      .eq('activo', true),
  ]);

  const centro      = centroRes.data   ?? {};
  const profs       = profesRes.data   ?? [];
  const servs       = servRes.data     ?? [];
  const faqs        = faqRes.data      ?? [];
  const pcsRows     = pcsRes.data      ?? [];
  const pcsHorarios = pcsHorarioRes.data ?? [];

  const profIdsList = profs.map((p: any) => p.id);
  const servIdsList = servs.map((s: any) => s.id);

  const [faqProfRes, faqServRes] = await Promise.all([
    profIdsList.length > 0
      ? sb.from('faq_profesional').select('profesional_id,pregunta,respuesta').in('profesional_id', profIdsList).eq('activo', true)
      : Promise.resolve({ data: [] }),
    servIdsList.length > 0
      ? sb.from('faq_servicio').select('servicio_id,pregunta,respuesta').in('servicio_id', servIdsList).eq('activo', true)
      : Promise.resolve({ data: [] }),
  ]);

  const faqsProfesional = (faqProfRes.data ?? []) as Array<{ profesional_id: string; pregunta: string; respuesta: string }>;
  const faqsServicio    = (faqServRes.data ?? []) as Array<{ servicio_id: string; pregunta: string; respuesta: string }>;

  let osRows: Array<{ profesional_id: string; nombre: string; codigo: string }> = [];
  if (profIdsList.length > 0) {
    const { data: osData } = await sb
      .from('obras_sociales')
      .select('profesional_id,nombre,codigo')
      .in('profesional_id', profIdsList)
      .eq('activa', true);
    osRows = (osData ?? []) as typeof osRows;
  }

  // ─── Mapas internos ───────────────────────────────────────────────────────────
  const pcsByProfServ: Record<string, string> = {};
  for (const p of pcsRows) pcsByProfServ[`${p.profesional_id}|${p.servicio_id}`] = p.id;

  const horariosPorPcs: Record<string, Array<{ dia: number; inicio: string; fin: string; acepta_os: boolean; precio: number | null }>> = {};
  for (const h of pcsHorarios) {
    if (!horariosPorPcs[h.pcs_id]) horariosPorPcs[h.pcs_id] = [];
    horariosPorPcs[h.pcs_id].push({ dia: h.dia_semana, inicio: h.hora_inicio, fin: h.hora_fin, acepta_os: h.acepta_os, precio: h.precio_particular });
  }

  const osPorProf: Record<string, Array<{ nombre: string; codigo: string }>> = {};
  for (const o of osRows) {
    if (!osPorProf[o.profesional_id]) osPorProf[o.profesional_id] = [];
    osPorProf[o.profesional_id].push({ nombre: o.nombre, codigo: o.codigo });
  }

  const servDuracion: Record<string, number> = {};
  const servNombre: Record<string, string> = {};
  for (const s of servs) {
    servDuracion[s.id] = s.duracion_minutos ?? 60;
    servNombre[s.id]   = s.nombre;
  }

  // ─── System prompt dinámico ───────────────────────────────────────────────────
  const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const DIAS_ORDEN = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

  const profsStr = profs.map((p: any) => {
    const nombreCompleto = [p.titulo, p.nombre, p.apellido].filter(Boolean).join(' ');
    const pcsDePeste = pcsRows.filter(pc => pc.profesional_id === p.id);
    const serviciosStr = pcsDePeste.map(pc => {
      const nom  = servNombre[pc.servicio_id] ?? pc.servicio_id;
      const hors = horariosPorPcs[pc.id] ?? [];
      const porDia = hors.map(h => {
        const dia = diaSemanaATexto(h.dia);
        const horario = `${h.inicio.slice(0,5)}–${h.fin.slice(0,5)}`;
        let costoStr: string;
        if (h.acepta_os && (h.precio == null || h.precio === 0)) {
          costoStr = 'OS cubre todo (sin adicional)';
        } else if (h.acepta_os && h.precio != null && h.precio > 0) {
          costoStr = `OS + adicional $${Number(h.precio).toLocaleString('es-AR')}`;
        } else {
          costoStr = `solo particular $${h.precio != null ? Number(h.precio).toLocaleString('es-AR') : 'consultar'}`;
        }
        return `      ${dia} ${horario}: ${costoStr}`;
      }).sort((a, b) => {
        const dA = DIAS_ORDEN.findIndex(d => a.includes(d));
        const dB = DIAS_ORDEN.findIndex(d => b.includes(d));
        return dA - dB;
      }).join('\n');
      const cobro = pc.cobro_anticipado ?? 'ninguno';
      const cobroStr = cobro === 'ninguno' ? '' : `\n      ⚠️ Requiere pago anticipado del ${cobro}`;
      return `    • ${nom} (servicio_id: ${pc.servicio_id})${cobroStr}\n${porDia || '      (sin horarios configurados)'}`;
    }).join('\n') || '    (sin servicios configurados)';
    const osList = osPorProf[p.id] ?? [];
    const osStr = osList.length > 0 ? osList.map(o => `    • ${o.nombre} (${o.codigo})`).join('\n') : '    (no trabaja con obras sociales)';
    const faqsProf = faqsProfesional.filter(f => f.profesional_id === p.id).map(f => `    P: ${f.pregunta}\n    R: ${f.respuesta}`).join('\n');
    const servIdsDeProf = pcsDePeste.map(pc => pc.servicio_id);
    const faqsServs = faqsServicio.filter(f => servIdsDeProf.includes(f.servicio_id)).map(f => `    [${servNombre[f.servicio_id] ?? ''}] P: ${f.pregunta}\n    R: ${f.respuesta}`).join('\n');
    const faqStr = [faqsProf, faqsServs].filter(Boolean).join('\n');
    return `${nombreCompleto} (profesional_id: ${p.id})\n  Servicios y horarios:\n${serviciosStr}\n  Obras sociales:\n${osStr}${faqStr ? `\n  FAQ específicas:\n${faqStr}` : ''}`;
  }).join('\n\n');

  const faqStr = faqs.map((f: any) => `P: ${f.pregunta}\nR: ${f.respuesta}`).join('\n\n');

  const systemPrompt = `Sos el asistente virtual de ${(centro as any).nombre ?? 'este centro de salud'}. Atendés consultas de pacientes por WhatsApp. El paciente te envió un MENSAJE DE VOZ — transcribilo e interpretalo para responder.

PROFESIONALES Y DISPONIBILIDAD:
${profsStr || '(sin datos)'}

${faqStr ? `BASE DE CONOCIMIENTO (FAQ DEL CENTRO):\n${faqStr}\n` : ''}

═══ FLUJO ESTRUCTURADO OBLIGATORIO ═══

PASO 1 — CON QUIÉN HABLO
Si no sabés el nombre, preguntá: "¿Me podés decir tu nombre y apellido?"

PASO 2 — QUÉ NECESITA
Entendé el motivo: sacar turno, cancelar, reagendar, consulta de horarios/precios/OS, otra consulta.

PASO 3 — DETALLES (según el motivo)
Para turnos: profesional → servicio → fecha preferida → usá check_slots para mostrar horarios reales.
Para consultas: respondé con la info de arriba.

PASO 4 — INFORMAR / ASESORAR
Ejemplo: "La Lic. Abraham atiende lunes a viernes 14-20 hs. ¿Querés sacar un turno?"

PASO 5 — REQUERIMIENTO (cuando quiere agendar)
Si hay cobro anticipado, informalo. Pedí el DNI si vas a registrar el turno.

PASO 6 — CONFIRMAR ANTES DE EJECUTAR
Mostrá resumen y preguntá "¿Confirmamos?" antes de emitir book_turno.

PASO 7 — CIERRE
Tras agendar: "✅ Turno confirmado para el [fecha] a las [hora] con [profesional]."

═══ PRECIOS Y OBRAS SOCIALES ═══
Cada día tiene su esquema. Respondé exactamente según el día elegido.

═══ AUDIO / CASOS ESPECIALES ═══
- Si el audio no se entiende bien o es ambiguo, pedí confirmación antes de actuar.
- Si la consulta está fuera de lo que podés resolver → action "escalate"
- No inventés datos que no estén arriba.

FECHA/HORA ACTUAL (Buenos Aires): ${now}

RESPONDÉ ÚNICAMENTE con JSON válido (sin markdown):
{"action":"message|check_slots|book_turno|cancel_turno|escalate","reply":"texto para el paciente","data":{"profesional_id":"uuid","servicio_id":"uuid","fecha":"YYYY-MM-DD","hora":"HH:MM","nombre":"...","apellido":"...","dni":"..."}}

OBLIGATORIO en "data" para book_turno: nombre, apellido, dni, profesional_id, servicio_id, fecha, hora.`;

  // ─── Llamar GPT-4o con audio ──────────────────────────────────────────────────
  const fmt = audioFormat(audioMimetype);

  // Historial de texto para contexto (últimos 20 mensajes)
  const msgsHistorial = historial
    .filter(h => h.role !== 'system')
    .slice(-20)
    .map(h => ({ role: h.role as 'user' | 'assistant', content: h.content }));

  // Mensaje de usuario: audio como input_audio
  const userMessage = {
    role: 'user' as const,
    content: [
      { type: 'input_audio', input_audio: { data: audioBase64, format: fmt } },
    ],
  };

  const msgs = [...msgsHistorial, userMessage];
  const rawGPT = await callGPT(msgs, systemPrompt);

  const parsed = parsearRespuesta(rawGPT);
  let action     = parsed.action;
  let aData      = parsed.data;
  let finalReply = parsed.reply;
  let raw1       = rawGPT;

  // ─── Ejecutar acciones (misma lógica que wa-asistente) ───────────────────────

  // ── check_slots ──────────────────────────────────────────────────────────────
  if (action === 'check_slots') {
    const fechaStr  = aData.fecha ?? new Date().toISOString().slice(0, 10);
    const profId    = aData.profesional_id;
    const servId    = aData.servicio_id;

    if (profId && servId) {
      const fechaObj  = new Date(`${fechaStr}T00:00:00`);
      const diaSemana = fechaObj.getDay();
      const pcsId     = pcsByProfServ[`${profId}|${servId}`];
      const horariosDia = (horariosPorPcs[pcsId] ?? []).filter(h => h.dia === diaSemana);
      const duracion  = servDuracion[servId] ?? 60;

      let slotsText: string;
      if (!pcsId || horariosDia.length === 0) {
        slotsText = `El profesional no atiende el ${diaSemanaATexto(diaSemana)}.`;
      } else {
        const todosSlots: string[] = [];
        for (const h of horariosDia) todosSlots.push(...generarSlots(h.inicio.slice(0,5), h.fin.slice(0,5), duracion));
        const { data: ocupados } = await sb
          .from('turnos')
          .select('hora_inicio')
          .eq('centro_id', centro_id)
          .eq('profesional_id', profId)
          .eq('fecha', fechaStr)
          .not('estado', 'in', '("cancelado","pendiente_pago")');
        const ocupadasHoras = new Set((ocupados ?? []).map((t: any) => t.hora_inicio.slice(0,5)));
        const disponibles = todosSlots.filter(h => !ocupadasHoras.has(h));
        slotsText = disponibles.length ? disponibles.join(', ') : 'No hay turnos disponibles para esa fecha.';
      }

      // Segunda llamada GPT para presentar slots
      const msgs2 = [
        ...msgsHistorial,
        userMessage,
        { role: 'assistant' as const, content: raw1 },
        { role: 'user' as const, content: `SLOTS DISPONIBLES para el ${fechaStr} (${diaSemanaATexto(diaSemana)}): ${slotsText}. Presentá las opciones al paciente y preguntá cuál le queda mejor.` },
      ];
      const raw2 = await callGPT(msgs2, systemPrompt);
      const ai2  = parsearRespuesta(raw2);
      if (ai2.reply) finalReply = ai2.reply;
      if (ai2.action) { action = ai2.action; aData = { ...aData, ...ai2.data }; }
    }
  }

  // ── book_turno ───────────────────────────────────────────────────────────────
  if (action === 'book_turno') {
    const { profesional_id: profId, servicio_id: servId, fecha, hora, nombre = '', apellido = '', dni = '' } = aData;

    if (!nombre || !apellido) {
      finalReply = '¿Me podés decir tu nombre y apellido completo para registrar el turno?';
      action = 'message';
    } else if (!dni) {
      finalReply = `Gracias, ${nombre}. Para registrar el turno necesito tu DNI (solo el número, sin puntos).`;
      action = 'message';
    } else if (!profId || !servId || !fecha || !hora) {
      finalReply = 'Para confirmar el turno necesito saber el profesional, servicio, fecha y horario.';
      action = 'message';
    } else {
      try {
        const { data: pacienteId } = await sb.rpc('buscar_o_crear_paciente', {
          p_centro_id: centro_id, p_nombre: nombre, p_apellido: apellido, p_dni: dni || null, p_celular: celular,
        });

        const pcs        = pcsRows.find(p => p.profesional_id === profId && p.servicio_id === servId);
        const cobro      = pcs?.cobro_anticipado ?? 'ninguno';
        const hors       = horariosPorPcs[pcs?.id ?? ''] ?? [];
        const precioTotal = hors[0]?.precio ?? 0;
        const porcentaje  = cobro === '100%' ? 1 : cobro === '50%' ? 0.5 : 0;
        const montoCobro  = Math.round(precioTotal * porcentaje);
        const needsPayment = porcentaje > 0 && montoCobro > 0;

        const duracion  = servDuracion[servId] ?? 60;
        const [hh, mm]  = hora.split(':').map(Number);
        const finMin    = hh * 60 + mm + duracion;
        const toTime    = (min: number) => `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}:00`;
        const horaInicio = hora.length === 5 ? `${hora}:00` : hora;
        const horaFin    = toTime(finMin);

        const { data: turno, error: turnoError } = await sb
          .from('turnos')
          .insert({
            centro_id, profesional_id: profId, servicio_id: servId, paciente_id: pacienteId,
            fecha, hora_inicio: horaInicio, hora_fin: horaFin,
            estado: needsPayment ? 'pendiente_pago' : 'reservado',
            created_by: 'paciente',
            ...(needsPayment ? { pago_expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() } : {}),
          })
          .select('id')
          .single();

        if (turnoError) throw new Error(turnoError.message);

        if (pacienteId) {
          await sb.from('conversaciones_wa').update({ paciente_id: pacienteId }).eq('id', conv.id).is('paciente_id', null);
        }

        const profObj = profs.find((p: any) => p.id === profId);
        const nomProf = profObj ? [profObj.titulo, profObj.nombre, profObj.apellido].filter(Boolean).join(' ') : 'el profesional';
        const fechaDisplay = new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

        if (needsPayment) {
          finalReply = `✅ ¡Turno reservado! Te mandamos el link para abonar el ${cobro} ($${montoCobro.toLocaleString('es-AR')}) y quedar confirmado.\n\n📅 ${fechaDisplay} a las ${hora} hs con ${nomProf} — ${servNombre[servId] ?? ''}`;
        } else {
          finalReply = `✅ ¡Turno confirmado!\n\n📅 ${fechaDisplay} a las ${hora} hs con ${nomProf} — ${servNombre[servId] ?? ''}\n\nUn día antes recibirás un recordatorio. ¡Respondelo para confirmar tu asistencia!`;
        }

        if (needsPayment && turno?.id) {
          const mpRes = await fetch(`${SUPABASE_URL}/functions/v1/mp-pago-portal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE}` },
            body: JSON.stringify({ turno_id: turno.id, monto: montoCobro, descripcion: `${cobro} de turno — ${servNombre[servId] ?? ''}` }),
          });
          const mpData = await mpRes.json();
          const mpUrl = mpData.checkout_url ?? mpData.init_point ?? mpData.url;
          if (mpUrl) {
            finalReply += `\n\n💳 *Link de pago:*\n${mpUrl}\n\n⏱ Tenés 30 minutos para pagar.`;
          }
        }
      } catch (e: any) {
        await logError(centro_id, 'wa-asistente-audio/book_turno', e.message, { celular, aData });
        finalReply = 'Hubo un problema al registrar el turno. Contactá directamente al centro para confirmarlo.';
      }
    }
  }

  // ── cancel_turno ─────────────────────────────────────────────────────────────
  if (action === 'cancel_turno') {
    try {
      const pacienteId = conv?.paciente_id ?? null;
      const dniCancelacion = aData.dni || '';
      const hoy = new Date().toISOString().slice(0, 10);
      let query: any = sb.from('turnos').select('id,fecha,hora_inicio,profesional_id').eq('centro_id', centro_id).gte('fecha', hoy).in('estado', ['reservado','confirmado','pendiente_pago']).order('fecha', { ascending: true }).limit(1);

      if (pacienteId) {
        query = query.eq('paciente_id', pacienteId);
      } else {
        const { data: pacs } = await sb.from('pacientes').select('id').eq('centro_id', centro_id)
          .or(dniCancelacion ? `dni.eq.${dniCancelacion},celular.eq.${celular}` : `celular.eq.${celular}`);
        const pacIds = (pacs ?? []).map((p: any) => p.id);
        if (pacIds.length > 0) {
          query = query.in('paciente_id', pacIds);
        } else {
          finalReply = !dniCancelacion ? 'Para cancelar necesito tu DNI. ¿Me lo podés indicar?' : 'No encontré ningún turno con ese DNI.';
          action = 'message';
          query = null;
        }
      }

      if (action === 'cancel_turno' && query) {
        const { data: turnoActivo } = await query;
        if (turnoActivo) {
          await sb.from('turnos').update({ estado: 'cancelado', motivo_cancelacion: 'Cancelado por el paciente vía WhatsApp' }).eq('id', turnoActivo.id);
          const profObj = profs.find((p: any) => p.id === turnoActivo.profesional_id);
          const nomProf = profObj ? `${profObj.titulo ?? ''} ${profObj.nombre} ${profObj.apellido}`.trim() : 'el profesional';
          finalReply = `✅ Listo, cancelé tu turno del ${turnoActivo.fecha} a las ${turnoActivo.hora_inicio.slice(0,5)} con ${nomProf}.`;
          action = 'message';
        } else {
          finalReply = 'No encontré turnos próximos activos con tu número.';
          action = 'message';
        }
      }
    } catch (e: any) {
      await logError(centro_id, 'wa-asistente-audio/cancel_turno', e.message, { celular });
      finalReply = 'No pude cancelar el turno. Escribinos directamente y te ayudamos.';
      action = 'message';
    }
  }

  // ── escalate ─────────────────────────────────────────────────────────────────
  if (action === 'escalate') {
    await sb.from('conversaciones_wa').update({ estado: 'derivada', derivada_en: new Date().toISOString() }).eq('id', conv.id);
    if (!finalReply || finalReply.length < 5) {
      finalReply = 'Gracias por tu mensaje de voz 🎧 Un asesor lo revisará y te responderá en breve 🙏';
    }
  }

  // ─── Guardar historial ────────────────────────────────────────────────────────
  const ts = new Date().toISOString();
  const nuevoHistorial = [
    ...historial.filter(h => h.type !== 'pending_booking'),
    { role: 'user',      content: '[Mensaje de voz]', ts, type: 'audio' },
    { role: 'assistant', content: finalReply,         ts },
  ].slice(-60);

  await sb.from('conversaciones_wa').update({ historial: nuevoHistorial, updated_at: ts }).eq('id', conv.id);

  // ─── Log tokens (GPT-4o no retorna usage en la misma forma, usamos estimación) ─
  // No logueamos tokens para GPT-4o en ia_uso_tokens (modelo diferente)

  if (finalReply) await sendWhatsApp(celular, finalReply);

  console.log('[wa-asistente-audio] completado', { celular, action, convId: conv.id });
  return { reply: finalReply, action, convId: conv.id };
}
