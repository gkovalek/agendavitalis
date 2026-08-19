/**
 * mp-webhook — Endpoint público que Mercado Pago llama al procesarse un pago.
 *
 * Seguridad: verifica la firma HMAC-SHA256 que MP envía en el header x-signature.
 * Si la firma no coincide, rechaza el request con 401 — descarta cualquier
 * notificación que no venga realmente de MP.
 *
 * Idempotencia: UNIQUE en mp_pagos.payment_id + check de estado previo.
 * MP garantiza at-least-once delivery, puede enviar el mismo evento varias veces.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_PLATFORM_TOKEN = Deno.env.get('MP_PLATFORM_ACCESS_TOKEN')!;
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// ── Verificación de firma MP ─────────────────────────────────────────────────
// MP envía: x-signature: ts=<timestamp>,v1=<hmac>
// Manifest a firmar: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
async function verificarFirma(req: Request, dataId: string): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) return false;

  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id') ?? '';

  if (!xSignature) return false;

  // Extraer ts y v1 del header
  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.split('=') as [string, string])
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  // Construir el manifest exactamente como lo hace MP
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  // HMAC-SHA256
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const hex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

  return hex === v1;
}

Deno.serve(async (req: Request) => {
  // MP hace un GET inicial de verificación al configurar el webhook
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

  // ── 1. Verificar firma ───────────────────────────────────────────────────
  const firmaValida = await verificarFirma(req, paymentId);
  if (!firmaValida) {
    console.warn(`Firma inválida para payment ${paymentId}`);
    return new Response('unauthorized', { status: 401 });
  }

  // ── 2. Idempotencia: si ya está aprobado, no reprocesar ─────────────────
  const { data: existing } = await supabase
    .from('mp_pagos')
    .select('id, estado')
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (existing?.estado === 'approved') {
    return new Response('already_processed', { status: 200 });
  }

  // ── 3. Fetch detalles del pago desde MP API ──────────────────────────────
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_PLATFORM_TOKEN}` },
  });

  if (!mpRes.ok) {
    console.error(`MP API error: ${mpRes.status} for payment ${paymentId}`);
    // 200 para que MP no reintente — lo conciliamos manualmente si hace falta
    return new Response('mp_api_error', { status: 200 });
  }

  const payment = await mpRes.json();

  // ── 4. Extraer metadata que pusimos al crear la Preference ───────────────
  const centroId = payment.metadata?.centro_id as string | undefined;
  const turnoId  = payment.metadata?.turno_id  as string | undefined;

  if (!centroId) {
    console.error(`Payment ${paymentId} sin centro_id en metadata`);
    return new Response('no_centro_id', { status: 200 });
  }

  // ── 5. Calcular montos ───────────────────────────────────────────────────
  const montoTotal   = payment.transaction_amount ?? 0;
  const montoVitalis = payment.marketplace_fee    ?? 0;
  const montoCentro  = montoTotal - montoVitalis;
  const mpStatus       = payment.status as string;
  const mpStatusDetail = payment.status_detail as string;

  // ── 6. Upsert en mp_pagos ────────────────────────────────────────────────
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

  // ── 7. Efectos de negocio si el pago fue aprobado ───────────────────────
  if (mpStatus === 'approved' && turnoId) {
    await supabase.from('caja_movimientos').insert({
      centro_id:           centroId,
      turno_id:            turnoId,
      fecha:               new Date().toISOString().slice(0, 10),
      monto_efectivo:      0,
      monto_transferencia: montoCentro,
      monto_prepaga:       0,
    });

    // Actualiza si el turno está en 'pendiente_pago' o 'reservado'
    await supabase
      .from('turnos')
      .update({ estado: 'confirmado' })
      .eq('id', turnoId)
      .in('estado', ['pendiente_pago', 'reservado']);

    // Notificación WA al paciente + email de confirmación (fire-and-forget)
    try {
      const { data: turnoData } = await supabase
        .from('turnos')
        .select('fecha, hora_inicio, paciente:pacientes(nombre, apellido, mail, email, celular), profesional:profesionales(titulo, nombre, apellido), servicio:servicios(nombre), centro:centros(nombre)')
        .eq('id', turnoId)
        .maybeSingle();

      if (turnoData) {
        const pac      = turnoData.paciente as any;
        const prof     = turnoData.profesional as any;
        const nombreProf = [prof?.titulo, prof?.nombre, prof?.apellido].filter(Boolean).join(' ');
        const emailPaciente = pac?.mail || pac?.email;
        const celularPaciente = pac?.celular as string | undefined;

        // WhatsApp de confirmación al paciente
        if (celularPaciente) {
          const waMsg = `✅ *¡Turno confirmado!*\n\n📅 Fecha: ${turnoData.fecha}\n🕐 Hora: ${(turnoData.hora_inicio as string).slice(0, 5)}\n👨‍⚕️ Profesional: ${nombreProf}\n💼 Servicio: ${(turnoData.servicio as any)?.nombre ?? ''}\n\n¡Te esperamos!`;
          const evolutionUrl = Deno.env.get('EVOLUTION_URL') ?? 'http://72.61.58.46:8080';
          const evolutionInst = Deno.env.get('EVOLUTION_INSTANCE') ?? 'Secretaria_Vitalis';
          const evolutionKey = Deno.env.get('EVOLUTION_API_KEY') ?? '';
          fetch(`${evolutionUrl}/message/sendText/${evolutionInst}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
            body: JSON.stringify({ number: celularPaciente, text: waMsg }),
          }).catch(() => {});
        }

        // Email de confirmación via n8n
        if (emailPaciente) {
          fetch('https://n8n.srv1152912.hstgr.cloud/webhook/email-turno-confirmado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              turno_id:        turnoId,
              fecha:           turnoData.fecha,
              hora:            turnoData.hora_inicio,
              paciente_email:  emailPaciente,
              paciente_nombre: `${pac?.nombre ?? ''} ${pac?.apellido ?? ''}`.trim(),
              profesional:     nombreProf,
              servicio:        (turnoData.servicio as any)?.nombre ?? '',
              centro:          (turnoData.centro as any)?.nombre ?? '',
            }),
          }).catch(() => {});
        }
      }
    } catch { /* no interrumpir el flujo principal */ }
  }

  return new Response('ok', { status: 200 });
});
