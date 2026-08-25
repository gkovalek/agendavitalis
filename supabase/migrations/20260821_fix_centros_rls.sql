-- Fix: política RLS de centros para acceso público (rol anon)
-- El portal público en /reservas/:slug usaba anon key pero la política
-- portal_centros_read no incluía el rol anon, causando error 406.

DROP POLICY IF EXISTS "portal_centros_read" ON centros;

CREATE POLICY "portal_centros_read" ON centros
FOR SELECT TO anon, authenticated
USING (true);

-- Verificar y agregar acceso anon a tablas relacionadas usadas por PortalPublico

-- profesionales: lectura pública (solo activos, filtrado en la query)
DROP POLICY IF EXISTS "portal_profesionales_read" ON profesionales;
CREATE POLICY "portal_profesionales_read" ON profesionales
FOR SELECT TO anon, authenticated
USING (true);

-- servicios: lectura pública (solo activos, filtrado en la query)
DROP POLICY IF EXISTS "portal_servicios_read" ON servicios;
CREATE POLICY "portal_servicios_read" ON servicios
FOR SELECT TO anon, authenticated
USING (true);

-- profesional_centro_servicio: lectura pública
DROP POLICY IF EXISTS "portal_pcs_read" ON profesional_centro_servicio;
CREATE POLICY "portal_pcs_read" ON profesional_centro_servicio
FOR SELECT TO anon, authenticated
USING (true);

-- agendas: lectura pública (para calcular capacidad de slots)
DROP POLICY IF EXISTS "portal_agendas_read" ON agendas;
CREATE POLICY "portal_agendas_read" ON agendas
FOR SELECT TO anon, authenticated
USING (true);

-- turnos: lectura pública limitada (para calcular slots disponibles)
-- La query filtra por centro_id, profesional_id, servicio_id, fecha
DROP POLICY IF EXISTS "portal_turnos_read" ON turnos;
CREATE POLICY "portal_turnos_read" ON turnos
FOR SELECT TO anon, authenticated
USING (true);

-- pcs_horario_dia: lectura pública (para calcular precio en cobro anticipado)
DROP POLICY IF EXISTS "portal_pcs_horario_dia_read" ON pcs_horario_dia;
CREATE POLICY "portal_pcs_horario_dia_read" ON pcs_horario_dia
FOR SELECT TO anon, authenticated
USING (true);
