import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPERADMIN_EMAIL = 'gkovalek@hotmail.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return res(null, 204);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Verificar que el caller es el superadmin vía JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user || user.email !== SUPERADMIN_EMAIL) {
    return json({ error: 'forbidden' }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  const { action } = body;

  // ── Crear usuario ──────────────────────────────────────────────────────────
  if (action === 'crear') {
    const { nombre, apellido, mail, password, rol, centro_id } = body as {
      nombre?: string; apellido?: string; mail?: string;
      password?: string; rol?: string; centro_id?: string;
    };

    if (!nombre?.trim() || !mail?.trim() || !password || !rol || !centro_id) {
      return json({ error: 'missing_fields' }, 400);
    }
    if ((password as string).length < 6) return json({ error: 'password_too_short' }, 400);

    const rolesValidos = ['administrador', 'secretaria', 'profesional'];
    if (!rolesValidos.includes(rol)) return json({ error: 'rol_invalido' }, 400);

    // Verificar email no duplicado
    const { data: existing } = await admin.auth.admin.listUsers();
    if (existing?.users?.some(u => u.email === mail.trim().toLowerCase())) {
      return json({ error: 'email_already_exists' }, 409);
    }

    const { data: authData, error: authCreateErr } = await admin.auth.admin.createUser({
      email: mail.trim().toLowerCase(),
      password: password as string,
      email_confirm: true,
    });
    if (authCreateErr || !authData.user) {
      return json({ error: 'auth_error', detail: authCreateErr?.message }, 500);
    }
    const authUserId = authData.user.id;

    const { data: rolData } = await admin.from('roles').select('id').eq('nombre', rol).single();
    if (!rolData?.id) {
      await admin.auth.admin.deleteUser(authUserId);
      return json({ error: 'rol_not_found' }, 500);
    }

    const nombreCompleto = apellido?.trim() ? `${nombre.trim()} ${apellido.trim()}` : nombre.trim();

    const { error: usuarioErr } = await admin.from('usuarios').insert({
      auth_user_id: authUserId,
      centro_id,
      rol_id: rolData.id,
      nombre: nombreCompleto,
      mail: mail.trim().toLowerCase(),
      activo: true,
    });

    if (usuarioErr) {
      await admin.auth.admin.deleteUser(authUserId);
      return json({ error: 'usuario_error', detail: usuarioErr.message }, 500);
    }

    return json({ ok: true, auth_user_id: authUserId });
  }

  // ── Resetear contraseña ────────────────────────────────────────────────────
  if (action === 'resetear_pass') {
    const { auth_user_id, nueva_password } = body as { auth_user_id?: string; nueva_password?: string };
    if (!auth_user_id || !nueva_password) return json({ error: 'missing_fields' }, 400);
    if (nueva_password.length < 6) return json({ error: 'password_too_short' }, 400);

    const { error } = await admin.auth.admin.updateUserById(auth_user_id, { password: nueva_password });
    if (error) return json({ error: 'update_error', detail: error.message }, 500);
    return json({ ok: true });
  }

  // ── Desactivar usuario ─────────────────────────────────────────────────────
  if (action === 'desactivar') {
    const { auth_user_id, usuario_id } = body as { auth_user_id?: string; usuario_id?: string };
    if (!auth_user_id || !usuario_id) return json({ error: 'missing_fields' }, 400);

    const { error: banErr } = await admin.auth.admin.updateUserById(auth_user_id, {
      ban_duration: '876600h', // ~100 años
    });
    if (banErr) return json({ error: 'ban_error', detail: banErr.message }, 500);

    const { error: dbErr } = await admin.from('usuarios').update({ activo: false }).eq('id', usuario_id);
    if (dbErr) return json({ error: 'db_error', detail: dbErr.message }, 500);

    return json({ ok: true });
  }

  // ── Reactivar usuario ──────────────────────────────────────────────────────
  if (action === 'reactivar') {
    const { auth_user_id, usuario_id } = body as { auth_user_id?: string; usuario_id?: string };
    if (!auth_user_id || !usuario_id) return json({ error: 'missing_fields' }, 400);

    const { error: unbanErr } = await admin.auth.admin.updateUserById(auth_user_id, {
      ban_duration: 'none',
    });
    if (unbanErr) return json({ error: 'unban_error', detail: unbanErr.message }, 500);

    const { error: dbErr } = await admin.from('usuarios').update({ activo: true }).eq('id', usuario_id);
    if (dbErr) return json({ error: 'db_error', detail: dbErr.message }, 500);

    return json({ ok: true });
  }

  return json({ error: 'action_unknown' }, 400);
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function res(body: null, status: number) {
  return new Response(body, { status, headers: cors() });
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
