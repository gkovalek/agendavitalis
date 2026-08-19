import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { registroData, amount, planLabel, origin } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Guardar datos pendientes
    const { data: pendiente, error: pendErr } = await supabase
      .from('registros_pendientes')
      .insert({ datos: registroData, estado: 'pendiente' })
      .select('id')
      .single();

    if (pendErr) throw new Error(pendErr.message);

    const id = pendiente.id as string;

    // Crear preferencia MP
    const mpToken = Deno.env.get('MP_VITALIS_ACCESS_TOKEN');
    if (!mpToken) throw new Error('MP_VITALIS_ACCESS_TOKEN no configurado');

    const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpToken}`,
      },
      body: JSON.stringify({
        items: [{
          title: `Vitalis — Plan ${planLabel}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: amount,
        }],
        back_urls: {
          success: `${origin}/pago/success?tipo=registro&rid=${id}`,
          failure: `${origin}/pago/failure?tipo=registro&rid=${id}`,
          pending: `${origin}/pago/pending?tipo=registro&rid=${id}`,
        },
        auto_return: 'approved',
        external_reference: id,
      }),
    });

    const pref = await prefRes.json();
    if (!pref.init_point) throw new Error(pref.message ?? 'Error al crear preferencia MP');

    return new Response(
      JSON.stringify({ checkout_url: pref.init_point, registro_id: id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
