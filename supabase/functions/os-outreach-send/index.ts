// os-outreach-send — Vitalis OS v1
// Triggered: after CEO approves a message in os_outreach
// Reads: os_outreach WHERE estado='approved', os_config (kill switch + limits)
// Writes: os_outreach (sent_at, delivery_status, message_id, funnel_stage)
//         os_attribution (CONTACT event)
//         os_campaigns (total_contacts++)
// HARD RULE: NEVER sends if estado != 'approved' or kill_switch=true

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const EVOLUTION_URL = Deno.env.get('EVOLUTION_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const outreachId = body?.outreach_id

    if (outreachId) {
      // Single send mode (webhook-triggered after CEO approval)
      const result = await sendApproved(outreachId)
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    } else {
      // Batch mode: send all pending approved messages
      const results = await sendAllApproved()
      return new Response(JSON.stringify({ ok: true, results }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }
  } catch (err) {
    console.error('[os-outreach-send] error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})

async function sendAllApproved(): Promise<unknown[]> {
  // Check kill switch FIRST
  const { data: configRow } = await supabase
    .from('os_config')
    .select('config')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  const config = configRow?.config ?? {}
  if (config?.kill_switch === true) {
    console.log('[os-outreach-send] kill switch active — no sends')
    return [{ skipped: 'kill_switch_active' }]
  }
  if (config?.outreach?.enabled === false) {
    console.log('[os-outreach-send] outreach disabled — no sends')
    return [{ skipped: 'outreach_disabled' }]
  }

  // Daily limit check
  const today = new Date().toISOString().split('T')[0]
  const { count: sentToday } = await supabase
    .from('os_outreach')
    .select('*', { count: 'exact', head: true })
    .not('sent_at', 'is', null)
    .gte('sent_at', `${today}T00:00:00.000Z`)

  const dailyLimit = config?.outreach?.daily_limit ?? 5
  if ((sentToday ?? 0) >= dailyLimit) {
    console.log(`[os-outreach-send] daily limit ${dailyLimit} reached (${sentToday} sent today)`)
    return [{ skipped: 'daily_limit_reached', sent_today: sentToday, limit: dailyLimit }]
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
    console.log(`[os-outreach-send] monthly limit ${monthlyLimit} reached`)
    return [{ skipped: 'monthly_limit_reached', sent_month: sentMonth, limit: monthlyLimit }]
  }

  // Load approved messages (up to remaining daily capacity)
  const remaining = dailyLimit - (sentToday ?? 0)
  const { data: approved } = await supabase
    .from('os_outreach')
    .select('*')
    .eq('estado', 'approved')
    .is('sent_at', null)
    .limit(remaining)
    .order('created_at', { ascending: true })

  const results = []
  for (const outreach of approved ?? []) {
    try {
      const result = await sendApproved(outreach.id, outreach)
      results.push(result)
    } catch (err) {
      results.push({ outreach_id: outreach.id, error: String(err) })
    }
  }
  return results
}

async function sendApproved(outreachId: string, preloaded?: Record<string, unknown>): Promise<unknown> {
  // Load record
  const record = preloaded ?? await loadOutreach(outreachId)
  if (!record) throw new Error(`outreach ${outreachId} not found`)

  // HARD CHECK: must be 'approved' state
  if (record.estado !== 'approved') {
    throw new Error(`HARD_RULE_VIOLATION: outreach ${outreachId} estado=${record.estado}, expected 'approved'. No send.`)
  }
  if (record.ceo_decision !== 'approved') {
    throw new Error(`HARD_RULE_VIOLATION: outreach ${outreachId} ceo_decision=${record.ceo_decision}. No send.`)
  }

  // Send via Evolution API
  const evolutionResp = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY
    },
    body: JSON.stringify({
      number: record.prospecto_numero,
      text: record.mensaje
    })
  })

  const evolutionData = await evolutionResp.json()
  const messageId = evolutionData?.key?.id ?? evolutionData?.messageId ?? null
  const deliveryStatus = evolutionResp.ok ? 'sent' : 'failed'
  const now = new Date().toISOString()

  if (!evolutionResp.ok) {
    await supabase.from('os_outreach').update({
      estado: 'approved',  // keep approved, will retry
      delivery_status: `failed:${evolutionResp.status}`,
      updated_at: now
    }).eq('id', outreachId)
    throw new Error(`Evolution API error: ${evolutionResp.status} — ${JSON.stringify(evolutionData)}`)
  }

  // Update os_outreach — mark as sent
  await supabase.from('os_outreach').update({
    estado: 'sent',
    sent_at: now,
    delivery_status: deliveryStatus,
    message_id: messageId,
    funnel_stage: 'contact',
    funnel_stage_updated_at: now,
    contact_date: now,
    updated_at: now
  }).eq('id', outreachId)

  // Write attribution event: CONTACT (first funnel stage)
  await supabase.from('os_attribution').insert({
    outreach_id: outreachId,
    campaign_id: record.campaign_id,
    contact_nombre: record.prospecto_nombre,
    contact_numero: record.prospecto_numero,
    channel: record.channel ?? 'whatsapp_outreach',
    agent: record.agent ?? 'growth',
    event_date: now,
    cost_attributed_usd: 0,  // campaign cost share calculated weekly by Finance
    from_stage: null,
    to_stage: 'contact',
    notes: `Mensaje enviado via Evolution API. message_id: ${messageId}`
  })

  // Increment campaign contacts counter
  if (record.campaign_id) {
    const { data: camp } = await supabase
      .from('os_campaigns')
      .select('total_contacts')
      .eq('id', record.campaign_id)
      .single()

    await supabase.from('os_campaigns').update({
      total_contacts: (camp?.total_contacts ?? 0) + 1,
      updated_at: now
    }).eq('id', record.campaign_id)
  }

  console.log(`[os-outreach-send] sent to ${record.prospecto_numero}, message_id: ${messageId}`)
  return { outreach_id: outreachId, message_id: messageId, status: 'sent' }
}

async function loadOutreach(id: string) {
  const { data } = await supabase
    .from('os_outreach')
    .select('*')
    .eq('id', id)
    .single()
  return data
}
