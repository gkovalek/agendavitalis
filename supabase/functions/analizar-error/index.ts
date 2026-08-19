/**
 * analizar-error — Analiza un error de Edge Function usando Claude IA
 *
 * Recibe POST: { funcion: string, nivel: string, mensaje: string, centro_id?: string }
 * Retorna: { ok: true, causa: string, solucion: string } | { ok: false, error: string }
 */

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = await req.json() as { funcion: string; nivel: string; mensaje: string; centro_id?: string };
    const { funcion, nivel, mensaje } = body;

    if (!funcion || !nivel || !mensaje) {
      return Response.json({ ok: false, error: 'Faltan campos requeridos: funcion, nivel, mensaje' }, { status: 400 });
    }

    const prompt = `Eres un experto en Supabase Edge Functions (Deno). Analiza el siguiente error y responde en español.

Edge Function: ${funcion}
Nivel: ${nivel}
Mensaje de error: ${mensaje}

Responde con exactamente este formato JSON (sin markdown, sin código):
{
  "causa": "Explicación clara de la causa probable del error en 1-2 oraciones",
  "solucion": "Solución concreta y accionable en 1-2 oraciones"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ ok: false, error: `Error Anthropic API: ${response.status} — ${errText}` }, { status: 500 });
    }

    const aiData = await response.json() as { content: Array<{ type: string; text: string }> };
    const rawText = aiData.content.find((c) => c.type === 'text')?.text ?? '';

    let parsed: { causa: string; solucion: string };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Fallback: si no viene JSON puro, devolver el texto completo como causa
      return Response.json({ ok: true, causa: rawText, solucion: 'Ver causa para más detalles.' });
    }

    return Response.json(
      { ok: true, causa: parsed.causa ?? '', solucion: parsed.solucion ?? '' },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    );
  } catch (err: unknown) {
    return Response.json(
      { ok: false, error: String(err) },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } },
    );
  }
});
