-- ============================================================
-- MIGRACIÓN: Modelo unificado de horarios por día
-- Reemplaza: profesionales_dias_config, profesionales_servicios_config
-- Extiende: profesional_centro_servicio (PCS)
-- Nueva tabla: pcs_horario_dia
-- ============================================================

-- ------------------------------------------------------------
-- 1. LIMPIAR tablas reemplazadas por el nuevo modelo
-- ------------------------------------------------------------
DROP TABLE IF EXISTS profesionales_dias_config;
DROP TABLE IF EXISTS profesionales_servicios_config;

-- Eliminar columnas redundantes de profesionales
ALTER TABLE profesionales
  DROP COLUMN IF EXISTS precio_particular,
  DROP COLUMN IF EXISTS acepta_particular;

-- Eliminar costo_base y requiere_os de servicios
-- (el precio real y la lógica OS van a pcs_horario_dia y profesionales_os)
ALTER TABLE servicios
  DROP COLUMN IF EXISTS costo_base,
  DROP COLUMN IF EXISTS requiere_os;

-- ------------------------------------------------------------
-- 2. SIMPLIFICAR profesional_centro_servicio
-- Eliminar columna nombre (redundante, el nombre viene de servicios)
-- Mantener: id, centro_id, profesional_id, equipo_id, servicio_id,
--           agenda_id, capacidad_simultanea, activo, created_at
-- dias_trabajo y hora_inicio/fin quedan temporalmente para no romper
-- código existente — se deprecan después de migrar datos
-- ------------------------------------------------------------
ALTER TABLE profesional_centro_servicio
  DROP COLUMN IF EXISTS nombre;

-- ------------------------------------------------------------
-- 3. NUEVA TABLA: pcs_horario_dia
-- Una fila por cada franja horaria de un día para una asignación PCS
-- Permite múltiples franjas el mismo día (8-10 y 17-20)
-- Permite configurar OS y precio por día
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pcs_horario_dia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centro_id       uuid NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  pcs_id          uuid NOT NULL REFERENCES profesional_centro_servicio(id) ON DELETE CASCADE,
  dia_semana      smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio     time NOT NULL,
  hora_fin        time NOT NULL,
  acepta_os       boolean NOT NULL DEFAULT true,
  precio_particular numeric(10,2),
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hora_fin_mayor CHECK (hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_pcs_horario_dia_pcs_id
  ON pcs_horario_dia (pcs_id);

CREATE INDEX IF NOT EXISTS idx_pcs_horario_dia_centro_dia
  ON pcs_horario_dia (centro_id, dia_semana);

-- ------------------------------------------------------------
-- 4. MIGRAR datos existentes de PCS → pcs_horario_dia
-- Expande cada registro PCS (con array dias_trabajo) en filas individuales
-- ------------------------------------------------------------
INSERT INTO pcs_horario_dia (
  centro_id, pcs_id, dia_semana, hora_inicio, hora_fin, acepta_os, activo
)
SELECT
  p.centro_id,
  p.id AS pcs_id,
  CASE d.dia
    WHEN 'domingo'   THEN 0
    WHEN 'lunes'     THEN 1
    WHEN 'martes'    THEN 2
    WHEN 'miercoles' THEN 3
    WHEN 'jueves'    THEN 4
    WHEN 'viernes'   THEN 5
    WHEN 'sabado'    THEN 6
  END AS dia_semana,
  p.hora_inicio,
  p.hora_fin,
  true AS acepta_os,
  COALESCE(p.activo, true) AS activo
FROM profesional_centro_servicio p
CROSS JOIN unnest(p.dias_trabajo) AS d(dia)
WHERE p.profesional_id IS NOT NULL
  AND p.servicio_id IS NOT NULL
  AND p.dias_trabajo IS NOT NULL
  AND array_length(p.dias_trabajo, 1) > 0
  AND p.hora_inicio IS NOT NULL
  AND p.hora_fin IS NOT NULL;

-- ------------------------------------------------------------
-- 5. RLS para pcs_horario_dia
-- ------------------------------------------------------------
ALTER TABLE pcs_horario_dia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "centro_own_pcs_horario_dia"
  ON pcs_horario_dia FOR ALL
  USING (centro_id = get_centro_id_usuario());

-- ------------------------------------------------------------
-- 6. updated_at trigger
-- ------------------------------------------------------------
CREATE TRIGGER trg_pcs_horario_dia_updated_at
  BEFORE UPDATE ON pcs_horario_dia
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 7. VISTA ÚTIL: servicio_horario_completo
-- Une todo para consultas del bot y del frontend
-- profesional + servicio + día + horario + OS config
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW servicio_horario_completo AS
SELECT
  phd.id                    AS horario_id,
  phd.pcs_id,
  phd.dia_semana,
  phd.hora_inicio,
  phd.hora_fin,
  phd.acepta_os,
  phd.precio_particular,
  phd.activo                AS horario_activo,
  pcs.centro_id,
  pcs.profesional_id,
  pcs.servicio_id,
  pcs.capacidad_simultanea,
  p.nombre                  AS prof_nombre,
  p.apellido                AS prof_apellido,
  s.nombre                  AS servicio_nombre,
  s.duracion_minutos,
  s.es_tratamiento,
  s.sesiones_por_bloque,
  s.agenda_id
FROM pcs_horario_dia phd
JOIN profesional_centro_servicio pcs ON pcs.id = phd.pcs_id
JOIN profesionales p ON p.id = pcs.profesional_id
JOIN servicios s ON s.id = pcs.servicio_id
WHERE pcs.activo = true
  AND phd.activo = true;
