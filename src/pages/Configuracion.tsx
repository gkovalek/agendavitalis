import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCentroConfig } from '@/hooks/use-centro-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Settings, Clock, MessageSquare, CreditCard, AlertTriangle, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SQL_SCRIPT = `-- Ejecutar en Supabase SQL Editor para habilitar configuración por centro
CREATE TABLE IF NOT EXISTS centros_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  centro_id uuid NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
  clave text NOT NULL,
  valor text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(centro_id, clave)
);

ALTER TABLE centros_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios ven config de su centro" ON centros_config
  FOR SELECT USING (
    centro_id = (SELECT centro_id FROM usuarios WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "admin modifica config de su centro" ON centros_config
  FOR ALL USING (
    centro_id = (SELECT centro_id FROM usuarios WHERE auth_user_id = auth.uid())
  );`;

interface SectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, description, icon, children }: SectionProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function Configuracion() {
  const { centroId } = useAuth();
  const { get, getNumber, set, loading, tableExists } = useCentroConfig(centroId);
  const { toast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Local state para edición
  const [vals, setVals] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!loading && !initialized) {
      setVals({
        centro_nombre: get('centro_nombre'),
        centro_telefono: get('centro_telefono'),
        centro_direccion: get('centro_direccion'),
        intervalo_turnos: String(getNumber('intervalo_turnos')),
        hora_inicio_agenda: get('hora_inicio_agenda') || '08:00',
        hora_fin_agenda: get('hora_fin_agenda') || '20:00',
        n8n_webhook_recordatorios: get('n8n_webhook_recordatorios'),
        mp_access_token: get('mp_access_token'),
        mp_public_key: get('mp_public_key'),
      });
      setInitialized(true);
    }
  }, [loading, initialized]);

  const handleSave = async (section: string, keys: string[]) => {
    setSaving(section);
    for (const k of keys) {
      await set(k as any, vals[k] ?? '');
    }
    setSaving(null);
    toast({ title: 'Configuración guardada' });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(SQL_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Configuración</h1>
        <p className="text-sm text-muted-foreground">Ajustes del centro médico</p>
      </div>

      {/* Banner si la tabla no existe */}
      {!tableExists && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-yellow-800">Tabla de configuración no encontrada</p>
                <p className="text-xs text-yellow-700 mt-1">Ejecutá el siguiente SQL en el editor de Supabase para habilitar esta sección:</p>
              </div>
            </div>
            <div className="relative">
              <pre className="bg-yellow-100 rounded p-3 text-xs overflow-auto max-h-40 text-yellow-900 font-mono">{SQL_SCRIPT}</pre>
              <Button size="sm" variant="outline" className="absolute top-2 right-2 h-7 text-xs" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info del centro */}
      <Section
        title="Información del centro"
        description="Nombre y datos de contacto que se muestran en el portal público"
        icon={<Settings className="h-4 w-4 text-muted-foreground" />}
      >
        <Field label="Nombre del centro">
          <Input value={vals.centro_nombre ?? ''} onChange={e => setVals(v => ({ ...v, centro_nombre: e.target.value }))} placeholder="Ej: Kinekids Centro de Kinesiología" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Teléfono">
            <Input value={vals.centro_telefono ?? ''} onChange={e => setVals(v => ({ ...v, centro_telefono: e.target.value }))} placeholder="Ej: +54 11 4567-8900" />
          </Field>
          <Field label="Dirección">
            <Input value={vals.centro_direccion ?? ''} onChange={e => setVals(v => ({ ...v, centro_direccion: e.target.value }))} placeholder="Ej: Av. Corrientes 1234, CABA" />
          </Field>
        </div>
        <Button
          size="sm"
          disabled={saving === 'centro' || !tableExists}
          onClick={() => handleSave('centro', ['centro_nombre', 'centro_telefono', 'centro_direccion'])}
        >
          {saving === 'centro' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </Section>

      {/* Configuración de agenda */}
      <Section
        title="Agenda"
        description="Intervalo de slots y horario de atención mostrado en el panel principal"
        icon={<Clock className="h-4 w-4 text-muted-foreground" />}
      >
        <Field label="Intervalo de turnos (minutos)">
          <Select
            value={vals.intervalo_turnos ?? '30'}
            onValueChange={v => setVals(prev => ({ ...prev, intervalo_turnos: v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[15, 20, 30, 45, 60].map(m => (
                <SelectItem key={m} value={String(m)}>{m} minutos</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horario inicio">
            <Input type="time" value={vals.hora_inicio_agenda ?? '08:00'} onChange={e => setVals(v => ({ ...v, hora_inicio_agenda: e.target.value }))} className="w-32" />
          </Field>
          <Field label="Horario fin">
            <Input type="time" value={vals.hora_fin_agenda ?? '20:00'} onChange={e => setVals(v => ({ ...v, hora_fin_agenda: e.target.value }))} className="w-32" />
          </Field>
        </div>
        <Button
          size="sm"
          disabled={saving === 'agenda' || !tableExists}
          onClick={() => handleSave('agenda', ['intervalo_turnos', 'hora_inicio_agenda', 'hora_fin_agenda'])}
        >
          {saving === 'agenda' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </Section>

      {/* n8n / Recordatorios */}
      <Section
        title="Recordatorios (n8n + WhatsApp)"
        description="URL del webhook de n8n que recibe los turnos para enviar recordatorios por WhatsApp"
        icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <Field label="Webhook URL">
          <Input
            value={vals.n8n_webhook_recordatorios ?? ''}
            onChange={e => setVals(v => ({ ...v, n8n_webhook_recordatorios: e.target.value }))}
            placeholder="https://tu-n8n.app/webhook/recordatorios"
            className="font-mono text-sm"
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          El módulo de Recordatorios enviará un POST a esta URL con la lista de turnos del día siguiente.
        </p>
        <Button
          size="sm"
          disabled={saving === 'n8n' || !tableExists}
          onClick={() => handleSave('n8n', ['n8n_webhook_recordatorios'])}
        >
          {saving === 'n8n' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </Section>

      {/* Mercado Pago */}
      <Section
        title="Mercado Pago"
        description="Credenciales para generar links de pago al momento de reservar un turno"
        icon={<CreditCard className="h-4 w-4 text-muted-foreground" />}
      >
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline" className="text-xs">Próximamente</Badge>
          <span className="text-xs text-muted-foreground">Módulo en desarrollo</span>
        </div>
        <Field label="Access Token">
          <Input
            value={vals.mp_access_token ?? ''}
            onChange={e => setVals(v => ({ ...v, mp_access_token: e.target.value }))}
            placeholder="APP_USR-..."
            type="password"
            className="font-mono text-sm"
          />
        </Field>
        <Field label="Public Key">
          <Input
            value={vals.mp_public_key ?? ''}
            onChange={e => setVals(v => ({ ...v, mp_public_key: e.target.value }))}
            placeholder="APP_USR-..."
            className="font-mono text-sm"
          />
        </Field>
        <Button
          size="sm"
          disabled={saving === 'mp' || !tableExists}
          onClick={() => handleSave('mp', ['mp_access_token', 'mp_public_key'])}
        >
          {saving === 'mp' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" /> Guardar
        </Button>
      </Section>

      {/* Link del portal público */}
      <Section
        title="Portal público de reservas"
        description="Compartí este link con tus pacientes para que puedan reservar turnos online"
        icon={<Settings className="h-4 w-4 text-muted-foreground" />}
      >
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={centroId ? `${window.location.origin}/reservar/${centroId}` : ''}
            className="font-mono text-sm bg-muted"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/reservar/${centroId}`);
              toast({ title: 'Link copiado' });
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </Section>
    </div>
  );
}
