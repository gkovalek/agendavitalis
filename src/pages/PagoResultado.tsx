import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

type Estado = 'loading' | 'approved' | 'failure' | 'pending';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const CONFIG: Record<Exclude<Estado, 'loading'>, {
  icon: React.ReactNode;
  titulo: string;
  texto: string;
  color: string;
}> = {
  approved: {
    icon: <CheckCircle2 className="w-16 h-16 text-emerald-500" />,
    titulo: '¡Turno confirmado!',
    texto: 'Tu pago fue acreditado. Recibirás un recordatorio antes de tu turno.',
    color: '#0F6E56',
  },
  failure: {
    icon: <XCircle className="w-16 h-16 text-red-500" />,
    titulo: 'El pago no se pudo procesar',
    texto: 'Por favor intentá con otro medio de pago o contactá al centro.',
    color: '#DC2626',
  },
  pending: {
    icon: <Clock className="w-16 h-16 text-amber-500" />,
    titulo: 'Pago en proceso',
    texto: 'Tu pago está siendo verificado. Te avisaremos cuando se confirme.',
    color: '#D97706',
  },
};

const CONFIG_REGISTRO: Record<Exclude<Estado, 'loading'>, {
  icon: React.ReactNode;
  titulo: string;
  texto: string;
  color: string;
}> = {
  approved: {
    icon: <CheckCircle2 className="w-16 h-16 text-emerald-500" />,
    titulo: '¡Cuenta creada exitosamente!',
    texto: 'Revisá tu email — te enviamos el acceso a tu cuenta de Vitalis.',
    color: '#0F6E56',
  },
  failure: {
    icon: <XCircle className="w-16 h-16 text-red-500" />,
    titulo: 'El pago no se procesó',
    texto: 'No se realizó ningún cobro. Podés intentarlo de nuevo o contactarnos.',
    color: '#DC2626',
  },
  pending: {
    icon: <Clock className="w-16 h-16 text-amber-500" />,
    titulo: 'Pago en verificación',
    texto: 'Cuando se confirme el pago activaremos tu cuenta y te avisamos por email.',
    color: '#D97706',
  },
};

export default function PagoResultado({ tipo }: { tipo: 'success' | 'failure' | 'pending' }) {
  const [searchParams] = useSearchParams();
  const tipoRegistro  = searchParams.get('tipo') === 'registro';
  const registroId    = searchParams.get('rid');
  const turnoId       = searchParams.get('turno');
  const paymentId     = searchParams.get('payment_id') ?? searchParams.get('collection_id');

  const [estado, setEstado] = useState<Estado>('loading');
  const [turno, setTurno]   = useState<{ hora_inicio: string; fecha: string } | null>(null);
  const [done, setDone]     = useState(false);

  useEffect(() => {
    const map: Record<string, Estado> = { success: 'approved', failure: 'failure', pending: 'pending' };
    const nuevoEstado: Estado = map[tipo] ?? 'pending';
    setEstado(nuevoEstado);

    if (tipoRegistro && registroId && !done) {
      setDone(true);
      fetch(`${SUPABASE_URL}/functions/v1/registro-completar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          registro_id: registroId,
          payment_id: paymentId,
          success: nuevoEstado === 'approved',
        }),
      }).catch(console.error);
    }

    if (!tipoRegistro && turnoId) {
      supabase.from('turnos').select('fecha, hora_inicio').eq('id', turnoId).single()
        .then(({ data }) => setTurno(data));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  if (estado === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EDF6F4]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00C9B1]" />
      </div>
    );
  }

  const cfg = tipoRegistro ? CONFIG_REGISTRO[estado] : CONFIG[estado];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EDF6F4] p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center space-y-5">
        <div className="flex justify-center">{cfg.icon}</div>
        <h1 className="text-2xl font-bold" style={{ color: cfg.color }}>{cfg.titulo}</h1>
        <p className="text-gray-500 text-sm leading-relaxed">{cfg.texto}</p>

        {estado === 'approved' && turno && !tipoRegistro && (
          <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-800">
            <p className="font-semibold">{turno.fecha}</p>
            <p>{turno.hora_inicio.slice(0, 5)} hs</p>
          </div>
        )}

        {tipoRegistro && estado === 'approved' && (
          <a href="/login" className="inline-block mt-2 bg-[#00ADBB] text-white px-6 py-3 rounded-lg font-semibold text-sm" style={{ textDecoration:'none' }}>
            Ingresar a Vitalis →
          </a>
        )}

        {tipoRegistro && estado === 'failure' && (
          <a href="/registro" className="inline-block mt-2 text-sm text-[#00ADBB] hover:underline">
            ← Volver al registro
          </a>
        )}

        {!tipoRegistro && (
          <button onClick={() => window.history.back()} className="mt-4 text-sm text-[#00C9B1] hover:underline">
            ← Volver
          </button>
        )}
      </div>
    </div>
  );
}
