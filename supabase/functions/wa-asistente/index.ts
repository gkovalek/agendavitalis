/**
 * wa-asistente — Asistente IA para WhatsApp (invocado desde n8n)
 *
 * Recibe: { celular, userText, messageType?, imageBase64?, imageMimetype?, centro_id? }
 * Retorna: { reply, action, convId }
 *
 * centro_id: se lee de la variable de entorno CENTRO_ID (número dedicado, ej. Kine+).
 * Si CENTRO_ID no está definida, se toma del body (modo multi-centro futuro).
 *
 * No requiere JWT — llamado internamente por n8n con service_role key.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY    = Deno.env.get('ANTHROPIC_API_KEY')!;
const CENTRO_ID_ENV    = Deno.env.get('CENTRO_ID') ?? '';          // fijo para Kine+
const EVOLUTION_URL    = Deno.env.get('EVOLUTION_URL') ?? 'http://72.61.58.46:8080';
const EVOLUTION_INST   = Deno.env.get('EVOLUTION_INSTANCE') ?? 'Secretaria_Vitalis';
const EVOLUTION_KEY    = Deno.env.get('EVOLUTION_API_KEY') ?? '';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// ─── Observabilidad ───────────────────────────────────────────────────────────

async function logError(centroId: string | null, funcion: string, mensaje: string, detalle?: unknown) {
  console.error(`[${funcion}] ${mensaje}`, detalle ?? '');
  try {
    await sb.from('error_logs').insert({
      centro_id: centroId,
      funcion,
      nivel: 'error',
      mensaje,
      detalle: detalle ? JSON.parse(JSON.stringify(detalle)) : {},
    });
  } catch { /* no recursión */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}

/** Extrae URLs de un texto */
function extraerUrls(texto: string): string[] {
  const re = /https?:\/\/[^\s\])"'>]+/g;
  return [...new Set(texto.match(re) ?? [])].slice(0, 3); // máx 3 URLs
}

/** Fetch de URL con timeout de 8s, devuelve texto limpio */
async function fetchUrlTexto(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null;
    const html = await res.text();

    // 1. Intentar extraer datos estructurados de Next.js (__NEXT_DATA__)
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const texto = JSON.stringify(nextData?.props?.pageProps ?? nextData, null, 2).slice(0, 4000);
        if (texto.length > 50) return `[Datos de la página]\n${texto}`;
      } catch { /* continúa */ }
    }

    // 2. Intentar extraer JSON-LD (datos estructurados SEO)
    const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const ldData = JSON.parse(jsonLdMatch[1]);
        return `[Datos estructurados]\n${JSON.stringify(ldData, null, 2).slice(0, 3000)}`;
      } catch { /* continúa */ }
    }

    // 3. Extraer meta tags relevantes
    const metas: string[] = [];
    const metaRe = /<meta[^>]+(?:name|property)="([^"]+)"[^>]+content="([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = metaRe.exec(html)) !== null) {
      if (/description|title|og:|prescription|medic/i.test(m[1])) {
        metas.push(`${m[1]}: ${m[2]}`);
      }
    }

    // 4. Texto plano del HTML como fallback
    const texto = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 3000);

    if (metas.length > 0) return `[Meta]\n${metas.join('\n')}\n\n${texto}`.slice(0, 3000);
    return texto || null;
  } catch { return null; }
}

function diaSemanaATexto(dia: number): string {
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dia] ?? '';
}

/** Genera slots de hora_inicio a hora_fin con incrementos de duracion_min minutos */
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

// ─── Claude helper ─────────────────────────────────────────────────────────────

async function callClaude(
  messages: Array<{ role: string; content: unknown }>,
  systemPrompt: string,
  maxTokens = 1024,
): Promise<{ content: Array<{ text: string }>; usage: { input_tokens: number; output_tokens: number } }> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25,prompt-caching-2024-07-31',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    }),
  });
  return r.json();
}

