import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CENTRO_ID } from '@/lib/constants';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PrepagaAutocomplete } from '@/components/PrepagaAutocomplete';

export default function NuevoPaciente() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    fecha_nacimiento: '',
    celular: '',
    email: '',
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
    setLoading(true);

    const { error } = await supabase.from('pacientes').insert({
      nombre: form.nombre,
      apellido: form.apellido,
      dni: form.dni,
      fecha_nacimiento: form.fecha_nacimiento || null,
      celular: form.celular,
      email: form.email || null,
      obra_social_id: form.obra_social_id,
      nro_afiliado: isParticular ? null : form.nro_afiliado || null,
      centro_id: CENTRO_ID,
    });

    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo registrar el paciente. ' + error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Paciente registrado', description: `${form.nombre} ${form.apellido} fue registrado exitosamente.` });
      navigate('/pacientes');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/pacientes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuevo Paciente</h1>
          <p className="text-muted-foreground">Completá los datos del paciente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Datos Personales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input id="nombre" name="nombre" value={form.nombre} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apellido">Apellido *</Label>
              <Input id="apellido" name="apellido" value={form.apellido} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dni">DNI *</Label>
              <Input id="dni" name="dni" value={form.dni} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha_nacimiento">Fecha de Nacimiento</Label>
              <Input id="fecha_nacimiento" name="fecha_nacimiento" type="date" value={form.fecha_nacimiento} onChange={handleChange} />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Contacto</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="celular">Celular *</Label>
              <Input id="celular" name="celular" value={form.celular} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" value={form.email} onChange={handleChange} />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Obra Social</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PrepagaAutocomplete
              value={form.obra_social_id}
              onSelect={(id, nombre) => setForm({ ...form, obra_social_id: id, obra_social_nombre: nombre })}
            />
            {!isParticular && (
              <div className="space-y-2">
                <Label htmlFor="nro_afiliado">Nro. Afiliado</Label>
                <Input id="nro_afiliado" name="nro_afiliado" value={form.nro_afiliado} onChange={handleChange} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar Paciente
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/pacientes')}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
}
