import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CENTRO_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PrepagaAutocomplete } from '@/components/PrepagaAutocomplete';

interface Props {
  fecha: string;
  hora: string;
  profesionalId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function NuevoTurnoForm({ fecha, hora, profesionalId, onSuccess, onCancel }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    celular: '',
    fecha_nacimiento: '',
    obra_social_id: null as string | null,
    obra_social_nombre: '',
    nro_afiliado: '',
  });

  const isParticular = !form.obra_social_id || form.obra_social_nombre.toLowerCase() === 'particular';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre || !form.apellido || !form.dni || !form.celular) {
      toast({ title: 'Error', description: 'Completá los campos obligatorios', variant: 'destructive' });
      return;
    }
    setLoading(true);

    // Check if patient exists by DNI
    let pacienteId: string;
    const { data: existing } = await supabase
      .from('pacientes')
      .select('id')
      .eq('dni', form.dni)
      .eq('centro_id', CENTRO_ID)
      .maybeSingle();

    if (existing) {
      pacienteId = existing.id;
    } else {
      const { data: newPac, error: pacErr } = await supabase
        .from('pacientes')
        .insert({
          nombre: form.nombre,
          apellido: form.apellido,
          dni: form.dni,
          celular: form.celular,
          fecha_nacimiento: form.fecha_nacimiento || null,
          obra_social_id: form.obra_social_id,
          nro_afiliado: isParticular ? null : form.nro_afiliado || null,
          centro_id: CENTRO_ID,
        })
        .select('id')
        .single();

      if (pacErr || !newPac) {
        toast({ title: 'Error', description: 'No se pudo crear el paciente: ' + (pacErr?.message || ''), variant: 'destructive' });
        setLoading(false);
        return;
      }
      pacienteId = newPac.id;
    }

    const { error: turnoErr } = await supabase.from('turnos').insert({
      fecha,
      hora,
      profesional_id: profesionalId,
      paciente_id: pacienteId,
      estado: 'reservado',
      centro_id: CENTRO_ID,
    });

    setLoading(false);
    if (turnoErr) {
      toast({ title: 'Error', description: 'No se pudo crear el turno: ' + turnoErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'Turno creado', description: `${form.apellido}, ${form.nombre} — ${fecha} ${hora}` });
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">Fecha: <strong>{fecha}</strong> — Hora: <strong>{hora}</strong></p>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Nombre *</Label>
          <Input name="nombre" value={form.nombre} onChange={handleChange} required />
        </div>
        <div className="space-y-1">
          <Label>Apellido *</Label>
          <Input name="apellido" value={form.apellido} onChange={handleChange} required />
        </div>
        <div className="space-y-1">
          <Label>DNI *</Label>
          <Input name="dni" value={form.dni} onChange={handleChange} required />
        </div>
        <div className="space-y-1">
          <Label>Celular *</Label>
          <Input name="celular" value={form.celular} onChange={handleChange} required />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Fecha de Nacimiento</Label>
        <Input name="fecha_nacimiento" type="date" value={form.fecha_nacimiento} onChange={handleChange} />
      </div>

      <PrepagaAutocomplete
        value={form.obra_social_id}
        onSelect={(id, nombre) => setForm({ ...form, obra_social_id: id, obra_social_nombre: nombre })}
      />

      {!isParticular && (
        <div className="space-y-1">
          <Label>Nro. de Afiliado</Label>
          <Input name="nro_afiliado" value={form.nro_afiliado} onChange={handleChange} />
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar Turno
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}
