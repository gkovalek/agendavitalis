// os-ceo-agent — Vitalis OS v1
// Runs: Daily 06:00 UTC (approve outreach) + Monday 07:00 UTC (weekly report)
// Reads: os_outreach (pending_ceo), os_config, os_metrics, os_memory, os_decisions, os_campaigns
// Writes: os_outreach (approved/rejected), os_decisions (audit), os_tasks (instructions), os_reports
// GATE: Every WhatsApp outreach must pass through CEO approval before Evolution API sends
// Primary metric: ROI. CEO optimizes approval quality, not approval volume.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CHAIRMAN_EMAIL = 'gkovalek@gmail.com'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action ?? 'daily'

    let result
    if (action === 'daily') {
      result = await dailyCycle()
    } else if (action === 'weekly_report') {
      result = await weeklyReport()
    } else if (action === 'approve_outreach') {
      result = await reviewPendingOutreach()
    } else {
      return new Response(JSON.stringify({ ok: false, error: 'unknown_action' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[os-ceo-agent] error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})

async function dailyCycle() {
  const results: Record<string, unknown> = {}

  // 1. Review and approve/reject pending outreach
  results.outreach = await reviewPendingOutreach()

  // 2. Check for guardrail violations (Finance alerts)
  results.guardrails = await checkGuardrails()

  // 3. Emit tasks for Growth (if needed)
  results.tasks = await emitTasks()

  return results
}

async function reviewPendingOutreach() {
  // Load config
  const { data: configRow } = await supabase
    .from('os_config')
    .select('config')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const config = configRow?.config ?? {}

  if (config?.kill_switch === true) return { skipped: 'kill_switch_active' }

  // Check daily limits
  const today = new Date().toISOString().split('T')[0]
  const { count: sentToday } = await supabase
    .from('os_outreach')
    .select('*', { count: 'exact', head: true })
    .not('sent_at', 'is', null)
    .gte('sent_at', `${today}T00:00:00.000Z`)

  const dailyLimit = config?.outreach?.daily_limit ?? 5
  const remainingToday = dailyLimit - (sentToday ?? 0)

  if (remainingToday <= 0) {
    return { skipped: 'daily_limit_reached', sent_today: sentToday }
  }

  // Monthly limit check
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { count: sentMonth } = await supabase
    .from('os_outreach')
    .select('*', { count: 'exact', head: true })
    .not('sent_at', 'is', null)
    .gte('sent_at', monthStart.toISOString())

  const monthlyLimit = config?.outreach?.monthly_limit ?? 60
  if ((sentMonth ?? 0) >= monthlyLimit) {
    return { skipped: 'monthly_limit_reached' }
  }

  // Load pending proposals
  const { data: pending } = await supabase
    .from('os_outreach')
    .select('*')
    .eq('estado', 'pending_ceo')
    .order('created_at', { ascending: true })
    .limit(remainingToday + 5)  // load a few extra to evaluate quality

  if (!pending?.length) return { reviewed: 0, message: 'No hay propuestas pendientes' }

  // Load agent memory for context
  const { data: memories } = await supabase
    .from('os_memory')
    .select('contenido')
    .in('agente', ['ceo', 'growth'])
    .eq('activo', true)
    .order('relevancia', { ascending: false })
    .limit(8)

  const memoryContext = memories?.map(m => m.contenido).join('\n') ?? ''

  // Load recent metrics for ROI context
  const { data: latestMetrics } = await supabase
    .from('os_metrics')
    .select('outreach_roi, outreach_response_rate, outreach_customers, outreach_cac_usd, v2_eligible')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const results = []

  // CEO evaluates each proposal
  for (const proposal of pending ?? []) {
    // Active client check (hard rule)
    const { count: isClient } = await supabase
      .from('centros')
      .select('*', { count: 'exact', head: true })
      .eq('telefono', proposal.prospecto_numero)

    if ((isClient ?? 0) > 0) {
      await rejectProposal(proposal, 'HARD STOP: el número corresponde a un cliente activo de Vitalis.')
      results.push({ id: proposal.id, decision: 'rejected', reason: 'active_client' })
      continue
    }

    // Cooldown check (hard rule)
    const cooldownDays = config?.outreach?.cooldown_days ?? 90
    const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000)
    const { count: inCooldown } = await supabase
      .from('os_outreach')
      .select('*', { count: 'exact', head: true })
      .eq('prospecto_numero', proposal.prospecto_numero)
      .not('sent_at', 'is', null)
      .gte('sent_at', cooldownDate.toISOString())
      .neq('id', proposal.id)

    if ((inCooldown ?? 0) > 0) {
      await rejectProposal(proposal, `En cooldown: número contactado en los últimos ${cooldownDays} días.`)
      results.push({ id: proposal.id, decision: 'rejected', reason: 'cooldown' })
      continue
    }

    // CEO reasoning with Claude
    const decision = await evaluateWithClaude(proposal, memoryContext, latestMetrics)
    results.push({ id: proposal.id, decision: decision.action, reason: decision.razon })
  }

  return { reviewed: results.length, results }
}

async function evaluateWithClaude(
  proposal: Record<string, unknown>,
  memoryContext: string,
  metrics: Record<string, unknown> | null
) {
  const prompt = `Sos el CEO Agent de Vitalis OS. Tu rol: evaluar propuestas de outreach de Growth y aprobar o rechazar cada mensaje de WhatsApp.

CONTEXTO DE NEGOCIO:
- MRR objetivo M1: USD 200 | M2: USD 400 | M3: USD 800
- Métrica principal: ROI = revenue / costo de adquisición
- ROI outreach actual: ${metrics?.outreach_roi ?? 'N/D'}x
- Response rate actual: ${metrics?.outreach_response_rate ? (Number(metrics.outreach_response_rate)*100).toFixed(1) + '%' : 'N/D'}
- Clientes atribuidos al outreach: ${metrics?.outreach_customers ?? 0}
- CAC actual: USD ${metrics?.outreach_cac_usd ?? 'N/D'}

PROPUESTA DE GROWTH:
Prospecto: ${proposal.prospecto_nombre}
Número: ${proposal.prospecto_numero}
Tipo: ${proposal.prospecto_tipo}
URL/Fuente: ${proposal.prospecto_url ?? 'N/D'}
Score de calificación: ${proposal.calificacion_score}/6
Criterios: ${JSON.stringify(proposal.calificacion, null, 2)}
Mensaje propuesto: "${proposal.mensaje}"
Justificación de Growth: ${proposal.justificacion}

MEMORIA DEL OS (aprendizajes previos):
${memoryContext || 'Sin aprendizajes previos.'}

CRITERIOS DE DECISIÓN:
✓ Aprobar si: score ≥ 4, mensaje apropiado, no es spam, justificación sólida, prospecto bien calificado
✗ Rechazar si: score < 4, mensaje inapropiado, hipótesis de calificación débil, no es el target correcto

Devolvé SOLO JSON:
{
  "action": "approved" | "rejected",
  "razon": "explicación concisa de la decisión (será guardada como aprendizaje)",
  "feedback_growth": "feedback específico para que Growth mejore futuras propuestas"
}`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`)
  const data = await resp.json()
  const raw = data?.content?.[0]?.text ?? ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('CEO Claude did not return valid JSON')

  const parsed = JSON.parse(match[0])
  const now = new Date().toISOString()

  if (parsed.action === 'approved') {
    await approveProposal(proposal, parsed.razon)
  } else {
    await rejectProposal(proposal, parsed.razon)
    // Save feedback to Growth's memory
    await supabase.from('os_memory').insert({
      agente: 'growth',
      tipo: 'rejection_reason',
      contenido: `[${now.split('T')[0]}] Rechazo de "${proposal.prospecto_nombre}": ${parsed.razon}. Feedback: ${parsed.feedback_growth}`,
      relevancia: 8,
      outreach_id: proposal.id as string
    })
  }

  // Save CEO decision
  await supabase.from('os_decisions').insert({
    tipo: parsed.action === 'approved' ? 'outreach_approve' : 'outreach_reject',
    descripcion: `${parsed.action === 'approved' ? 'Aprobado' : 'Rechazado'}: ${proposal.prospecto_nombre}`,
    razonamiento: parsed.razon,
    outreach_id: proposal.id as string
  })

  return parsed
}

async function approveProposal(proposal: Record<string, unknown>, razon: string) {
  const now = new Date().toISOString()
  await supabase.from('os_outreach').update({
    estado: 'approved',
    ceo_decision: 'approved',
    ceo_razon: razon,
    ceo_decided_at: now,
    updated_at: now
  }).eq('id', proposal.id as string)

  // Trigger send (call os-outreach-send)
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${SUPABASE_URL}/functions/v1/os-outreach-send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ outreach_id: proposal.id })
  })
}

async function rejectProposal(proposal: Record<string, unknown>, razon: string) {
  const now = new Date().toISOString()
  await supabase.from('os_outreach').update({
    estado: 'rejected',
    ceo_decision: 'rejected',
    ceo_razon: razon,
    ceo_decided_at: now,
    updated_at: now
  }).eq('id', proposal.id as string)
}

async function checkGuardrails() {
  const { data: configRow } = await supabase
    .from('os_config')
    .select('config')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const config = configRow?.config ?? {}
  const budget = config?.financials?.budget_monthly_usd ?? 300

  const { data: latestMetrics } = await supabase
    .from('os_metrics')
    .select('burn_rate_usd, outreach_roi, v2_eligible')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const alerts = []

  if (latestMetrics?.burn_rate_usd && Number(latestMetrics.burn_rate_usd) > budget * 0.75) {
    alerts.push(`Burn rate USD ${latestMetrics.burn_rate_usd} supera el 75% del budget mensual.`)
  }

  if (latestMetrics?.v2_eligible) {
    alerts.push('Sistema elegible para transición a autonomía v2. Preparar propuesta para Chairman.')
  }

  return { alerts }
}

async function emitTasks() {
  // Emit weekly task to Growth if there are not enough pending proposals
  const { count: pendingCount } = await supabase
    .from('os_outreach')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'pending_ceo')

  const tasks = []

  if ((pendingCount ?? 0) === 0) {
    await supabase.from('os_tasks').insert({
      agente_destino: 'growth',
      tipo: 'prospecting',
      instruccion: 'No hay propuestas pendientes en os_outreach. Identificar y calificar 5 nuevos prospectos kinesiológicos en Argentina y proponer mensajes WA para aprobación del CEO.',
      prioridad: 8
    })
    tasks.push('task_prospecting_emitted')
  }

  return { tasks }
}

async function weeklyReport() {
  // Load metrics for the past 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const today = new Date()

  const { data: metrics } = await supabase
    .from('os_metrics')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const { data: decisions } = await supabase
    .from('os_decisions')
    .select('tipo, descripcion, created_at')
    .gte('created_at', weekAgo.toISOString())
    .order('created_at', { ascending: false })

  const { data: outreachWeek } = await supabase
    .from('os_outreach')
    .select('funnel_stage, response_class, ceo_decision, conversion, mrr_attributed, acquisition_cost_usd, roi')
    .gte('created_at', weekAgo.toISOString())

  const approved = outreachWeek?.filter(o => o.ceo_decision === 'approved').length ?? 0
  const rejected = outreachWeek?.filter(o => o.ceo_decision === 'rejected').length ?? 0
  const sent = outreachWeek?.filter(o => ['sent','delivered','responded','customer'].includes(o.funnel_stage ?? '')).length ?? 0
  const responded = outreachWeek?.filter(o => o.response_class === 'interesado').length ?? 0
  const converted = outreachWeek?.filter(o => o.conversion).length ?? 0

  const roiWeek = metrics?.outreach_roi

  const reportContent = {
    periodo: `${weekAgo.toISOString().split('T')[0]} → ${today.toISOString().split('T')[0]}`,
    mrr_usd: metrics?.mrr_usd ?? 0,
    burn_rate_usd: metrics?.burn_rate_usd ?? 0,
    outreach_roi: roiWeek,
    outreach_contacts: sent,
    outreach_responses: responded,
    outreach_converted: converted,
    ceo_approved: approved,
    ceo_rejected: rejected,
    approval_rate: (approved + rejected) > 0 ? approved / (approved + rejected) : null,
    v2_eligible: metrics?.v2_eligible ?? false,
    decisions_count: decisions?.length ?? 0
  }

  // Save report
  const { data: reportRow } = await supabase
    .from('os_reports')
    .insert({
      tipo: 'weekly',
      periodo_inicio: weekAgo.toISOString().split('T')[0],
      periodo_fin: today.toISOString().split('T')[0],
      contenido: reportContent,
      roi_periodo: roiWeek,
      mrr_inicio: metrics?.mrr_usd,
      mrr_fin: metrics?.mrr_usd
    })
    .select()
    .single()

  // Generate email body
  const emailBody = `
VITALIS OS — Reporte Semanal
${reportContent.periodo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEGOCIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━
MRR:        USD ${Number(reportContent.mrr_usd).toFixed(2)}
Burn rate:  USD ${Number(reportContent.burn_rate_usd).toFixed(2)}
EBITDA est: USD ${(Number(reportContent.mrr_usd) - Number(reportContent.burn_rate_usd)).toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTREACH — ROI: ${roiWeek ? `${Number(roiWeek).toFixed(2)}x` : 'N/D (sin datos suficientes)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contactos enviados:   ${sent}
Respuestas (interés): ${responded}  ${sent > 0 ? `(${((responded/sent)*100).toFixed(1)}%)` : ''}
Clientes nuevos:      ${converted}
CEO aprobados:        ${approved}  (${(approved + rejected) > 0 ? ((approved/(approved+rejected))*100).toFixed(0) : 'N/D'}%)
CEO rechazados:       ${rejected}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Decisiones del OS esta semana: ${reportContent.decisions_count}
Elegible para autonomía v2: ${reportContent.v2_eligible ? 'SÍ — preparar propuesta' : 'No aún'}

Vitalis OS — CEO Agent
  `.trim()

  // Send email to Chairman
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'os@agendavitalis.app',
      to: CHAIRMAN_EMAIL,
      subject: `[Vitalis OS] Reporte Semanal — ROI: ${roiWeek ? `${Number(roiWeek).toFixed(2)}x` : 'N/D'} | MRR: USD ${Number(reportContent.mrr_usd).toFixed(0)}`,
      text: emailBody
    })
  })

  return { report_id: reportRow?.id, roi: roiWeek, mrr: reportContent.mrr_usd }
}
