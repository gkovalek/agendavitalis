# Changelog — Vitalis SaaS

## 2026-08-19 — Flujo de Registro con MercadoPago

### Nuevas páginas y componentes

- **`src/pages/Registro.tsx`** — Flujo de auto-alta en 2 pasos:
  - Paso 1: Datos de facturación (nombre, apellido, DNI, CUIT, categoría fiscal, provincia, ciudad, dirección) + email/contraseña + selección de plan
  - Paso 2: Configuración del centro (nombre, horarios, profesionales, servicios)
  - Planes simplificados (solo nombre + precio, sin lista de features)
  - Al finalizar llama a `registro-pago` y redirige al checkout de MercadoPago

- **`src/pages/Landing.tsx`** — Portal público de Vitalis (sin sidebar de la app)

- **`src/pages/SuscripcionVencida.tsx`** — Pantalla de suscripción vencida

- **`src/pages/FaqManager.tsx`** — Gestor de FAQs del centro

- **`src/pages/admin/`** — Panel de administración interna

### Edge Functions nuevas

- **`supabase/functions/registro-pago/`**
  - Recibe datos del formulario de registro
  - Guarda en `registros_pendientes` (jsonb)
  - Crea preferencia en MercadoPago Checkout Pro
  - Retorna `checkout_url` y `registro_id`

- **`supabase/functions/registro-completar/`** (con `config.toml`: `verify_jwt = false`)
  - Llamada desde `PagoResultado.tsx` tras redirect de MP
  - Crea usuario en Supabase Auth
  - INSERT en `centros` con datos de facturación y horarios
  - INSERT en `usuarios` con `auth_user_id`, `centro_id`, rol `administrador`
  - INSERT en `profesionales` (campo email = `mail`)
  - INSERT en `servicios` (sin `precio_particular`, con `es_tratamiento` y `activo`)
  - Marca `registros_pendientes` como `completado`
  - Envía emails via Resend: bienvenida al cliente + notificación al admin

- **`supabase/functions/mp-pago-portal/`** — Pago con MP para turnos existentes
- **`supabase/functions/mp-webhook/`** — Webhook de notificaciones de MP
- **`supabase/functions/wa-send/`** — Envío de mensajes WhatsApp via Evolution API
- **`supabase/functions/analizar-error/`** — Análisis de errores con IA
- **`supabase/functions/limpiar-turnos-expirados/`** — Cron de limpieza
- **`supabase/functions/registro-centro/`** — Versión anterior (reemplazada)

### Páginas modificadas

- **`src/pages/PagoResultado.tsx`**
  - Detecta `tipo=registro` y `rid` en query params
  - Llama a `registro-completar` con `Authorization: Bearer $ANON_KEY` (fix crítico — sin este header la función devolvía 401)
  - Muestra "¡Cuenta creada exitosamente!" + botón "Ingresar a Vitalis" en success de registro
  - Muestra "← Volver al registro" en failure de registro

- **`src/App.tsx`** — Rutas `/pago/success`, `/pago/failure`, `/pago/pending`, `/registro`, `/login`, `/suscripcion-vencida`

### Migraciones SQL

- `20260803_auto_registro.sql` — Tabla `registros_pendientes`
- `20260803_billing.sql` — Columnas `billing_email`, `suscripcion_estado`, `facturacion_*`, `horarios` en `centros`
- `20260812_superadmin_logs.sql` — Logs de administración
- `20260819_registro_completar_fix.sql` — Fixes de schema para el flujo de registro

### Bugs corregidos

1. **401 en `registro-pago`** — Faltaba `Authorization: Bearer $ANON_KEY` en el fetch del frontend
2. **404 en `/pago-resultado/success`** — back_url incorrecta; la ruta correcta es `/pago/success`
3. **500 `cant_profesionales` column not found** — Columna inexistente en `centros`, removida del INSERT
4. **500 `user_id` column not found** — `centros` no tiene `user_id`; el link auth↔centro va por tabla `usuarios`
5. **500 usuario ya registrado** — Fallback para email ya existente en Supabase Auth
6. **500 `email` column not found en profesionales** — El campo se llama `mail`, no `email`
7. **500 `precio_particular` column not found en servicios** — Esa columna está en `pcs_horario_dia`, no en `servicios`
8. **Faltaba INSERT en `usuarios`** — Sin ese registro, `AuthContext` no podía resolver el centro del usuario al loguearse
9. **Rol `admin` inexistente** — El rol se llama `administrador` (hay check constraint en la tabla `roles`)
10. **401 en `registro-completar`** — Faltaba `config.toml` con `verify_jwt = false` y `Authorization` header en `PagoResultado.tsx`

### Variables de entorno requeridas (Supabase Secrets)

```
MP_VITALIS_ACCESS_TOKEN   — Token de acceso MercadoPago
RESEND_API_KEY            — API key de Resend para emails
```

### Schema relevante confirmado

**`centros`**: id, nombre, plan, billing_email, suscripcion_estado, suscripcion_vence, facturacion_nombre, facturacion_apellido, facturacion_dni, facturacion_cuit, facturacion_categoria_fiscal, facturacion_provincia, facturacion_ciudad, facturacion_direccion, horarios (text/JSON)

**`usuarios`**: id, auth_user_id, centro_id, rol_id, profesional_id, nombre, mail, activo

**`roles`**: valores aceptados: `administrador`, `secretaria`, `profesional`

**`profesionales`**: campo email = `mail` (no `email`)

**`servicios`**: centro_id, nombre, duracion_minutos, es_tratamiento, activo (sin `precio_particular`)
