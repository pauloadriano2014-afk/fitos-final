// lib/voiceDiet/pipeline.ts
// 🎙️ (30 set 2026) Refeições normalizadas -> itens da tela de conferência.
// Módulo próprio pra rota e avaliação usarem exatamente o mesmo código.
import { matchFood, type FoodIndex } from './match';
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
