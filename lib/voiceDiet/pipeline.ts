// lib/voiceDiet/pipeline.ts
// 🎙️ (30 set 2026) Refeições normalizadas -> itens da tela de conferência.
// Módulo próprio pra rota e avaliação usarem exatamente o mesmo código.
import { matchFood, type FoodIndex } from './match';
import { portionsForFoods } from '@/lib/foodMeasures';
import type { NormalizedMeal } from './normalize';
import type { Assumed } from './units';

export function buildDietReview(meals: NormalizedMeal[], index: FoodIndex) {
  return meals.map((m, mi) => ({
    key: `m${mi}`,
    name: m.name,
    time: m.time,
    notes: m.notes,
    assumed: m.assumed,
    foods: m.foods.map((f, fi) => {
      const r = matchFood(f.spoken, f.prep, index);
      const assumed: Assumed[] = [...f.assumed];
      const warnings: string[] = [];
      if (r.unknownPrep) {
        assumed.push('prep');
        warnings.push(`Preparo "${r.unknownPrep}" não existe no catálogo — usei o padrão cozido.`);
      }
      return {
        key: `m${mi}f${fi}`,
        spoken: f.spoken,
        prep: f.prep,
        status: r.status,
        match: r.best,
        candidates: r.candidates,
        amount: f.amount,          // null = o app completa com a porção padrão do alimento
        unit: f.unit,
        assumed,
        unitNote: f.unitNote,
        groupKey: `g${f.groupIndex}`,
        alternative: f.alternative,
        note: f.note,
        warnings,
      };
    }),
  }));
}

export type DietReviewMeal = ReturnType<typeof buildDietReview>[number];

/**
 * Anexa a cada candidato o foodId e as medidas caseiras dele (as mesmas que GET /api/food/search entrega),
 * pra o app converter "2 escumadeiras" / "1 bife médio" em gramas com o cadastro do alimento -- inclusive
 * quando o coach troca o alimento sugerido na conferência. 1 consulta só; se a tabela nova ainda não existe,
 * vai só com as medidas antigas (portionsForFoods nunca lança).
 */
export async function attachPortions(meals: DietReviewMeal[], teamScope: string | null): Promise<void> {
  const foods = new Map<string, { id: string; name: string }>();
  const cands: any[] = [];
  for (const m of meals) for (const f of m.foods) for (const c of f.candidates) { cands.push(c); foods.set(c.id, { id: c.id, name: c.name }); }
  if (!foods.size) return;
  const map = await portionsForFoods([...foods.values()], teamScope);
  for (const c of cands) {
    const r = map.get(c.id);
    c.foodId = c.id;
    c.portions = r?.portions ?? {};
    c.defaultPortion = r?.defaultPortion ?? null;
  }
}
