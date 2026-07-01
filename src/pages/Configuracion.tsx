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
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Settings, Clock, AlertTriangle, Copy, Check, MapPin, Globe, Mail, ShieldCheck } from 'lucide-react';
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

-- Lectura: cualquier usuario activo del centro puede ver configuración no sensible.
-- IMPORTANTE: No almacenar secretos (tokens privados de pago, API keys) en esta tabla.
-- Usar Edge Function Secrets de Supabase para credenciales server-side.
DROP POLICY IF EXISTS "usuarios ven config de su centro" ON centros_config;
CREATE POLICY "usuarios ven config de su centro" ON centros_config
  FOR SELECT TO authenticated USING (
    centro_id = (SELECT centro_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo = true)
  );

-- Escritura: SOLO administradores del centro pueden modificar la configuración
DROP POLICY IF EXISTS "admin modifica config de su centro" ON centros_config;
CREATE POLICY "admin modifica config de su centro" ON centros_config
  FOR ALL TO authenticated USING (
    centro_id = (SELECT centro_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo = true)
    AND EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.auth_user_id = auth.uid() AND u.activo = true AND r.nombre = 'admin'
    )
  ) WITH CHECK (
    centro_id = (SELECT centro_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo = true)
    AND EXISTS (
      SELECT 1 FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE u.auth_user_id = auth.uid() AND u.activo = true AND r.nombre = 'admin'
    )
  );

-- Eliminar cualquier token sensible que pueda haber quedado almacenado en client-readable config
DELETE FROM centros_config WHERE clave IN ('mp_access_token');`;

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
        centro_ciudad: get('centro_ciudad'),
        centro_mail: get('centro_mail'),
        centro_web: get('centro_web'),
        secretario_ver_caja: get('secretario_ver_caja') || 'true',
        secretario_ver_liquidacion: get('secretario_ver_liquidacion') || 'true',
        intervalo_turnos: String(getNumber('intervalo_turnos')),
        hora_inicio_agenda: get('hora_inicio_agenda') || '08:00',
        hora_fin_agenda: get('hora_fin_agenda') || '20:00',
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
            <Input value={vals.centro_direccion ?? ''} onChange={e => setVals(v => ({ ...v, centro_direccion: e.target.value }))} placeholder="Ej: Av. Corrientes 1234" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={<span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Ciudad</span>}>
            <Input value={vals.centro_ciudad ?? ''} onChange={e => setVals(v => ({ ...v, centro_ciudad: e.target.value }))} placeholder="Ej: Resistencia, Chaco" />
          </Field>
          <Field label={<span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Mail institucional (opcional)</span>}>
            <Input type="email" value={vals.centro_mail ?? ''} onChange={e => setVals(v => ({ ...v, centro_mail: e.target.value }))} placeholder="Ej: info@kineplus.com.ar" />
          </Field>
        </div>
        <Field label={<span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Sitio web (opcional)</span>}>
          <Input value={vals.centro_web ?? ''} onChange={e => setVals(v => ({ ...v, centro_web: e.target.value }))} placeholder="Ej: https://kineplus.com.ar" />
        </Field>
        <Button
          size="sm"
          disabled={saving === 'centro' || !tableExists}
          onClick={() => handleSave('centro', ['centro_nombre', 'centro_telefono', 'centro_direccion', 'centro_ciudad', 'centro_mail', 'centro_web'])}
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

      {/* Permisos de secretarios */}
      <Section
        title="Permisos de secretarios"
        description="Los secretarios ven todo el sistema excepto lo que desactives aquí"
        icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Caja del día</p>
              <p className="text-xs text-muted-foreground">Puede ver y registrar movimientos de caja</p>
            </div>
            <Switch
              checked={vals.secretario_ver_caja !== 'false'}
              onCheckedChange={v => setVals(prev => ({ ...prev, secretario_ver_caja: v ? 'true' : 'false' }))}
              className="data-[state=checked]:bg-[#0F6E56]"
              disabled={!tableExists}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Liquidación mensual OS</p>
              <p className="text-xs text-muted-foreground">Puede ver la liquidación de obras sociales</p>
            </div>
            <Switch
              checked={vals.secretario_ver_liquidacion !== 'false'}
              onCheckedChange={v => setVals(prev => ({ ...prev, secretario_ver_liquidacion: v ? 'true' : 'false' }))}
              className="data-[state=checked]:bg-[#0F6E56]"
              disabled={!tableExists}
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={saving === 'permisos' || !tableExists}
          onClick={() => handleSave('permisos', ['secretario_ver_caja', 'secretario_ver_liquidacion'])}
        >
          {saving === 'permisos' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
