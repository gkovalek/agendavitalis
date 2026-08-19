-- Auto-registro: columnas de trial y estado de suscripción en centros

ALTER TABLE centros
  ADD COLUMN IF NOT EXISTS trial_hasta  timestamptz,
  ADD COLUMN IF NOT EXISTS activo       boolean NOT NULL DEFAULT true;
