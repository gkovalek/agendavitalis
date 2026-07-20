import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface CrearPagoParams {
  turno_id: string;
  monto: number;
  descripcion: string;
}

interface CrearPagoResult {
  checkout_url: string;
  checkout_url_sandbox: string;
  preference_id: string;
}

export function useMpPago() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function crearPago(params: CrearPagoParams): Promise<CrearPagoResult | null> {
    setLoading(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mp-crear-pago`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        ...params,
        back_url_base: window.location.origin,
      }),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.message ?? 'Error al iniciar el pago');
      return null;
    }

    return json as CrearPagoResult;
  }

  return { crearPago, loading, error };
}
