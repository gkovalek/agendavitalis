# deploy-os-v1.ps1 — Vitalis OS v1 Deployment Script
# Run from repo root: .\scripts\deploy-os-v1.ps1
# Prerequisites: supabase CLI logged in, project linked to gsmrccofuegcmujycydd

$PROJECT_REF = "gsmrccofuegcmujycydd"

Write-Host "=== VITALIS OS v1 — DEPLOYMENT ===" -ForegroundColor Cyan
Write-Host "Project: $PROJECT_REF" -ForegroundColor Gray
Write-Host ""

# Step 1: Run migrations
Write-Host "[1/3] Running migrations..." -ForegroundColor Yellow
Write-Host "  → 20260827_vitalis_os_v1.sql"
Write-Host ""
Write-Host "  ACTION REQUIRED: Run this SQL in Supabase Dashboard → SQL Editor:" -ForegroundColor Red
Write-Host "  File: supabase/migrations/20260827_vitalis_os_v1.sql" -ForegroundColor White
Write-Host ""
Write-Host "  Then run cron setup (replace YOUR_SUPABASE_URL and YOUR_SERVICE_KEY):" -ForegroundColor Red
Write-Host "  File: supabase/migrations/20260827_vitalis_os_crons.sql" -ForegroundColor White
Write-Host ""
$confirm = Read-Host "Press ENTER after running the migration SQL in Supabase Dashboard"

# Step 2: Deploy Edge Functions
Write-Host "[2/3] Deploying Edge Functions..." -ForegroundColor Yellow

$functions = @(
  "os-finance-agent",
  "os-growth-agent",
  "os-ceo-agent",
  "os-outreach-send",
  "os-outreach-webhook"
)

foreach ($fn in $functions) {
  Write-Host "  Deploying $fn..." -ForegroundColor Gray
  npx supabase functions deploy $fn --project-ref $PROJECT_REF
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR deploying $fn" -ForegroundColor Red
    exit 1
  }
  Write-Host "  ✓ $fn deployed" -ForegroundColor Green
}

# Step 3: Verify secrets
Write-Host ""
Write-Host "[3/3] Required Secrets Checklist" -ForegroundColor Yellow
Write-Host "  Verify these are set in Supabase Dashboard → Settings → Edge Functions → Secrets:" -ForegroundColor Gray
Write-Host ""
Write-Host "  ANTHROPIC_API_KEY       — Claude API key" -ForegroundColor White
Write-Host "  RESEND_API_KEY          — Resend email key (already configured)" -ForegroundColor White
Write-Host "  EVOLUTION_URL           — Evolution API base URL" -ForegroundColor White
Write-Host "  EVOLUTION_API_KEY       — Evolution API key" -ForegroundColor White
Write-Host "  EVOLUTION_INSTANCE      — Evolution instance name" -ForegroundColor White
Write-Host "  BRAVE_API_KEY           — Brave Search API key (optional but recommended)" -ForegroundColor Gray
Write-Host ""
Write-Host "  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase." -ForegroundColor Gray
Write-Host ""

# Summary
Write-Host "=== DEPLOYMENT COMPLETE ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Configure Evolution API webhook → URL: [SUPABASE_URL]/functions/v1/os-outreach-webhook" -ForegroundColor White
Write-Host "  2. Verify pg_cron extension is enabled in Supabase Dashboard → Extensions" -ForegroundColor White
Write-Host "  3. Run cron migration with your actual SUPABASE_URL and SERVICE_KEY" -ForegroundColor White
Write-Host "  4. Test: POST to /os-growth-agent with body {}" -ForegroundColor White
Write-Host "  5. Check os_outreach table for first proposals (status: pending_ceo)" -ForegroundColor White
Write-Host "  6. Test: POST to /os-ceo-agent with body {action: 'daily'}" -ForegroundColor White
Write-Host "  7. Check os_outreach — should have approved records" -ForegroundColor White
Write-Host "  8. Test: POST to /os-outreach-send with body {}" -ForegroundColor White
Write-Host ""
Write-Host "Evolution webhook config:" -ForegroundColor Yellow
Write-Host "  Events: MESSAGES_UPSERT, MESSAGE_UPDATE, MESSAGES_UPDATE" -ForegroundColor White
Write-Host "  URL: https://gsmrccofuegcmujycydd.supabase.co/functions/v1/os-outreach-webhook" -ForegroundColor White
