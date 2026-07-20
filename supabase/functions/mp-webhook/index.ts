/**
 * mp-webhook — Endpoint público que Mercado Pago llama al procesarse un pago.
 *
 * MP puede enviar el mismo evento múltiples veces (at-least-once delivery).
 * La idempotencia se maneja con UNIQUE en mp_pagos.payment_id + ON CONFLICT DO NOTHING.
 *
 * Flujo:
 *   1. MP POST /mp-webhook  { type: "payment", data: { id: "123" } }
 *   2. Fetch GET /v1/payments/123  con token de plataforma Vitalis
 *   3. Extraer metadata.centro_id y metadata.turno_id (que pusimos al crear la Preference)
 *   4. Upsert mp_pagos
 *   5. Si approved → insertar caja_movimientos + actualizar turno a 'confirmado'
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Token de la cuenta Vitalis (plataforma marketplace), NO del centro
const MP_PLATFORM_TOKEN = Deno.env.get('MP_PLATFORM_ACCESS_TOKEN')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

Deno.serve(async (req: Request) => {
  // MP envía POST, pero también hace un GET de verificación inicial
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  let body: { type?: string; data?: { id?: string } };
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  // Solo procesamos notificaciones de tipo "payment"
  if (body.type !== 'payment' || !body.data?.id) {
    return new Response('ignored', { status: 200 });
  }

  const paymentId = String(body.data.id);

  // ── 1. Idempotencia rápida: si ya procesamos este payment, salimos ──────
  const { data: existing } = await supabase
    .from('mp_pagos')
    .select('id, estado')
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (existing?.estado === 'approved') {
    return new Response('already_processed', { status: 200 });
  }

  // ── 2. Fetch detalles del pago desde MP API ──────────────────────────────
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_PLATFORM_TOKEN}` },
  });

  if (!mpRes.ok) {
    console.error(`MP API error: ${mpRes.status} for payment ${paymentId}`);
    // Devolvemos 200 para que MP no reintente con backoff exponencial
    // pero el pago queda en pending y lo podemos conciliar manualmente
    return new Response('mp_api_error', { status: 200 });
  }

  const payment = await mpRes.json();

  // ── 3. Extraer metadata que pusimos al crear la Preference ───────────────
  const centroId = payment.metadata?.centro_id as string | undefined;
  const turnoId  = payment.metadata?.turno_id  as string | undefined;

  if (!centroId) {
    console.error(`Payment ${paymentId} sin centro_id en metadata`);
    return new Response('no_centro_id', { status: 200 });
  }

  // ── 4. Calcular montos ───────────────────────────────────────────────────
  const montoTotal    = payment.transaction_amount ?? 0;
  // marketplace_fee que pusimos al crear la Preference
  const montoVitalis  = payment.marketplace_fee   ?? 0;
  const montoCentro   = montoTotal - montoVitalis;

  const mpStatus       = payment.status;         // approved | rejected | pending | etc.
  const mpStatusDetail = payment.status_detail;

  // ── 5. Upsert en mp_pagos ────────────────────────────────────────────────
  const { error: upsertErr } = await supabase.from('mp_pagos').upsert({
    centro_id:        centroId,
    turno_id:         turnoId ?? null,
    payment_id:       paymentId,
    preference_id:    payment.order?.id ?? null,
    estado:           mpStatus === 'approved' ? 'approved' : mpStatus === 'rejected' ? 'rejected' : 'pending',
    monto_total:      montoTotal,
    monto_vitalis:    montoVitalis,
    monto_centro:     montoCentro,
    mp_status:        mpStatus,
    mp_status_detail: mpStatusDetail,
    metadata: {
      payer_email:    payment.payer?.email,
      payment_method: payment.payment_method_id,
      installments:   payment.installments,
    },
  }, { onConflict: 'payment_id' });

  if (upsertErr) {
    console.error('upsert mp_pagos error:', upsertErr);
    return new Response('db_error', { status: 500 });
  }

  // ── 6. Si el pago fue aprobado → efecto en negocio ──────────────────────
  if (mpStatus === 'approved' && turnoId) {
    // Registrar en caja_movimientos
    await supabase.from('caja_movimientos').insert({
      centro_id:          centroId,
      turno_id:           turnoId,
      fecha:              new Date().toISOString().slice(0, 10),
      monto_efectivo:     0,
      monto_transferencia: montoCentro,   // MP = transferencia
      monto_prepaga:      0,
    });

    // Marcar turno como confirmado
    await supabase
      .from('turnos')
      .update({ estado: 'confirmado' })
      .eq('id', turnoId)
      .eq('estado', 'reservado'); // solo si estaba reservado, no sobreescribir estados posteriores
  }

  return new Response('ok', { status: 200 });
});
