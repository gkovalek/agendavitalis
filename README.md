# Vitalis — SaaS de gestión de centros de salud

**URL producción:** https://agendavitalis.app  
**Stack:** React 18 + TypeScript + Vite · Supabase (PostgreSQL + Auth + Edge Functions) · MercadoPago · Evolution API (WhatsApp)

---

## Planes comerciales

| | Starter | Profesional | Premium |
|---|---|---|---|
| **Precio/mes** | $40.000 ARS | $50.000 ARS | $80.000 ARS |
| Portal público | ✓ | ✓ | ✓ |
| Cobro con MercadoPago | ✓ | ✓ | ✓ |
| Agendas | hasta 3 | hasta 6 | ilimitadas |
| Recordatorios WA/mes | 200 | 350 | 500 |
| Agente IA WhatsApp | ✗ | ✓ | ✓ |
| Historias clínicas | ✗ | ✓ (sin adjuntos) | ✓ + 500 MB |
| Caja del día | ✓ | ✓ | ✓ |
| Módulo Obras Sociales | ✗ | ✓ | ✓ |
| Módulo Financiero (EERR) | ✗ | ✓ | ✓ |
| Tableros de indicadores | ✗ | ✗ | ✓ |

Los planes se gestionan en `src/hooks/use-plan.ts`. Las keys de DB son `basico / intermedio / premium`.

---

## Estructura del proyecto

```
src/
├── components/          # TopNavbar, AppSidebar, SplashScreen, VitalisLogo, ...
├── contexts/            # AuthContext (sesión + perfil + centro)
├── hooks/               # use-plan.ts, useCentroConfig, ...
├── pages/
│   ├── Landing.tsx      # Página pública con pricing y FAQ
│   ├── Registro.tsx     # Alta de nuevo centro (con pago MP)
│   ├── PortalPublico.tsx# Portal de reservas por slug del centro
│   ├── Dashboard.tsx    # Panel principal
│   ├── HistoriaClinica.tsx
│   ├── Recordatorios.tsx
│   ├── EERR.tsx         # Estado de Resultados (plan Profesional+)
│   ├── Reportes.tsx     # Dashboard de indicadores (plan Premium)
│   ├── SecretariaWhatsApp.tsx
│   └── admin/SuperAdmin.tsx
supabase/
└── functions/           # Edge Functions (Deno)
    ├── registro-pago
    ├── registro-completar
    ├── mp-webhook
    ├── wa-asistente
    ├── wa-send
    ├── admin-cobro-centro   ← genera débito automático MP por centro
    └── admin-gestionar-usuario
```

---

## Deploy

### Frontend
```bash
npm run build
scp -r dist/. root@72.61.58.46:/opt/vitalis/dist/
```
> Usar `dist/.` (con punto), NO `dist/*`.

### Edge Functions
```bash
npx supabase functions deploy <nombre> --project-ref gsmrccofuegcmujycydd
```

---

## Desarrollo local

```bash
npm install
npm run dev
```

Variables de entorno necesarias: ver `.env.example` (no incluido en el repo).

---

## SuperAdmin

Acceso en `/admin` con la cuenta `gkovalek@hotmail.com`. Permite:
- Ver y gestionar todos los centros registrados
- Administrar usuarios de cada centro (crear, resetear contraseña, desactivar)
- Ver facturación por centro y generar débito automático vía MercadoPago Preapproval

**SQL requerido antes de usar la pestaña Facturación:**
```sql
ALTER TABLE centros
  ADD COLUMN IF NOT EXISTS mp_preapproval_id text,
  ADD COLUMN IF NOT EXISTS mp_preapproval_status text;
```

---

## Bugs conocidos

| Bug | Estado |
|---|---|
| BUG-007: turno creado desde app se auto-cancela | Pendiente investigar |
| BUG-008: Recordatorios defaultea a D+1 | Pendiente |
| BUG-009: PCS con servicio_id=NULL (data sucia) | Pendiente limpiar |

---

## Supabase

**Project ref:** `gsmrccofuegcmujycydd` (región sa-east-1)
