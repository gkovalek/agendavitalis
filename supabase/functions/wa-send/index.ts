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

  const EVOLUTION_URL = Deno.env.get('EVOLUTION_URL');
  const EVOLUTION_KEY = Deno.env.get('EVOLUTION_KEY');
  const EVOLUTION_INST = Deno.env.get('EVOLUTION_INSTANCE');

  if (!EVOLUTION_URL || !EVOLUTION_KEY || !EVOLUTION_INST) {
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

  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INST}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({ number, text }),
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
