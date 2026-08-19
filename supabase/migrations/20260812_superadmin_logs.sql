-- ═══════════════════════════════════════════════════════════════
-- SuperAdmin: tablas de observabilidad
-- ═══════════════════════════════════════════════════════════════

-- 1. Uso de tokens IA por centro
CREATE TABLE IF NOT EXISTS ia_uso_tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id        uuid NOT NULL REFERENCES centros(id),
  funcion          text NOT NULL DEFAULT 'wa-asistente',
  conversacion_id  uuid,
  modelo           text,
  input_tokens     int  NOT NULL DEFAULT 0,
  output_tokens    int  NOT NULL DEFAULT 0,
  total_tokens     int  GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  costo_usd        numeric(10,6) DEFAULT 0,
  fecha            date,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ia_uso_tokens_centro_idx   ON ia_uso_tokens(centro_id);
CREATE INDEX IF NOT EXISTS ia_uso_tokens_created_idx  ON ia_uso_tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS ia_uso_tokens_fecha_idx    ON ia_uso_tokens(fecha DESC);

ALTER TABLE ia_uso_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_ia" ON ia_uso_tokens USING (true) WITH CHECK (true);

-- 2. Logs de errores de edge functions
CREATE TABLE IF NOT EXISTS error_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id   uuid REFERENCES centros(id),
  funcion     text NOT NULL,
  nivel       text NOT NULL DEFAULT 'error' CHECK (nivel IN ('warn','error','critical')),
  mensaje     text NOT NULL,
  detalle     jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_logs_created_idx  ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_centro_idx   ON error_logs(centro_id);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_errors" ON error_logs USING (true) WITH CHECK (true);
