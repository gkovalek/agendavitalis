-- =============================================================================
-- VITALIS OS v1 — pg_cron Schedules
-- Run AFTER deploying all Edge Functions
-- Requires: pg_cron extension enabled in Supabase (Dashboard → Extensions)
-- =============================================================================

-- Enable pg_cron if not already enabled
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Note: Replace YOUR_SUPABASE_URL and YOUR_ANON_KEY with actual values
-- Or use the Supabase secret approach via pg_net + vault

-- CEO Agent: daily 06:00 UTC (approve pending outreach, check guardrails)
SELECT cron.schedule(
  'os-ceo-daily',
  '0 6 * * *',
  $$
  SELECT
    net.http_post(
      url := 'YOUR_SUPABASE_URL/functions/v1/os-ceo-agent',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
      body := '{"action": "daily"}'::jsonb
    )
  $$
);

-- CEO Agent: weekly report — Monday 10:00 UTC
SELECT cron.schedule(
  'os-ceo-weekly-report',
  '0 10 * * 1',
  $$
  SELECT
    net.http_post(
      url := 'YOUR_SUPABASE_URL/functions/v1/os-ceo-agent',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
      body := '{"action": "weekly_report"}'::jsonb
    )
  $$
);

-- Growth Agent: Monday/Wednesday/Friday 07:00 UTC (prospect + propose)
SELECT cron.schedule(
  'os-growth-mwf',
  '0 7 * * 1,3,5',
  $$
  SELECT
    net.http_post(
      url := 'YOUR_SUPABASE_URL/functions/v1/os-growth-agent',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
      body := '{"action": "propose"}'::jsonb
    )
  $$
);

-- Finance Agent: every Sunday 05:00 UTC (metrics snapshot + ROI + campaign health)
SELECT cron.schedule(
  'os-finance-weekly',
  '0 5 * * 0',
  $$
  SELECT
    net.http_post(
      url := 'YOUR_SUPABASE_URL/functions/v1/os-finance-agent',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
      body := '{}'::jsonb
    )
  $$
);

-- Dead leads cron: daily 04:00 UTC (mark no-response leads as dead after 14 days)
SELECT cron.schedule(
  'os-dead-leads',
  '0 4 * * *',
  $$
  UPDATE os_outreach
  SET
    estado = 'dead',
    response_class = 'no_response',
    funnel_stage = 'contact',
    updated_at = now()
  WHERE
    estado = 'delivered'
    AND sent_at < now() - interval '14 days'
    AND response IS NULL
  $$
);

-- Outreach send batch: daily 06:30 UTC (after CEO approves, trigger batch send)
-- This ensures approved messages from the 06:00 CEO run get sent promptly
SELECT cron.schedule(
  'os-outreach-send-batch',
  '30 6 * * *',
  $$
  SELECT
    net.http_post(
      url := 'YOUR_SUPABASE_URL/functions/v1/os-outreach-send',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
      body := '{}'::jsonb
    )
  $$
);

-- =============================================================================
-- To verify cron jobs are registered:
-- SELECT * FROM cron.job;
--
-- To unschedule:
-- SELECT cron.unschedule('os-ceo-daily');
-- =============================================================================
