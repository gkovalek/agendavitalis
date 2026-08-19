/**
 * mp-pago-portal — Crea una Preference de MP para pagos desde el portal público.
 *
 * No requiere JWT del usuario. Valida que el turno exista y esté en 'pendiente_pago'.
 * El centro_id se obtiene desde el turno (no del perfil autenticado).
 *
 * Body: { turno_id, monto, descripcion }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL          = Deno.env.get('APP_URL') ?? 'https://agendavitalis.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { turno_id?: string; monto?: number; descripcion?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const { turno_id, monto, descripcion } = body;
  if (!turno_id) return json({ error: 'turno_id_requerido' }, 400);
  if (!monto || monto <= 0) return json({ error: 'monto_invalido' }, 400);

  // 1. Verificar que el turno existe y está pendiente_pago
  const { data: turno } = await supabase
    .from('turnos')
    .select('id, estado, centro_id, profesional_id, pago_expira_at')
    .eq('id', turno_id)
    .single();

  if (!turno) return json({ error: 'turno_no_encontrado' }, 404);
  if (turno.estado !== 'pendiente_pago') return json({ error: 'turno_no_pendiente' }, 409);
  if (turno.pago_expira_at && new Date(turno.pago_expira_at) < new Date()) {
    return json({ error: 'turno_expirado' }, 410);
  }

  // 2. Obtener credenciales MP: primero del profesional, fallback al centro
  const { data: centro } = await supabase
    .from('centros')
    .select('mp_access_token, mp_user_id, mp_fee_pct, nombre')
    .eq('id', turno.centro_id)
    .single();

  let accessToken = centro?.mp_access_token ?? null;

  if (turno.profesional_id) {
    const { data: prof } = await supabase
      .from('profesionales')
      .select('mp_access_token')
      .eq('id', turno.profesional_id)
      .single();
    if (prof?.mp_access_token) accessToken = prof.mp_access_token;
  }

  if (!accessToken) {
    return json({ error: 'mp_not_configured' }, 400);
  }

  const feePct        = centro?.mp_fee_pct ?? 3.0;
  const marketplaceFee = Math.round(monto * (feePct / 100) * 100) / 100;

  // 3. Crear Preference en MP
  const preferencePayload = {
    items: [{
      id:          turno_id,
      title:       descripcion ?? `Turno en ${centro.nombre}`,
      description: descripcion ?? `Turno en ${centro.nombre}`,
      quantity:    1,
      unit_price:  monto,
      currency_id: 'ARS',
    }],
    external_reference: turno_id,
    marketplace_fee: marketplaceFee,
    metadata: {
      centro_id:   turno.centro_id,
      turno_id:    turno_id,
      vitalis_fee: marketplaceFee,
    },
    back_urls: {
      success: `${APP_URL}/pago/success?turno=${turno_id}`,
      failure: `${APP_URL}/pago/failure?turno=${turno_id}`,
      pending: `${APP_URL}/pago/pending?turno=${turno_id}`,
    },
    auto_return: 'approved',
    notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
    statement_descriptor: 'VITALIS',
  };

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preferencePayload),
  });

  if (!mpRes.ok) {
    const mpErr = await mpRes.json().catch(() => ({}));
    console.error('MP error:', mpErr);
    return json({ error: 'mp_error', detail: mpErr }, 502);
  }

  const preference = await mpRes.json();

  // 4. Registrar pago en estado pending
  await supabase.from('mp_pagos').insert({
    centro_id:     turno.centro_id,
    turno_id:      turno_id,
    preference_id: preference.id,
    estado:        'pending',
    monto_total:   monto,
    monto_vitalis: marketplaceFee,
    monto_centro:  monto - marketplaceFee,
    metadata: { descripcion },
  });

  return json({
    preference_id:        preference.id,
    checkout_url:         preference.init_point,
    checkout_url_sandbox: preference.sandbox_init_point,
  }, 200);
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
