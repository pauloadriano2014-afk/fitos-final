// lib/voiceDiet/normalize.ts
// 🎙️ (30 set 2026) Dieta por voz -- pega o que a IA extraiu e devolve refeições
// LIMPAS: nome/horário no padrão do app, quantidades nas unidades do app, e os
// alimentos "ou" agrupados como substitutos. Nada aqui escolhe alimento do
// catálogo (isso é do match.ts) nem completa porções (isso é do app).
import { normalizeQuantity, type Assumed, type AppUnit } from './units';
import { resolveMealName, normalizeTime, defaultTimeFor } from './names';

export type RawFood = {
  nome_falado?: unknown;
  preparo?: unknown;
  quantidade?: unknown;
  unidade?: unknown;
  ou_anterior?: unknown;
  observacao?: unknown;
};
export type RawMeal = { nome?: unknown; horario?: unknown; observacao?: unknown; alimentos?: unknown };
export type RawDiet = { refeicoes?: unknown; avisos?: unknown };

export type NormalizedFood = {
  spoken: string;
  prep: string | null;
  amount: number | null;
  unit: AppUnit | null;
  assumed: Assumed[];
  unitNote: string;
  alternative: boolean;      // "ou": opção no lugar do alimento anterior
  groupIndex: number;        // alimentos com o mesmo groupIndex são base + substitutos
  note: string;
};

export type NormalizedMeal = {
  name: string;
  time: string;
  notes: string;
  assumed: Assumed[];        // 'name' / 'time' quando o coach não falou
  foods: NormalizedFood[];
};

const MAX_MEALS = 12;
const MAX_FOODS = 30;

function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeDiet(raw: RawDiet | null | undefined, opts: { native?: boolean } = {}): { meals: NormalizedMeal[]; warnings: string[] } | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.refeicoes)) return null;

  const meals: NormalizedMeal[] = [];
  for (const rm of (raw.refeicoes as RawMeal[]).slice(0, MAX_MEALS)) {
    const position = meals.length;
    const foods: NormalizedFood[] = [];
    let groupCounter = 0;

    const rawFoods = Array.isArray(rm?.alimentos) ? (rm.alimentos as RawFood[]).slice(0, MAX_FOODS) : [];
    for (const rf of rawFoods) {
      const spoken = cleanText(rf?.nome_falado, 80);
      if (!spoken) continue;
      const q = normalizeQuantity(rf?.quantidade, rf?.unidade, opts);
      const prev = foods[foods.length - 1];
      const alternative = rf?.ou_anterior === true && !!prev;
      const groupIndex = alternative ? prev.groupIndex : groupCounter++;
      foods.push({
        spoken,
        prep: cleanText(rf?.preparo, 30) || null,
        amount: q.amount,
        unit: q.unit,
        assumed: q.assumed,
        unitNote: q.note,
        alternative,
        groupIndex,
        note: cleanText(rf?.observacao, 120),
      });
    }

    const notes = cleanText(rm?.observacao, 300);
    if (!foods.length && !notes) continue;   // refeição vazia: descarta

    const resolved = resolveMealName(rm?.nome);
    const assumed: Assumed[] = [];
    const name = resolved.name ?? `Refeição ${position + 1}`;
    if (!resolved.name) assumed.push('name');

    let time = normalizeTime(rm?.horario);
    if (!time) {
      time = defaultTimeFor(resolved.standard ? resolved.name : null, position);
      assumed.push('time');
    }

    meals.push({ name, time, notes, assumed, foods });
  }

  const warnings = Array.isArray(raw.avisos)
    ? (raw.avisos as unknown[]).map((a) => cleanText(a, 200)).filter(Boolean).slice(0, 10)
    : [];
  return { meals, warnings };
}
