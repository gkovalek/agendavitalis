import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

type Estado = 'loading' | 'approved' | 'failure' | 'pending';

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

export default function PagoResultado({ tipo }: { tipo: 'success' | 'failure' | 'pending' }) {
  const [searchParams] = useSearchParams();
  const turnoId = searchParams.get('turno');
  const [estado, setEstado] = useState<Estado>('loading');
  const [turno, setTurno] = useState<{ hora_inicio: string; fecha: string } | null>(null);

  useEffect(() => {
    // Mapear tipo de URL a estado
    const map: Record<string, Estado> = { success: 'approved', failure: 'failure', pending: 'pending' };
    setEstado(map[tipo] ?? 'pending');

    if (turnoId) {
      supabase.from('turnos').select('fecha, hora_inicio').eq('id', turnoId).single()
        .then(({ data }) => setTurno(data));
    }
  }, [tipo, turnoId]);

  if (estado === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EDF6F4]">
        <Loader2 className="w-8 h-8 animate-spin text-[#00C9B1]" />
      </div>
    );
  }

  const cfg = CONFIG[estado];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EDF6F4] p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center space-y-5">
        <div className="flex justify-center">{cfg.icon}</div>
        <h1 className="text-2xl font-bold" style={{ color: cfg.color }}>{cfg.titulo}</h1>
        <p className="text-gray-500 text-sm leading-relaxed">{cfg.texto}</p>

        {estado === 'approved' && turno && (
          <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-800">
            <p className="font-semibold">{turno.fecha}</p>
            <p>{turno.hora_inicio.slice(0, 5)} hs</p>
          </div>
        )}

        <button
          onClick={() => window.history.back()}
          className="mt-4 text-sm text-[#00C9B1] hover:underline"
        >
          ← Volver
        </button>
      </div>
    </div>
  );
}
