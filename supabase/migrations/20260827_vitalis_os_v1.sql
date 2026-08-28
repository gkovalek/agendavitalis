-- =============================================================================
-- VITALIS OS v1 — Business Memory / Data Layer
-- Chairman-approved architecture: 2026-08-27
-- Attribution: CONTACT → RESPONSE → QUALIFIED_CONVERSATION → DEMO → PROPOSAL → CUSTOMER → MRR → REVENUE → GROSS_MARGIN → ROI
-- Primary metric: ROI = Revenue Generated / Cost of Acquisition
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. os_campaigns — Outreach campaigns (CEO approves at campaign level for v2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text NOT NULL,
  descripcion           text,
  estado                text DEFAULT 'active'
                          CHECK (estado IN ('draft','active','paused','completed','cancelled')),
  canal                 text DEFAULT 'whatsapp',
  audiencia_criterios   jsonb,
  mensaje_template      text,
  daily_limit           integer DEFAULT 5,
  monthly_limit         integer DEFAULT 60,
  budget_usd            numeric(10,2),
  cost_per_contact_usd  numeric(10,2) DEFAULT 0,
  -- Aggregate attribution (updated by Finance Agent weekly)
  total_contacts        integer DEFAULT 0,
  total_responses       integer DEFAULT 0,
  total_qualified       integer DEFAULT 0,
  total_demos           integer DEFAULT 0,
  total_proposals       integer DEFAULT 0,
  total_customers       integer DEFAULT 0,
  mrr_attributed        numeric(10,2) DEFAULT 0,
  revenue_attributed    numeric(10,2) DEFAULT 0,
  gross_margin_attributed numeric(10,2) DEFAULT 0,
  cost_total_usd        numeric(10,2) DEFAULT 0,
  cac_usd               numeric(10,2),   -- cost_total / total_customers
  roi                   numeric(6,2),    -- revenue_attributed / cost_total
  response_rate         numeric(5,4),    -- total_responses / total_contacts
  conversion_rate       numeric(5,4),    -- total_customers / total_contacts
  -- Approval chain
  approved_by           text,            -- 'chairman' | 'ceo'
  approved_at           timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. os_pipeline — Lead qualification and sales stage tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_pipeline (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text NOT NULL,
  empresa               text,
  telefono              text,
  email                 text,
  linkedin_url          text,
  fuente                text DEFAULT 'outreach_wa',
                        -- 'outreach_wa' | 'referral' | 'organic' | 'inbound' | 'evento'
  outreach_id           uuid,            -- FK set after os_outreach created (avoid circular)
  campaign_id           uuid REFERENCES os_campaigns(id),
  stage                 text DEFAULT 'lead'
                          CHECK (stage IN (
                            'lead','qualified','demo_scheduled','demo_done',
                            'proposal_sent','negotiation','won','lost','disqualified'
                          )),
  score                 integer DEFAULT 0 CHECK (score BETWEEN 0 AND 6),
  calificacion_criterios jsonb,
  notas                 text,
  proximo_paso          text,
  proximo_paso_fecha    date,
  -- Attribution (7 dimensions — Chairman requirement)
  channel               text DEFAULT 'whatsapp_outreach',
  agent                 text DEFAULT 'growth',
  first_contact_date    timestamptz,
  -- Financial attribution
  plan_estimado         text,            -- 'basico' | 'intermedio' | 'premium'
  mrr_potential_usd     numeric(10,2),
  mrr_attributed        numeric(10,2),
  revenue_attributed    numeric(10,2),
  gross_margin_attributed numeric(10,2),
  acquisition_cost_usd  numeric(10,2),
  roi                   numeric(6,2),
  -- Outcome
  won_at                timestamptz,
  lost_reason           text,
  centro_id             uuid,            -- set when won (FK to centros)
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. os_outreach — Complete outreach record with full attribution funnel
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_outreach (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           uuid REFERENCES os_campaigns(id),
  pipeline_id           uuid REFERENCES os_pipeline(id),
  -- Prospecto identity
  prospecto_nombre      text NOT NULL,
  prospecto_numero      text NOT NULL,   -- WA number, E.164
  prospecto_url         text,            -- LinkedIn / IG / source URL
  prospecto_tipo        text,            -- 'kinesiologia' | 'rehabilitacion' | etc.
  calificacion          jsonb,           -- result of 6 qualification criteria
  calificacion_score    integer CHECK (calificacion_score BETWEEN 0 AND 6),
  -- Outreach content
  mensaje               text NOT NULL,
  justificacion         text NOT NULL,   -- Growth's reasoning for proposing this contact
  -- CEO approval gate (v1 — per message)
  estado                text DEFAULT 'pending_ceo'
                          CHECK (estado IN (
                            'pending_ceo','approved','rejected',
                            'sent','delivered','responded',
                            'qualified_conversation','demo_scheduled',
                            'converted','dead'
                          )),
  ceo_decision          text CHECK (ceo_decision IN ('approved','rejected')),
  ceo_razon             text,            -- mandatory on rejection, for Growth learning
  ceo_decided_at        timestamptz,
  -- Execution (Evolution API)
  sent_at               timestamptz,
  delivery_status       text,            -- evolution delivery status
  message_id            text,            -- evolution message_id
  -- Response tracking
  response              text,
  response_at           timestamptz,
  response_class        text CHECK (response_class IN (
                          'interesado','no_interesado','invalido','no_response'
                        )),
  -- Attribution funnel stage (Chairman's 10-step funnel)
  funnel_stage          text DEFAULT 'contact'
                          CHECK (funnel_stage IN (
                            'contact','response','qualified_conversation',
                            'demo','proposal','customer'
                          )),
  funnel_stage_updated_at timestamptz DEFAULT now(),
  -- 7 attribution dimensions (Chairman requirement)
  channel               text DEFAULT 'whatsapp_outreach',
  agent                 text DEFAULT 'growth',
  contact_date          timestamptz DEFAULT now(),
  -- Financial attribution (populated as funnel progresses)
  acquisition_cost_usd  numeric(10,2),  -- campaign cost share for this contact
  mrr_attributed        numeric(10,2),  -- MRR of converted client
  revenue_attributed    numeric(10,2),  -- LTV estimate at conversion
  gross_margin_attributed numeric(10,2),
  roi                   numeric(6,2),   -- revenue_attributed / acquisition_cost_usd
  -- Conversion
  conversion            boolean DEFAULT false,
  conversion_at         timestamptz,
  centro_id             uuid,           -- FK to centros when converted
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- FK from pipeline to outreach (added after both tables exist)
ALTER TABLE os_pipeline
  ADD CONSTRAINT fk_pipeline_outreach
  FOREIGN KEY (outreach_id) REFERENCES os_outreach(id);

-- -----------------------------------------------------------------------------
-- 4. os_attribution — Immutable event log: every funnel transition with full attribution
--    This is the source of truth for ROI calculation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_attribution (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source references
  outreach_id           uuid REFERENCES os_outreach(id),
  pipeline_id           uuid REFERENCES os_pipeline(id),
  campaign_id           uuid REFERENCES os_campaigns(id),
  -- 7 attribution dimensions (Chairman requirement)
  contact_nombre        text,
  contact_numero        text,
  channel               text NOT NULL,
  agent                 text NOT NULL,
  event_date            timestamptz DEFAULT now(),
  cost_attributed_usd   numeric(10,2) DEFAULT 0,
  -- Funnel transition
  from_stage            text,           -- null for first event (contact)
  to_stage              text NOT NULL,  -- the new funnel stage
  -- Financial attribution at this stage
  mrr_usd               numeric(10,2) DEFAULT 0,
  revenue_usd           numeric(10,2) DEFAULT 0,  -- LTV estimate
  gross_margin_usd      numeric(10,2) DEFAULT 0,
  cac_usd               numeric(10,2) DEFAULT 0,
  roi                   numeric(6,2),  -- revenue_usd / cac_usd, when available
  -- Context
  notes                 text,
  created_at            timestamptz DEFAULT now()
  -- Note: os_attribution is append-only — no updates, no deletes
);

-- -----------------------------------------------------------------------------
-- 5. os_metrics — Daily business snapshots (Finance Agent writes every Sunday)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_metrics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date         date NOT NULL DEFAULT CURRENT_DATE,
  -- Business KPIs
  mrr_usd               numeric(10,2),
  clients_active        integer,
  clients_new           integer DEFAULT 0,
  clients_churned       integer DEFAULT 0,
  churn_rate            numeric(5,4),
  -- Pipeline
  leads_in_pipeline     integer DEFAULT 0,
  qualified_leads       integer DEFAULT 0,
  demos_scheduled       integer DEFAULT 0,
  proposals_sent        integer DEFAULT 0,
  -- Financials
  burn_rate_usd         numeric(10,2),
  marketing_spend_usd   numeric(10,2),
  os_cost_usd           numeric(10,2),
  -- Outreach attribution (ROI-first metrics — Chairman requirement)
  outreach_contacts     integer DEFAULT 0,
  outreach_responses    integer DEFAULT 0,
  outreach_qualified    integer DEFAULT 0,
  outreach_demos        integer DEFAULT 0,
  outreach_proposals    integer DEFAULT 0,
  outreach_customers    integer DEFAULT 0,
  outreach_mrr_attributed    numeric(10,2) DEFAULT 0,
  outreach_revenue_attributed numeric(10,2) DEFAULT 0,
  outreach_gross_margin numeric(10,2) DEFAULT 0,
  outreach_cost_usd     numeric(10,2) DEFAULT 0,
  outreach_cac_usd      numeric(10,2),   -- cost / customers
  outreach_roi          numeric(6,2),    -- revenue / cost (primary metric)
  outreach_response_rate numeric(5,4),
  outreach_conversion_rate numeric(5,4),
  -- Outreach v2 promotion criteria tracking
  v2_criteria_approval_rate  numeric(5,4),  -- CEO approval rate of Growth proposals
  v2_criteria_days_elapsed   integer,       -- days since all criteria first met simultaneously
  v2_eligible                boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  UNIQUE (snapshot_date)
);

-- -----------------------------------------------------------------------------
-- 6. os_tasks — CEO → Agent instruction queue
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_tasks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_destino        text NOT NULL CHECK (agente_destino IN ('growth','finance','ceo')),
  tipo                  text NOT NULL,
  instruccion           text NOT NULL,
  prioridad             integer DEFAULT 5 CHECK (prioridad BETWEEN 1 AND 10),
  estado                text DEFAULT 'pending'
                          CHECK (estado IN ('pending','in_progress','completed','cancelled')),
  resultado             text,
  outreach_id           uuid REFERENCES os_outreach(id),
  created_at            timestamptz DEFAULT now(),
  completed_at          timestamptz
);

-- -----------------------------------------------------------------------------
-- 7. os_decisions — CEO decision audit trail
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                  text NOT NULL,
    -- 'outreach_approve' | 'outreach_reject' | 'campaign_pause' | 'budget_allocate'
    -- | 'experiment_approve' | 'escalate_chairman' | 'v2_propose'
  descripcion           text NOT NULL,
  razonamiento          text,
  accion_tomada         text,
  resultado             text,
  escalado_chairman     boolean DEFAULT false,
  chairman_response     text,
  outreach_id           uuid REFERENCES os_outreach(id),
  campaign_id           uuid REFERENCES os_campaigns(id),
  created_at            timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 8. os_experiments — A/B tests and growth experiments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_experiments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text NOT NULL,
  hipotesis             text NOT NULL,
  tipo                  text,  -- 'pricing' | 'messaging' | 'channel' | 'audience'
  estado                text DEFAULT 'running'
                          CHECK (estado IN ('planned','running','paused','completed','cancelled')),
  metrica_primaria      text DEFAULT 'roi',  -- Always ROI-first
  metrica_secundaria    text,
  valor_control         numeric,
  valor_variante        numeric,
  resultado             text,
  learnings             text,
  campaign_id           uuid REFERENCES os_campaigns(id),
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 9. os_memory — Persistent agent context (learnings, rules, patterns)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_memory (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente                text NOT NULL CHECK (agente IN ('ceo','growth','finance')),
  tipo                  text NOT NULL,
    -- 'learning' | 'rule' | 'pattern' | 'rejection_reason' | 'success_pattern'
  contenido             text NOT NULL,
  relevancia            integer DEFAULT 5 CHECK (relevancia BETWEEN 1 AND 10),
  activo                boolean DEFAULT true,
  outreach_id           uuid REFERENCES os_outreach(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 10. os_reports — Chairman weekly reports
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                  text DEFAULT 'weekly',
  periodo_inicio        date,
  periodo_fin           date,
  -- Report includes: MRR, outreach ROI, funnel summary, decisions, experiments, next steps
  contenido             jsonb,
  resumen_ejecutivo     text,
  roi_periodo           numeric(6,2),    -- primary headline metric
  mrr_inicio            numeric(10,2),
  mrr_fin               numeric(10,2),
  enviado_a             text,
  enviado_at            timestamptz,
  created_at            timestamptz DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 11. os_config — Global OS configuration (kill switch, limits, parameters)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS os_config (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config                jsonb NOT NULL DEFAULT '{}',
  version               integer DEFAULT 1,
  updated_at            timestamptz DEFAULT now(),
  updated_by            text DEFAULT 'chairman'
);

-- Seed: initial os_config
INSERT INTO os_config (config, updated_by) VALUES (
  '{
    "agents_active": {
      "ceo": true,
      "growth": true,
      "finance": true
    },
    "kill_switch": false,
    "outreach": {
      "enabled": true,
      "autonomy_level": "ceo_approval",
      "daily_limit": 5,
      "monthly_limit": 60,
      "campaign_pause_threshold": 0.10,
      "min_qualification_score": 4,
      "cooldown_days": 90,
      "dead_lead_days": 14
    },
    "financials": {
      "budget_monthly_usd": 300,
      "budget_structural_usd": 100,
      "budget_marketing_usd": 200,
      "pricing_floor_usd": 35,
      "pricing_ceiling_usd": 90,
      "max_single_expense_usd": 50,
      "min_roi_for_reinvestment": 2.0,
      "reinvestment_horizon_days": 60
    },
    "attribution": {
      "primary_metric": "roi",
      "funnel": ["contact","response","qualified_conversation","demo","proposal","customer"],
      "dimensions": ["contact","campaign","message","channel","agent","date","cost"]
    },
    "chairman": {
      "email": "gkovalek@gmail.com",
      "escalation_timeout_hours": 48,
      "report_day": "monday",
      "report_time_utc": "10:00"
    },
    "schedules": {
      "ceo_daily": "0 6 * * *",
      "growth_mwf": "0 7 * * 1,3,5",
      "finance_weekly": "0 5 * * 0"
    }
  }',
  'chairman'
);

-- Seed: initial os_campaigns (first campaign)
INSERT INTO os_campaigns (nombre, descripcion, canal, daily_limit, monthly_limit, budget_usd, cost_per_contact_usd, approved_by, approved_at) VALUES (
  'WA Kinesiólogos ARG — Campaña Inicial',
  'Outreach a centros de kinesiología y rehabilitación en Argentina. Hipótesis: el competidor es el statu quo (Calendar + WA + Excel). Mensaje: cuantificar el costo del caos.',
  'whatsapp',
  5,
  60,
  200.00,
  3.33,
  'chairman',
  now()
);

-- -----------------------------------------------------------------------------
-- RLS Policies — Edge Functions con service role key tienen acceso completo
-- Los agentes usan service role key (nunca anon)
-- -----------------------------------------------------------------------------
ALTER TABLE os_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_campaigns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_pipeline        ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_outreach        ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_attribution     ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_metrics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_decisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_experiments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_memory          ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_reports         ENABLE ROW LEVEL SECURITY;

-- Authenticated users del centro pueden leer (para futuro dashboard)
-- Service role (Edge Functions) tiene bypass de RLS por defecto

CREATE POLICY "os_config_read" ON os_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "os_campaigns_read" ON os_campaigns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "os_pipeline_read" ON os_pipeline
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "os_outreach_read" ON os_outreach
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "os_attribution_read" ON os_attribution
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "os_metrics_read" ON os_metrics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "os_reports_read" ON os_reports
  FOR SELECT TO authenticated USING (true);

-- No DML directa desde el frontend — todo pasa por Edge Functions con service role
-- -----------------------------------------------------------------------------

-- Indexes para queries frecuentes de los agentes
CREATE INDEX IF NOT EXISTS idx_os_outreach_estado ON os_outreach(estado);
CREATE INDEX IF NOT EXISTS idx_os_outreach_sent_at ON os_outreach(sent_at);
CREATE INDEX IF NOT EXISTS idx_os_outreach_numero ON os_outreach(prospecto_numero);
CREATE INDEX IF NOT EXISTS idx_os_outreach_campaign ON os_outreach(campaign_id);
CREATE INDEX IF NOT EXISTS idx_os_outreach_funnel ON os_outreach(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_os_attribution_outreach ON os_attribution(outreach_id);
CREATE INDEX IF NOT EXISTS idx_os_attribution_campaign ON os_attribution(campaign_id);
CREATE INDEX IF NOT EXISTS idx_os_attribution_stage ON os_attribution(to_stage);
CREATE INDEX IF NOT EXISTS idx_os_pipeline_stage ON os_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_os_metrics_date ON os_metrics(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_os_tasks_agente_estado ON os_tasks(agente_destino, estado);
CREATE INDEX IF NOT EXISTS idx_os_memory_agente ON os_memory(agente, activo);

-- =============================================================================
-- MILESTONE 1 COMPLETE: Business Memory / Data Layer
-- Tables: os_config, os_campaigns, os_pipeline, os_outreach, os_attribution,
--         os_metrics, os_tasks, os_decisions, os_experiments, os_memory, os_reports
-- Attribution funnel: 10-step Chairman-approved model
-- Primary metric: ROI (revenue / acquisition_cost)
-- Seed: os_config + first campaign
-- =============================================================================
