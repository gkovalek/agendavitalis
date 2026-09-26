# Setup n8n — Recordatorios Vitalis

## Variables de entorno (n8n > Settings > Environment Variables)

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | `https://gsmrccofuegcmujycydd.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key de Supabase |
| `YCLOUD_API_KEY` | API Key de YCloud (WhatsApp Manager > Developers) |

---

## Workflow 1 — Recordatorios manuales (desde la app)

1. Importar `workflow-1-envio-recordatorios.json`
2. Activar el workflow
3. Copiar la URL del webhook: `https://<tu-n8n>/webhook/vitalis-recordatorios`
4. En Supabase Dashboard → Table Editor → `centros` → buscar el centro → campo `configuracion`:
   ```json
   { "n8n_webhook_recordatorios": "https://<tu-n8n>/webhook/vitalis-recordatorios" }
   ```

### Plantilla activa en YCloud
- **Nombre**: `template_utility_20260916104443`
- **Idioma**: `es_AR`
- **Estado**: Activo (Calidad pendiente — apta para envío)
- **Variables** (en orden):

| `{{N}}` | Campo enviado | Ejemplo |
|---------|--------------|---------|
| `{{1}}` | Nombre del paciente | `María` |
| `{{2}}` | Día del turno (DD/MM/YYYY) | `28/09/2026` |
| `{{3}}` | Hora del turno (HH:MM) | `10:00` |
| `{{4}}` | Servicio | `Kinesiología` |
| `{{5}}` | Profesional (Apellido, Nombre) | `García, Juan` |
| `{{6}}` | Nombre del centro | `Kine+` |
| `{{7}}` | Dirección del centro | `Av. Belgrano 1234` |

### Número origen YCloud
- **Número**: `+5493625456570`
- **WABA ID**: `1091435396905786`
- **Phone Number ID**: `6a9b136791b24440ea6d2a87`

---

## Workflow 4 — Mensajes inbound (bot IA)

1. Importar `workflow-4-ycloud-inbound.json`
2. Activar el workflow
3. Copiar la URL del webhook: `https://<tu-n8n>/webhook/ycloud-inbound`
4. En YCloud console → WhatsApp Manager → Settings → Webhook URL → pegar la URL

### Variables de entorno adicionales para Workflow 4

| Variable | Valor |
|---|---|
| `YCLOUD_API_KEY` | API Key de YCloud |
| `SUPABASE_URL` | `https://gsmrccofuegcmujycydd.supabase.co` |

---

## Flujo completo

```
[App - botón Enviar recordatorio] ──POST──► Workflow 1 ──► YCloud API ──► WhatsApp paciente
[Paciente responde]               ──────────────────────► YCloud webhook ──► Workflow 4 ──► wa-asistente EF
```

## Configuración en la app (Vitalis > Configuración)

Para que los recordatorios incluyan la dirección en el mensaje, asegurate de tener configurados:
- **Nombre del centro** (`centro_nombre`)
- **Dirección** (`centro_direccion`)
