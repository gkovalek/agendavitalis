import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2 } from 'lucide-react';
import { normalizeDiasTrabajo } from '@/lib/constants';

interface AgendaOption {
  id: string;
  nombre: string;
  duracion_minutos: number;
  sesiones_por_bloque: number;
}

export interface InlineAgendaAsignada {
  id?: string;
  agenda_id: string;
  dias_trabajo: string[];
  hora_inicio: string;
  hora_fin: string;
}

interface Props {
  centroId: string | null;
  agendas: InlineAgendaAsignada[];
  onChange: (agendas: InlineAgendaAsignada[]) => void;
}

const DIAS_SEMANA = [
  { value: 'lunes', label: 'Lun' },
  { value: 'martes', label: 'Mar' },
  { value: 'miercoles', label: 'Mié' },
  { value: 'jueves', label: 'Jue' },
  { value: 'viernes', label: 'Vie' },
  { value: 'sabado', label: 'Sáb' },
];

export function InlineAgendasHorarios({ centroId, agendas, onChange }: Props) {
  const [agendasDisponibles, setAgendasDisponibles] = useState<AgendaOption[]>([]);

  useEffect(() => {
    if (!centroId) return;
    supabase.from('agendas').select('id, nombre, duracion_minutos, sesiones_por_bloque').eq('centro_id', centroId).order('nombre')
      .then(({ data }) => setAgendasDisponibles(data ?? []));
  }, [centroId]);

  const addAgenda = () => {
    onChange([...agendas, { agenda_id: '', dias_trabajo: [], hora_inicio: '08:00', hora_fin: '18:00' }]);
  };

  const removeAgenda = (idx: number) => {
    onChange(agendas.filter((_, i) => i !== idx));
  };

  const updateAgenda = (idx: number, updates: Partial<InlineAgendaAsignada>) => {
    onChange(agendas.map((a, i) => i === idx ? { ...a, ...updates } : a));
  };

  const toggleDia = (idx: number, dia: string, checked: boolean) => {
    const ag = agendas[idx];
    const diasActuales = normalizeDiasTrabajo(ag.dias_trabajo);
    const newDias = checked ? [...diasActuales, dia] : diasActuales.filter(d => d !== dia);
    updateAgenda(idx, { dias_trabajo: normalizeDiasTrabajo(newDias) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Agendas y Horarios</Label>
        <Button type="button" variant="outline" size="sm" onClick={addAgenda}>
          <Plus className="w-3 h-3 mr-1" /> Agregar Agenda
        </Button>
      </div>

      {agendas.length === 0 && <p className="text-xs text-muted-foreground">Sin agendas asignadas</p>}

      {agendas.map((ag, idx) => {
        const agendaInfo = agendasDisponibles.find(a => a.id === ag.agenda_id);
        return (
          <div key={idx} className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Agenda</Label>
                <Select value={ag.agenda_id} onValueChange={v => updateAgenda(idx, { agenda_id: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar agenda" /></SelectTrigger>
                  <SelectContent>
                    {agendasDisponibles.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nombre}
                        <span className="text-muted-foreground ml-2 text-xs">({a.duracion_minutos} min · {a.sesiones_por_bloque} sim.)</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {agendaInfo && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Duración: <strong>{agendaInfo.duracion_minutos} min</strong> · Simultáneos: <strong>{agendaInfo.sesiones_por_bloque}</strong>
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeAgenda(idx)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>

            <div className="pl-3 border-l-2 border-primary/20 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Días de trabajo</Label>
              <div className="flex flex-wrap gap-2">
                {DIAS_SEMANA.map(d => (
                  <label key={d.value} className="flex items-center gap-1 text-xs cursor-pointer">
                    <Checkbox
                      checked={normalizeDiasTrabajo(ag.dias_trabajo).includes(d.value)}
                      onCheckedChange={(checked) => toggleDia(idx, d.value, !!checked)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Hora inicio</Label>
                  <Input type="time" value={ag.hora_inicio} className="h-8 text-xs"
                    onChange={e => updateAgenda(idx, { hora_inicio: e.target.value })} />
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Hora fin</Label>
                  <Input type="time" value={ag.hora_fin} className="h-8 text-xs"
                    onChange={e => updateAgenda(idx, { hora_fin: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
