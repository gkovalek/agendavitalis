import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ServicioOption {
  id: string;
  nombre: string;
}

export interface InlineHorario {
  id?: string;
  tipo: 'semanal' | 'especifico';
  dia_semana: number[];
  fecha_especifica: Date | null;
  hora_inicio: string;
  hora_fin: string;
}

export interface InlineServicioAsignado {
  id?: string;
  servicio_id: string;
  capacidad_simultanea: number;
  horarios: InlineHorario[];
}

interface Props {
  centroId: string | null;
  servicios: InlineServicioAsignado[];
  onChange: (servicios: InlineServicioAsignado[]) => void;
}

const DIAS_SEMANA = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
];

export function InlineServiciosHorarios({ centroId, servicios, onChange }: Props) {
  const [serviciosDisponibles, setServiciosDisponibles] = useState<ServicioOption[]>([]);

  useEffect(() => {
    if (!centroId) return;
    supabase.from('servicios').select('id, nombre').eq('centro_id', centroId).eq('activo', true).order('nombre')
      .then(({ data }) => setServiciosDisponibles(data ?? []));
  }, [centroId]);

  const addServicio = () => {
    onChange([...servicios, { servicio_id: '', capacidad_simultanea: 1, horarios: [] }]);
  };

  const removeServicio = (idx: number) => {
    onChange(servicios.filter((_, i) => i !== idx));
  };

  const updateServicio = (idx: number, updates: Partial<InlineServicioAsignado>) => {
    onChange(servicios.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const addHorario = (sIdx: number) => {
    const updated = [...servicios];
    updated[sIdx] = {
      ...updated[sIdx],
      horarios: [...updated[sIdx].horarios, { tipo: 'semanal', dia_semana: [], fecha_especifica: null, hora_inicio: '08:00', hora_fin: '12:00' }],
    };
    onChange(updated);
  };

  const removeHorario = (sIdx: number, hIdx: number) => {
    const updated = [...servicios];
    updated[sIdx] = { ...updated[sIdx], horarios: updated[sIdx].horarios.filter((_, i) => i !== hIdx) };
    onChange(updated);
  };

  const updateHorario = (sIdx: number, hIdx: number, updates: Partial<InlineHorario>) => {
    const updated = [...servicios];
    updated[sIdx] = { ...updated[sIdx], horarios: updated[sIdx].horarios.map((h, i) => i === hIdx ? { ...h, ...updates } : h) };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Servicios y Horarios</Label>
        <Button type="button" variant="outline" size="sm" onClick={addServicio}>
          <Plus className="w-3 h-3 mr-1" /> Agregar Servicio
        </Button>
      </div>

      {servicios.length === 0 && <p className="text-xs text-muted-foreground">Sin servicios asignados</p>}

      {servicios.map((srv, sIdx) => (
        <div key={sIdx} className="border rounded-md p-3 space-y-3 bg-muted/30">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Servicio</Label>
              <Select value={srv.servicio_id} onValueChange={v => updateServicio(sIdx, { servicio_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {serviciosDisponibles.map(s => (<SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28 space-y-1">
              <Label className="text-xs">Capacidad</Label>
              <Input type="number" min={1} value={srv.capacidad_simultanea} className="h-9"
                onChange={e => updateServicio(sIdx, { capacidad_simultanea: Number(e.target.value) })} />
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeServicio(sIdx)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>

          <div className="pl-3 border-l-2 border-primary/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Horarios</span>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addHorario(sIdx)}>
                <Plus className="w-3 h-3 mr-1" /> Agregar Horario
              </Button>
            </div>

            {srv.horarios.map((h, hIdx) => (
              <div key={hIdx} className="bg-background border rounded p-2 space-y-2">
                <div className="flex items-end gap-2">
                  <div className="w-36 space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={h.tipo} onValueChange={v => updateHorario(sIdx, hIdx, { tipo: v as 'semanal' | 'especifico' })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semanal">Semanal fijo</SelectItem>
                        <SelectItem value="especifico">Día específico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Inicio</Label>
                    <Input type="time" value={h.hora_inicio} className="h-8 text-xs"
                      onChange={e => updateHorario(sIdx, hIdx, { hora_inicio: e.target.value })} />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Fin</Label>
                    <Input type="time" value={h.hora_fin} className="h-8 text-xs"
                      onChange={e => updateHorario(sIdx, hIdx, { hora_fin: e.target.value })} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeHorario(sIdx, hIdx)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>

                {h.tipo === 'semanal' ? (
                  <div className="flex flex-wrap gap-2">
                    {DIAS_SEMANA.map(d => (
                      <label key={d.value} className="flex items-center gap-1 text-xs">
                        <Checkbox checked={h.dia_semana.includes(d.value)}
                          onCheckedChange={(checked) => {
                            updateHorario(sIdx, hIdx, {
                              dia_semana: checked ? [...h.dia_semana, d.value] : h.dia_semana.filter(v => v !== d.value),
                            });
                          }} />
                        {d.label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-8 text-xs w-48", !h.fecha_especifica && "text-muted-foreground")}>
                        <CalendarIcon className="mr-1 h-3 w-3" />
                        {h.fecha_especifica ? format(h.fecha_especifica, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={h.fecha_especifica ?? undefined}
                        onSelect={d => updateHorario(sIdx, hIdx, { fecha_especifica: d ?? null })}
                        initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
