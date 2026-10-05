-- Profesiones sugeridas por centros, pendientes de aprobación del superadmin
ALTER TABLE profesiones
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo', 'pendiente', 'rechazado')),
  ADD COLUMN IF NOT EXISTS centro_id_sugerido UUID REFERENCES centros(id) ON DELETE SET NULL;

-- Las profesiones existentes quedan activas
UPDATE profesiones SET estado = 'activo' WHERE estado IS NULL OR estado = '';
