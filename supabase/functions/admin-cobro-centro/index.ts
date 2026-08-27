import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPERADMIN_EMAIL = 'gkovalek@hotmail.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Guard: solo el superadmin puede usar esta función
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user || user.email !== SUPERADMIN_EMAIL) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, centro_id } = body;
    const MP_TOKEN = Deno.env.get('MP_VITALIS_ACCESS_TOKEN')!;

    // ── Crear preapproval ────────────────────────────────────────────────────
    if (action === 'crear_preapproval') {
      const { centro_nombre, plan, monto, payer_email } = body;

      const mpBody = {
        reason: `Vitalis - Plan ${plan} - ${centro_nombre}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: monto,
          currency_id: 'ARS',
        },
        back_url: 'https://agendavitalis.app/admin',
        payer_email: payer_email || undefined,
        status: 'pending',
      };

      const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mpBody),
      });

      const mpData = await mpRes.json();

      if (!mpRes.ok) {
        return new Response(JSON.stringify({ ok: false, error: mpData?.message ?? 'MP error' }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      // Guardar preapproval_id y status en centros
      await supabase
        .from('centros')
        .update({
          mp_preapproval_id: mpData.id,
          mp_preapproval_status: mpData.status,
        })
        .eq('id', centro_id);

      return new Response(JSON.stringify({ ok: true, init_point: mpData.init_point, id: mpData.id, status: mpData.status }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Consultar preapproval ────────────────────────────────────────────────
    if (action === 'consultar_preapproval') {
      const { data: centro } = await supabase
        .from('centros')
        .select('mp_preapproval_id')
        .eq('id', centro_id)
        .single();

      if (!centro?.mp_preapproval_id) {
        return new Response(JSON.stringify({ ok: false, error: 'no_preapproval' }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${centro.mp_preapproval_id}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` },
      });

      const mpData = await mpRes.json();

      if (!mpRes.ok) {
        return new Response(JSON.stringify({ ok: false, error: mpData?.message ?? 'MP error' }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      // Actualizar status en centros
      await supabase
        .from('centros')
        .update({ mp_preapproval_status: mpData.status })
        .eq('id', centro_id);

      return new Response(JSON.stringify({ ok: true, status: mpData.status, data: mpData }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: 'unknown_action' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
