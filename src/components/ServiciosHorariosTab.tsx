import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  entityType: 'profesional' | 'equipo';
  entityId: string;
}

interface HorarioDia {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  acepta_os: boolean;
  precio_particular: number | null;
}

type CobroAnticipado = 'ninguno' | '50%' | '100%';

interface ServicioAsignado {
  pcs_id: string;
  servicio_id: string;
  servicio_nombre: string;
  duracion_minutos: number;
  es_tratamiento: boolean;
  sesiones_por_bloque: number | null;
  agenda_nombre: string | null;
  cobro_anticipado: CobroAnticipado;
  horarios: HorarioDia[];
}

const DIAS_LABEL: Record<number, string> = {
  0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb',
};

export function ServiciosHorariosTab({ entityType, entityId }: Props) {
  const { centroId } = useAuth();
  const { toast } = useToast();
  const [servicios, setServicios] = useState<ServicioAsignado[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPcs, setSavingPcs] = useState<string | null>(null);

  useEffect(() => {
    if (!centroId || !entityId) return;
    load();
  }, [centroId, entityId]);

  const load = async () => {
    setLoading(true);
    const col = entityType === 'profesional' ? 'profesional_id' : 'equipo_id';

    // Traer PCS del profesional
    const { data: pcsData } = await supabase
      .from('profesional_centro_servicio')
      .select('id, servicio_id, cobro_anticipado')
      .eq(col, entityId)
      .eq('centro_id', centroId!)
      .eq('activo', true);

    if (!pcsData || pcsData.length === 0) { setServicios([]); setLoading(false); return; }

    const pcsIds = pcsData.map(p => p.id);
    const servicioIds = [...new Set(pcsData.map(p => p.servicio_id).filter(Boolean))];

    // Traer servicios y agendas
    const { data: srvData } = await supabase
      .from('servicios')
      .select('id, nombre, duracion_minutos, es_tratamiento, sesiones_por_bloque, agenda_id, agendas(nombre)')
      .in('id', servicioIds);

    const srvMap: Record<string, any> = {};
    (srvData ?? []).forEach(s => { srvMap[s.id] = s; });

    // Traer franjas horarias
    const { data: horData } = await supabase
      .from('pcs_horario_dia')
      .select('*')
      .in('pcs_id', pcsIds)
      .eq('activo', true)
      .order('dia_semana')
      .order('hora_inicio');

    const horMap: Record<string, HorarioDia[]> = {};
    (horData ?? []).forEach(h => {
      if (!horMap[h.pcs_id]) horMap[h.pcs_id] = [];
      horMap[h.pcs_id].push({
        dia_semana: h.dia_semana,
        hora_inicio: h.hora_inicio.substring(0, 5),
        hora_fin: h.hora_fin.substring(0, 5),
        acepta_os: h.acepta_os,
        precio_particular: h.precio_particular,
      });
    });

    const result: ServicioAsignado[] = pcsData.map(pcs => {
      const srv = srvMap[pcs.servicio_id] ?? {};
      return {
        pcs_id: pcs.id,
        servicio_id: pcs.servicio_id,
        servicio_nombre: srv.nombre ?? '—',
        duracion_minutos: srv.duracion_minutos ?? 0,
        es_tratamiento: srv.es_tratamiento ?? false,
        sesiones_por_bloque: srv.sesiones_por_bloque ?? null,
        agenda_nombre: srv.agendas?.nombre ?? null,
        cobro_anticipado: (pcs.cobro_anticipado as CobroAnticipado) ?? 'ninguno',
        horarios: horMap[pcs.id] ?? [],
      };
    });

    setServicios(result);
    setLoading(false);
  };

  const handleCobroAnticipado = async (pcsId: string, valor: CobroAnticipado) => {
    setSavingPcs(pcsId);
    const { error } = await supabase
      .from('profesional_centro_servicio')
      .update({ cobro_anticipado: valor })
      .eq('id', pcsId);
    setSavingPcs(null);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      setServicios(prev => prev.map(s => s.pcs_id === pcsId ? { ...s, cobro_anticipado: valor } : s));
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  if (servicios.length === 0) return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      Sin servicios asignados. Asigná servicios desde el módulo <strong>Agendas → Servicios</strong>.
    </div>
  );

  return (
    <div className="space-y-3 pt-4">
      {servicios.map(s => (
        <Card key={s.pcs_id} className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{s.servicio_nombre}</CardTitle>
              {s.es_tratamiento
                ? <Badge variant="secondary">Tratamiento ({s.sesiones_por_bloque} ses.)</Badge>
                : <Badge variant="outline">Consulta</Badge>}
              {s.agenda_nombre && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{s.agenda_nombre}</span>
              )}
              <span className="text-xs text-muted-foreground">{s.duracion_minutos} min</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.horarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin horarios configurados.</p>
            ) : (
              <div className="space-y-1.5">
                {s.horarios.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="font-medium w-10">{DIAS_LABEL[h.dia_semana]}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" /> {h.hora_inicio} – {h.hora_fin}
                    </span>
                    {h.acepta_os
                      ? <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Acepta OS</Badge>
                      : <Badge variant="outline" className="text-xs">Solo particular</Badge>}
                    {h.precio_particular && (
                      <span className="text-xs text-muted-foreground">${h.precio_particular.toLocaleString('es-AR')}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1 border-t">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Cobro anticipado (MP):</span>
              <Select
                value={s.cobro_anticipado}
                onValueChange={v => handleCobroAnticipado(s.pcs_id, v as CobroAnticipado)}
                disabled={savingPcs === s.pcs_id}
              >
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin cobro anticipado</SelectItem>
                  <SelectItem value="50%">50% del turno</SelectItem>
                  <SelectItem value="100%">100% del turno</SelectItem>
                </SelectContent>
              </Select>
              {savingPcs === s.pcs_id && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
