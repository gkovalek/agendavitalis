-- ============================================================
-- SECRETARIA VIRTUAL VITALIS
-- Migración: tablas de aranceles, conversaciones WA y pedidos
-- ============================================================

-- ------------------------------------------------------------
-- 1. ARANCELES POR PROFESIONAL + OBRA SOCIAL
-- Qué OS acepta cada profesional, si cobra plus y cuánto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profesionales_os (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  profesional_id  uuid NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  os_id           uuid NOT NULL REFERENCES obras_sociales(id) ON DELETE CASCADE,
  cobra_plus      boolean NOT NULL DEFAULT false,
  monto_plus      numeric(10,2) NOT NULL DEFAULT 0,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profesional_id, os_id)
);

-- ------------------------------------------------------------
-- 2. CONFIGURACIÓN DE SERVICIOS POR PROFESIONAL
-- Si un servicio es solo particular, y su precio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profesionales_servicios_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  profesional_id  uuid NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  servicio_id     uuid NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  solo_particular boolean NOT NULL DEFAULT false,
  precio_particular numeric(10,2),
  precio_os_sin_plus numeric(10,2),
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profesional_id, servicio_id)
);

-- ------------------------------------------------------------
-- 3. EXCEPCIONES POR DÍA DE LA SEMANA
-- Ej: traumatólogo los miércoles solo atiende particular
-- dia_semana: 0=domingo, 1=lunes ... 6=sábado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profesionales_dias_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  profesional_id  uuid NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  dia_semana      smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  solo_particular boolean NOT NULL DEFAULT false,
  nota            text,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profesional_id, dia_semana)
);

-- ------------------------------------------------------------
-- 4. PRECIO PARTICULAR GENERAL POR PROFESIONAL
-- Fallback cuando no hay config específica de servicio
-- ------------------------------------------------------------
ALTER TABLE profesionales
  ADD COLUMN IF NOT EXISTS precio_particular  numeric(10,2),
  ADD COLUMN IF NOT EXISTS acepta_particular  boolean NOT NULL DEFAULT true;

-- ------------------------------------------------------------
-- 5. CONVERSACIONES WHATSAPP
-- Historial de cada conversación con un paciente
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversaciones_wa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  celular         text NOT NULL,
  paciente_id     uuid REFERENCES pacientes(id),
  historial       jsonb NOT NULL DEFAULT '[]',
  estado          text NOT NULL DEFAULT 'activa'
                  CHECK (estado IN ('activa', 'derivada', 'cerrada')),
  derivada_en     timestamptz,
  cerrada_en      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversaciones_wa_centro_celular
  ON conversaciones_wa (centro_id, celular);

CREATE INDEX IF NOT EXISTS idx_conversaciones_wa_estado
  ON conversaciones_wa (estado);

-- ------------------------------------------------------------
-- 6. LOG DE APRENDIZAJE
-- Captura respuestas del secretario humano para mejorar el bot
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aprendizaje_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id           uuid NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  conversacion_id     uuid REFERENCES conversaciones_wa(id),
  pregunta            text NOT NULL,
  respuesta_humana    text NOT NULL,
  categoria           text,
  usado_en_prompts    boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 7. PEDIDOS MÉDICOS RECIBIDOS POR WHATSAPP
-- fuente: url | pdf | imagen | manual
-- estado: pendiente | procesado | derivado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos_medicos_wa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  paciente_id     uuid REFERENCES pacientes(id),
  conversacion_id uuid REFERENCES conversaciones_wa(id),
  os              text,
  nro_afiliado    text,
  nro_orden       text,
  servicio        text,
  sesiones        int,
  medico          text,
  especialidad    text,
  diagnostico     text,
  fecha_orden     date,
  fuente          text NOT NULL DEFAULT 'manual'
                  CHECK (fuente IN ('url', 'pdf', 'imagen', 'manual')),
  url_original    text,
  raw_data        jsonb,
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'procesado', 'derivado')),
  nota_secretario text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 8. RLS — todas las tablas filtradas por centro_id
-- ------------------------------------------------------------
ALTER TABLE profesionales_os              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesionales_servicios_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesionales_dias_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones_wa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE aprendizaje_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_medicos_wa            ENABLE ROW LEVEL SECURITY;

-- Helper: obtiene centro_id del usuario autenticado
CREATE OR REPLACE FUNCTION get_centro_id_usuario()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT centro_id FROM usuarios
  WHERE auth_user_id = auth.uid() AND activo = true
  LIMIT 1;
$$;

-- Políticas
CREATE POLICY "centro_own_profesionales_os"
  ON profesionales_os FOR ALL
  USING (centro_id = get_centro_id_usuario());

CREATE POLICY "centro_own_profesionales_servicios_config"
  ON profesionales_servicios_config FOR ALL
  USING (centro_id = get_centro_id_usuario());

CREATE POLICY "centro_own_profesionales_dias_config"
  ON profesionales_dias_config FOR ALL
  USING (centro_id = get_centro_id_usuario());

CREATE POLICY "centro_own_conversaciones_wa"
  ON conversaciones_wa FOR ALL
  USING (centro_id = get_centro_id_usuario());

CREATE POLICY "centro_own_aprendizaje_log"
  ON aprendizaje_log FOR ALL
  USING (centro_id = get_centro_id_usuario());

CREATE POLICY "centro_own_pedidos_medicos_wa"
  ON pedidos_medicos_wa FOR ALL
  USING (centro_id = get_centro_id_usuario());

-- ------------------------------------------------------------
-- 9. updated_at automático
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profesionales_os_updated_at
  BEFORE UPDATE ON profesionales_os
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_profesionales_servicios_config_updated_at
  BEFORE UPDATE ON profesionales_servicios_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversaciones_wa_updated_at
  BEFORE UPDATE ON conversaciones_wa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pedidos_medicos_wa_updated_at
  BEFORE UPDATE ON pedidos_medicos_wa
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
