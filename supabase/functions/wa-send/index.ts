const EVOLUTION_URL  = Deno.env.get('EVOLUTION_URL')  ?? 'http://72.61.58.46:8080';
const EVOLUTION_INST = Deno.env.get('EVOLUTION_INSTANCE') ?? 'Secretaria_Vitalis';
const EVOLUTION_KEY  = Deno.env.get('EVOLUTION_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  const { number, text } = await req.json();
  if (!number || !text) return new Response('missing number or text', { status: 400, headers: cors });

  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INST}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({ number, text }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
