// lib/dietTargets.ts
// 🎯 (30 set 2026) Validação das metas do nutricionista (mesma regra de src/utils/macroPlanner.js do app).
// O servidor só GUARDA e devolve a configuração; quem calcula kcal/macros é o app (o mesmo cálculo do cabeçalho
// da dieta, da IA e do Raio-X). Aqui garantimos que nada absurdo/gigante entra no banco.
export const DAY_TYPES = ['TREINO', 'TREINO_CARDIO', 'CARDIO', 'DESCANSO'] as const;
const DEFAULT_DAY_MULT: Record<string, number> = { TREINO: 1.0, TREINO_CARDIO: 1.05, CARDIO: 0.95, DESCANSO: 0.9 };
const EQUATIONS = ['mifflin', 'harris', 'fao', 'cunningham', 'manual'];

export type DietTargets = {
  v: 1;
  equation: string;
  manualTmb: number | null;
  bodyFatPct: number | null;
  activity: { mode: 'auto' | 'factor'; factor: number };
  goal: { mode: 'auto' | 'percent' | 'kcal'; value: number };
  dayMult: Record<string, number>;
  kcalManual: Record<string, number>;
  macros: { mode: 'auto' | 'gkg' | 'pct'; protGkg: number; fatGkg: number; pct: { prot: number; carb: number; fat: number } };
};

const toNum = (v: unknown): number => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')));
const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const strict = (v: unknown, min: number, max: number): number | null => {
  const n = toNum(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export function sanitizeTargets(raw: unknown): DietTargets {
  const t: any = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out: DietTargets = {
    v: 1,
    equation: EQUATIONS.includes(t.equation) ? t.equation : 'mifflin',
    manualTmb: strict(t.manualTmb, 500, 6000),
    bodyFatPct: strict(t.bodyFatPct, 3, 60),
    activity: { mode: t.activity?.mode === 'factor' ? 'factor' : 'auto', factor: clamp(t.activity?.factor, 1.0, 2.5, 1.55) },
    goal: {
      mode: ['percent', 'kcal'].includes(t.goal?.mode) ? t.goal.mode : 'auto',
      value: t.goal?.mode === 'kcal' ? clamp(t.goal?.value, -2500, 2500, 0) : clamp(t.goal?.value, -50, 50, 0),
    },
    dayMult: {},
    kcalManual: {},
    macros: {
      mode: ['gkg', 'pct'].includes(t.macros?.mode) ? t.macros.mode : 'auto',
      protGkg: clamp(t.macros?.protGkg, 0.3, 4.5, 2.0),
      fatGkg: clamp(t.macros?.fatGkg, 0.2, 3.0, 1.0),
      pct: {
        prot: clamp(t.macros?.pct?.prot, 0, 100, 30),
        carb: clamp(t.macros?.pct?.carb, 0, 100, 40),
        fat: clamp(t.macros?.pct?.fat, 0, 100, 30),
      },
    },
  };
  for (const k of DAY_TYPES) {
    out.dayMult[k] = clamp(t.dayMult?.[k], 0.5, 1.5, DEFAULT_DAY_MULT[k]);
    const m = strict(t.kcalManual?.[k], 600, 8000);
    if (m) out.kcalManual[k] = Math.round(m);
  }
  return out;
}
