import { supabase } from '@/lib/supabase';
import { TURNO_ESTADOS, TurnoEstado } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

interface Turno {
  id: string; fecha: string; hora_inicio: string; estado: TurnoEstado; profesional_id: string;
  paciente_id: string; paciente?: { nombre: string; apellido: string };
}

interface Props { turno: Turno | null; onClose: () => void; onUpdated: () => void; }

export function TurnoDetailDialog({ turno, onClose, onUpdated }: Props) {
  const { toast } = useToast();
  const [estado, setEstado] = useState<TurnoEstado | ''>('');
  const [saving, setSaving] = useState(false);

  const currentEstado = estado || turno?.estado || 'reservado';

  const handleSave = async () => {
    if (!turno || !estado) return;
    setSaving(true);
    const { error } = await supabase.from('turnos').update({ estado }).eq('id', turno.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el turno. Intentá de nuevo.', variant: 'destructive' });
    } else {
      toast({ title: 'Turno actualizado' });
      onUpdated();
    }
  };

  if (!turno) return null;

  return (
    <Dialog open={!!turno} onOpenChange={(o) => { if (!o) { onClose(); setEstado(''); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Detalle del Turno</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><p className="text-sm text-muted-foreground">Paciente</p><p className="font-semibold text-foreground">{turno.paciente ? `${turno.paciente.apellido}, ${turno.paciente.nombre}` : '—'}</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-sm text-muted-foreground">Fecha</p><p className="text-foreground">{turno.fecha}</p></div>
            <div><p className="text-sm text-muted-foreground">Hora</p><p className="text-foreground">{turno.hora_inicio}</p></div>
          </div>
          
          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={currentEstado} onValueChange={(v) => setEstado(v as TurnoEstado)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TURNO_ESTADOS).map(([key, val]) => (
                  <SelectItem key={key} value={key}><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: val.color }} />{val.label}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !estado}>Guardar</Button>
            <Button variant="outline" onClick={() => { onClose(); setEstado(''); }}>Cerrar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
