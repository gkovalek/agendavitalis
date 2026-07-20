-- ═══════════════════════════════════════════════════════════════
-- Mercado Pago Marketplace Integration
-- ═══════════════════════════════════════════════════════════════

-- 1. Credenciales MP por centro (en centros table)
ALTER TABLE centros
  ADD COLUMN IF NOT EXISTS mp_access_token  text,   -- token del centro, encriptado vía Vault idealmente
  ADD COLUMN IF NOT EXISTS mp_public_key    text,
  ADD COLUMN IF NOT EXISTS mp_user_id       text,   -- collector ID numérico de su cuenta MP
  ADD COLUMN IF NOT EXISTS mp_fee_pct       numeric DEFAULT 3.0;  -- % de comisión Vitalis

-- 2. Tabla de pagos MP
CREATE TABLE IF NOT EXISTS mp_pagos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id         uuid NOT NULL REFERENCES centros(id),
  turno_id          uuid REFERENCES turnos(id),
  preference_id     text,                  -- ID de la preference creada
  payment_id        text UNIQUE,           -- ID del pago efectivo (de MP)
  estado            text NOT NULL DEFAULT 'pending'
                      CHECK (estado IN ('pending','approved','rejected','refunded','cancelled')),
  monto_total       numeric NOT NULL DEFAULT 0,
  monto_vitalis     numeric NOT NULL DEFAULT 0,   -- comisión cobrada
  monto_centro      numeric NOT NULL DEFAULT 0,   -- lo que recibe el centro
  mp_status         text,                  -- status raw de MP (approved, rejected, etc.)
  mp_status_detail  text,                  -- detalle (accredited, cc_rejected_bad_filled_date, etc.)
  metadata          jsonb DEFAULT '{}',    -- datos extra (nombre paciente, servicio, etc.)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Índices para el webhook handler (busca por payment_id y por centro)
CREATE INDEX IF NOT EXISTS mp_pagos_payment_id_idx  ON mp_pagos(payment_id);
CREATE INDEX IF NOT EXISTS mp_pagos_centro_id_idx   ON mp_pagos(centro_id);
CREATE INDEX IF NOT EXISTS mp_pagos_turno_id_idx    ON mp_pagos(turno_id);
CREATE INDEX IF NOT EXISTS mp_pagos_preference_id_idx ON mp_pagos(preference_id);

-- RLS
ALTER TABLE mp_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centro_ve_sus_pagos" ON mp_pagos
  FOR ALL USING (
    centro_id IN (
      SELECT centro_id FROM perfiles WHERE id = auth.uid()
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS mp_pagos_updated_at ON mp_pagos;
CREATE TRIGGER mp_pagos_updated_at
  BEFORE UPDATE ON mp_pagos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
