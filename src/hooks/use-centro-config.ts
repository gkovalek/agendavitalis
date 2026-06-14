import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type ConfigMap = Record<string, string>;

export interface CentroConfig {
  intervalo_turnos: number;
  hora_inicio_agenda: string;
  hora_fin_agenda: string;
  n8n_webhook_recordatorios: string;
  mp_access_token: string;
  mp_public_key: string;
  centro_nombre: string;
  centro_telefono: string;
  centro_direccion: string;
}

const DEFAULTS: CentroConfig = {
  intervalo_turnos: 30,
  hora_inicio_agenda: '08:00',
  hora_fin_agenda: '20:00',
  n8n_webhook_recordatorios: '',
  mp_access_token: '',
  mp_public_key: '',
  centro_nombre: '',
  centro_telefono: '',
  centro_direccion: '',
};

export function useCentroConfig(centroId: string | null) {
  const [raw, setRaw] = useState<ConfigMap>({});
  const [loading, setLoading] = useState(true);
  const [tableExists, setTableExists] = useState(true);

  const fetch = useCallback(async () => {
    if (!centroId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('centros_config')
      .select('clave, valor')
      .eq('centro_id', centroId);

    if (error) {
      // Table doesn't exist yet — use defaults silently
      setTableExists(false);
      setLoading(false);
      return;
    }

    const map: ConfigMap = {};
    // Never keep server-only secrets in client memory even if RLS accidentally returns them
    const CLIENT_BLOCKED = new Set(['mp_access_token']);
    (data ?? []).forEach(r => {
      if (CLIENT_BLOCKED.has(r.clave)) return;
      map[r.clave] = r.valor ?? '';
    });
    setRaw(map);
    setLoading(false);
  }, [centroId]);

  useEffect(() => { fetch(); }, [fetch]);

  const get = useCallback((key: keyof CentroConfig): string => {
    return raw[key] ?? String(DEFAULTS[key]);
  }, [raw]);

  const getNumber = useCallback((key: keyof CentroConfig): number => {
    return Number(raw[key]) || (DEFAULTS[key] as number);
  }, [raw]);

  const set = useCallback(async (key: keyof CentroConfig, value: string) => {
    if (!centroId) return;
    setRaw(prev => ({ ...prev, [key]: value }));
    await supabase
      .from('centros_config')
      .upsert({ centro_id: centroId, clave: key, valor: value }, { onConflict: 'centro_id,clave' });
  }, [centroId]);

  return { get, getNumber, set, loading, tableExists, refetch: fetch };
}
