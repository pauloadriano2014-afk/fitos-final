// lib/workoutDuration.ts
// ⏱️ (7 out 2026) Limpeza dos números que o app manda ao finalizar o treino: a DURAÇÃO (minutos, do cronômetro do treino) e o CARDIO feito (segundos e calorias).
// Antes `duration || 0` aceitava qualquer coisa (negativo, texto, 99999). Agora vira um inteiro de 0 a 1440 (um dia).

export const MAX_DURATION_MIN = 1440;
const MAX_CARDIO_SEC = 6 * 3600;
const MAX_CARDIO_KCAL = 5000;

/** Minutos inteiros de 0 a 1440; qualquer valor inválido vira 0. */
export function cleanDuration(v: unknown): number {
  const n = Math.round(Number(String(v ?? '').replace(',', '.')));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_DURATION_MIN);
}

const intIn = (v: unknown, max: number): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Math.round(Number(String(v).replace(',', '.')));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
};

/** Campos de cardio de UMA série do corpo do finalizar: { cardioSeconds, cardioKcal } (nulos quando não vierem ou forem inválidos). */
export function cleanCardio(s: any): { cardioSeconds: number | null; cardioKcal: number | null } {
  return { cardioSeconds: intIn(s?.cardioSeconds, MAX_CARDIO_SEC), cardioKcal: intIn(s?.cardioKcal, MAX_CARDIO_KCAL) };
}
