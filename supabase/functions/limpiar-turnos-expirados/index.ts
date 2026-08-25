/**
 * limpiar-turnos-expirados — Elimina turnos pendiente_pago cuyo plazo venció.
 * Se invoca como cron cada 5 minutos desde Supabase Scheduled Functions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async () => {
  // Cambiar estado a 'cancelado' en lugar de eliminar para preservar historial
  const { error, count } = await supabase
    .from('turnos')
    .update({ estado: 'cancelado', motivo_cancelacion: 'Expirado por falta de pago' }, { count: 'exact' })
    .eq('estado', 'pendiente_pago')
    .not('pago_expira_at', 'is', null)
    .lt('pago_expira_at', new Date().toISOString());

  if (error) {
    console.error('Error limpiando turnos:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`Turnos expirados cancelados: ${count}`);
  return new Response(JSON.stringify({ cancelados: count }), { status: 200 });
});
