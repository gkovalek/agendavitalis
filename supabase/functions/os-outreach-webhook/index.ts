// os-outreach-webhook — Vitalis OS v1
// Triggered: Evolution API sends WhatsApp delivery + response events
// Reads: os_outreach (by prospecto_numero), os_campaigns
// Writes: os_outreach (delivery_status, response, funnel_stage), os_attribution (events)
// Handles: message delivered, message read, response received
// Triggers: os-growth-agent classify_responses when a response arrives

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await req.json()
    await processWebhookEvent(body)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[os-outreach-webhook] error:', err)
    // Always return 200 to Evolution (don't retry on our errors)
    return new Response(JSON.stringify({ ok: true, internal_error: String(err) }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })
  }
})

async function processWebhookEvent(event: Record<string, unknown>) {
  const eventType = event?.event as string
  const data = event?.data as Record<string, unknown>

  // Delivery status update
  if (eventType === 'messages.update' || eventType === 'message.ack') {
    await handleDeliveryUpdate(data)
    return
  }

  // Incoming message (response from prospect)
  if (eventType === 'messages.upsert' || eventType === 'message') {
    const message = data?.messages?.[0] ?? data
    const fromMe = message?.key?.fromMe as boolean
    if (!fromMe) {
      await handleIncomingResponse(message)
    }
    return
  }

  console.log(`[os-outreach-webhook] unhandled event type: ${eventType}`)
}

async function handleDeliveryUpdate(data: Record<string, unknown>) {
  const messageId = data?.key?.id as string
  const ackStatus = data?.update?.status as string  // DELIVERY_ACK | READ | PLAYED

  if (!messageId) return

  // Find outreach by message_id
  const { data: outreach } = await supabase
    .from('os_outreach')
    .select('id, estado')
    .eq('message_id', messageId)
    .single()

  if (!outreach) return

  const deliveryMap: Record<string, string> = {
    'DELIVERY_ACK': 'delivered',
    'READ': 'read',
    'PLAYED': 'played',
    'SERVER_ACK': 'sent'
  }

  const mappedStatus = deliveryMap[ackStatus] ?? ackStatus?.toLowerCase() ?? 'unknown'
  const newEstado = (mappedStatus === 'delivered' || mappedStatus === 'read') ? 'delivered' : outreach.estado

  await supabase.from('os_outreach').update({
    delivery_status: mappedStatus,
    estado: newEstado,
    updated_at: new Date().toISOString()
  }).eq('id', outreach.id)
}

async function handleIncomingResponse(message: Record<string, unknown>) {
  const remoteJid = message?.key?.remoteJid as string
  const text = (message?.message?.conversation ?? message?.message?.extendedTextMessage?.text ?? '') as string

  if (!remoteJid || !text) return

  // Extract number from JID (e.g. "5491123456789@s.whatsapp.net")
  const numero = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')

  if (!numero) return

  // Find the most recent outreach to this number (that was sent)
  const { data: outreach } = await supabase
    .from('os_outreach')
    .select('*')
    .eq('prospecto_numero', numero)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()

  if (!outreach) {
    console.log(`[os-outreach-webhook] incoming from ${numero} — no matching outreach found`)
    return
  }

  const now = new Date().toISOString()

  // Update outreach with response
  await supabase.from('os_outreach').update({
    response: text,
    response_at: now,
    estado: 'responded',
    funnel_stage: 'response',  // temporary, will be properly classified by Growth
    funnel_stage_updated_at: now,
    updated_at: now
  }).eq('id', outreach.id)

  // Update pipeline
  await supabase.from('os_pipeline')
    .update({ notas: `Respuesta recibida: "${text.substring(0, 200)}"`, updated_at: now })
    .eq('outreach_id', outreach.id)

  // Trigger Growth Agent to classify the response
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${SUPABASE_URL}/functions/v1/os-growth-agent`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'classify_responses' })
  })

  console.log(`[os-outreach-webhook] response from ${numero} recorded, Growth Agent notified`)
}
