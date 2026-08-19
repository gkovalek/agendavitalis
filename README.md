# Vitalis — Gestión Inteligente de Centros de Salud

> SaaS multi-tenant para clínicas y centros kinesiológicos en Argentina. Agenda online, historia clínica, obras sociales, cobros con MercadoPago, recordatorios por WhatsApp y asistente IA 24/7.

---

## Índice

- [¿Qué es Vitalis?](#qué-es-vitalis)
- [Stack tecnológico](#stack-tecnológico)
- [Funcionalidades por módulo](#funcionalidades-por-módulo)
- [Planes y feature gating](#planes-y-feature-gating)
- [Arquitectura](#arquitectura)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Variables de entorno](#variables-de-entorno)
- [Setup local](#setup-local)
- [Edge Functions (Supabase)](#edge-functions-supabase)
- [Workflows n8n](#workflows-n8n)
- [Modelo de roles](#modelo-de-roles)
- [Deployment](#deployment)

---

## ¿Qué es Vitalis?

Vitalis es una plataforma SaaS completa para la gestión de centros de salud (kinesiología, fisioterapia, clínicas). Permite a cada centro administrar su agenda, pacientes, profesionales, cobros, obras sociales e historia clínica desde un único sistema.

**Características principales:**

- **Multi-tenant**: cada centro tiene sus propios datos, usuarios y configuración aislados por RLS en Supabase.
- **Portal de reservas online**: los pacientes reservan turnos desde un link público sin necesidad de registrarse.
- **Cobros integrados con MercadoPago**: cobro anticipado de turnos con modelo Marketplace (cada centro conecta su propia cuenta MP).
- **Recordatorios automáticos por WhatsApp**: el sistema avisa a los pacientes 24 hs antes de su turno y procesa respuestas (confirmar / cancelar / reagendar).
- **Asistente IA por WhatsApp**: atiende consultas, agenda turnos y envía links de pago a las 3am si es necesario (plan Premium).
- **Historia clínica digital**: con exportación a PDF.
- **Estado de resultados financiero**: con gráficos y exportación a Excel.
- **Panel SuperAdmin**: métricas y gestión de billing para todos los centros.

---

## Stack tecnológico

### Frontend

| Tecnología | Uso |
|---|---|
| React 18 + TypeScript 5 | Framework principal |
| Vite 5 (SWC) | Bundler — build ultra rápido |
| React Router DOM 6 | Routing SPA con lazy loading por ruta |
| TanStack React Query 5 | Server state y caché |
| React Hook Form 7 + Zod 3 | Formularios tipados con validación |
| Tailwind CSS 3 + shadcn/ui | Sistema de diseño con CSS variables |
| Radix UI | Componentes accesibles (Dialog, Popover, Select…) |
| Recharts 2 | Gráficos en Reportes y EERR |
| jsPDF 4 | Exportación de historia clínica a PDF |
| xlsx | Exportación de reportes a Excel |
| date-fns 3 | Manejo de fechas |
| Sentry React | Monitoreo de errores en producción |
| Lucide React | Iconografía |

### Backend / Infraestructura

| Tecnología | Uso |
|---|---|
| Supabase | Auth, PostgreSQL, Edge Functions (Deno), RLS, Realtime |
| n8n (self-hosted) | Automatización de workflows (recordatorios, emails, WA) |
| MercadoPago | Cobros en línea — Checkout Pro + OAuth Marketplace |
| Evolution API | Instancia WhatsApp Business para el asistente IA |
| Anthropic Claude Sonnet | IA para el asistente virtual de WhatsApp |
| OpenAI Whisper | Transcripción de audios de WhatsApp |
| Zoho SMTP | Envío de emails transaccionales |
| nginx | Servidor estático en VPS |
| Traefik | Reverse proxy con HTTPS automático |
| Docker + Docker Compose | Contenedores en VPS |
| fail2ban | Protección SSH del VPS |

---

## Funcionalidades por módulo

### Dashboard
Vista principal del día con calendario mensual, listado de turnos del día seleccionado, acceso rápido a nuevo turno, indicadores de asistencia y cobros del día.

### Agenda / Turnos
- Creación, edición, reprogramación y cancelación de turnos
- Estados: reservado, confirmado, presente, ausente, cancelado, pendiente_pago
- Cobro anticipado automático via MercadoPago con expiración de turno a los 30 min si no paga
- Filtrado por profesional, servicio, fecha

### Portal de Reservas Online
- URL pública por centro: `/reservar/:centroId` o `/reservas/:slug`
- Selección de profesional → servicio → fecha → horario disponible
- Cobro anticipado integrado si el servicio lo requiere
- No requiere cuenta de usuario

### Pacientes
- Alta, edición y búsqueda de pacientes
- Autocomplete inteligente en formularios
- Perfil completo del paciente con historial de turnos y tratamientos

### Profesionales
- ABM de profesionales con datos de contacto, título y configuración
- Conexión de cuenta MercadoPago por profesional (modelo Marketplace)
- Configuración de horarios de atención por día y agenda

### Equipos
- Gestión de equipos y recursos del centro (salas, equipamiento)
- Asignación a agendas y servicios

### Servicios
- Catálogo de servicios ofrecidos
- Precios particulares por profesional
- Configuración de cobro anticipado (ninguno / parcial 50% / total 100%)
- Duración y cupos por turno

### Obras Sociales
- ABM de obras sociales y prepagas aceptadas
- Configuración de aranceles por profesional y obra social

### Liquidación OS
- Generación de liquidación mensual por obra social
- Exportación a Excel

### Caja
- Registro de cobros (efectivo, transferencia, prepaga)
- Historial de movimientos con filtros
- Resumen diario y mensual

### Historia Clínica
- Registro cronológico de sesiones y evolución del paciente
- Exportación completa a PDF con formato profesional
- Requiere plan Intermedio o superior

### Tratamientos
- Planes de tratamiento con sesiones autorizadas
- Seguimiento de avance
- Requiere plan Intermedio o superior

### Recordatorios
- Envío manual de recordatorio WhatsApp desde el sistema
- Cron automático diario que avisa a todos los pacientes del día siguiente
- El paciente responde y el sistema actualiza el estado del turno automáticamente

### Reportes
- Estadísticas de turnos, asistencia y ausentismo
- Comparación histórica por período
- Filtros por profesional
- Requiere plan Intermedio o superior

### Estado de Resultados (EERR)
- Ingresos, egresos y resultado neto
- Gráficos por período
- Exportación a Excel
- Requiere plan Premium

### FAQ / Secretaria Virtual
- Base de conocimiento del centro (preguntas y respuestas)
- La IA usa este FAQ para responder a los pacientes sin escalar
- ABM de FAQs desde la interfaz

### Configuración del Centro
- Datos del centro (nombre, slug, dirección, teléfono)
- Horarios de atención generales
- Integración MercadoPago (OAuth)
- Configuración de webhook n8n
- Permisos de secretario (ver caja, ver liquidaciones)

### Panel SuperAdmin (`/admin`)
- Métricas globales: total de centros, activos, en trial, vencidos
- Tabla completa de centros con plan, estado, vencimiento y email de billing
- Acciones: cambiar estado de suscripción (activo / trial / vencido / suspendido)
- Solo accesible con email autorizado

---

## Planes y feature gating

| Feature | Básico | Intermedio | Premium |
|---|:---:|:---:|:---:|
| Pacientes ilimitados | ✓ | ✓ | ✓ |
| Agenda y turnos | ✓ | ✓ | ✓ |
| Portal de reservas online | ✓ | ✓ | ✓ |
| Caja y cobros | ✓ | ✓ | ✓ |
| Recordatorios WhatsApp (100/mes) | ✓ | ✓ | ✓ |
| Cobro anticipado con MercadoPago | ✓ | ✓ | ✓ |
| Historia clínica | — | ✓ | ✓ |
| Tratamientos | — | ✓ | ✓ |
| Obras sociales | — | ✓ | ✓ |
| Liquidación OS | — | ✓ | ✓ |
| Reportes estadísticos | — | ✓ | ✓ |
| Estado de Resultados (EERR) | — | — | ✓ |
| Asistente IA WhatsApp 24/7 | — | — | ✓ |
| FAQ y base de conocimiento | — | — | ✓ |

**Precios de referencia:** Básico $40.000 ARS · Intermedio $55.000 ARS · Premium $70.000 ARS (por profesional / mes).

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (SPA)                            │
│  React + TypeScript + Vite · Desplegado en VPS via nginx         │
│  agendavitalis.app                                               │
└────────────────────┬─────────────────────────────────────────────┘
                     │ Supabase JS Client (REST + Realtime)
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│                      SUPABASE                                     │
│  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ Auth (JWT)   │  │ PostgreSQL + RLS │  │  Edge Functions     │ │
│  │              │  │  Multi-tenant    │  │  (Deno runtime)     │ │
│  │ - Email/Pass │  │  by centro_id    │  │  - mp-crear-pago    │ │
│  │ - Magic Link │  │                 │  │  - mp-oauth         │ │
│  └──────────────┘  └─────────────────┘  │  - mp-pago-portal   │ │
│                                          │  - mp-webhook       │ │
│                                          │  - wa-asistente     │ │
│                                          │  - wa-send          │ │
│                                          │  - registro-centro  │ │
│                                          └─────────────────────┘ │
└────────────────────────────────────┬─────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────┐
          │                          │                      │
┌─────────▼────────┐    ┌────────────▼───────┐   ┌─────────▼──────┐
│   MercadoPago    │    │      n8n            │   │  Evolution API  │
│   Checkout Pro   │    │  (self-hosted)      │   │  WhatsApp Biz  │
│   OAuth per      │    │  Workflows:         │   │                │
│   centro         │    │  - Recordatorios   │   │  → Claude AI   │
│                  │    │  - Emails           │   │  → Whisper     │
│  Webhook →       │    │  - Inbound WA       │   │                │
│  mp-webhook EF   │    │  - Vencimientos     │   │                │
└──────────────────┘    └────────────────────┘   └────────────────┘
```

### Modelo multi-tenant

Todos los datos tienen `centro_id` como clave de aislamiento. Las Row Level Security policies de Supabase garantizan que cada usuario solo accede a los datos de su propio centro, sin excepciones.

```sql
-- Ejemplo de policy RLS
CREATE POLICY "centro_isolation" ON turnos
  USING (
    centro_id = (
      SELECT centro_id FROM usuarios
      WHERE auth_user_id = auth.uid() AND activo = true
    )
  );
```

---

## Estructura del proyecto

```
agendavitalis-repo/
├── src/
│   ├── App.tsx                         # Router principal con lazy loading
│   ├── main.tsx                        # Entry point con Sentry
│   ├── pages/
│   │   ├── Landing.tsx                 # Landing page pública
│   │   ├── Login.tsx
│   │   ├── Registro.tsx                # Auto-registro de centro
│   │   ├── Dashboard.tsx               # Panel principal
│   │   ├── Pacientes.tsx
│   │   ├── NuevoPaciente.tsx
│   │   ├── Profesionales.tsx
│   │   ├── GestionAgendas.tsx
│   │   ├── Equipos.tsx
│   │   ├── Servicios.tsx
│   │   ├── ObrasSociales.tsx
│   │   ├── LiquidacionOS.tsx
│   │   ├── Caja.tsx
│   │   ├── Tratamientos.tsx
│   │   ├── HistoriaClinica.tsx
│   │   ├── Recordatorios.tsx
│   │   ├── Reportes.tsx
│   │   ├── EERR.tsx
│   │   ├── FaqManager.tsx
│   │   ├── Configuracion.tsx
│   │   ├── MiPerfil.tsx
│   │   ├── PortalPublico.tsx           # Portal de reservas online
│   │   ├── PagoResultado.tsx           # Resultado de pago MP
│   │   ├── SecretariaWhatsApp.tsx      # Bandeja WA del secretario
│   │   ├── SuscripcionVencida.tsx
│   │   ├── ResetPassword.tsx
│   │   ├── NotFound.tsx
│   │   └── admin/
│   │       └── SuperAdmin.tsx          # Panel de superadmin
│   ├── components/
│   │   ├── AppLayout.tsx
│   │   ├── AppSidebar.tsx              # Sidebar con feature gating por rol
│   │   ├── TopNavbar.tsx
│   │   ├── NuevoTurnoForm.tsx
│   │   ├── TurnoDetailDialog.tsx
│   │   ├── ReprogramarTurnoDialog.tsx
│   │   ├── ExportarHistoriaPDF.tsx     # Export PDF via jsPDF
│   │   ├── PacienteAutocomplete.tsx
│   │   └── ui/                         # Componentes shadcn/ui
│   ├── contexts/
│   │   └── AuthContext.tsx             # Sesión + perfil + centroId
│   ├── hooks/
│   │   ├── use-plan.ts                 # Feature gating por plan
│   │   ├── use-centro-config.ts        # Config del centro (KV store)
│   │   ├── use-mp-pago.ts              # Checkout Pro de MP
│   │   └── use-mobile.tsx
│   └── lib/
│       ├── supabase.ts
│       ├── constants.ts                # Estados de turno, slots, días
│       └── utils.ts
├── supabase/
│   ├── functions/                      # 7 Edge Functions (Deno)
│   └── migrations/                     # 8 migraciones SQL
├── n8n/                                # 9 workflows JSON exportados
│   └── SETUP.md                        # Guía de configuración n8n
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── components.json                     # shadcn/ui config
└── package.json
```

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# Supabase
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Sentry (opcional — si no se define, Sentry no se inicializa)
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

Las Edge Functions requieren variables de entorno adicionales configuradas en el dashboard de Supabase (Settings → Edge Functions):

```env
# MercadoPago
MP_APP_ID=...
MP_APP_SECRET=...
MP_REDIRECT_URI=https://agendavitalis.app/mp/callback

# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://72.61.58.46:8080
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=...

# Anthropic (asistente IA)
ANTHROPIC_API_KEY=sk-ant-...

# Supabase Service Role (para Edge Functions)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Setup local

### Requisitos
- Node.js 18+ o Bun
- Cuenta de Supabase (puede ser el proyecto existente o uno nuevo)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/agendavitalis-repo.git
cd agendavitalis-repo

# Instalar dependencias
npm install
# o con bun:
bun install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores de Supabase

# Iniciar en modo desarrollo
npm run dev
```

La app estará disponible en `http://localhost:8080`.

### Aplicar migraciones

```bash
# Instalar Supabase CLI
npm install -g supabase

# Linkear con tu proyecto
supabase link --project-ref TU_PROJECT_REF

# Aplicar todas las migraciones
supabase db push
```

### Deploy de Edge Functions

```bash
# Deploy de todas las funciones
supabase functions deploy

# O una función específica
supabase functions deploy mp-webhook
```

---

## Edge Functions (Supabase)

Todas las funciones están en `supabase/functions/` y se ejecutan en el runtime Deno de Supabase.

| Función | Método | Descripción |
|---|---|---|
| `registro-centro` | POST | Auto-registro de nuevos centros. Crea usuario Auth + centro + admin. Activa trial de 7 días. |
| `mp-oauth` | GET | Intercambia el código OAuth de MercadoPago por el access_token del centro. |
| `mp-crear-pago` | POST | Genera preferencia de Checkout Pro para cobrar un turno. Requiere JWT. |
| `mp-pago-portal` | POST | Igual que `mp-crear-pago` pero para el portal público (sin JWT). |
| `mp-webhook` | POST | Recibe notificaciones de pago de MP. Verifica firma HMAC-SHA256. Idempotente. |
| `wa-asistente` | POST | Asistente IA WhatsApp. Procesa mensajes de pacientes con Claude Sonnet. |
| `wa-send` | POST | Envío directo de mensaje WhatsApp via Evolution API. |

---

## Workflows n8n

Los workflows están exportados en `n8n/`. Para importarlos: en n8n → Workflows → Import from file.

| Archivo | Trigger | Descripción |
|---|---|---|
| `workflow-2-recordatorios-cron.json` | Cron 20:00 diario | Envía recordatorios WA a todos los pacientes del día siguiente |
| `workflow-3-respuestas-inbound.json` | Webhook Twilio | Procesa respuestas del paciente (1=confirmar, 2=cancelar, 3=reagendar) |
| `workflow-email-bienvenida.json` | Webhook HTTP | Email de bienvenida al registrar un nuevo centro |
| `workflow-email-turno-confirmado.json` | Webhook HTTP | Email de confirmación de turno (invocado desde mp-webhook) |
| `workflow-email-recordatorio.json` | Webhook HTTP | Email de recordatorio de turno |
| `workflow-email-vencimiento.json` | Cron 10:00 diario | Email de aviso de vencimiento de suscripción (trial: 3d/1d, activo: 5d/2d/0d) |

Ver `n8n/SETUP.md` para instrucciones detalladas de configuración.

---

## Modelo de roles

El sistema soporta tres roles por centro, más el SuperAdmin global:

| Rol | Acceso |
|---|---|
| **admin** | Acceso completo a todos los módulos del plan contratado |
| **secretario** | Agenda, pacientes, caja. Sin acceso a profesionales, equipos, servicios ni configuración |
| **profesional** | Su propia agenda y los pacientes que atiende |
| **superadmin** | Panel `/admin` con visibilidad de todos los centros (email específico hardcodeado) |

Los módulos con lock-icon en el sidebar se muestran bloqueados si el plan no los incluye, con tooltip indicando el plan necesario para desbloquearlos.

---

## Deployment

### Producción actual

La app corre en un VPS de Hostinger con la siguiente configuración:

```
VPS: 72.61.58.46
Dominio: agendavitalis.app
Stack: Docker + Traefik (HTTPS) + nginx (static files)
Archivos: /opt/vitalis/dist/
```

### Build y deploy

```bash
# Build de producción
npm run build

# Copiar al servidor
scp -r dist/* root@72.61.58.46:/opt/vitalis/dist/
```

### Docker Compose (en el VPS)

```yaml
# /root/docker-compose.yml
services:
  traefik:
    image: traefik:v3
    # ... HTTPS automático via Let's Encrypt

  vitalis:
    image: nginx:alpine
    volumes:
      - /opt/vitalis/dist:/usr/share/nginx/html:ro
      - /opt/vitalis/nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

### nginx (SPA routing)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Licencia

Propietario. Todos los derechos reservados — Vitalis © 2026.
