-- ============================================================
-- Vitalis — Bug fixes (2026-07-28)
-- ============================================================

-- Bug 21: RLS policy en mp_pagos referenciaba tabla inexistente 'perfiles'
-- La tabla correcta es 'usuarios' (con columna auth_user_id)
DROP POLICY IF EXISTS "centro_ve_sus_pagos" ON mp_pagos;

CREATE POLICY "centro_ve_sus_pagos" ON mp_pagos
  FOR ALL
  USING (
    centro_id = (
      SELECT centro_id
      FROM   usuarios
      WHERE  auth_user_id = auth.uid()
        AND  activo = true
      LIMIT  1
    )
  );

-- Bug 11: Constraint UNIQUE en turno_id de caja_movimientos para evitar doble cobro
-- NOTA: si ya existen duplicados en la tabla, esta instrucción fallará;
--       en ese caso ejecutar primero: DELETE de duplicados.
ALTER TABLE caja_movimientos
  ADD CONSTRAINT IF NOT EXISTS uq_caja_movimientos_turno_id UNIQUE (turno_id);

-- Bug 22: Cron de limpieza de turnos pendiente_pago — agregar buffer de 10 segundos
-- para evitar cancelar turnos cuyo webhook de pago llega justo al vencer.
-- (requiere pg_cron habilitado en Supabase)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('limpiar_turnos_pendientes');
    PERFORM cron.schedule(
      'limpiar_turnos_pendientes',
      '*/5 * * * *',
      $$UPDATE turnos
          SET estado = 'cancelado'
        WHERE estado = 'pendiente_pago'
          AND pago_expira_at < NOW() - INTERVAL '10 seconds'$$
    );
  END IF;
END;
$$;

-- Bug 23: Función get_centro_id_usuario() idempotente
-- (evita error si la migración se ejecuta dos veces)
CREATE OR REPLACE FUNCTION get_centro_id_usuario()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT centro_id
  FROM   usuarios
  WHERE  auth_user_id = auth.uid()
    AND  activo = true
  LIMIT  1;
$$;
