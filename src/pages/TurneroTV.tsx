import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { VitalisLogo } from '@/components/VitalisLogo';

interface TurnoTV {
  id: string;
  hora_inicio: string;
  estado: 'en_sala' | 'siendo_atendido';
  paciente: string;
  profesional: string;
  servicio: string;
}

interface Centro {
  nombre: string;
}

// Genera un chime con Web Audio API
function playChime(ctx: AudioContext, tipo: 'sala' | 'atencion') {
  const frecuencias = tipo === 'atencion' ? [880, 1100] : [880];
  let inicio = ctx.currentTime;
  frecuencias.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, inicio);
    gain.gain.setValueAtTime(0, inicio);
    gain.gain.linearRampToValueAtTime(0.35, inicio + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, inicio + 0.8);
    osc.start(inicio);
    osc.stop(inicio + 0.8);
    inicio += 0.25;
  });
}

export default function TurneroTV() {
  const { centroId } = useParams<{ centroId: string }>();

  const [centro, setCentro] = useState<Centro | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [turnos, setTurnos] = useState<TurnoTV[]>([]);
  const [hora, setHora] = useState('');
  const [fecha, setFecha] = useState('');
  const [audioActivo, setAudioActivo] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const turnosRef = useRef<TurnoTV[]>([]);  // para comparar en realtime sin stale closure

  // Reloj en tiempo real
  useEffect(() => {
    const tick = () => {
      const ahora = new Date();
      setHora(ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setFecha(ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Carga nombre del centro y video configurado
  useEffect(() => {
    if (!centroId) return;
    supabase.from('centros').select('nombre').eq('id', centroId).single()
      .then(({ data }) => { if (data) setCentro(data); });
    supabase.from('centros_config').select('clave, valor').eq('centro_id', centroId)
      .then(({ data }) => {
        const vid = data?.find(r => r.clave === 'youtube_video_id')?.valor;
        if (vid) setVideoId(vid);
      });
  }, [centroId]);

  // Carga turnos y detecta cambios para reproducir chime
  const cargarTurnos = async () => {
    if (!centroId) return;
    // Usar fecha local de Argentina (UTC-3, sin DST) para evitar que después
    // de las 21:00 AR toISOString() devuelva el día siguiente en UTC.
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    const { data } = await supabase
      .from('turnero_view')
      .select('*')
      .eq('centro_id', centroId)
      .eq('fecha', hoy)
      .in('estado', ['en_sala', 'siendo_atendido'])
      .order('hora_inicio', { ascending: true });
    if (!data) return;

    const nuevos = data as TurnoTV[];
    const prev = turnosRef.current;

    if (audioCtxRef.current && prev.length > 0) {
      // Turno nuevo en cualquier estado
      const idsAnteriores = new Set(prev.map((t) => t.id));
      const hayNuevo = nuevos.some((t) => !idsAnteriores.has(t.id));
      if (hayNuevo) {
        playChime(audioCtxRef.current, 'sala');
      } else {
        // Turno que cambió de en_sala → siendo_atendido
        const prevMap = new Map(prev.map((t) => [t.id, t.estado]));
        const cambioAtencion = nuevos.some(
          (t) => t.estado === 'siendo_atendido' && prevMap.get(t.id) === 'en_sala'
        );
        if (cambioAtencion) playChime(audioCtxRef.current, 'atencion');
      }
    }

    turnosRef.current = nuevos;
    setTurnos(nuevos);
  };

  useEffect(() => {
    cargarTurnos();
  }, [centroId]);

  // Polling cada 15 segundos (base confiable para TV)
  useEffect(() => {
    if (!centroId) return;
    const id = setInterval(cargarTurnos, 2000);
    return () => clearInterval(id);
  }, [centroId]);

  // Realtime como bonus (requiere que turnos esté en publicación Realtime de Supabase)
  useEffect(() => {
    if (!centroId) return;

    channelRef.current = supabase
      .channel(`turnero-${centroId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos', filter: `centro_id=eq.${centroId}` },
        () => { cargarTurnos(); }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [centroId]);

  const formatHora = (h: string) => {
    if (!h) return '';
    return h.substring(0, 5); // HH:MM
  };

  const nombreCorto = (nombre: string) => {
    if (!nombre) return '';
    const partes = nombre.split(' ');
    return partes.length >= 2
      ? `${partes[partes.length - 1]}, ${partes[0]}`
      : nombre;
  };

  return (
    <div className="tv-root">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .tv-root {
          width: 100vw;
          height: 100vh;
          background: #050a14;
          color: #e8edf5;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* ── TOP HEADER ── */
        .tv-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          height: 72px;
          flex-shrink: 0;
          background: #07101f;
          border-bottom: 1px solid #1a2d4a;
        }

        .tv-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        /* VitalisLogo navbar variant se escala bien sobre fondo oscuro */
        .tv-logo > * {
          transform-origin: left center;
        }

        /* Botón activar sonido */
        .tv-sound-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.85rem;
          border-radius: 6px;
          border: 1px solid rgba(96,165,250,0.3);
          background: rgba(96,165,250,0.08);
          color: #60a5fa;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: background 0.2s;
          margin-right: 1.5rem;
        }
        .tv-sound-btn:hover { background: rgba(96,165,250,0.16); }

        @keyframes pulseBtn {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .tv-sound-btn { animation: pulseBtn 2s ease-in-out infinite; }

        .tv-clock-block {
          text-align: right;
        }

        .tv-clock {
          font-size: 2rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: #e8edf5;
          line-height: 1;
        }

        .tv-fecha {
          font-size: 0.8rem;
          color: #5a7fa8;
          text-transform: capitalize;
          margin-top: 2px;
        }

        /* ── BODY ── */
        .tv-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        /* ── LEFT: VIDEO ── */
        .tv-video {
          flex: 1;
          background: #020810;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .tv-video iframe {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        }

        .tv-no-video {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          opacity: 0.15;
        }

        .tv-no-video svg {
          width: 80px;
          height: 80px;
        }

        .tv-no-video-text {
          font-size: 1rem;
          color: #5a7fa8;
        }

        /* ── RIGHT: TURNOS ── */
        .tv-turnos {
          width: 380px;
          flex-shrink: 0;
          background: #07101f;
          border-left: 1px solid #1a2d4a;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* ── SECCIÓN (En Sala / Siendo Llamados) ── */
        .tv-seccion {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* En sala ocupa 60% del espacio disponible */
        .tv-seccion.en-sala {
          flex: 3;
          border-bottom: 2px solid #1a2d4a;
        }

        /* Siendo llamados ocupa 40% */
        .tv-seccion.siendo-llamados {
          flex: 2;
        }

        .tv-seccion-header {
          padding: 0.75rem 1.25rem 0.5rem;
          flex-shrink: 0;
          border-bottom: 1px solid #1a2d4a;
        }

        .tv-seccion-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .tv-seccion-label.naranja { color: #fb923c; }
        .tv-seccion-label.verde   { color: #4ade80; }

        .tv-seccion-label-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }

        .tv-seccion-label.verde .tv-seccion-label-dot {
          animation: pulseDot 2.4s ease-in-out infinite;
        }

        .tv-turnos-cols {
          display: grid;
          grid-template-columns: 64px 1fr 1fr;
          gap: 0.25rem;
          padding: 0.4rem 1.25rem 0;
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #3a5a78;
        }

        .tv-turnos-list {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .tv-turnos-list::-webkit-scrollbar { width: 4px; }
        .tv-turnos-list::-webkit-scrollbar-track { background: transparent; }
        .tv-turnos-list::-webkit-scrollbar-thumb { background: #1a2d4a; border-radius: 2px; }

        /* ── TARJETA DE TURNO ── */
        .tv-turno-card {
          display: grid;
          grid-template-columns: 64px 1fr 1fr;
          gap: 0.25rem;
          padding: 0.85rem 0.75rem;
          border-radius: 8px;
          border-left: 4px solid transparent;
          transition: all 0.4s ease;
        }

        /* Estado: en_sala — naranja estático, fade-in */
        @keyframes fadeInCard {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .tv-turno-card.en_sala {
          background: rgba(251, 146, 60, 0.06);
          border-left-color: #f97316;
          animation: fadeInCard 0.5s ease forwards;
        }

        /* Estado: siendo_atendido — verde pulsante */
        @keyframes glowPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.0),
                        inset 0 0 0 0 rgba(34, 197, 94, 0.0);
            background: rgba(34, 197, 94, 0.08);
          }
          50% {
            box-shadow: 0 0 16px 4px rgba(34, 197, 94, 0.18),
                        inset 0 0 8px 0 rgba(34, 197, 94, 0.06);
            background: rgba(34, 197, 94, 0.14);
          }
        }

        .tv-turno-card.siendo_atendido {
          border-left-color: #22c55e;
          animation: glowPulse 2.4s ease-in-out infinite;
        }

        .tv-turno-hora {
          font-size: 1.25rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1.1;
          color: #c8d8eb;
        }

        .tv-turno-nombre {
          font-size: 0.82rem;
          font-weight: 600;
          color: #d8e8f5;
          line-height: 1.2;
          word-break: break-word;
        }

        .tv-turno-prof {
          font-size: 0.72rem;
          color: #6a8fac;
          line-height: 1.3;
          word-break: break-word;
        }

        .tv-estado-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          margin-top: 0.3rem;
        }

        .tv-estado-badge.en_sala {
          background: rgba(249, 115, 22, 0.15);
          color: #fb923c;
        }

        .tv-estado-badge.siendo_atendido {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
        }

        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }

        .tv-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
          animation: pulseDot 2.4s ease-in-out infinite;
        }

        .tv-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          opacity: 0.25;
          padding: 2rem;
        }

        .tv-empty-icon {
          font-size: 2.5rem;
        }

        .tv-empty-text {
          font-size: 0.85rem;
          text-align: center;
          color: #5a7fa8;
        }
      `}</style>

      {/* Header */}
      <header className="tv-header">
        <div className="tv-logo">
          <VitalisLogo variant="navbar" />
          {centro?.nombre && (
            <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.45)', marginLeft: '0.5rem', fontWeight: 500 }}>
              — {centro.nombre}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          {!audioActivo && (
            <button
              className="tv-sound-btn"
              onClick={() => {
                audioCtxRef.current = new AudioContext();
                // Toca un chime de prueba para "desbloquear" el contexto
                playChime(audioCtxRef.current, 'sala');
                setAudioActivo(true);
              }}
            >
              🔔 Activar sonido
            </button>
          )}
          <div className="tv-clock-block">
            <div className="tv-clock">{hora}</div>
            <div className="tv-fecha">{fecha}</div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="tv-body">

        {/* Left: YouTube video o fondo vacío */}
        <div className="tv-video">
          {videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3`}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : (
            <div className="tv-no-video">
              <svg viewBox="0 0 80 80" fill="none">
                <path d="M10 20 Q40 60 70 20" stroke="#5a7fa8" strokeWidth="3" strokeLinecap="round" fill="none"/>
                <path d="M20 20 Q40 50 60 20" stroke="#3a5a78" strokeWidth="3" strokeLinecap="round" fill="none"/>
              </svg>
              <span className="tv-no-video-text">Agregá ?video=ID_YOUTUBE a la URL para mostrar un video</span>
            </div>
          )}
        </div>

        {/* Right: dos secciones */}
        <aside className="tv-turnos">

          {/* Sección En Sala */}
          <div className="tv-seccion en-sala">
            <div className="tv-seccion-header">
              <div className="tv-seccion-label naranja">
                <span className="tv-seccion-label-dot" />
                En sala
              </div>
              <div className="tv-turnos-cols">
                <span>Horario</span>
                <span>Paciente</span>
                <span>Profesional</span>
              </div>
            </div>
            <div className="tv-turnos-list">
              {turnos.filter(t => t.estado === 'en_sala').length === 0 ? (
                <div className="tv-empty">
                  <span className="tv-empty-icon">🪑</span>
                  <span className="tv-empty-text">Sin pacientes en sala</span>
                </div>
              ) : (
                turnos.filter(t => t.estado === 'en_sala').map((t) => (
                  <div key={t.id} className="tv-turno-card en_sala">
                    <div>
                      <div className="tv-turno-hora">{formatHora(t.hora_inicio)}</div>
                    </div>
                    <div className="tv-turno-nombre">{nombreCorto(t.paciente)}</div>
                    <div className="tv-turno-prof">{t.profesional}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sección Siendo Llamados */}
          <div className="tv-seccion siendo-llamados">
            <div className="tv-seccion-header">
              <div className="tv-seccion-label verde">
                <span className="tv-seccion-label-dot" />
                Siendo llamados
              </div>
              <div className="tv-turnos-cols">
                <span>Horario</span>
                <span>Paciente</span>
                <span>Profesional</span>
              </div>
            </div>
            <div className="tv-turnos-list">
              {turnos.filter(t => t.estado === 'siendo_atendido').length === 0 ? (
                <div className="tv-empty">
                  <span className="tv-empty-icon">📢</span>
                  <span className="tv-empty-text">Nadie siendo llamado</span>
                </div>
              ) : (
                turnos.filter(t => t.estado === 'siendo_atendido').map((t) => (
                  <div key={t.id} className="tv-turno-card siendo_atendido">
                    <div>
                      <div className="tv-turno-hora">{formatHora(t.hora_inicio)}</div>
                    </div>
                    <div className="tv-turno-nombre">{nombreCorto(t.paciente)}</div>
                    <div className="tv-turno-prof">{t.profesional}</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}