function parsearRespuestaClaude(raw: string): { action: string; reply: string; data: Record<string, string> } {
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

// ─── Evolution API sender ─────────────────────────────────────────────────────

async function sendWhatsApp(celular: string, mensaje: string): Promise<void> {
  if (!EVOLUTION_URL || !EVOLUTION_KEY || !EVOLUTION_INST) {
    console.warn('[sendWhatsApp] Variables de Evolution no configuradas, omitiendo envío directo');
    return;
  }
  try {
    const url = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INST}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: celular,
        text: mensaje,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[sendWhatsApp] Error Evolution:', res.status, txt);
    } else {
      console.log('[sendWhatsApp] Mensaje enviado a', celular);
    }
  } catch (e) {
    console.error('[sendWhatsApp] fetch error:', e);
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: {
    celular: string;
    userText: string;
    messageType?: string;
    centro_id?: string;
    imageBase64?: string | null;
    imageMimetype?: string | null;
    documentBase64?: string | null;
    documentMimetype?: string | null;
    documentName?: string | null;
  };

  try { body = await req.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const {
    celular, userText, messageType = 'text',
    imageBase64, imageMimetype,
    documentBase64, documentMimetype, documentName,
  } = body;

  // centro_id: env var tiene prioridad (número dedicado); si no, viene del body
  const centro_id = CENTRO_ID_ENV || body.centro_id || '';

  if (!celular || !userText || !centro_id) {
    return json({ error: 'faltan_campos', required: ['celular', 'userText', 'centro_id o env CENTRO_ID'] }, 400);
  }

  const resultado = await procesarMensaje({
    celular, userText, messageType, centro_id,
    imageBase64: imageBase64 ?? null,
    imageMimetype: imageMimetype ?? null,
    documentBase64: documentBase64 ?? null,
    documentMimetype: documentMimetype ?? null,
    documentName: documentName ?? null,
  });

  return json({ ok: true, reply: resultado.reply, action: resultado.action, convId: resultado.convId });
});

// ─── Procesamiento principal (async, desacoplado del webhook) ─────────────────

