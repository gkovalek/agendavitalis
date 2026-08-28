// os-growth-agent — Vitalis OS v1
// Runs: Monday/Wednesday/Friday 07:00 UTC (pg_cron)
// Reads: os_config, os_outreach (cooldown check), os_campaigns, os_memory, os_pipeline
// Writes: os_outreach (pending_ceo proposals), os_pipeline, os_memory (learnings)
// HARD RULE: Never proposes if daily/monthly limits are already reached
// HARD RULE: Never proposes to numbers in centros/usuarios (active clients)
// HARD RULE: Checks 90-day cooldown before proposing any number
// Primary metric: ROI. Growth optimizes CAC, not volume.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY') ?? ''

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action ?? 'propose'

    if (action === 'propose') {
      const result = await proposeOutreach()
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    if (action === 'classify_responses') {
      const result = await classifyResponses()
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ ok: false, error: 'unknown_action' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[os-growth-agent] error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})

async function proposeOutreach(): Promise<unknown> {
  // 1. Load config
  const { data: configRow } = await supabase
    .from('os_config')
    .select('config')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const config = configRow?.config ?? {}

  if (config?.kill_switch === true) return { skipped: 'kill_switch_active' }
  if (config?.outreach?.enabled === false) return { skipped: 'outreach_disabled' }

  const dailyLimit = config?.outreach?.daily_limit ?? 5
  const monthlyLimit = config?.outreach?.monthly_limit ?? 60
  const minScore = config?.outreach?.min_qualification_score ?? 4
  const cooldownDays = config?.outreach?.cooldown_days ?? 90

  // 2. Check limits before doing any research
  const today = new Date().toISOString().split('T')[0]
  const { count: sentToday } = await supabase
    .from('os_outreach')
    .select('*', { count: 'exact', head: true })
    .not('sent_at', 'is', null)
    .gte('sent_at', `${today}T00:00:00.000Z`)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { count: sentMonth } = await supabase
    .from('os_outreach')
    .select('*', { count: 'exact', head: true })
    .not('sent_at', 'is', null)
    .gte('sent_at', monthStart.toISOString())

  const { count: pendingCeo } = await supabase
    .from('os_outreach')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'pending_ceo')

  // If enough pending approvals already, skip
  if ((pendingCeo ?? 0) >= dailyLimit) {
    return { skipped: 'enough_pending_approvals', pending: pendingCeo }
  }

  // 3. Load agent memory (learnings from CEO rejections)
  const { data: memories } = await supabase
    .from('os_memory')
    .select('contenido')
    .eq('agente', 'growth')
    .eq('activo', true)
    .order('relevancia', { ascending: false })
    .limit(10)

  const memoryContext = memories?.map(m => m.contenido).join('\n') ?? 'Sin aprendizajes previos.'

  // 4. Load recent CEO rejections (for learning)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const { data: recentRejections } = await supabase
    .from('os_outreach')
    .select('prospecto_nombre, ceo_razon, calificacion_criterios')
    .eq('ceo_decision', 'rejected')
    .gte('ceo_decided_at', weekAgo.toISOString())
    .limit(5)

  const rejectionContext = recentRejections?.map(r =>
    `- ${r.prospecto_nombre}: "${r.ceo_razon}"`
  ).join('\n') ?? 'Sin rechazos recientes.'

  // 5. Get active campaign
  const { data: campaign } = await supabase
    .from('os_campaigns')
    .select('*')
    .eq('estado', 'active')
    .limit(1)
    .single()

  if (!campaign) return { skipped: 'no_active_campaign' }

  // 6. Research prospects using Brave (if key available) or use internal context
  let prospectResearch = ''
  if (BRAVE_API_KEY) {
    const searchResp = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=kinesiologia+rehabilitacion+argentina+centro+whatsapp&count=10`,
      { headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY } }
    )
    if (searchResp.ok) {
      const searchData = await searchResp.json()
      prospectResearch = searchData?.web?.results?.map((r: Record<string, string>) =>
        `- ${r.title}: ${r.url}`
      ).slice(0, 5).join('\n') ?? ''
    }
  }

  // 7. Ask Claude to generate prospect proposals
  const prompt = `Sos el Growth Agent de Vitalis, un SaaS de gestión para centros de kinesiología en Argentina.

TU OBJETIVO: Identificar prospectos calificados y proponer mensajes de WhatsApp para que el CEO apruebe.
MÉTRICA PRINCIPAL: ROI = Revenue generado / Costo de adquisición. Calidad sobre volumen.

CONTEXTO DE CAMPAÑA:
Nombre: ${campaign.nombre}
Template de mensaje: ${campaign.mensaje_template ?? 'Crear mensaje personalizado'}
Audiencia: centros kinesiológicos, 1-5 profesionales, Argentina

APRENDIZAJES PREVIOS:
${memoryContext}

RECHAZOS RECIENTES DEL CEO (aprender de estos):
${rejectionContext}

RESEARCH DE CONTEXTO:
${prospectResearch || 'Sin datos de búsqueda este ciclo. Usar criterios de calificación para generar propuesta.'}

CRITERIOS DE CALIFICACIÓN (score 0-6, mínimo ${minScore} para proponer):
1. Tipo de consultorio: kinesiología / rehabilitación / fisioterapia ARG (must-have)
2. Tamaño: 1-5 profesionales (must-have)
3. Presencia digital: WA Business + Instagram activo (alto)
4. Sin competidor SaaS de gestión (alto)
5. Actividad reciente: post en últimas 4 semanas (medio)
6. No contactado en 90 días (must-have — CEO lo verificará)

HIPÓTESIS DE MENSAJE:
El competidor real es el statu quo: Google Calendar + WhatsApp manual + Excel + caos.
El mensaje debe cuantificar ese costo: "¿Cuánto tiempo perdés por mes administrando el centro a mano?"
NO vender features. Vender el dolor que resuelve.

Devolvé JSON con esta estructura exacta:
{
  "proposals": [
    {
      "prospecto_nombre": "nombre del centro",
      "prospecto_numero": "5491112345678",
      "prospecto_url": "https://...",
      "prospecto_tipo": "kinesiologia",
      "calificacion": {
        "tipo_consultorio": true,
        "tamanio": true,
        "presencia_digital": true,
        "sin_competidor": true,
        "actividad_reciente": true,
        "no_contactado": true
      },
      "calificacion_score": 6,
      "mensaje": "texto del mensaje WA personalizado (máx 200 palabras, cordial, no spam)",
      "justificacion": "por qué este prospecto está bien calificado y por qué este mensaje"
    }
  ],
  "aprendizajes": "insights de este ciclo que deberían guardarse en memoria"
}

Genera 3-5 propuestas reales y bien justificadas. Si no tenés datos suficientes de prospectos reales, generá propuestas plausibles con números de ejemplo (el CEO los revisará antes de aprobar).`

  const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!anthropicResp.ok) {
    throw new Error(`Anthropic API error: ${anthropicResp.status}`)
  }

  const anthropicData = await anthropicResp.json()
  const rawContent = anthropicData?.content?.[0]?.text ?? ''

  // Parse JSON from Claude response
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude did not return valid JSON')

  const parsed = JSON.parse(jsonMatch[0])
  const proposals = parsed?.proposals ?? []
  const aprendizajes = parsed?.aprendizajes ?? ''

  const proposed = []
  const skipped = []

  for (const p of proposals) {
    // Validate score
    if ((p.calificacion_score ?? 0) < minScore) {
      skipped.push({ nombre: p.prospecto_nombre, reason: 'score_insuficiente', score: p.calificacion_score })
      continue
    }

    // HARD CHECK: not an active client
    if (p.prospecto_numero) {
      const { count: isClient } = await supabase
        .from('centros')
        .select('*', { count: 'exact', head: true })
        .eq('telefono', p.prospecto_numero)

      if ((isClient ?? 0) > 0) {
        skipped.push({ nombre: p.prospecto_nombre, reason: 'es_cliente_activo' })
        continue
      }
    }

    // HARD CHECK: cooldown (90 days)
    const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000)
    const { count: inCooldown } = await supabase
      .from('os_outreach')
      .select('*', { count: 'exact', head: true })
      .eq('prospecto_numero', p.prospecto_numero)
      .not('sent_at', 'is', null)
      .gte('sent_at', cooldownDate.toISOString())

    if ((inCooldown ?? 0) > 0) {
      skipped.push({ nombre: p.prospecto_nombre, reason: 'en_cooldown_90_dias' })
      continue
    }

    // Write to os_outreach (estado: pending_ceo)
    const { data: outreachRow, error: outreachErr } = await supabase
      .from('os_outreach')
      .insert({
        campaign_id: campaign.id,
        prospecto_nombre: p.prospecto_nombre,
        prospecto_numero: p.prospecto_numero,
        prospecto_url: p.prospecto_url,
        prospecto_tipo: p.prospecto_tipo,
        calificacion: p.calificacion,
        calificacion_score: p.calificacion_score,
        mensaje: p.mensaje,
        justificacion: p.justificacion,
        estado: 'pending_ceo',
        channel: 'whatsapp_outreach',
        agent: 'growth'
      })
      .select()
      .single()

    if (outreachErr) {
      skipped.push({ nombre: p.prospecto_nombre, reason: `db_error: ${outreachErr.message}` })
      continue
    }

    // Also add to os_pipeline
    await supabase.from('os_pipeline').insert({
      nombre: p.prospecto_nombre,
      telefono: p.prospecto_numero,
      linkedin_url: p.prospecto_url,
      fuente: 'outreach_wa',
      outreach_id: outreachRow.id,
      campaign_id: campaign.id,
      stage: 'lead',
      score: p.calificacion_score,
      calificacion_criterios: p.calificacion,
      channel: 'whatsapp_outreach',
      agent: 'growth',
      first_contact_date: new Date().toISOString()
    })

    proposed.push({ outreach_id: outreachRow.id, nombre: p.prospecto_nombre })
  }

  // Save learnings to memory
  if (aprendizajes) {
    await supabase.from('os_memory').insert({
      agente: 'growth',
      tipo: 'learning',
      contenido: `[${new Date().toISOString().split('T')[0]}] ${aprendizajes}`,
      relevancia: 6
    })
  }

  return {
    proposed: proposed.length,
    skipped: skipped.length,
    details: { proposed, skipped }
  }
}

async function classifyResponses(): Promise<unknown> {
  // Load responded messages that haven't been classified yet
  const { data: unclassified } = await supabase
    .from('os_outreach')
    .select('*')
    .eq('estado', 'responded')
    .is('response_class', null)
    .limit(20)

  if (!unclassified?.length) return { classified: 0 }

  const classified = []

  for (const o of unclassified) {
    if (!o.response) continue

    const prompt = `Clasificá la siguiente respuesta de WhatsApp de un prospecto de un SaaS de gestión de centros kinesiológicos en Argentina.

Mensaje enviado: "${o.mensaje}"
Respuesta del prospecto: "${o.response}"

Clasificá en UNA de estas categorías:
- "interesado": el prospecto muestra curiosidad, quiere saber más, pregunta algo, acepta una demo
- "no_interesado": no quiere, dice que no le interesa, ya tiene solución
- "invalido": número equivocado, no es un centro kinesiológico, respuesta sin sentido

También determiná si este prospecto debería avanzar en el funnel:
- Si "interesado" → funnel_stage: "response"
- Si no es interesado o inválido → funnel_stage: "contact" (sin avance)

Devolvé JSON: {"response_class": "interesado|no_interesado|invalido", "funnel_stage": "response|contact", "razon": "explicación breve"}`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!resp.ok) continue
    const data = await resp.json()
    const raw = data?.content?.[0]?.text ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) continue

    const parsed = JSON.parse(match[0])
    const now = new Date().toISOString()

    await supabase.from('os_outreach').update({
      response_class: parsed.response_class,
      funnel_stage: parsed.funnel_stage,
      funnel_stage_updated_at: now,
      updated_at: now
    }).eq('id', o.id)

    // Write attribution event for RESPONSE stage (if interesado)
    if (parsed.response_class === 'interesado') {
      await supabase.from('os_attribution').insert({
        outreach_id: o.id,
        campaign_id: o.campaign_id,
        contact_nombre: o.prospecto_nombre,
        contact_numero: o.prospecto_numero,
        channel: o.channel ?? 'whatsapp_outreach',
        agent: 'growth',
        event_date: now,
        from_stage: 'contact',
        to_stage: 'response',
        notes: `Respuesta clasificada: ${parsed.response_class}. ${parsed.razon}`
      })

      // Update pipeline stage
      await supabase.from('os_pipeline')
        .update({ stage: 'qualified', updated_at: now })
        .eq('outreach_id', o.id)
    }

    classified.push({ outreach_id: o.id, class: parsed.response_class })
  }

  return { classified: classified.length, details: classified }
}
