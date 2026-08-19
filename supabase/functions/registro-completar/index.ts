import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAIL  = 'gkovalek@hotmail.com';
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL   = 'Vitalis <noreply@agendavitalis.app>';
const APP_URL      = 'https://agendavitalis.app';

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) { console.warn('RESEND_API_KEY no configurado — email omitido'); return; }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { registro_id, payment_id, success } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Obtener datos pendientes
    const { data: pendiente, error: pendErr } = await supabase
      .from('registros_pendientes')
      .select('*')
      .eq('id', registro_id)
      .single();

    if (pendErr || !pendiente) throw new Error('Registro no encontrado');

    // Pago fallido → solo notificar al admin
    if (!success) {
      const d = pendiente.datos;
      await sendEmail(
        ADMIN_EMAIL,
        `❌ Pago fallido — ${d.nombre} ${d.apellido}`,
        `<h2>Pago no procesado</h2>
         <p><b>Cliente:</b> ${d.nombre} ${d.apellido}</p>
         <p><b>Email:</b> ${d.email}</p>
         <p><b>Plan:</b> ${d.plan} × ${d.cantProf} prof</p>
         <p><b>Payment ID:</b> ${payment_id ?? 'N/A'}</p>`,
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Ya fue completado (idempotencia)
    if (pendiente.estado === 'completado') {
      return new Response(JSON.stringify({ ok: true, msg: 'already done' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const d = pendiente.datos;

    // Crear usuario en Supabase Auth (o recuperar si ya existe)
    let userId: string;
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: d.email,
      password: d.password,
      email_confirm: true,
    });
    if (authErr) {
      if (authErr.message.includes('already been registered')) {
        // Usuario ya existe — buscar su id
        const { data: listData } = await supabase.auth.admin.listUsers();
        const existing = listData?.users?.find((u: { email: string }) => u.email === d.email);
        if (!existing) throw new Error('Usuario ya existe pero no se pudo recuperar');
        userId = existing.id;
      } else {
        throw new Error(authErr.message);
      }
    } else {
      userId = authData.user.id;
    }

    // Crear centro
    const { data: centroData, error: centroErr } = await supabase
      .from('centros')
      .insert({
        nombre: d.nombreCentro,
        plan: d.plan,
        billing_email: d.email,
        suscripcion_estado: 'activo',
        facturacion_nombre: d.nombre,
        facturacion_apellido: d.apellido,
        facturacion_dni: d.dni,
        facturacion_cuit: d.cuit,
        facturacion_categoria_fiscal: d.catFiscal,
        facturacion_provincia: d.provincia,
        facturacion_ciudad: d.ciudad,
        facturacion_direccion: d.direccion,
        horarios: JSON.stringify(d.horarios),
      })
      .select('id')
      .single();

    if (centroErr) throw new Error(centroErr.message);
    const centroId = centroData.id as string;

    // Crear usuario en tabla usuarios (rol admin del centro)
    const { data: rolData } = await supabase
      .from('roles')
      .select('id')
      .eq('nombre', 'administrador')
      .maybeSingle();
    const rolId = rolData?.id ?? null;

    const { error: usuarioErr } = await supabase.from('usuarios').insert({
      auth_user_id: userId,
      centro_id: centroId,
      rol_id: rolId,
      nombre: `${d.nombre} ${d.apellido}`,
      mail: d.email,
      activo: true,
    });
    if (usuarioErr) throw new Error('Error creando usuario: ' + usuarioErr.message);

    // Insertar profesionales
    if (d.profesionales?.length > 0) {
      await supabase.from('profesionales').insert(
        d.profesionales.map((p: { nombre: string; apellido: string; titulo: string; email: string }) => ({
          centro_id: centroId, nombre: p.nombre, apellido: p.apellido, titulo: p.titulo || null, mail: p.email,
        })),
      );
    }

    // Insertar servicios
    if (d.servicios?.length > 0) {
      await supabase.from('servicios').insert(
        d.servicios.map((s: { nombre: string; duracion_minutos: number }) => ({
          centro_id: centroId, nombre: s.nombre, duracion_minutos: s.duracion_minutos, es_tratamiento: false, activo: true,
        })),
      );
    }

    // Marcar como completado
    await supabase.from('registros_pendientes').update({ estado: 'completado', completado_at: new Date().toISOString() }).eq('id', registro_id);

    // Emails
    await Promise.allSettled([
      sendEmail(
        d.email,
        '¡Bienvenido a Vitalis! Tu cuenta está lista',
        `<div style="font-family:sans-serif;max-width:500px;margin:auto">
          <h2 style="color:#00ADBB">¡Hola ${d.nombre}!</h2>
          <p>Tu pago fue procesado y tu cuenta en Vitalis ya está activa.</p>
          <p><b>Plan:</b> ${d.plan} · <b>Centro:</b> ${d.nombreCentro}</p>
          <p>Ingresá a la app y comenzá a configurar tu agenda:</p>
          <a href="${APP_URL}/login" style="display:inline-block;background:#00ADBB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px">Ingresar a Vitalis</a>
          <p style="color:#888;font-size:12px;margin-top:24px">Si tenés alguna consulta respondé este email.</p>
        </div>`,
      ),
      sendEmail(
        ADMIN_EMAIL,
        `✅ Nuevo alta: ${d.nombre} ${d.apellido} — Plan ${d.plan}`,
        `<h2>Nuevo cliente activo</h2>
         <p><b>Nombre:</b> ${d.nombre} ${d.apellido}</p>
         <p><b>Email:</b> ${d.email}</p>
         <p><b>CUIT:</b> ${d.cuit}</p>
         <p><b>Plan:</b> ${d.plan} × ${d.cantProf} profesional(es)</p>
         <p><b>Centro:</b> ${d.nombreCentro}</p>
         <p><b>Payment ID:</b> ${payment_id ?? 'N/A'}</p>`,
      ),
    ]);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('registro-completar error:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