async function procesarMensaje(params: {
  celular: string;
  userText: string;
  messageType: string;
  centro_id: string;
  imageBase64: string | null;
  imageMimetype: string | null;
  documentBase64: string | null;
  documentMimetype: string | null;
  documentName: string | null;
}) {
  const { celular, userText, messageType, centro_id, imageBase64, imageMimetype, documentBase64, documentMimetype, documentName } = params;

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

  // ─── Pending booking (Opción B) ───────────────────────────────────────────────
  const BOOKING_FIELDS = ['nombre','apellido','dni','profesional_id','servicio_id','fecha','hora'];
  const hasAllBookingData = (d: Record<string,string>) => BOOKING_FIELDS.every(f => !!d[f]);
  const esAfirmativo = (txt: string) =>
    /^(si|sí|dale|ok|confirmo|confirmado|bueno|perfecto|va|listo|yes|claro|exacto|correcto|adelante|sip|sep|obvio|re|re que si)\b/i.test(txt.trim());

  // Buscar último pending_booking en el historial
  const pendingEntry = [...historial].reverse().find(h => h.type === 'pending_booking');
  const pendingData = pendingEntry?.data ?? null;

  // ─── Cargar contexto completo (paralelo) ─────────────────────────────────────
  const profIds: string[] = [];

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

  // Cargar FAQs específicas por profesional y servicio (en paralelo)
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

  // Recolectar ids de profesionales
  for (const p of profs) profIds.push(p.id);

  // Cargar OS directamente desde obras_sociales (tiene profesional_id)
  let osRows: Array<{ profesional_id: string; nombre: string; codigo: string }> = [];
  if (profIds.length > 0) {
    const { data: osData } = await sb
      .from('obras_sociales')
      .select('profesional_id,nombre,codigo')
      .in('profesional_id', profIds)
      .eq('activa', true);
    osRows = (osData ?? []) as typeof osRows;
  }

  // ─── Construir mapas internos ─────────────────────────────────────────────────

  // (profId, servId) → pcs_id
  const pcsByProfServ: Record<string, string> = {};
  for (const p of pcsRows) pcsByProfServ[`${p.profesional_id}|${p.servicio_id}`] = p.id;

  // pcs_id → lista de horarios por día
  const horariosPorPcs: Record<string, Array<{ dia: number; inicio: string; fin: string; acepta_os: boolean; precio: number | null }>> = {};
  for (const h of pcsHorarios) {
    if (!horariosPorPcs[h.pcs_id]) horariosPorPcs[h.pcs_id] = [];
    horariosPorPcs[h.pcs_id].push({
      dia:       h.dia_semana,
      inicio:    h.hora_inicio,
      fin:       h.hora_fin,
      acepta_os: h.acepta_os,
      precio:    h.precio_particular,
    });
  }

  // profId → lista de OS aceptadas
  const osPorProf: Record<string, Array<{ nombre: string; codigo: string }>> = {};
  for (const o of osRows) {
    if (!osPorProf[o.profesional_id]) osPorProf[o.profesional_id] = [];
    osPorProf[o.profesional_id].push({ nombre: o.nombre, codigo: o.codigo });
  }

  // servId → duracion_minutos / nombre
  const servDuracion: Record<string, number> = {};
  const servNombre: Record<string, string> = {};
  for (const s of servs) {
    servDuracion[s.id] = s.duracion_minutos ?? 60;
    servNombre[s.id]   = s.nombre;
  }

  // ─── System prompt dinámico ──────────────────────────────────────────────────

  const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const DIAS_ORDEN = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

  const profsStr = profs.map((p: any) => {
    const nombreCompleto = [p.titulo, p.nombre, p.apellido].filter(Boolean).join(' ');
    const pcsDePeste = pcsRows.filter(pc => pc.profesional_id === p.id);

    // Servicios con detalle por día
    const serviciosStr = pcsDePeste.map(pc => {
      const nom  = servNombre[pc.servicio_id] ?? pc.servicio_id;
      const hors = horariosPorPcs[pc.id] ?? [];

      const porDia = hors.map(h => {
        const dia     = diaSemanaATexto(h.dia);
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
      const cobroStr = cobro === 'ninguno' ? '' : `\n      ⚠️ Requiere pago anticipado del ${cobro} para confirmar el turno`;
      return `    • ${nom} (servicio_id: ${pc.servicio_id})${cobroStr}\n${porDia || '      (sin horarios configurados)'}`;
    }).join('\n') || '    (sin servicios configurados)';

    // OS que acepta este profesional
    const osList = osPorProf[p.id] ?? [];
    const osStr = osList.length > 0
      ? osList.map(o => `    • ${o.nombre} (${o.codigo})`).join('\n')
      : '    (no trabaja con obras sociales)';

    // FAQs específicas de este profesional
    const faqsProf = faqsProfesional
      .filter(f => f.profesional_id === p.id)
      .map(f => `    P: ${f.pregunta}\n    R: ${f.respuesta}`)
      .join('\n');

    // FAQs de los servicios que atiende este profesional
    const servIdsDeProf = pcsDePeste.map(pc => pc.servicio_id);
    const faqsServsProf = faqsServicio
      .filter(f => servIdsDeProf.includes(f.servicio_id))
      .map(f => {
        const nomServ = servNombre[f.servicio_id] ?? '';
        return `    [${nomServ}] P: ${f.pregunta}\n    R: ${f.respuesta}`;
      })
      .join('\n');

    const faqProfStr = [faqsProf, faqsServsProf].filter(Boolean).join('\n');

    return `${nombreCompleto} (profesional_id: ${p.id})
  Servicios y horarios:
${serviciosStr}
  Obras sociales:
${osStr}${faqProfStr ? `\n  FAQ específicas:\n${faqProfStr}` : ''}`;
  }).join('\n\n');

  const faqStr = faqs.map((f: any) => `P: ${f.pregunta}\nR: ${f.respuesta}`).join('\n\n');

  const systemPrompt = `Sos el asistente virtual de ${(centro as any).nombre ?? 'este centro de salud'}. Atendés consultas de pacientes por WhatsApp.

PROFESIONALES Y DISPONIBILIDAD:
${profsStr || '(sin datos)'}

${faqStr ? `BASE DE CONOCIMIENTO (FAQ DEL CENTRO):\n${faqStr}\n` : ''}

═══ FLUJO ESTRUCTURADO OBLIGATORIO ═══

PASO 1 — CON QUIÉN HABLO
Si no sabés el nombre de quien escribe, preguntá: "¿Me podés decir tu nombre y apellido?"
Guardá nombre y apellido en "data". Si la consulta es para otra persona (familiar, etc.), preguntá el nombre y apellido de ESA persona.

PASO 2 — QUÉ NECESITA
Entendé el motivo: sacar turno, cancelar, reagendar, consulta de horarios/precios/OS, otra consulta.

PASO 3 — DETALLES (según el motivo)
Para turnos: profesional → servicio → fecha preferida → usá check_slots para mostrar horarios reales → el paciente elige hora.
Para consultas: respondé con la info de arriba (horarios reales, precios_particular, qué OS acepta cada profesional).

PASO 4 — INFORMAR / ASESORAR
Ejemplo: "La Lic. Abraham atiende lunes a viernes 14-20 hs y los jueves desde las 8. El RPG con OS cuesta $13.000 la sesión particular. ¿Querés sacar un turno?"

PASO 5 — REQUERIMIENTO (cuando quiere agendar, cancelar o reagendar)
Si el servicio tiene "Requiere pago anticipado", informalo ANTES de pedir el DNI. Ejemplo: "Este servicio requiere abonar el 50% ($X) por adelantado vía MercadoPago para confirmar el turno. ¿Querés continuar?"
Pedí el DNI: "Para registrar el turno necesito tu DNI (solo el número)."
Ya tenés nombre y apellido del Paso 1 — no los volvás a pedir.
Guardá el DNI en data.dni.

Si el servicio tiene cobro anticipado: informá el porcentaje y monto, y que necesita pagar por MP para confirmar. Ejemplo: "Este turno requiere abonar el 50% ($6.500) por adelantado vía MercadoPago. ¿Confirmamos y te mando el link?"
Si no tiene cobro anticipado: agendá directamente.

PASO 6 — CONFIRMAR ANTES DE EJECUTAR
Mostrá resumen: profesional, servicio, fecha, hora, DNI, nombre. Preguntá "¿Confirmamos?" con action "message".
SOLO cuando el paciente diga "sí / confirmo / dale / ok": emitir action "book_turno" o "cancel_turno".
⚠️ NUNCA emitas "book_turno" como pregunta de confirmación. Primero preguntá, esperá el sí, DESPUÉS la acción.

PASO 7 — CIERRE
Tras agendar: "✅ Turno confirmado para el [fecha] a las [hora] con [profesional] — [servicio]. Un día antes recibirás un recordatorio por WhatsApp. ¡Importante que lo respondás para confirmar!"

═══ PRECIOS Y OBRAS SOCIALES ═══
Cada día de cada servicio tiene su propio esquema. Leé el detalle por día en "Servicios y horarios":

- "OS cubre todo (sin adicional)" → el paciente no paga nada en el centro ese día
- "OS + adicional $X" → el turno se factura a la OS y el paciente paga $X de adicional en el centro
- "solo particular $X" → ese día NO trabaja con obras sociales, el paciente paga $X sea cual sea su cobertura

Cuando el paciente menciona su OS, buscá el día que le interesa y respondé exactamente según esa combinación.
Si aún no eligió día, informá todos los esquemas disponibles para que elija con conciencia.

Ejemplos de respuesta correcta:
- OS + adicional: "Con INSSEP, el costo para vos es $13.000."
- OS sin adicional: "Con OSDE, no tenés costo en el centro."
- Solo particular ese día: "Los miércoles el costo es $60.000."

NUNCA menciones valor_sesion ni aranceles internos.

═══ CASOS ESPECIALES ═══
- Si el paciente manda una imagen, audio o archivo que no pude procesar: "Por ahora solo puedo leer texto. ¿En qué te puedo ayudar?"
- Si no podés resolver la consulta con la info disponible → action "escalate"
- No inventés datos que no estén en la información de arriba

FECHA/HORA ACTUAL (Buenos Aires): ${now}

RESPONDÉ ÚNICAMENTE con JSON válido (sin markdown):
{"action":"message|check_slots|book_turno|cancel_turno|reagendar|escalate","reply":"texto para el paciente","data":{"profesional_id":"uuid","servicio_id":"uuid","fecha":"YYYY-MM-DD","hora":"HH:MM","nombre":"...","apellido":"...","dni":"..."}}

OBLIGATORIO en "data" para book_turno: nombre, apellido, dni, profesional_id, servicio_id, fecha, hora.
OBLIGATORIO en "data" para cancel_turno/reagendar: dni (para identificar al paciente).
Para check_slots: incluí profesional_id, servicio_id y fecha.
Solo incluí en "data" los campos relevantes.`;

  // ─── Mensajes para Claude ────────────────────────────────────────────────────

  // ── Enriquecer mensaje con links y documentos ────────────────────────────────
  const contentBlocks: unknown[] = [];

  // 1. Imagen
  if (messageType === 'image' && imageBase64) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: (imageMimetype ?? 'image/jpeg') as string, data: imageBase64 },
    });
  }

  // 2. PDF — Claude lo lee nativamente como bloque document
  const pdfBase64 = documentBase64 ?? (messageType === 'document' ? imageBase64 : null);
  const pdfMime   = documentMimetype ?? imageMimetype ?? 'application/pdf';
  if (pdfBase64 && pdfMime === 'application/pdf') {
    contentBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
      title: documentName ?? 'Documento adjunto',
    });
  }

  // 3. Texto del usuario (siempre)
  let textoEnriquecido = userText;

  // 4. Fetch de URLs detectadas en el texto
  const urls = extraerUrls(userText);
  if (urls.length > 0) {
    const contenidos = await Promise.all(urls.map(async (url) => {
      const txt = await fetchUrlTexto(url);
      return txt ? `--- Contenido de ${url} ---\n${txt}` : null;
    }));
    const extra = contenidos.filter(Boolean).join('\n\n');
    if (extra) textoEnriquecido = `${userText}\n\n[Contenido de los links compartidos]\n${extra}`;
  }

  contentBlocks.push({ type: 'text', text: textoEnriquecido });

  const userContent = contentBlocks.length === 1 && contentBlocks[0] && (contentBlocks[0] as { type: string }).type === 'text'
    ? textoEnriquecido   // mensaje simple — string plano (ahorra tokens)
    : contentBlocks;     // multimodal — array de bloques

  const msgs = [
    ...historial.filter(h => h.role !== 'system').slice(-20).map(h => ({ role: h.role, content: String(h.content) })),
    { role: 'user', content: userContent },
  ];

  // ─── Intercepción: pending booking + respuesta afirmativa ────────────────────
  let totalIn = 0, totalOut = 0;
  let action = 'message';
  let aData: Record<string, string> = {};
  let finalReply = '';
  let raw1 = '';

  if (pendingData && esAfirmativo(userText.trim())) {
    // El paciente confirmó — ejecutar booking directamente sin llamar a Claude
    action = 'book_turno';
    aData  = pendingData;
    finalReply = ''; // se genera en el bloque book_turno
  } else {
    // Flujo normal — llamar a Claude
    if (pendingData && !esAfirmativo(userText.trim())) {
      // El paciente dijo algo que no es confirmación — limpiar pending
      // (se limpiará al no guardarlo en el nuevo historial)
    }

    const claudeResp1 = await callClaude(msgs, systemPrompt);
    totalIn  += claudeResp1.usage?.input_tokens  ?? 0;
    totalOut += claudeResp1.usage?.output_tokens ?? 0;

    raw1 = claudeResp1.content?.[0]?.text
      ?? '{"action":"message","reply":"Disculpá, hubo un error. Intentá nuevamente."}';

    const parsed = parsearRespuestaClaude(raw1);
    action     = parsed.action;
    aData      = parsed.data;
    finalReply = parsed.reply;
  }

  // ─── Ejecutar acción ─────────────────────────────────────────────────────────

  // ── check_slots: disponibilidad real desde pcs_horario_dia ───────────────────
  if (action === 'check_slots') {
    const fechaStr  = aData.fecha ?? new Date().toISOString().slice(0, 10);
    const profId    = aData.profesional_id;
    const servId    = aData.servicio_id;

    if (profId && servId) {
      const fechaObj  = new Date(`${fechaStr}T00:00:00`);
      const diaSemana = fechaObj.getDay(); // 0=dom … 6=sab

      const pcsId      = pcsByProfServ[`${profId}|${servId}`];
      const horariosDia = (horariosPorPcs[pcsId] ?? []).filter(h => h.dia === diaSemana);
      const duracion   = servDuracion[servId] ?? 60;

      let slotsText: string;

      if (!pcsId || horariosDia.length === 0) {
        slotsText = `El profesional no atiende el ${diaSemanaATexto(diaSemana)}.`;
      } else {
        // Generar todos los slots posibles del día
        const todosSlots: string[] = [];
        for (const h of horariosDia) {
          todosSlots.push(...generarSlots(h.inicio.slice(0, 5), h.fin.slice(0, 5), duracion));
        }

        // Descontar turnos ocupados
        const { data: ocupados } = await sb
          .from('turnos')
          .select('hora_inicio')
          .eq('centro_id', centro_id)
          .eq('profesional_id', profId)
          .eq('fecha', fechaStr)
          .not('estado', 'in', '("cancelado","pendiente_pago")');

        const ocupadasHoras = new Set((ocupados ?? []).map((t: any) => t.hora_inicio.slice(0, 5)));
        const disponibles = todosSlots.filter(h => !ocupadasHoras.has(h));

        slotsText = disponibles.length
          ? disponibles.join(', ')
          : 'No hay turnos disponibles para esa fecha.';
      }

      // Segunda llamada Claude para que presente los slots al paciente
      const msgs2 = [
        ...msgs,
        { role: 'assistant', content: raw1 },
        { role: 'user', content: `SLOTS DISPONIBLES para el ${fechaStr} (${diaSemanaATexto(diaSemana)}): ${slotsText}. Presentá las opciones al paciente y preguntá cuál le queda mejor.` },
      ];
      const claude2 = await callClaude(msgs2, systemPrompt);
      totalIn  += claude2.usage?.input_tokens  ?? 0;
      totalOut += claude2.usage?.output_tokens ?? 0;

      const raw2 = claude2.content?.[0]?.text ?? '';
      const ai2  = parsearRespuestaClaude(raw2);
      if (ai2.reply) finalReply = ai2.reply;
      if (ai2.action) { action = ai2.action; aData = { ...aData, ...ai2.data }; }
    }
  }

  // ── book_turno ───────────────────────────────────────────────────────────────
  if (action === 'book_turno') {
    const profId   = aData.profesional_id;
    const servId   = aData.servicio_id;
    const fecha    = aData.fecha;
    const hora     = aData.hora;
    const nombre   = aData.nombre   || '';
    const apellido = aData.apellido || '';
    const dni      = aData.dni      || '';

    // Validar que tenemos todos los datos necesarios antes de continuar
    if (!nombre || !apellido) {
      finalReply = '¿Me podés decir tu nombre y apellido completo para registrar el turno?';
      action = 'message';
    } else if (!dni) {
      finalReply = `Gracias, ${nombre}. Para registrar el turno necesito tu DNI (solo el número, sin puntos).`;
      action = 'message';
    } else if (!profId || !servId || !fecha || !hora) {
      // Faltan datos del turno — pedir al paciente que especifique
      finalReply = 'Para confirmar el turno necesito saber el profesional, servicio, fecha y horario. ¿Podés indicarme esos datos?';
      action = 'message';
    } else if (profId && servId && fecha && hora) {
      try {
        const { data: pacienteId } = await sb.rpc('buscar_o_crear_paciente', {
          p_centro_id: centro_id,
          p_nombre:    nombre,
          p_apellido:  apellido,
          p_dni:       dni || null,
          p_celular:   celular,
        });

        // Cobro anticipado desde PCS
        const pcs         = pcsRows.find(p => p.profesional_id === profId && p.servicio_id === servId);
        const cobro       = pcs?.cobro_anticipado ?? 'ninguno';
        const hors        = horariosPorPcs[pcs?.id ?? ''] ?? [];
        const precioTotal = hors[0]?.precio ?? 0;
        // Calcular monto a cobrar según el porcentaje configurado
        const porcentaje  = cobro === '100%' ? 1 : cobro === '50%' ? 0.5 : 0;
        const montoCobro  = Math.round(precioTotal * porcentaje);
        const needsPayment = porcentaje > 0 && montoCobro > 0;
        console.log('[book_turno] pcs:', JSON.stringify(pcs), '| cobro:', cobro, '| precioTotal:', precioTotal, '| montoCobro:', montoCobro, '| needsPayment:', needsPayment);

        const duracion   = servDuracion[servId] ?? 60;
        const [hh, mm]   = hora.split(':').map(Number);
        const finMin     = hh * 60 + mm + duracion;
        // Asegurar formato HH:MM:SS que espera la DB
        const toTime = (min: number) =>
          `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
        const horaInicio = hora.length === 5 ? `${hora}:00` : hora;
        const horaFin    = toTime(finMin);

        const { data: turno, error: turnoError } = await sb
          .from('turnos')
          .insert({
            centro_id,
            profesional_id: profId,
            servicio_id:    servId,
            paciente_id:    pacienteId,
            fecha,
            hora_inicio:    horaInicio,
            hora_fin:       horaFin,
            estado:         needsPayment ? 'pendiente_pago' : 'reservado',
            created_by:     'paciente',
            ...(needsPayment ? { pago_expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() } : {}),
          })
          .select('id')
          .single();

        if (turnoError) throw new Error(`INSERT turno: ${turnoError.message} (code: ${turnoError.code})`);

        // Persistir paciente_id en la conversación para futuras interacciones
        if (pacienteId) {
          await sb
            .from('conversaciones_wa')
            .update({ paciente_id: pacienteId })
            .eq('id', conv.id)
            .is('paciente_id', null); // solo si aún no estaba seteado
        }

        // Mensaje base de confirmación (siempre, venga de Claude o de pending_booking)
        const profObj   = profs.find((p: any) => p.id === profId);
        const nomProf   = profObj ? [profObj.titulo, profObj.nombre, profObj.apellido].filter(Boolean).join(' ') : 'el profesional';
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
            body: JSON.stringify({
              turno_id:    turno.id,
              monto:       montoCobro,
              descripcion: `${cobro} de turno — ${servNombre[servId] ?? ''}`,
            }),
          });
          const mpData = await mpRes.json();
          console.log('[book_turno] mp-pago-portal response:', JSON.stringify(mpData));
          const mpUrl  = mpData.checkout_url ?? mpData.init_point ?? mpData.url;
          if (mpUrl) {
            finalReply += `\n\n💳 *Link de pago:*\n${mpUrl}\n\n⏱ Tenés 30 minutos para pagar. Si no se completa, el turno se libera automáticamente.`;
          } else {
            finalReply += '\n\n⚠️ No pudimos generar el link de pago. Contactá al centro para completar la reserva.';
          }
        }
      } catch (e: any) {
        await logError(centro_id, 'wa-asistente/book_turno', e.message, { celular, aData });
        finalReply = 'Hubo un problema al registrar el turno. Contactá directamente al centro para confirmarlo.';
      }
    }
  }

  // ── cancel_turno ─────────────────────────────────────────────────────────────
  if (action === 'cancel_turno') {
    try {
      const pacienteId = conv?.paciente_id ?? null;
      const dniCancelacion = aData.dni || '';

      // Buscar turno activo próximo del paciente
      const hoy = new Date().toISOString().slice(0, 10);
      let query = sb
        .from('turnos')
        .select('id,fecha,hora_inicio,profesional_id,servicio_id')
        .eq('centro_id', centro_id)
        .gte('fecha', hoy)
        .in('estado', ['reservado', 'confirmado', 'pendiente_pago'])
        .order('fecha', { ascending: true })
        .limit(1);

      if (pacienteId) {
        query = query.eq('paciente_id', pacienteId);
      } else {
        // Buscar por DNI (prioritario) o por celular
        const { data: pacs } = await sb
          .from('pacientes')
          .select('id')
          .eq('centro_id', centro_id)
          .or(dniCancelacion
            ? `dni.eq.${dniCancelacion},celular.eq.${celular}`
            : `celular.eq.${celular}`);
        const pacIds = (pacs ?? []).map((p: any) => p.id);
        if (pacIds.length > 0) {
          query = query.in('paciente_id', pacIds);
        } else {
          finalReply = !dniCancelacion
            ? 'Para cancelar necesito tu DNI. ¿Me lo podés indicar?'
            : 'No encontré ningún turno registrado con ese DNI. Si creés que hay un error, escribinos y lo revisamos.';
          action = 'message';
          query = null as any;
        }
      }

      if (action === 'cancel_turno' && query) {
        const { data: turnoActivo } = await query;
        if (turnoActivo) {
          await sb
            .from('turnos')
            .update({ estado: 'cancelado', motivo_cancelacion: 'Cancelado por el paciente vía WhatsApp' })
            .eq('id', turnoActivo.id);

          const profNombre = profs.find((p: any) => p.id === turnoActivo.profesional_id);
          const nomProf = profNombre
            ? `${profNombre.titulo ?? ''} ${profNombre.nombre} ${profNombre.apellido}`.trim()
            : 'el profesional';

          finalReply = `✅ Listo, cancelé tu turno del ${turnoActivo.fecha} a las ${turnoActivo.hora_inicio.slice(0,5)} con ${nomProf}. Si querés sacar uno nuevo, avisame.`;
          action = 'message';
        } else {
          finalReply = 'No encontré turnos próximos activos con tu número. Si creés que hay un error, escribinos y lo revisamos.';
          action = 'message';
        }
      }
    } catch (e: any) {
      await logError(centro_id, 'wa-asistente/cancel_turno', e.message, { celular });
      finalReply = 'No pude cancelar el turno en este momento. Escribinos directamente y te ayudamos.';
      action = 'message';
    }
  }

  // ── reagendar: cancela el turno actual y ofrece nueva disponibilidad ─────────
  if (action === 'reagendar') {
    try {
      const pacienteId = conv?.paciente_id ?? null;
      const fechaPref  = aData.fecha ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const profId     = aData.profesional_id;
      const servId     = aData.servicio_id;

      const hoy = new Date().toISOString().slice(0, 10);
      let query = sb
        .from('turnos')
        .select('id,fecha,hora_inicio,profesional_id,servicio_id')
        .eq('centro_id', centro_id)
        .gte('fecha', hoy)
        .in('estado', ['reservado', 'confirmado', 'pendiente_pago'])
        .order('fecha', { ascending: true })
        .limit(1);

      if (pacienteId) {
        query = query.eq('paciente_id', pacienteId);
      } else {
        const { data: pacs } = await sb
          .from('pacientes')
          .select('id')
          .eq('celular', celular)
          .eq('centro_id', centro_id);
        const pacIds = (pacs ?? []).map((p: any) => p.id);
        if (pacIds.length > 0) query = query.in('paciente_id', pacIds);
      }

      const { data: turnoActivo } = await query;

      if (turnoActivo) {
        await sb
          .from('turnos')
          .update({ estado: 'cancelado', motivo_cancelacion: 'Reagendado por el paciente vía WhatsApp' })
          .eq('id', turnoActivo.id);
      }

      // Buscar slots en la fecha preferida usando el mismo prof/servicio del turno cancelado o el indicado por Claude
      const profIdFinal = profId ?? turnoActivo?.profesional_id;
      const servIdFinal = servId ?? turnoActivo?.servicio_id;
      const fechaObj    = new Date(`${fechaPref}T00:00:00`);
      const diaSemana   = fechaObj.getDay();
      const pcsId       = profIdFinal && servIdFinal ? pcsByProfServ[`${profIdFinal}|${servIdFinal}`] : undefined;
      const horariosDia = pcsId ? (horariosPorPcs[pcsId] ?? []).filter(h => h.dia === diaSemana) : [];
      const duracion    = servIdFinal ? (servDuracion[servIdFinal] ?? 60) : 60;

      let slotsText: string;
      if (!pcsId || horariosDia.length === 0) {
        slotsText = `El profesional no atiende el ${diaSemanaATexto(diaSemana)}.`;
      } else {
        const todosSlots: string[] = [];
        for (const h of horariosDia) {
          todosSlots.push(...generarSlots(h.inicio.slice(0, 5), h.fin.slice(0, 5), duracion));
        }
        const { data: ocupados } = await sb
          .from('turnos')
          .select('hora_inicio')
          .eq('centro_id', centro_id)
          .eq('profesional_id', profIdFinal)
          .eq('fecha', fechaPref)
          .not('estado', 'in', '("cancelado","pendiente_pago")');

        const ocupadasHoras = new Set((ocupados ?? []).map((t: any) => t.hora_inicio.slice(0, 5)));
        const disponibles   = todosSlots.filter(h => !ocupadasHoras.has(h));
        slotsText = disponibles.length ? disponibles.join(', ') : 'No hay turnos disponibles para esa fecha.';
      }

      const msgs2 = [
        ...msgs,
        { role: 'assistant', content: raw1 },
        { role: 'user', content: `${turnoActivo ? 'Cancelé el turno anterior. ' : ''}SLOTS DISPONIBLES para el ${fechaPref} (${diaSemanaATexto(diaSemana)}): ${slotsText}. Presentá las opciones al paciente.` },
      ];
      const claude2 = await callClaude(msgs2, systemPrompt);
      totalIn  += claude2.usage?.input_tokens  ?? 0;
      totalOut += claude2.usage?.output_tokens ?? 0;

      const ai2 = parsearRespuestaClaude(claude2.content?.[0]?.text ?? '');
      if (ai2.reply) finalReply = ai2.reply;
      if (ai2.action && ai2.action !== 'reagendar') { action = ai2.action; aData = { ...aData, ...ai2.data }; }
      else action = 'message';

    } catch (e: any) {
      await logError(centro_id, 'wa-asistente/reagendar', e.message, { celular });
      finalReply = 'No pude procesar el cambio de turno ahora. Escribinos directamente y te ayudamos.';
      action = 'message';
    }
  }

  // ── escalate ──────────────────────────────────────────────────────────────────
  if (action === 'escalate') {
    await sb
      .from('conversaciones_wa')
      .update({ estado: 'derivada', derivada_en: new Date().toISOString() })
      .eq('id', conv.id);
  }

  // ─── Guardar pending_booking si Claude tiene todos los datos pero pidió confirmación
  const ts = new Date().toISOString();
  const entradas: typeof historial = [
    { role: 'user',      content: userText,   ts, type: messageType },
    { role: 'assistant', content: finalReply, ts },
  ];

  // Si Claude respondió con message y tiene todos los campos → guardar pending
  if (action === 'message' && hasAllBookingData(aData)) {
    entradas.push({ role: 'system', type: 'pending_booking', content: '', ts, data: aData });
  }
  // Si se ejecutó book_turno → limpiar cualquier pending_booking anterior
  // (no agregamos nueva entrada system, el pending anterior queda enterrado)

  const nuevoHistorial = [
    ...historial.filter(h => h.type !== 'pending_booking'), // limpiar pendientes viejos
    ...entradas,
  ].slice(-60);

  await sb
    .from('conversaciones_wa')
    .update({ historial: nuevoHistorial, updated_at: ts })
    .eq('id', conv.id);

  // ─── Log tokens ───────────────────────────────────────────────────────────────
  if (totalIn > 0) {
    const costoUsd = (totalIn * 3 + totalOut * 15) / 1_000_000;
    await sb.from('ia_uso_tokens').insert({
      centro_id,
      conversacion_id: conv.id,
      modelo:          'claude-sonnet-4-6',
      input_tokens:    totalIn,
      output_tokens:   totalOut,
      costo_usd:       costoUsd,
      fecha:           ts.slice(0, 10),
    });
  }

  // Enviar respuesta directamente a WhatsApp (no dependemos de que n8n reenvíe)
  if (finalReply) {
    await sendWhatsApp(celular, finalReply);
  }

  console.log('[procesarMensaje] completado', { celular, action, convId: conv.id });
  return { reply: finalReply, action, convId: conv.id };
}
