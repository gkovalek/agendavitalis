import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2 } from 'lucide-react';

interface ServicioOption {
  id: string;
  nombre: string;
}

export interface InlineServicioAsignado {
  id?: string;
  servicio_id: string;
  capacidad_simultanea: number;
  dias_trabajo: number[];
  hora_inicio: string;
  hora_fin: string;
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
    onChange([...servicios, { servicio_id: '', capacidad_simultanea: 1, dias_trabajo: [], hora_inicio: '08:00', hora_fin: '18:00' }]);
  };

  const removeServicio = (idx: number) => {
    onChange(servicios.filter((_, i) => i !== idx));
  };

  const updateServicio = (idx: number, updates: Partial<InlineServicioAsignado>) => {
    onChange(servicios.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const toggleDia = (idx: number, dia: number, checked: boolean) => {
    const srv = servicios[idx];
    const newDias = checked ? [...srv.dias_trabajo, dia] : srv.dias_trabajo.filter(d => d !== dia);
    updateServicio(idx, { dias_trabajo: newDias });
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
            <Label className="text-xs font-medium text-muted-foreground">Días de trabajo</Label>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map(d => (
                <label key={d.value} className="flex items-center gap-1 text-xs">
                  <Checkbox checked={srv.dias_trabajo.includes(d.value)}
                    onCheckedChange={(checked) => toggleDia(sIdx, d.value, !!checked)} />
                  {d.label}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="w-28 space-y-1">
                <Label className="text-xs">Hora inicio</Label>
                <Input type="time" value={srv.hora_inicio} className="h-8 text-xs"
                  onChange={e => updateServicio(sIdx, { hora_inicio: e.target.value })} />
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-xs">Hora fin</Label>
                <Input type="time" value={srv.hora_fin} className="h-8 text-xs"
                  onChange={e => updateServicio(sIdx, { hora_fin: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
