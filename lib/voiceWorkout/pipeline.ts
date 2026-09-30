// lib/voiceWorkout/pipeline.ts
// 🎙️ (30 set 2026) Extração da IA (já normalizada) -> itens da tela de conferência.
//
// Fica num módulo próprio pra a rota /interpretar e a avaliação
// (scripts/voz-eval) usarem EXATAMENTE o mesmo código: o que a avaliação mede
// é o que roda em produção, sem cópia que possa divergir.
import { matchExercise, type LibraryIndex } from './match';
import type { NormalizedExercise } from './normalize';

export function buildReviewItems(exercises: NormalizedExercise[], index: LibraryIndex) {
  return exercises.map((ex, i) => {
    const m = matchExercise(ex.spoken, index);
    // Os blocos vão como o coach FALOU. Se o exercício final for Cardio (que
    // no app é minutos + kcal, não séries x reps), quem troca pelos valores
    // de cardio é o app, na hora -- assim também vale quando o coach troca o
    // exercício sugerido por outro de categoria diferente na conferência.
    return {
      key: `${i}`,
      spoken: ex.spoken,
      status: m.status,
      match: m.best,
      candidates: m.candidates,
      blocks: ex.blocks,
      assumed: ex.assumed,
      observation: ex.observation,
      warnings: ex.warnings,
    };
  });
}

export type ReviewItem = ReturnType<typeof buildReviewItems>[number];
