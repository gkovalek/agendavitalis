# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # local dev server (Vite)
npm run build        # production build → dist/
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest watch mode

# Deploy frontend to VPS
npm run build
scp -r dist/. root@72.61.58.46:/opt/vitalis/dist/   # use dist/. NOT dist/*

# Deploy a Supabase Edge Function
npx supabase functions deploy <nombre> --project-ref gsmrccofuegcmujycydd
```

## Architecture

**Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Supabase (PostgreSQL + Auth + Edge Functions) + MercadoPago + Evolution API (WhatsApp).

**Supabase project:** `gsmrccofuegcmujycydd` (sa-east-1)  
**Production URL:** https://agendavitalis.app  
**VPS:** `root@72.61.58.46` — nginx serves `dist/` as SPA

### Auth & multi-tenancy

Every authenticated user has a row in `usuarios` with `centro_id` and `rol_id`. Roles are `administrador`, `secretaria`, `profesional` (stored as strings, not foreign keys). All Supabase queries in the frontend must filter by `centro_id` — never query cross-tenant. `AuthContext` (`src/contexts/AuthContext.tsx`) exposes `{ user, perfil, centro, rol }`.

### Data model — critical relationships

```
centros → usuarios (centro_id)
centros → profesionales (centro_id)
profesionales → profesional_centro_servicio PCS (profesional_id)
PCS → pcs_horario_dia (pcs_id)          ← NEW schema (use this)
PCS → dias_trabajo / hora_inicio / hora_fin  ← LEGACY columns (still exist, don't delete)
obras_sociales.profesional_id           ← OS are per-professional, not per-centro
conversaciones_wa (celular, historial jsonb, estado, paciente_id)
```

⚠️ Two horario schemas coexist. `NuevoTurnoForm`, `wa-asistente`, `ServiciosHorariosTab` use `pcs_horario_dia`. `GestionAgendas` still uses legacy columns. Do not remove legacy columns until GestionAgendas is migrated.

### Edge Functions (`supabase/functions/`)

Each function needs a `config.toml` with `verify_jwt = true/false`. Public endpoints (called without session) use `verify_jwt = false`.

| Function | Purpose | JWT |
|---|---|---|
| `wa-asistente` | WhatsApp AI bot (Claude) — text/image/PDF | false |
| `wa-asistente-audio` | WhatsApp AI bot (GPT-4o) — audio messages | false |
| `wa-send` | Send WhatsApp message via Evolution API | false |
| `mp-webhook` | MercadoPago payment notifications | false |
| `mp-pago-portal` | Create MP payment from public portal | false |
| `registro-completar` | Complete registration after MP payment | false |
| `admin-gestionar-usuario` | CRUD users (superadmin only) | true |
| `admin-cobro-centro` | MP Preapproval for centro billing | false |
| `limpiar-turnos-expirados` | Cron: cancel expired pending_payment turnos | — |

`wa-asistente` reads `CENTRO_ID` from env (fixed per Evolution instance). `messageType` values: `'text'`, `'image'`, `'document'`, `'audio'`.

### n8n Workflows (`n8n/`)

- `workflow-4-evolution-inbound.json` — main inbound handler: parses Evolution webhook, routes by message type, downloads media via **POST** `/chat/getBase64FromMediaMessage/{instance}`, calls wa-asistente or wa-asistente-audio.
- Media download nodes must use `method: POST` (not GET) — Evolution ignores GET body.

### Key pages

- `/dashboard` — agenda principal con `NuevoTurnoForm` (usa `pcs_horario_dia`)
- `/secretaria` — WhatsApp inbox: tabs Derivadas/Activas/Cerradas, realtime via Supabase, respuestas manuales via `wa-send`
- `/reservas/:slug` — portal público (anon, usa RLS policies)
- `/admin` — superadmin (`gkovalek@hotmail.com` only)
- `/landing`, `/registro`, `/pago` — public onboarding funnel

### RLS policies

Portal público accede como `anon`. Estas policies deben existir en `centros`, `profesionales`, `servicios`, `profesional_centro_servicio`, `pcs_horario_dia`, `agendas`, `turnos`, `pacientes`. Si el portal no puede insertar turnos o pacientes, verificar las policies `portal_turnos_insert` y `portal_pacientes_insert` para rol `anon`.

### MercadoPago

`centros.mp_access_token` / `mp_public_key` — token del centro (cobros de turnos).  
`profesionales.mp_access_token` — token del profesional (cobros propios, OAuth flow en `/mi-perfil`).  
`MP_VITALIS_ACCESS_TOKEN` secret — token de la plataforma (para cobro de suscripciones en `registro-pago` y `admin-cobro-centro`).
