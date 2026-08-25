/**
 * mp-crear-pago — Crea una Preference de MP con split de comisión.
 *
 * Llamada desde el frontend (portal reservas o caja) con JWT del usuario.
 * Devuelve la URL de checkout de MP para redirigir al paciente.
 *
 * Body esperado:
 *   { turno_id, monto, descripcion, back_url_base }
 *
 * Flujo:
 *   1. Verificar JWT → obtener centro_id del perfil
 *   2. Buscar mp_access_token + mp_fee_pct del centro
 *   3. Calcular marketplace_fee = monto * (fee_pct / 100)
 *   4. Crear Preference en MP con el token del CENTRO
 *   5. Insertar mp_pagos en estado 'pending'
 *   6. Devolver { preference_id, checkout_url }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// ID de la aplicación Vitalis en MP (requerido para marketplace)
const MP_APP_ID        = Deno.env.get('MP_APP_ID')!;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // ── 1. Autenticar usuario via JWT ────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  // ── 2. Obtener centro_id del usuario ────────────────────────────────────
  const { data: perfil } = await supabaseAdmin
    .from('usuarios')
    .select('centro_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!perfil?.centro_id) return json({ error: 'no_centro' }, 400);
  const centroId = perfil.centro_id;

  // ── 3. Obtener credenciales MP del centro ────────────────────────────────
  const { data: centro } = await supabaseAdmin
    .from('centros')
    .select('mp_access_token, mp_user_id, mp_fee_pct, nombre')
    .eq('id', centroId)
    .single();

  // ── 4. Parsear body ──────────────────────────────────────────────────────
  let body: { turno_id?: string; monto?: number; descripcion?: string; back_url_base?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const { turno_id, monto, descripcion, back_url_base } = body;
  if (!monto || monto <= 0) return json({ error: 'monto_invalido' }, 400);

  // Resolver token: profesional del turno primero, fallback al centro
  let accessToken = centro?.mp_access_token ?? null;

  if (turno_id) {
    const { data: turno } = await supabaseAdmin
      .from('turnos')
      .select('profesional_id')
      .eq('id', turno_id)
      .single();
    if (turno?.profesional_id) {
      const { data: prof } = await supabaseAdmin
        .from('profesionales')
        .select('mp_access_token')
        .eq('id', turno.profesional_id)
        .single();
      if (prof?.mp_access_token) accessToken = prof.mp_access_token;
    }
  }

  if (!accessToken) {
    return json({ error: 'mp_not_configured', message: 'El profesional o centro no tiene Mercado Pago configurado.' }, 400);
  }

  const feePct       = centro?.mp_fee_pct ?? 3.0;
  const marketplaceFee = Math.round(monto * (feePct / 100) * 100) / 100;

  const backBase = back_url_base ?? 'https://vitalis.app';

  // ── 5. Crear Preference en MP con el token del CENTRO ───────────────────
  const preferencePayload = {
    items: [{
      id:          turno_id ?? 'turno',
      title:       descripcion ?? `Turno en ${centro.nombre}`,
      quantity:    1,
      unit_price:  monto,
      currency_id: 'ARS',
    }],
    marketplace_fee: marketplaceFee,
    // Metadata que vamos a leer en el webhook
    metadata: {
      centro_id:  centroId,
      turno_id:   turno_id ?? null,
      vitalis_fee: marketplaceFee,
    },
    back_urls: {
      success: `${backBase}/pago/success?turno=${turno_id}`,
      failure: `${backBase}/pago/failure?turno=${turno_id}`,
      pending: `${backBase}/pago/pending?turno=${turno_id}`,
    },
    auto_return: 'approved',
    // URL pública de nuestro webhook (la Edge Function mp-webhook)
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
    console.error('MP create preference error:', mpErr);
    return json({ error: 'mp_error', detail: mpErr }, 502);
  }

  const preference = await mpRes.json();

  // ── 6. Registrar pago en estado pending ─────────────────────────────────
  await supabaseAdmin.from('mp_pagos').insert({
    centro_id:     centroId,
    turno_id:      turno_id ?? null,
    preference_id: preference.id,
    estado:        'pending',
    monto_total:   monto,
    monto_vitalis: marketplaceFee,
    monto_centro:  monto - marketplaceFee,
    metadata: { descripcion },
  });

  return json({
    preference_id:  preference.id,
    checkout_url:   preference.init_point,        // URL producción
    checkout_url_sandbox: preference.sandbox_init_point, // URL sandbox para testing
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
