/**
 * mp-oauth — Intercambia el código OAuth de MP por tokens del centro.
 *
 * Por qué Edge Function y no frontend:
 *   El intercambio requiere MP_APP_SECRET que jamás puede exponerse al browser.
 *   Esta función actúa como proxy seguro: recibe el código del frontend
 *   (que lo obtuvo de la URL post-redirect), llama a MP con el secreto,
 *   y guarda el access_token del centro directamente en la DB.
 *
 * Body esperado: { code: string }
 * Devuelve:      { ok: true, mp_user_id: string } | { error: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_APP_ID        = Deno.env.get('MP_APP_ID')!;
const MP_APP_SECRET    = Deno.env.get('MP_APP_SECRET')!;   // nunca va al frontend
const APP_URL          = Deno.env.get('APP_URL')!;          // ej: https://vitalis.app

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── 1. Autenticar usuario ────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const supabaseUser  = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return json({ error: 'unauthorized' }, 401);

  // ── 2. Obtener centro_id ─────────────────────────────────────────────────
  const { data: perfil } = await supabaseAdmin
    .from('usuarios')
    .select('centro_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!perfil?.centro_id) return json({ error: 'no_centro' }, 400);

  // ── 3. Parsear body ──────────────────────────────────────────────────────
  let body: { code?: string; profesional_id?: string; redirect_uri?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!body.code) return json({ error: 'missing_code' }, 400);

  const redirectUri = body.redirect_uri ?? `${APP_URL}/configuracion`;

  // ── 4. Intercambiar código por tokens con MP ─────────────────────────────
  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     MP_APP_ID,
      client_secret: MP_APP_SECRET,
      code:          body.code,
      grant_type:    'authorization_code',
      redirect_uri:  redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    console.error('MP OAuth error:', err);
    return json({ error: 'mp_oauth_failed', detail: err }, 502);
  }

  const tokens = await tokenRes.json();
  // tokens: { access_token, public_key, user_id, token_type, scope, expiration }

  // ── 5. Obtener public_key del centro via MP API ──────────────────────────
  // MP devuelve public_key en el response de oauth directamente
  const mpUserId    = String(tokens.user_id);
  const accessToken = tokens.access_token as string;
  const publicKey   = tokens.public_key   as string | undefined;

  // ── 6. Guardar en profesional o en centro (fallback) ────────────────────
  const refreshToken = tokens.refresh_token as string | undefined;

  if (body.profesional_id) {
    // Modelo 1 cuenta por profesional
    const { error: updateErr } = await supabaseAdmin
      .from('profesionales')
      .update({
        mp_access_token:  accessToken,
        mp_public_key:    publicKey ?? null,
        mp_user_id:       mpUserId,
        mp_refresh_token: refreshToken ?? null,
      })
      .eq('id', body.profesional_id)
      .eq('centro_id', perfil.centro_id);

    if (updateErr) {
      console.error('DB update profesional error:', updateErr);
      return json({ error: 'db_error' }, 500);
    }
  } else {
    // Fallback: guardar en centro (1 cuenta por centro)
    const { error: updateErr } = await supabaseAdmin
      .from('centros')
      .update({
        mp_access_token: accessToken,
        mp_public_key:   publicKey ?? null,
        mp_user_id:      mpUserId,
      })
      .eq('id', perfil.centro_id);

    if (updateErr) {
      console.error('DB update centro error:', updateErr);
      return json({ error: 'db_error' }, 500);
    }
  }

  return json({ ok: true, mp_user_id: mpUserId });
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
