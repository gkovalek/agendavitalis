import { useAuth } from '@/contexts/AuthContext';

export type Plan = 'basico' | 'intermedio' | 'premium';

const PLAN_RANK: Record<Plan, number> = { basico: 0, intermedio: 1, premium: 2 };

const PLAN_LABEL: Record<Plan, string> = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  premium: 'Premium',
};

const FEATURE_MIN_PLAN = {
  tratamientos:     'intermedio',
  historia_clinica: 'intermedio',
  adjuntos_hc:      'premium',
  obras_sociales:   'intermedio',
  liquidacion_os:   'intermedio',
  reportes:         'intermedio',
  servicios_ilimit: 'intermedio',
} as const satisfies Record<string, Plan>;

export type Feature = keyof typeof FEATURE_MIN_PLAN;

export function usePlan() {
  const { perfil } = useAuth();
  const plan: Plan = perfil?.plan ?? 'basico';

  function tiene(feature: Feature): boolean {
    return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
  }

  function planMinimoPara(feature: Feature): string {
    return PLAN_LABEL[FEATURE_MIN_PLAN[feature]];
  }

  return { plan, planLabel: PLAN_LABEL[plan], tiene, planMinimoPara };
}
