-- Billing: estado de suscripción por centro

ALTER TABLE centros
  ADD COLUMN IF NOT EXISTS suscripcion_estado text NOT NULL DEFAULT 'trial'
    CHECK (suscripcion_estado IN ('trial', 'activo', 'vencido', 'suspendido')),
  ADD COLUMN IF NOT EXISTS suscripcion_vence  timestamptz,
  ADD COLUMN IF NOT EXISTS billing_email      text;

-- Centros existentes que no tienen trial_hasta → trial por 7 días desde hoy
UPDATE centros
  SET trial_hasta = now() + INTERVAL '7 days'
  WHERE trial_hasta IS NULL;

-- Vista útil para el superadmin: centros con su estado de billing
CREATE OR REPLACE VIEW v_billing_centros AS
SELECT
  c.id,
  c.nombre,
  c.plan,
  c.suscripcion_estado,
  c.suscripcion_vence,
  c.trial_hasta,
  c.billing_email,
  c.activo,
  c.created_at
FROM centros c
ORDER BY c.created_at DESC;
