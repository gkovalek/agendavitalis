-- FAQ por profesional
CREATE TABLE IF NOT EXISTS faq_profesional (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id uuid NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  pregunta       text NOT NULL,
  respuesta      text NOT NULL,
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faq_profesional_prof_idx ON faq_profesional(profesional_id);

ALTER TABLE faq_profesional ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_faq_prof" ON faq_profesional USING (true) WITH CHECK (true);

-- FAQ por servicio
CREATE TABLE IF NOT EXISTS faq_servicio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  pregunta    text NOT NULL,
  respuesta   text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faq_servicio_serv_idx ON faq_servicio(servicio_id);

ALTER TABLE faq_servicio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_faq_serv" ON faq_servicio USING (true) WITH CHECK (true);
