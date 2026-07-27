/**
 * wa-asistente — Asistente IA para WhatsApp (invocado desde n8n)
 *
 * Recibe: { celular, userText, messageType, centro_id }
 * Retorna: { reply, action, convId }
 *
 * No requiere JWT — llamado internamente por n8n con service_role key.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY    = Deno.env.get('ANTHROPIC_API_KEY')!;
const OPENAI_KEY       = Deno.env.get('OPENAI_API_KEY') ?? '';
const EVOLUTION_URL    = Deno.env.get('EVOLUTION_URL') ?? 'http://72.61.58.46:8080';
const EVOLUTION_INST   = Deno.env.get('EVOLUTION_INSTANCE') ?? 'Secretaria_Vitalis';
const EVOLUTION_KEY    = Deno.env.get('EVOLUTION_API_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

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

// ─── Claude helper ────────────────────────────────────────────────────────────
async function callClaude(
  messages: Array<{ role: string; content: unknown }>,
  systemPrompt: string,
  maxTokens = 1024,
) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  return r.json();
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: {
    celular: string;
    userText: string;
    messageType?: string;
    centro_id: string;
  };

  try { body = await req.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const { celular, userText, messageType = 'text', centro_id } = body;
  if (!celular || !userText || !centro_id) {
    return json({ error: 'faltan_campos', required: ['celular', 'userText', 'centro_id'] }, 400);
  }

  // ─── Cargar / crear conversación ───────────────────────────────────────────
  const { data: convRows } = await sb
    .from('conversaciones_wa')
    .select('*')
    .eq('celular', celular)
    .eq('centro_id', centro_id)
    .in('estado', ['activa'])
    .order('created_at', { ascending: false })
    .limit(1);

  let conv = convRows?.[0];
  const isNew = !conv;

  if (isNew) {
    const { data: newConv } = await sb
      .from('conversaciones_wa')
      .insert({ centro_id, celular, historial: [], estado: 'activa' })
      .select()
      .single();
    conv = newConv;
  }

  const historial: Array<{ role: string; content: string; ts: string; type?: string }> =
    conv?.historial ?? [];

  // ─── Cargar contexto del centro (paralelo) ─────────────────────────────────
  const [centroRes, profesRes, servRes, faqRes, pcsRes] = await Promise.all([
    sb.from('centros').select('id,nombre,mp_user_id').eq('id', centro_id).single(),
    sb.from('profesionales').select('id,nombre,apellido,mp_user_id').eq('centro_id', centro_id).eq('activo', true),
    sb.from('servicios').select('id,nombre').eq('centro_id', centro_id).eq('activo', true),
    sb.from('faq').select('pregunta,respuesta').eq('centro_id', centro_id).eq('activo', true).limit(30),
    sb.from('profesional_centro_servicio').select('profesional_id,servicio_id,cobro_anticipado,precio_particular').eq('centro_id', centro_id),
  ]);

  const centro   = centroRes.data ?? {};
  const profs    = profesRes.data ?? [];
  const servs    = servRes.data   ?? [];
  const faqs     = faqRes.data    ?? [];
  const pcsRows  = pcsRes.data    ?? [];

  // Mapa PCS
  const pcsMap: Record<string, Record<string, { cobro: string; precio: number }>> = {};
  for (const p of pcsRows) {
    if (!pcsMap[p.profesional_id]) pcsMap[p.profesional_id] = {};
    pcsMap[p.profesional_id][p.servicio_id] = {
      cobro:  p.cobro_anticipado ?? 'ninguno',
      precio: p.precio_particular ?? 0,
    };
  }

  // ─── System prompt Claude ──────────────────────────────────────────────────
  const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

  const profsStr = profs.map((p: any) => `• ${p.nombre} ${p.apellido} (id: ${p.id})`).join('\n');
  const servsStr = servs.map((s: any) => `• ${s.nombre} (id: ${s.id})`).join('\n');
  const faqStr   = faqs.map((f: any) => `P: ${f.pregunta}\nR: ${f.respuesta}`).join('\n\n');

  const systemPrompt = `Sos el asistente virtual de ${(centro as any).nombre ?? 'este centro de salud'}. Atendés consultas de pacientes por WhatsApp de forma cordial, clara y concisa.

PROFESIONALES:
${profsStr || '(sin datos)'}

SERVICIOS:
${servsStr || '(sin datos)'}

${faqStr ? `BASE DE CONOCIMIENTO (FAQ):\n${faqStr}\n` : ''}

REGLAS:
- Para agendar turno: guiá paso a paso → profesional → servicio → fecha → slots → confirmación
- Si cobro_anticipado != 'ninguno': informá el monto y que enviarás link de pago MercadoPago
- Si no sabés el nombre y apellido del paciente, preguntalo antes de confirmar
- Respondé siempre en español, tono amigable pero profesional
- No inventés información; si no podés resolver → usá action "escalate"

FECHA/HORA (Buenos Aires): ${now}

RESPONDÉ ÚNICAMENTE con JSON válido (sin markdown):
{"action":"message|check_slots|book_turno|escalate","reply":"texto para el paciente","data":{"profesional_id":"uuid","servicio_id":"uuid","fecha":"YYYY-MM-DD","hora":"HH:MM","nombre":"...","apellido":"..."}}

Solo incluí en "data" los campos relevantes.`;

  // ─── Mensajes Claude ───────────────────────────────────────────────────────
  const msgs = [
    ...historial.slice(-20).map(h => ({ role: h.role, content: String(h.content) })),
    { role: 'user', content: userText },
  ];

  // ─── Primera llamada Claude ────────────────────────────────────────────────
  let totalIn = 0, totalOut = 0;

  const claudeResp = await callClaude(msgs, systemPrompt);
  totalIn  += claudeResp.usage?.input_tokens  ?? 0;
  totalOut += claudeResp.usage?.output_tokens ?? 0;

  const rawContent = claudeResp.content?.[0]?.text
    ?? '{"action":"message","reply":"Disculpá, hubo un error. Intentá nuevamente."}';

  let aiAction: { action: string; reply: string; data?: Record<string, string> };
  try {
    const match = rawContent.match(/\{[\s\S]*\}/);
    aiAction = JSON.parse(match ? match[0] : rawContent);
  } catch {
    aiAction = { action: 'message', reply: rawContent };
  }

  let { action, reply, data: aData = {} } = aiAction;
  let finalReply = reply ?? 'Gracias por tu mensaje.';

  // ─── Ejecutar acción ───────────────────────────────────────────────────────
  if (action === 'check_slots') {
    const fecha  = aData.fecha  ?? new Date().toISOString().slice(0, 10);
    const profId = aData.profesional_id;
    const servId = aData.servicio_id;

    if (profId && servId) {
      const { data: ocupados } = await sb
        .from('turnos')
        .select('hora_inicio')
        .eq('centro_id', centro_id)
        .eq('profesional_id', profId)
        .eq('servicio_id', servId)
        .eq('fecha', fecha)
        .neq('estado', 'cancelado');

      const ocupadasHoras = (ocupados ?? []).map((t: any) => t.hora_inicio.slice(0, 5));
      const todasHoras = ['08:00','09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00','19:00'];
      const disponibles = todasHoras.filter(h => !ocupadasHoras.includes(h));
      const slotsText   = disponibles.length ? disponibles.join(', ') : 'No hay turnos disponibles para esa fecha';

      const msgs2 = [
        ...msgs,
        { role: 'assistant', content: rawContent },
        { role: 'user', content: `SLOTS DISPONIBLES para ${fecha}: ${slotsText}. Presentá las opciones al paciente.` },
      ];
      const claude2 = await callClaude(msgs2, systemPrompt);
      totalIn  += claude2.usage?.input_tokens  ?? 0;
      totalOut += claude2.usage?.output_tokens ?? 0;

      const raw2 = claude2.content?.[0]?.text ?? '';
      try {
        const match2 = raw2.match(/\{[\s\S]*\}/);
        const ai2 = JSON.parse(match2 ? match2[0] : raw2);
        if (ai2.reply) finalReply = ai2.reply;
        if (ai2.action) { action = ai2.action; aData = { ...aData, ...(ai2.data ?? {}) }; }
      } catch { /* mantener reply anterior */ }
    }
  }

  if (action === 'book_turno') {
    const profId   = aData.profesional_id;
    const servId   = aData.servicio_id;
    const fecha    = aData.fecha;
    const hora     = aData.hora;
    const nombre   = aData.nombre   ?? celular;
    const apellido = aData.apellido ?? '';

    if (profId && servId && fecha && hora) {
      try {
        // Buscar o crear paciente
        const { data: pacienteId } = await sb.rpc('buscar_o_crear_paciente', {
          p_centro_id: centro_id,
          p_nombre:    nombre,
          p_apellido:  apellido,
          p_celular:   celular,
        });

        // Cobro anticipado
        const pcsInfo     = pcsMap[profId]?.[servId] ?? {};
        const cobro       = pcsInfo.cobro  ?? 'ninguno';
        const precio      = pcsInfo.precio ?? 0;
        const needsPayment = cobro !== 'ninguno' && precio > 0;

        // Hora fin (+1h)
        const [hh, mm]  = hora.split(':').map(Number);
        const horaFin   = `${String(hh + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        const pagoExpira = needsPayment
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : null;

        const { data: turno } = await sb
          .from('turnos')
          .insert({
            centro_id,
            profesional_id: profId,
            servicio_id:    servId,
            paciente_id:    pacienteId,
            fecha,
            hora_inicio:    hora,
            hora_fin:       horaFin,
            estado:         needsPayment ? 'pendiente_pago' : 'reservado',
            created_by:     'whatsapp',
            ...(pagoExpira ? { pago_expira_at: pagoExpira } : {}),
          })
          .select('id')
          .single();

        if (needsPayment && turno?.id) {
          const mpRes = await fetch(`${SUPABASE_URL}/functions/v1/mp-pago-portal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SUPABASE_SERVICE}`,
            },
            body: JSON.stringify({ turno_id: turno.id, monto: precio, descripcion: `Turno ${servs.find((s: any) => s.id === servId)?.nombre ?? ''}` }),
          });
          const mpData = await mpRes.json();
          const mpUrl  = mpData.checkout_url ?? mpData.init_point ?? mpData.url;
          if (mpUrl) {
            finalReply += `\n\n💳 *Link de pago (${precio.toLocaleString('es-AR')} ARS):*\n${mpUrl}\n\n⏱ Tenés 30 minutos para completar el pago.`;
          }
        }
      } catch (e: any) {
        console.error('book_turno error:', e.message);
        finalReply = 'Hubo un problema al registrar el turno. Contactá directamente al centro para confirmarlo.';
      }
    }
  } else if (action === 'escalate') {
    await sb
      .from('conversaciones_wa')
      .update({ estado: 'derivada', derivada_en: new Date().toISOString() })
      .eq('id', conv.id);
  }

  // ─── Actualizar historial ──────────────────────────────────────────────────
  const ts = new Date().toISOString();
  const nuevoHistorial = [
    ...historial,
    { role: 'user',      content: userText,   ts, type: messageType },
    { role: 'assistant', content: finalReply, ts },
  ].slice(-60);

  await sb
    .from('conversaciones_wa')
    .update({ historial: nuevoHistorial, updated_at: ts })
    .eq('id', conv.id);

  // ─── Log tokens ────────────────────────────────────────────────────────────
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

  return json({ reply: finalReply, action, convId: conv.id });
});
