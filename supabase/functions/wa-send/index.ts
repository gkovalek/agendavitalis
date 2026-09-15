import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const YCLOUD_API_KEY = Deno.env.get('YCLOUD_API_KEY');
  const YCLOUD_FROM = Deno.env.get('YCLOUD_FROM'); // número del negocio en E.164

  if (!YCLOUD_API_KEY || !YCLOUD_FROM) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_env_vars' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => null);
  const { number, text } = body ?? {};

  if (!number || !text) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_fields', required: ['number', 'text'] }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': YCLOUD_API_KEY },
    body: JSON.stringify({ from: YCLOUD_FROM, to: number, type: 'text', text: { body: text } }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return new Response(JSON.stringify({ ok: false, error: 'evolution_error', detail: err }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
