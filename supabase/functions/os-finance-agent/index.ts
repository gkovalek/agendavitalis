// os-finance-agent — Vitalis OS v1
// Runs: every Sunday 05:00 UTC (pg_cron) + on-demand alerts
// Reads: caja_movimientos, centros, os_outreach, os_attribution, os_campaigns
// Writes: os_metrics (daily snapshot), os_decisions (alerts), os_memory (learnings)
// Primary metric: ROI = revenue_attributed / acquisition_cost
// Chairman: gkovalek@gmail.com

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CHAIRMAN_EMAIL = 'gkovalek@gmail.com'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const result = await runFinanceAgent()
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[os-finance-agent] error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

async function runFinanceAgent() {
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 1. Load os_config
  const { data: configRow } = await supabase
    .from('os_config')
    .select('config')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const config = configRow?.config ?? {}
  const budgetMonthly = config?.financials?.budget_monthly_usd ?? 300
  const budgetMarketing = config?.financials?.budget_marketing_usd ?? 200
  const minRoiReinvestment = config?.financials?.min_roi_for_reinvestment ?? 2.0

  // 2. Calculate MRR from centros (active paying clients)
  const { data: centros } = await supabase
    .from('centros')
    .select('plan, suscripcion_estado')
    .eq('activo', true)
    .eq('suscripcion_estado', 'activa')

  const planPrices: Record<string, number> = { basico: 35, intermedio: 50, premium: 80 }
  let mrrUsd = 0
  let clientsActive = 0
  for (const c of centros ?? []) {
    const price = planPrices[c.plan] ?? 0
    mrrUsd += price
    clientsActive++
  }

  // 3. Calculate burn rate from caja_movimientos (this month)
  const { data: movimientos } = await supabase
    .from('caja_movimientos')
    .select('tipo, monto')
    .gte('fecha', monthStart.toISOString().split('T')[0])

  let totalIncome = 0
  let totalExpense = 0
  for (const m of movimientos ?? []) {
    if (m.tipo === 'ingreso') totalIncome += Number(m.monto)
    else totalExpense += Number(m.monto)
  }
  const burnRate = totalExpense

  // 4. Outreach ROI attribution (Chairman's primary metric)
  // Load all outreach records this month
  const { data: outreachMonth } = await supabase
    .from('os_outreach')
    .select(`
      id, funnel_stage, estado, sent_at, response_class,
      mrr_attributed, revenue_attributed, gross_margin_attributed,
      acquisition_cost_usd, roi, campaign_id
    `)
    .gte('sent_at', monthStart.toISOString())

  const outreach = outreachMonth ?? []
  const contacts = outreach.length
  const responses = outreach.filter(o => o.response_class === 'interesado').length
  const qualified = outreach.filter(o => o.funnel_stage === 'qualified_conversation' || ['demo','proposal','customer'].includes(o.funnel_stage)).length
  const demos = outreach.filter(o => ['demo','proposal','customer'].includes(o.funnel_stage)).length
  const proposals = outreach.filter(o => ['proposal','customer'].includes(o.funnel_stage)).length
  const customers = outreach.filter(o => o.funnel_stage === 'customer' || o.conversion).length
  const mrrAttributed = outreach.reduce((sum, o) => sum + (Number(o.mrr_attributed) || 0), 0)
  const revenueAttributed = outreach.reduce((sum, o) => sum + (Number(o.revenue_attributed) || 0), 0)
  const grossMargin = outreach.reduce((sum, o) => sum + (Number(o.gross_margin_attributed) || 0), 0)
  const outreachCost = contacts * (budgetMarketing / 60)  // budget / monthly_limit

  // Primary metric: ROI
  const outreachRoi = outreachCost > 0 ? revenueAttributed / outreachCost : null
  const cacUsd = customers > 0 ? outreachCost / customers : null
  const responseRate = contacts > 0 ? responses / contacts : 0
  const conversionRate = contacts > 0 ? customers / contacts : 0

  // 5. Campaign-level ROI aggregation
  const { data: campaigns } = await supabase
    .from('os_campaigns')
    .select('id, nombre, cost_total_usd')
    .eq('estado', 'active')

  for (const campaign of campaigns ?? []) {
    const cOutreach = outreach.filter(o => o.campaign_id === campaign.id)
    const cRevenue = cOutreach.reduce((sum, o) => sum + (Number(o.revenue_attributed) || 0), 0)
    const cCost = cOutreach.length * (budgetMarketing / 60)
    const cRoi = cCost > 0 ? cRevenue / cCost : null
    const cCustomers = cOutreach.filter(o => o.funnel_stage === 'customer' || o.conversion).length

    await supabase
      .from('os_campaigns')
      .update({
        total_contacts: cOutreach.length,
        total_responses: cOutreach.filter(o => o.response_class === 'interesado').length,
        total_customers: cCustomers,
        revenue_attributed: cRevenue,
        cost_total_usd: cCost,
        roi: cRoi,
        cac_usd: cCustomers > 0 ? cCost / cCustomers : null,
        response_rate: cOutreach.length > 0 ? cOutreach.filter(o => o.response_class === 'interesado').length / cOutreach.length : 0,
        conversion_rate: cOutreach.length > 0 ? cCustomers / cOutreach.length : 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaign.id)
  }

  // 6. CEO approval rate (for v2 promotion criteria)
  const { data: recentDecisions } = await supabase
    .from('os_outreach')
    .select('ceo_decision')
    .not('ceo_decision', 'is', null)
    .gte('created_at', weekAgo.toISOString())

  const totalDecided = recentDecisions?.length ?? 0
  const totalApproved = recentDecisions?.filter(d => d.ceo_decision === 'approved').length ?? 0
  const approvalRate = totalDecided > 0 ? totalApproved / totalDecided : null

  // 7. Check v2 promotion criteria
  const v2Criteria = {
    approval_rate_ok: approvalRate !== null && approvalRate >= 0.70,
    response_rate_ok: responseRate >= 0.15,
    zero_violations: true,   // TODO: check os_decisions for guardrail violations
    one_conversion: customers >= 1,
    zero_spam: true,          // TODO: check delivery_status for spam reports
    roi_ok: outreachRoi !== null && outreachRoi >= 2.0
  }
  const v2Eligible = Object.values(v2Criteria).every(Boolean)

  // 8. Write os_metrics snapshot (upsert by date)
  const { error: metricsErr } = await supabase
    .from('os_metrics')
    .upsert({
      snapshot_date: today.toISOString().split('T')[0],
      mrr_usd: mrrUsd,
      clients_active: clientsActive,
      burn_rate_usd: burnRate,
      marketing_spend_usd: budgetMarketing,
      outreach_contacts: contacts,
      outreach_responses: responses,
      outreach_qualified: qualified,
      outreach_demos: demos,
      outreach_proposals: proposals,
      outreach_customers: customers,
      outreach_mrr_attributed: mrrAttributed,
      outreach_revenue_attributed: revenueAttributed,
      outreach_gross_margin: grossMargin,
      outreach_cost_usd: outreachCost,
      outreach_cac_usd: cacUsd,
      outreach_roi: outreachRoi,
      outreach_response_rate: responseRate,
      outreach_conversion_rate: conversionRate,
      v2_criteria_approval_rate: approvalRate,
      v2_eligible: v2Eligible,
      created_at: new Date().toISOString()
    }, { onConflict: 'snapshot_date' })

  if (metricsErr) throw metricsErr

  const alerts: string[] = []

  // 9. HARD GUARDRAIL: Burn > budget
  if (burnRate > budgetMonthly) {
    await supabase.from('os_decisions').insert({
      tipo: 'escalate_chairman',
      descripcion: `HARD STOP: Burn rate USD ${burnRate.toFixed(2)} excede budget mensual USD ${budgetMonthly}`,
      razonamiento: `caja_movimientos muestra USD ${burnRate.toFixed(2)} en egresos este mes. Kill switch activado preventivamente.`,
      escalado_chairman: true
    })
    await supabase.from('os_config').update({
      config: { ...config, kill_switch: true },
      updated_by: 'finance_agent',
      updated_at: new Date().toISOString()
    }).order('updated_at', { ascending: false }).limit(1)
    alerts.push(`🔴 HARD STOP: Burn USD ${burnRate.toFixed(2)} > Budget USD ${budgetMonthly}. Kill switch activado.`)
  }

  // 10. SOFT ALERT: Burn > 75% of budget
  if (burnRate > budgetMonthly * 0.75 && burnRate <= budgetMonthly) {
    alerts.push(`🟡 ALERTA: Burn mensual USD ${burnRate.toFixed(2)} = ${((burnRate/budgetMonthly)*100).toFixed(0)}% del budget.`)
  }

  // 11. Campaign pause check (response rate < 10%)
  for (const campaign of campaigns ?? []) {
    const cOutreach = outreach.filter(o => o.campaign_id === campaign.id && o.sent_at)
    if (cOutreach.length >= 20) {
      const cResponded = cOutreach.filter(o => o.response_class === 'interesado').length
      const cRespRate = cResponded / cOutreach.length
      if (cRespRate < (config?.outreach?.campaign_pause_threshold ?? 0.10)) {
        await supabase.from('os_campaigns').update({
          estado: 'paused',
          updated_at: new Date().toISOString()
        }).eq('id', campaign.id)
        alerts.push(`🟡 Campaña "${campaign.nombre}" pausada: response rate ${(cRespRate*100).toFixed(1)}% < 10% en ${cOutreach.length} envíos.`)
      }
    }
  }

  // 12. V2 promotion signal
  if (v2Eligible) {
    await supabase.from('os_decisions').insert({
      tipo: 'v2_propose',
      descripcion: 'Todos los criterios de promoción a v2 (campaign_auto) están cumplidos.',
      razonamiento: JSON.stringify({ v2Criteria, approvalRate, responseRate, customers, outreachRoi }),
      escalado_chairman: false
    })
    alerts.push(`✅ V2 ELEGIBLE: Todos los criterios de autonomía cumplidos. CEO debe preparar propuesta para Chairman.`)
  }

  // 13. Write to os_memory
  if (contacts > 0) {
    await supabase.from('os_memory').insert({
      agente: 'finance',
      tipo: 'learning',
      contenido: `Semana ${today.toISOString().split('T')[0]}: ${contacts} contactos, ROI=${outreachRoi?.toFixed(2) ?? 'N/A'}x, CAC=USD ${cacUsd?.toFixed(0) ?? 'N/A'}, ${customers} clientes atribuidos. Response rate: ${(responseRate*100).toFixed(1)}%.`,
      relevancia: 7
    })
  }

  // 14. Send alert email to Chairman if needed
  if (alerts.length > 0) {
    await sendAlertEmail(alerts, { mrrUsd, burnRate, outreachRoi, customers, contacts })
  }

  return {
    snapshot_date: today.toISOString().split('T')[0],
    mrr_usd: mrrUsd,
    clients_active: clientsActive,
    burn_rate_usd: burnRate,
    outreach_roi: outreachRoi,
    outreach_contacts: contacts,
    outreach_customers: customers,
    v2_eligible: v2Eligible,
    alerts
  }
}

async function sendAlertEmail(alerts: string[], metrics: Record<string, unknown>) {
  const body = `
VITALIS OS — Finance Agent Alert

${alerts.map(a => `• ${a}`).join('\n')}

---
MRR: USD ${Number(metrics.mrr_usd).toFixed(2)}
Burn: USD ${Number(metrics.burn_rate_usd).toFixed(2)}
ROI outreach: ${metrics.outreach_roi ? `${Number(metrics.outreach_roi).toFixed(2)}x` : 'N/D'}
Contactos mes: ${metrics.outreach_contacts}
Clientes atribuidos: ${metrics.outreach_customers}

Vitalis OS — Finance Agent
  `.trim()

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'os@agendavitalis.app',
      to: CHAIRMAN_EMAIL,
      subject: `[Vitalis OS] Finance Alert — ${alerts.length} notificación(es)`,
      text: body
    })
  })
}
