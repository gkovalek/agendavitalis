-- Cobro anticipado por servicio/profesional
ALTER TABLE profesional_centro_servicio
  ADD COLUMN IF NOT EXISTS cobro_anticipado TEXT NOT NULL DEFAULT 'ninguno';

-- Timestamp de expiración para turnos pendiente_pago
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS pago_expira_at TIMESTAMPTZ;

-- pg_cron: liberar slots de turnos que no pagaron en 30 minutos
-- Requiere que pg_cron esté habilitado en el proyecto Supabase
SELECT cron.schedule(
  'limpiar-turnos-pendiente-pago',
  '*/5 * * * *',
  $$
    DELETE FROM turnos
    WHERE estado = 'pendiente_pago'
      AND pago_expira_at IS NOT NULL
      AND pago_expira_at < NOW();
  $$
);
