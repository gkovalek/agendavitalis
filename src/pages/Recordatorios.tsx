import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Loader2, Send, MessageSquare, Settings, CheckCircle, Clock, AlertCircle, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TurnoRecordatorio {
  id: string;
  fecha: string;
  hora_inicio: string;
  estado: string;
  recordatorio_enviado: boolean;
  paciente?: { nombre: string; apellido: string; celular: string | null };
  profesional?: { nombre: string; apellido: string };
  servicio?: { nombre: string };
}

const ESTADOS_VALIDOS = ['reservado', 'confirmado', 'en_sala'];

export default function Recordatorios() {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const [turnos, setTurnos] = useState<TurnoRecordatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [fechaObjetivo, setFechaObjetivo] = useState<string>('');
  const [soloSinEnviar, setSoloSinEnviar] = useState(true);

  // Configuración n8n (guardada en localStorage por centro)
  const storageKey = `vitalis_n8n_webhook_${centroId}`;
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem(storageKey) ?? '');
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [webhookTemp, setWebhookTemp] = useState('');

  // Calcular mañana como fecha default
  useEffect(() => {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    setFechaObjetivo(manana.toISOString().split('T')[0]);
  }, []);

  const fetchTurnos = async () => {
    if (!centroId || !fechaObjetivo) return;
    setLoading(true);
    const { data } = await supabase
      .from('turnos')
      .select('id, fecha, hora_inicio, estado, recordatorio_enviado, paciente:pacientes(nombre, apellido, celular), profesional:profesionales(nombre, apellido), servicio:servicios(nombre)')
      .eq('centro_id', centroId)
      .eq('fecha', fechaObjetivo)
      .in('estado', ESTADOS_VALIDOS)
      .order('hora_inicio');
    setTurnos((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (fechaObjetivo) fetchTurnos(); }, [centroId, fechaObjetivo]);

  const turnosFiltrados = useMemo(() => {
    if (!soloSinEnviar) return turnos;
    return turnos.filter(t => !t.recordatorio_enviado);
  }, [turnos, soloSinEnviar]);

  const conCelular = turnosFiltrados.filter(t => !!t.paciente?.celular && t.paciente.celular.trim() !== '');
  const sinCelular = turnosFiltrados.filter(t => !t.paciente?.celular || t.paciente.celular.trim() === '');

  const handleGuardarConfig = () => {
    localStorage.setItem(storageKey, webhookTemp);
    setWebhookUrl(webhookTemp);
    setEditandoConfig(false);
    toast({ title: 'Configuración guardada' });
  };

  const handleEnviarRecordatorios = async () => {
    if (!webhookUrl) {
      toast({ title: 'Configurá el webhook de n8n primero', variant: 'destructive' });
      return;
    }
    if (conCelular.length === 0) {
      toast({ title: 'No hay turnos para enviar recordatorios', variant: 'destructive' });
      return;
    }
    setEnviando(true);
    try {
      const payload = conCelular.map(t => ({
        turno_id: t.id,
        fecha: t.fecha,
        hora: t.hora_inicio,
        paciente_nombre: `${t.paciente?.nombre} ${t.paciente?.apellido}`,
        celular: t.paciente?.celular,
        profesional: `${t.profesional?.apellido}, ${t.profesional?.nombre}`,
        servicio: t.servicio?.nombre,
      }));

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ centro_id: centroId, fecha: fechaObjetivo, turnos: payload }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Marcar como enviados en Supabase
      const ids = conCelular.map(t => t.id);
      await supabase.from('turnos').update({ recordatorio_enviado: true }).in('id', ids);

      toast({ title: `${conCelular.length} recordatorios enviados a n8n` });
      fetchTurnos();
    } catch (err: any) {
      toast({ title: 'Error al llamar al webhook', description: err.message, variant: 'destructive' });
    }
    setEnviando(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Recordatorios</h1>
        <p className="text-sm text-muted-foreground">Enviá recordatorios de turno por WhatsApp via n8n</p>
      </div>

      {/* Configuración n8n */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Configuración n8n</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setWebhookTemp(webhookUrl); setEditandoConfig(!editandoConfig); }}>
              {editandoConfig ? 'Cancelar' : 'Editar'}
            </Button>
          </div>
          <CardDescription>URL del webhook de n8n que recibe los turnos para enviar recordatorios</CardDescription>
        </CardHeader>
        <CardContent>
          {editandoConfig ? (
            <div className="flex gap-2">
              <Input placeholder="https://tu-n8n.app/webhook/..." value={webhookTemp} onChange={e => setWebhookTemp(e.target.value)} className="flex-1 font-mono text-sm" />
              <Button onClick={handleGuardarConfig} disabled={!webhookTemp}>Guardar</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {webhookUrl ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-sm font-mono text-muted-foreground truncate">{webhookUrl}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                  <span className="text-sm text-muted-foreground">No configurado — hacé click en Editar para agregar la URL del webhook</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selector de fecha + filtros + acción */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="space-y-1">
          <Label>Fecha de los turnos</Label>
          <Input type="date" value={fechaObjetivo} onChange={e => setFechaObjetivo(e.target.value)} className="w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={soloSinEnviar} onCheckedChange={setSoloSinEnviar} />
          <Label className="text-sm">Solo sin enviar</Label>
        </div>
        <Button
          className="sm:ml-auto"
          onClick={handleEnviarRecordatorios}
          disabled={enviando || conCelular.length === 0 || !webhookUrl}
        >
          {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Enviar {conCelular.length > 0 ? `(${conCelular.length})` : ''} recordatorios
        </Button>
      </div>

      {/* Resumen */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Turnos del día', value: turnos.length, icon: Clock, color: 'text-foreground' },
            { label: 'Con celular', value: conCelular.length, icon: Phone, color: 'text-green-600' },
            { label: 'Sin celular', value: sinCelular.length, icon: AlertCircle, color: 'text-yellow-600' },
            { label: 'Ya enviados', value: turnos.filter(t => t.recordatorio_enviado).length, icon: CheckCircle, color: 'text-blue-600' },
          ].map(stat => (
            <Card key={stat.label} className="shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <div>
                  <p className="text-xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabla de turnos */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : turnosFiltrados.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No hay turnos para mostrar en esa fecha</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead>Profesional</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Estado envío</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turnosFiltrados.map(t => {
                  const tieneCelular = !!t.paciente?.celular && t.paciente.celular.trim() !== '';
                  return (
                    <TableRow key={t.id} className={!tieneCelular ? 'opacity-50' : ''}>
                      <TableCell className="font-mono text-sm">{t.hora_inicio?.substring(0, 5)}</TableCell>
                      <TableCell className="font-medium">{t.paciente?.apellido}, {t.paciente?.nombre}</TableCell>
                      <TableCell>
                        {tieneCelular ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-green-500" />
                            {t.paciente?.celular}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-yellow-500" /> Sin celular
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{t.profesional?.apellido}</TableCell>
                      <TableCell className="text-sm">{t.servicio?.nombre ?? '—'}</TableCell>
                      <TableCell>
                        {t.recordatorio_enviado ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" /> Enviado
                          </Badge>
                        ) : tieneCelular ? (
                          <Badge variant="outline" className="text-muted-foreground text-xs">
                            <Clock className="h-3 w-3 mr-1" /> Pendiente
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50 text-xs">
                            Sin datos
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
