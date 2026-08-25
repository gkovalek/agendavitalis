# Vitalis — SaaS de Gestión de Centros de Salud

Plataforma SaaS para la gestión integral de centros de salud (kinesiología, fisioterapia, etc.). Incluye agenda, portal público de turnos, cobros con MercadoPago, bot de WhatsApp con IA y panel de administración.

**URL producción:** https://agendavitalis.app  
**Supabase project:** gsmrccofuegcmujycydd (sa-east-1)

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Pagos | MercadoPago (Connect) |
| WhatsApp | Evolution API + n8n + Claude API |
| Email | Resend |
| Deploy | VPS en Hostinger (`72.61.58.46`) |

---

## Módulos principales

- **Dashboard / Agenda** — vista de turnos por día, semana y mes
- **Portal Público** (`/reservas/:slug`) — pacientes sacan turnos sin login
- **Historia Clínica** — notas clínicas por paciente
- **Tratamientos** — seguimiento de bloques de sesiones
- **Caja del día** — ingresos y egresos por profesional
- **Recordatorios** — envío manual de WhatsApp
- **Liquidación OS** — cálculo mensual por obra social
- **Obras Sociales** — configuración de aranceles por profesional
- **Chat WhatsApp** (`/secretaria`) — bandeja de conversaciones + gestión de FAQs
- **SuperAdmin** (`/admin`) — gestión de centros, usuarios, ingresos MP, tokens IA

---

## Edge Functions (Supabase)

| Función | Propósito |
|---|---|
| `admin-gestionar-usuario` | Crear / resetear pass / desactivar usuarios de un centro |
| `analizar-error` | Analiza logs de error con Claude IA |
| `limpiar-turnos-expirados` | Cancela turnos `pendiente_pago` vencidos |
| `mp-crear-pago` | Crea pago MP desde app interna |
| `mp-oauth` | OAuth con MercadoPago |
| `mp-pago-portal` | Crea pago MP desde portal público |
| `mp-webhook` | Recibe notificaciones de MP |
| `registro-centro` | Alta de centro (trial) |
| `registro-completar` | Completa registro post-pago MP |
| `registro-pago` | Crea pago MP para nuevo centro |
| `wa-asistente` | Bot WhatsApp IA con Claude |
| `wa-send` | Envía mensajes via Evolution API |

---

## Deploy

```bash
# Frontend
npm run build
scp -r dist/. root@72.61.58.46:/opt/vitalis/dist/

# Edge Function
npx supabase functions deploy <nombre> --project-ref gsmrccofuegcmujycydd
```

> Siempre usar `dist/.` (con punto), nunca `dist/*`.

---

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

```env
VITE_SUPABASE_URL=https://gsmrccofuegcmujycydd.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_SENTRY_DSN=...          # opcional
```

Las secrets de Edge Functions se configuran en Supabase Dashboard → Edge Functions → Secrets.

---

## Estructura del proyecto

```
src/
  components/     # Componentes reutilizables (AppLayout, NuevoTurnoForm, etc.)
  contexts/       # AuthContext
  hooks/          # use-plan, use-mobile, use-centro-config
  pages/          # Páginas por módulo
    admin/        # SuperAdmin
  lib/            # supabase.ts
supabase/
  functions/      # Edge Functions (Deno runtime)
  migrations/     # Migraciones SQL
```

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `administrador` | Acceso completo al centro |
| `secretaria` | Agenda, turnos, recordatorios, caja |
| `profesional` | Solo datos propios (turnos, historia clínica, caja, OS) |

---

## Seguridad RLS

El portal público (`/reservas/:slug`) funciona con el rol Supabase `anon`. Las políticas RLS necesarias están en `supabase/migrations/20260821_fix_centros_rls.sql`.
