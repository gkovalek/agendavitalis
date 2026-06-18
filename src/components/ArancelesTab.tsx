import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  profesionalId: string;
}

interface OSRow {
  os_id: string;
  nombre: string;
  acepta: boolean;
  cobra_plus: boolean;
  monto_plus: string;
}

interface ServicioRow {
  servicio_id: string;
  nombre: string;
  solo_particular: boolean;
  precio_particular: string;
  precio_os_sin_plus: string;
}

interface DiaRow {
  dia_semana: number;
  solo_particular: boolean;
  nota: string;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function ArancelesTab({ profesionalId }: Props) {
  const { centroId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [precioParticular, setPrecioParticular] = useState('');
  const [aceptaParticular, setAceptaParticular] = useState(true);

  const [osRows, setOsRows] = useState<OSRow[]>([]);
  const [servicioRows, setServicioRows] = useState<ServicioRow[]>([]);
  const [diaRows, setDiaRows] = useState<DiaRow[]>([]);

  useEffect(() => {
    if (!centroId || !profesionalId) return;
    load();
  }, [centroId, profesionalId]);

  const load = async () => {
    setLoading(true);
    const [
      { data: prof },
      { data: todasOS },
      { data: profOS },
      { data: todosServicios },
      { data: profServicios },
      { data: profDias },
    ] = await Promise.all([
      supabase.from('profesionales').select('precio_particular, acepta_particular').eq('id', profesionalId).single(),
      supabase.from('obras_sociales').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('profesionales_os').select('*').eq('profesional_id', profesionalId),
      supabase.from('profesional_centro_servicio')
        .select('servicio_id, servicios(id, nombre)')
        .eq('profesional_id', profesionalId)
        .eq('centro_id', centroId),
      supabase.from('profesionales_servicios_config').select('*').eq('profesional_id', profesionalId),
      supabase.from('profesionales_dias_config').select('*').eq('profesional_id', profesionalId),
    ]);

    setPrecioParticular(prof?.precio_particular?.toString() ?? '');
    setAceptaParticular(prof?.acepta_particular ?? true);

    // OS: cruzar todas las OS con las configuradas
    const osMap: Record<string, typeof profOS extends (infer T)[] | null ? T : never> = {};
    profOS?.forEach(r => { osMap[r.os_id] = r; });
    setOsRows((todasOS ?? []).map(os => ({
      os_id: os.id,
      nombre: os.nombre,
      acepta: !!osMap[os.id],
      cobra_plus: osMap[os.id]?.cobra_plus ?? false,
      monto_plus: osMap[os.id]?.monto_plus?.toString() ?? '',
    })));

    // Servicios: cruzar los asignados al profesional con config
    const srvMap: Record<string, any> = {};
    profServicios?.forEach(r => { srvMap[r.servicio_id] = r; });
    const serviciosUnicos = new Map<string, string>();
    todosServicios?.forEach((r: any) => {
      if (r.servicio_id && r.servicios?.nombre) {
        serviciosUnicos.set(r.servicio_id, r.servicios.nombre);
      }
    });
    setServicioRows(Array.from(serviciosUnicos.entries()).map(([id, nombre]) => ({
      servicio_id: id,
      nombre,
      solo_particular: srvMap[id]?.solo_particular ?? false,
      precio_particular: srvMap[id]?.precio_particular?.toString() ?? '',
      precio_os_sin_plus: srvMap[id]?.precio_os_sin_plus?.toString() ?? '',
    })));

    // Días: lunes a sábado por defecto
    const diaMap: Record<number, any> = {};
    profDias?.forEach(r => { diaMap[r.dia_semana] = r; });
    setDiaRows([1, 2, 3, 4, 5, 6].map(d => ({
      dia_semana: d,
      solo_particular: diaMap[d]?.solo_particular ?? false,
      nota: diaMap[d]?.nota ?? '',
    })));

    setLoading(false);
  };

  const handleSave = async () => {
    if (!centroId) return;
    setSaving(true);

    // 1. Actualizar precio_particular y acepta_particular en profesionales
    await supabase.from('profesionales').update({
      precio_particular: precioParticular ? parseFloat(precioParticular) : null,
      acepta_particular: aceptaParticular,
    }).eq('id', profesionalId);

    // 2. OS: delete todas y re-insertar las aceptadas
    await supabase.from('profesionales_os').delete().eq('profesional_id', profesionalId);
    const osAceptadas = osRows.filter(r => r.acepta).map(r => ({
      centro_id: centroId,
      profesional_id: profesionalId,
      os_id: r.os_id,
      cobra_plus: r.cobra_plus,
      monto_plus: r.cobra_plus && r.monto_plus ? parseFloat(r.monto_plus) : 0,
      activo: true,
    }));
    if (osAceptadas.length > 0) {
      await supabase.from('profesionales_os').insert(osAceptadas);
    }

    // 3. Servicios config: delete y re-insertar los que tienen config
    await supabase.from('profesionales_servicios_config').delete().eq('profesional_id', profesionalId);
    const srvConfig = servicioRows.filter(r => r.solo_particular || r.precio_particular || r.precio_os_sin_plus).map(r => ({
      centro_id: centroId,
      profesional_id: profesionalId,
      servicio_id: r.servicio_id,
      solo_particular: r.solo_particular,
      precio_particular: r.precio_particular ? parseFloat(r.precio_particular) : null,
      precio_os_sin_plus: r.precio_os_sin_plus ? parseFloat(r.precio_os_sin_plus) : null,
      activo: true,
    }));
    if (srvConfig.length > 0) {
      await supabase.from('profesionales_servicios_config').insert(srvConfig);
    }

    // 4. Días config: delete y re-insertar los que tienen excepción
    await supabase.from('profesionales_dias_config').delete().eq('profesional_id', profesionalId);
    const diasConfig = diaRows.filter(r => r.solo_particular || r.nota).map(r => ({
      centro_id: centroId,
      profesional_id: profesionalId,
      dia_semana: r.dia_semana,
      solo_particular: r.solo_particular,
      nota: r.nota || null,
      activo: true,
    }));
    if (diasConfig.length > 0) {
      await supabase.from('profesionales_dias_config').insert(diasConfig);
    }

    setSaving(false);
    toast({ title: 'Aranceles guardados' });
  };

  const setOs = (idx: number, patch: Partial<OSRow>) =>
    setOsRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const setSrv = (idx: number, patch: Partial<ServicioRow>) =>
    setServicioRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const setDia = (idx: number, patch: Partial<DiaRow>) =>
    setDiaRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 pt-4">

      {/* General */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-1">General</h3>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch checked={aceptaParticular} onCheckedChange={setAceptaParticular} id="acepta-particular" />
            <Label htmlFor="acepta-particular">Acepta particulares</Label>
          </div>
          {aceptaParticular && (
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">Precio particular general $</Label>
              <Input
                type="number"
                className="w-32"
                placeholder="0"
                value={precioParticular}
                onChange={e => setPrecioParticular(e.target.value)}
              />
            </div>
          )}
        </div>
      </section>

      {/* Obras Sociales */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-1">Obras Sociales</h3>
        {osRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay obras sociales cargadas en el sistema.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 font-medium pr-4">Obra Social</th>
                  <th className="pb-2 font-medium pr-4 text-center">Acepta</th>
                  <th className="pb-2 font-medium pr-4 text-center">Cobra plus</th>
                  <th className="pb-2 font-medium">Monto plus $</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {osRows.map((row, i) => (
                  <tr key={row.os_id} className="py-2">
                    <td className="py-2 pr-4 font-medium">{row.nombre}</td>
                    <td className="py-2 pr-4 text-center">
                      <Switch checked={row.acepta} onCheckedChange={v => setOs(i, { acepta: v, cobra_plus: v ? row.cobra_plus : false, monto_plus: v ? row.monto_plus : '' })} />
                    </td>
                    <td className="py-2 pr-4 text-center">
                      <Switch
                        checked={row.cobra_plus}
                        disabled={!row.acepta}
                        onCheckedChange={v => setOs(i, { cobra_plus: v, monto_plus: v ? row.monto_plus : '' })}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        type="number"
                        className="w-28"
                        placeholder="0"
                        disabled={!row.acepta || !row.cobra_plus}
                        value={row.monto_plus}
                        onChange={e => setOs(i, { monto_plus: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Servicios con modalidad especial */}
      {servicioRows.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">Servicios — modalidad y precio</h3>
          <p className="text-xs text-muted-foreground">Configurá solo los servicios que tienen precio o modalidad diferente al general.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 font-medium pr-4">Servicio</th>
                  <th className="pb-2 font-medium pr-4 text-center">Solo particular</th>
                  <th className="pb-2 font-medium pr-4">Precio particular $</th>
                  <th className="pb-2 font-medium">Precio c/OS $</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {servicioRows.map((row, i) => (
                  <tr key={row.servicio_id}>
                    <td className="py-2 pr-4 font-medium">{row.nombre}</td>
                    <td className="py-2 pr-4 text-center">
                      <Switch checked={row.solo_particular} onCheckedChange={v => setSrv(i, { solo_particular: v })} />
                    </td>
                    <td className="py-2 pr-4">
                      <Input
                        type="number"
                        className="w-28"
                        placeholder="General"
                        value={row.precio_particular}
                        onChange={e => setSrv(i, { precio_particular: e.target.value })}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        type="number"
                        className="w-28"
                        placeholder="—"
                        disabled={row.solo_particular}
                        value={row.precio_os_sin_plus}
                        onChange={e => setSrv(i, { precio_os_sin_plus: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Excepciones por día */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-1">Excepciones por día</h3>
        <p className="text-xs text-muted-foreground">Activá solo los días donde la modalidad difiere de lo general.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 font-medium pr-4">Día</th>
                <th className="pb-2 font-medium pr-4 text-center">Solo particular</th>
                <th className="pb-2 font-medium">Nota interna</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {diaRows.map((row, i) => (
                <tr key={row.dia_semana}>
                  <td className="py-2 pr-4 font-medium">{DIAS[row.dia_semana]}</td>
                  <td className="py-2 pr-4 text-center">
                    <Switch checked={row.solo_particular} onCheckedChange={v => setDia(i, { solo_particular: v })} />
                  </td>
                  <td className="py-2">
                    <Input
                      className="w-56"
                      placeholder="Ej: solo consultas privadas"
                      value={row.nota}
                      onChange={e => setDia(i, { nota: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar aranceles
        </Button>
      </div>
    </div>
  );
}
