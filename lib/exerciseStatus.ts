// lib/exerciseStatus.ts
// 🧾 (7 out 2026) O que o aluno diz sobre os exercícios que NÃO têm série registrada no fim do treino, e o HORÁRIO em que cada série foi marcada.
//  - exerciseStatus (WorkoutHistory): lista [{ exerciseId, name, status }] com status PULOU (tocou em "Pular" durante o treino), NAO_FEZ (marcou "não fiz" no
//    fim), PARCIAL (fez só parte) ou FEZ (fez mas esqueceu de marcar). Sem essa lista, "sem registro" não quer dizer que o aluno não fez: o coach ficava no escuro.
//  - loggedAt (ExerciseHistory): o instante em que a série foi marcada no app (dá o ritmo real e o minuto em que o aluno parou).
// Tudo opcional: app antigo manda nada e o resto do sistema segue igual.

export const EXERCISE_STATUSES = ['PULOU', 'NAO_FEZ', 'PARCIAL', 'FEZ'] as const;
export type ExerciseStatus = (typeof EXERCISE_STATUSES)[number];
export type ExerciseStatusItem = { exerciseId: string; name: string; status: ExerciseStatus };

const MAX_ITEMS = 60;

/** Lista limpa (no máximo 60, sem repetir exercício, só status conhecidos) ou null quando não veio nada de útil. */
export function cleanExerciseStatus(v: unknown): ExerciseStatusItem[] | null {
  if (!Array.isArray(v)) return null;
  const out: ExerciseStatusItem[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (out.length >= MAX_ITEMS) break;
    const r: any = raw;
    const status = String(r?.status || '').toUpperCase() as ExerciseStatus;
    const exerciseId = String(r?.exerciseId || '').trim().slice(0, 64);
    if (!exerciseId || !EXERCISE_STATUSES.includes(status) || seen.has(exerciseId)) continue;
    seen.add(exerciseId);
    out.push({ exerciseId, name: String(r?.name || '').replace(/\s+/g, ' ').trim().slice(0, 120), status });
  }
  return out.length ? out : null;
}

/** Horário (ms desde 1970 ou texto ISO) de uma série. Só vale de 24 h atrás até 5 min à frente (relógio do aparelho); fora disso vira null. */
export function cleanLoggedAt(v: unknown, now: Date): Date | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : /^\d{10,}$/.test(String(v)) ? Number(v) : Date.parse(String(v));
  if (!Number.isFinite(n)) return null;
  const t = now.getTime();
  if (n > t + 5 * 60000 || n < t - 24 * 3600000) return null;
  return new Date(n);
}

/** Nomes dos exercícios que o aluno NÃO fez (pulou ou marcou "não fiz"), na ordem em que vieram. Aceita o valor cru do banco (Json). */
export function notDoneNames(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return (list as any[]).filter((i) => i && (i.status === 'PULOU' || i.status === 'NAO_FEZ') && i.name).map((i) => String(i.name));
}
