export const TURNO_ESTADOS = {
  reservado: { label: 'Reservado', color: '#FCD34D', bg: 'bg-yellow-300/20', text: 'text-yellow-600' },
  confirmado: { label: 'Confirmado', color: '#4ADE80', bg: 'bg-green-400/20', text: 'text-green-600' },
  en_sala: { label: 'En sala de espera', color: '#C084FC', bg: 'bg-purple-400/20', text: 'text-purple-600' },
  siendo_atendido: { label: 'Siendo atendido', color: '#60A5FA', bg: 'bg-blue-400/20', text: 'text-blue-600' },
  atendiendo: { label: 'Siendo atendido', color: '#60A5FA', bg: 'bg-blue-400/20', text: 'text-blue-600' },
  finalizado: { label: 'Finalizado', color: '#7DD3FC', bg: 'bg-sky-300/20', text: 'text-sky-600' },
  cancelado: { label: 'Cancelado', color: '#F87171', bg: 'bg-red-400/20', text: 'text-red-600' },
} as const;

export type TurnoEstado = keyof typeof TURNO_ESTADOS;

export const TIME_SLOTS: string[] = [];
for (let h = 8; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

export const DIAS_NOMBRES: string[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

// Map JS getDay() (0=Sun) to Spanish name
const JS_DAY_TO_NAME: Record<number, string> = {
  0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miercoles',
  4: 'jueves', 5: 'viernes', 6: 'sabado',
};

export const getDayName = (jsDay: number): string => JS_DAY_TO_NAME[jsDay] ?? '';

export const normalizeDiasTrabajo = (dias: unknown): string[] => {
  if (!Array.isArray(dias)) return [];
  const VALID = new Set(DIAS_NOMBRES);
  // Map legacy numbers (1=lunes..7=domingo) to names
  const NUM_TO_NAME: Record<number, string> = {
    1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves',
    5: 'viernes', 6: 'sabado', 7: 'domingo',
  };
  return [...new Set(
    dias
      .map(d => typeof d === 'string' ? d.toLowerCase() : NUM_TO_NAME[Number(d)])
      .filter((d): d is string => !!d && VALID.has(d))
  )];
};
