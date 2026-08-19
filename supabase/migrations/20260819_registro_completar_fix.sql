-- Fix: tabla registros_pendientes y columnas facturacion_* en centros

-- 1. Crear tabla registros_pendientes si no existe
CREATE TABLE IF NOT EXISTS registros_pendientes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datos        jsonb        NOT NULL,
  estado       text         NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','completado','fallido')),
  completado_at timestamptz,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- RLS: solo service_role puede acceder
ALTER TABLE registros_pendientes ENABLE ROW LEVEL SECURITY;

-- 2. Agregar columnas de facturación y horarios a centros si no existen
ALTER TABLE centros
  ADD COLUMN IF NOT EXISTS facturacion_nombre           text,
  ADD COLUMN IF NOT EXISTS facturacion_apellido         text,
  ADD COLUMN IF NOT EXISTS facturacion_dni              text,
  ADD COLUMN IF NOT EXISTS facturacion_cuit             text,
  ADD COLUMN IF NOT EXISTS facturacion_categoria_fiscal text,
  ADD COLUMN IF NOT EXISTS facturacion_provincia        text,
  ADD COLUMN IF NOT EXISTS facturacion_ciudad           text,
  ADD COLUMN IF NOT EXISTS facturacion_direccion        text,
  ADD COLUMN IF NOT EXISTS horarios                     text;
