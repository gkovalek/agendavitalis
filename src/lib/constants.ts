export const TURNO_ESTADOS = {
  reservado: { label: 'Reservado', color: '#FCD34D', bg: 'bg-yellow-300/20', text: 'text-yellow-600' },
  confirmado: { label: 'Confirmado', color: '#4ADE80', bg: 'bg-green-400/20', text: 'text-green-600' },
  en_sala: { label: 'En sala de espera', color: '#C084FC', bg: 'bg-purple-400/20', text: 'text-purple-600' },
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
