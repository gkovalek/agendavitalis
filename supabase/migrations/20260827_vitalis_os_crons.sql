-- =============================================================================
-- VITALIS OS v1 — pg_cron Schedules
-- Prerequisito: pg_cron habilitado en Supabase Dashboard → Database → Extensions
-- Prerequisito: pg_net habilitado (viene activo por defecto en Supabase)
-- Ejecutar en: SQL Editor del proyecto gsmrccofuegcmujycydd
-- =============================================================================

-- IMPORTANTE: No commitear este archivo con el key real
-- Usar solo para ejecutar en SQL Editor, luego limpiar

-- CEO Agent: daily 06:00 UTC (approve pending outreach, check guardrails)
SELECT cron.schedule(
  'os-ceo-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsmrccofuegcmujycydd.supabase.co/functions/v1/os-ceo-agent',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbXJjY29mdWVnY211anljeWRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQyNTMyNSwiZXhwIjoyMDg5MDAxMzI1fQ.6HdtqI7Vy2Y6wwJFhFQtwBK4hmBKdeuSIJ8-Og3JkDE"}'::jsonb,
    body := '{"action": "daily"}'::jsonb
  )
  $$
);

-- CEO Agent: weekly report — Monday 10:00 UTC
SELECT cron.schedule(
  'os-ceo-weekly-report',
  '0 10 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://gsmrccofuegcmujycydd.supabase.co/functions/v1/os-ceo-agent',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbXJjY29mdWVnY211anljeWRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQyNTMyNSwiZXhwIjoyMDg5MDAxMzI1fQ.6HdtqI7Vy2Y6wwJFhFQtwBK4hmBKdeuSIJ8-Og3JkDE"}'::jsonb,
    body := '{"action": "weekly_report"}'::jsonb
  )
  $$
);

-- Growth Agent: Monday/Wednesday/Friday 07:00 UTC
SELECT cron.schedule(
  'os-growth-mwf',
  '0 7 * * 1,3,5',
  $$
  SELECT net.http_post(
    url := 'https://gsmrccofuegcmujycydd.supabase.co/functions/v1/os-growth-agent',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbXJjY29mdWVnY211anljeWRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQyNTMyNSwiZXhwIjoyMDg5MDAxMzI1fQ.6HdtqI7Vy2Y6wwJFhFQtwBK4hmBKdeuSIJ8-Og3JkDE"}'::jsonb,
    body := '{"action": "propose"}'::jsonb
  )
  $$
);

-- Finance Agent: every Sunday 05:00 UTC
SELECT cron.schedule(
  'os-finance-weekly',
  '0 5 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://gsmrccofuegcmujycydd.supabase.co/functions/v1/os-finance-agent',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbXJjY29mdWVnY211anljeWRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQyNTMyNSwiZXhwIjoyMDg5MDAxMzI1fQ.6HdtqI7Vy2Y6wwJFhFQtwBK4hmBKdeuSIJ8-Og3JkDE"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- Dead leads: daily 04:00 UTC (marca dead los que no respondieron en 14 días)
SELECT cron.schedule(
  'os-dead-leads',
  '0 4 * * *',
  $$
  UPDATE os_outreach
  SET
    estado = 'dead',
    response_class = 'no_response',
    updated_at = now()
  WHERE
    estado = 'delivered'
    AND sent_at < now() - interval '14 days'
    AND response IS NULL
  $$
);

-- Outreach send batch: daily 06:30 UTC (envía aprobados del ciclo CEO 06:00)
SELECT cron.schedule(
  'os-outreach-send-batch',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gsmrccofuegcmujycydd.supabase.co/functions/v1/os-outreach-send',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbXJjY29mdWVnY211anljeWRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzQyNTMyNSwiZXhwIjoyMDg5MDAxMzI1fQ.6HdtqI7Vy2Y6wwJFhFQtwBK4hmBKdeuSIJ8-Og3JkDE"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);

-- =============================================================================
-- Para verificar que quedaron registrados:
--   SELECT jobid, jobname, schedule, command FROM cron.job;
--
-- Para eliminar un cron:
--   SELECT cron.unschedule('os-ceo-daily');
-- =============================================================================
