/**
 * registro-centro — Auto-registro de nuevos centros de salud en Vitalis.
 *
 * Crea en una transacción lógica:
 *   1. Auth user (Supabase Auth)
 *   2. Registro en tabla `centros` con plan elegido y trial de 7 días
 *   3. Registro en tabla `usuarios` como admin del centro
 *
 * Body: { nombre_centro, nombre_admin, email, password, plan }
 * Devuelve: { ok: true } | { error: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: {
    nombre_centro?: string;
    nombre_admin?: string;
    email?: string;
    password?: string;
    plan?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const { nombre_centro, nombre_admin, email, password, plan } = body;

  if (!nombre_centro?.trim() || !nombre_admin?.trim() || !email?.trim() || !password || !plan) {
    return json({ error: 'missing_fields' }, 400);
  }

  const planesValidos = ['basico', 'intermedio', 'premium'];
  if (!planesValidos.includes(plan)) return json({ error: 'plan_invalido' }, 400);

  if (password.length < 8) return json({ error: 'password_too_short' }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  // 1. Verificar que el email no esté ya registrado
  const { data: existing } = await admin.auth.admin.listUsers();
  const emailTaken = existing?.users?.some(u => u.email === email.trim().toLowerCase());
  if (emailTaken) return json({ error: 'email_already_exists' }, 409);

  // 2. Crear auth user
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    console.error('Auth create error:', authErr);
    return json({ error: 'auth_error', detail: authErr?.message }, 500);
  }
  const authUserId = authData.user.id;

  // 3. Buscar rol admin
  const { data: rolData } = await admin
    .from('roles')
    .select('id')
    .eq('nombre', 'admin')
    .single();

  if (!rolData?.id) {
    await admin.auth.admin.deleteUser(authUserId);
    return json({ error: 'rol_admin_not_found' }, 500);
  }

  // 4. Crear centro con trial de 7 días
  const trialHasta = new Date();
  trialHasta.setDate(trialHasta.getDate() + 7);

  const { data: centroData, error: centroErr } = await admin
    .from('centros')
    .insert({
      nombre: nombre_centro.trim(),
      plan,
      trial_hasta: trialHasta.toISOString(),
      activo: true,
    })
    .select('id')
    .single();

  if (centroErr || !centroData?.id) {
    console.error('Centro create error:', centroErr);
    await admin.auth.admin.deleteUser(authUserId);
    return json({ error: 'centro_error', detail: centroErr?.message }, 500);
  }
  const centroId = centroData.id;

  // 5. Crear usuario admin del centro
  const [primerNombre, ...resto] = nombre_admin.trim().split(' ');
  const apellido = resto.join(' ') || '';

  const { error: usuarioErr } = await admin
    .from('usuarios')
    .insert({
      auth_user_id: authUserId,
      centro_id:    centroId,
      rol_id:       rolData.id,
      nombre:       primerNombre,
      apellido:     apellido || null,
      mail:         email.trim().toLowerCase(),
      activo:       true,
    });

  if (usuarioErr) {
    console.error('Usuario create error:', usuarioErr);
    await admin.from('centros').delete().eq('id', centroId);
    await admin.auth.admin.deleteUser(authUserId);
    return json({ error: 'usuario_error', detail: usuarioErr?.message }, 500);
  }

  // Disparar email de bienvenida via n8n (fire-and-forget)
  fetch('https://n8n.srv1152912.hstgr.cloud/webhook/email-bienvenida', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre_centro,
      nombre_admin: nombre_admin.trim(),
      email:        email.trim().toLowerCase(),
      plan,
    }),
  }).catch(() => {}); // no interrumpir si n8n no responde

  return json({ ok: true });
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
