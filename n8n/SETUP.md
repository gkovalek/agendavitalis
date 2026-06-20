# Setup n8n — Recordatorios Vitalis

## Variables de entorno (n8n > Settings > Environment Variables)

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key de Supabase |
| `TWILIO_ACCOUNT_SID` | Tu Account SID de Twilio |
| `TWILIO_FROM_WHATSAPP` | `whatsapp:+14155238886` (tu número Twilio) |
| `TWILIO_TEMPLATE_SID` | `HX5111b578b335001ca7d64be9222aff02` |

## Credencial en n8n (Credentials > New > HTTP Basic Auth)

- **Name**: `Twilio Basic Auth`
- **User**: tu `TWILIO_ACCOUNT_SID`
- **Password**: tu `TWILIO_AUTH_TOKEN`

---

## Workflow 1 — Manual (desde la app)

1. Importar `workflow-1-recordatorios-manual.json`
2. Activar el workflow
3. Copiar la URL del webhook: `https://tudominio.hostinger.com/webhook/recordatorios-manual`
4. En Supabase: `UPDATE centros SET configuracion = configuracion || '{"n8n_webhook_recordatorios": "https://tudominio.hostinger.com/webhook/recordatorios-manual"}' WHERE id = 'tu-centro-id'`

## Workflow 2 — Cron automático 20:00

1. Importar `workflow-2-recordatorios-cron.json`
2. **Verificar zona horaria del servidor Hostinger**: si es UTC, el cron debe ser `0 23 * * *` (UTC = Argentina+3). Si es UTC-3, usar `0 20 * * *`
3. Activar el workflow

## Workflow 3 — Respuestas inbound

1. Importar `workflow-3-respuestas-inbound.json`
2. Activar el workflow
3. Copiar la URL del webhook: `https://tudominio.hostinger.com/webhook/twilio-inbound`
4. En **Twilio Console**:
   - Ir a Messaging > Senders > WhatsApp Senders
   - Seleccionar tu número
   - En "A MESSAGE COMES IN": `POST` → pegar la URL del webhook
   - Guardar

---

## Flujo completo

```
[App - botón Enviar] ──POST──► Workflow 1 ──► Twilio ──► WhatsApp paciente
[Cron 20:00]         ──────► Workflow 2 ──► Twilio ──► WhatsApp paciente
[Paciente responde]  ──────► Twilio ──POST──► Workflow 3
                                                  ├─ "1/confirmo" ──► Supabase PATCH estado=confirmado
                                                  ├─ "2/cancelo"  ──► Supabase PATCH estado=cancelado
                                                  └─ "3/reagendar"──► Twilio reply con link WA
```

## Respuestas reconocidas (Workflow 3)

| Lo que escribe el paciente | Acción |
|---|---|
| 1, si, sí, confirmo, ok, dale, listo | → estado `confirmado` |
| 2, no, cancelo, no puedo | → estado `cancelado` |
| 3, reagendar, cambiar, otro horario | → responde con link WhatsApp |

El cambio de estado en Supabase se refleja automáticamente en el Dashboard de Vitalis (color de la tarjeta del turno).
