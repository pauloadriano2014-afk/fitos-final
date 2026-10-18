// lib/loadPhase.ts
// 🏷️ (18 out 2026) FASE DA CARGA: toda carga que o aluno anota é de uma de três fases:
//   NORMAL  = treino comum;
//   DELOAD  = semana de deload (carga ×0,8; inclui o deload menstrual);
//   CHOQUE  = semana de choque (carga ×mais de 1).
// O app do aluno multiplica a carga do coach enquanto o treino tem multiplicador ≠ 1 e a data de fim (`intensityEndDate`) não passou
// (src/components/DayWorkout/useDayWorkoutData.js) e, ao finalizar, devolve a carga digitada para a BASE (32 / 0,8 = 40) antes de enviar: `weight` do histórico
// é sempre "equivalente à base". Aqui usamos a MESMA regra de ativação, na hora de finalizar, para gravar a fase em `WorkoutHistory.loadPhase` e o multiplicador
// em `intensityApplied`. Com isso: (1) o coach vê o que o aluno de fato levantou em cada fase (base × multiplicador; lib/studentLoads.ts); (2) a sugestão de carga
// ignora semanas de deload e de choque (não são progressão normal; lib/loadSuggest.ts); (3) dá para sugerir "subir a base" depois de um choque bem-sucedido.
// Registro antigo (`loadPhase` null) = NORMAL e continua valendo como carga equivalente à base: ninguém perde histórico. Tudo aqui é função pura.

export const PHASES = ['NORMAL', 'DELOAD', 'CHOQUE'] as const;
export type LoadPhase = (typeof PHASES)[number];

/** Só as três palavras valem (qualquer outra coisa = sem fase, null). */
export function cleanPhase(v: unknown): LoadPhase | null {
  const s = String(v ?? '').trim().toUpperCase();
  return (PHASES as readonly string[]).includes(s) ? (s as LoadPhase) : null;
}

/** Registro sem fase (antigo) conta como NORMAL. */
export const isNormalPhase = (v: unknown): boolean => {
  const p = cleanPhase(v);
  return p === null || p === 'NORMAL';
};

export interface PhaseInfo { phase: LoadPhase; multiplier: number }

/**
 * Qual fase vale agora para um treino (multiplicador + data de fim). Igual ao app do aluno: só há máscara se o multiplicador é diferente de 1
 * E existe data de fim E agora ainda não passou dela. Menor que 1 = deload; maior que 1 = choque.
 */
export function phaseOf(multiplier: unknown, endDate: unknown, now: Date = new Date()): PhaseInfo {
  const m = typeof multiplier === 'number' ? multiplier : parseFloat(String(multiplier ?? ''));
  if (!Number.isFinite(m) || m <= 0 || m === 1 || !endDate) return { phase: 'NORMAL', multiplier: 1 };
  const end = new Date(endDate as any).getTime();
  if (!Number.isFinite(end) || now.getTime() > end) return { phase: 'NORMAL', multiplier: 1 };
  return { phase: m < 1 ? 'DELOAD' : 'CHOQUE', multiplier: Math.round(m * 1000) / 1000 };
}
