# Vitalis - Gestion Inteligente de Centros de Salud

SaaS multi-tenant para clinicas y centros kinesiologicos en Argentina. Agenda online, historia clinica, obras sociales, cobros con MercadoPago, recordatorios por WhatsApp y asistente de IA 24/7.

Demo en produccion: https://agendavitalis.app

---

## Que es Vitalis

Vitalis es una plataforma SaaS completa para la gestion de centros de salud (kinesiologia, fisioterapia, clinicas). Permite a cada centro administrar su agenda, pacientes, profesionales, cobros, obras sociales e historia clinica desde un unico sistema.

Caracteristicas principales: sistema multi-tenant con aislamiento de datos por Row Level Security (RLS) en Supabase; portal de reservas online donde los pacientes reservan turnos sin necesidad de registrarse; cobros integrados con MercadoPago (cobro anticipado, modelo Marketplace); recordatorios automaticos por WhatsApp que avisan a los pacientes 24 horas antes de su turno y procesan respuestas (confirmar, cancelar, reagendar); asistente de IA por WhatsApp que atiende consultas, agenda turnos y envia links de pago de forma autonoma (plan Premium); historia clinica digital con exportacion a PDF; estado de resultados financiero con graficos y exportacion a Excel; y un panel SuperAdmin con metricas y gestion de billing para todos los centros.

---

## Stack tecnologico

Frontend: React 18, TypeScript, Vite (SWC), React Router DOM, TanStack React Query, React Hook Form + Zod, Tailwind CSS + shadcn/ui, Radix UI, Recharts, jsPDF, date-fns, Sentry para monitoreo de errores.

Backend e infraestructura: Supabase (Auth, PostgreSQL, Edge Functions en Deno, RLS, Realtime), n8n self-hosted para automatizacion de workflows (recordatorios, emails, WhatsApp), MercadoPago (Checkout Pro + OAuth Marketplace), Evolution API para WhatsApp Business, Anthropic Claude como asistente conversacional, OpenAI Whisper para transcripcion de audios, y Docker + Traefik + nginx para el despliegue.

---

## Arquitectura

El frontend (React/TypeScript) se despliega como SPA y se comunica con Supabase via su cliente JS (REST + Realtime). Supabase centraliza autenticacion, base de datos PostgreSQL con RLS multi-tenant, y Edge Functions en Deno para la logica de pagos, el asistente de WhatsApp y el registro de nuevos centros. Las Edge Functions integran con MercadoPago para cobros, con n8n para workflows de automatizacion (recordatorios y emails), y con Evolution API para la mensajeria de WhatsApp, que a su vez usa Claude para las respuestas del asistente y Whisper para transcribir audios.

Modelo multi-tenant: todos los datos usan `centro_id` como clave de aislamiento, garantizado por politicas RLS de PostgreSQL. Cada usuario solo accede a los datos de su propio centro.

---

## Planes y feature gating

| Feature | Basico | Intermedio | Premium |
|---|:---:|:---:|:---:|
| Agenda, turnos y portal de reservas online | Si | Si | Si |
| Cobro anticipado con MercadoPago | Si | Si | Si |
| Recordatorios WhatsApp | Si | Si | Si |
| Historia clinica, tratamientos, obras sociales | No | Si | Si |
| Reportes estadisticos | No | Si | Si |
| Estado de Resultados (EERR) | No | No | Si |
| Asistente IA WhatsApp 24/7 | No | No | Si |

---

## Estado

Producto propietario en produccion activa. Este repositorio se comparte como referencia de arquitectura y stack; el codigo fuente completo y la configuracion de infraestructura son privados.

---

## Licencia

Propietario. Todos los derechos reservados. Vitalis, 2026.
## Licencia

Propietario. Todos los derechos reservados. Vitalis, 2026.
