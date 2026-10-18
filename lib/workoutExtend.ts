// lib/workoutExtend.ts
// ⏩ (18 out 2026) PRORROGAR O TREINO: o coach, na correria, empurra o vencimento do treino atual do aluno em 1 dia, 3 dias ou 1 semana para o aluno não ficar sem treino.
// Regras (sem banco aqui, só contas; quem lê e grava é `extendCurrentWorkouts`):
//   • o "treino atual" é o mais novo que não está arquivado (o mesmo critério da central HOJE e da pergunta "treinos vencendo"); se o aluno tem mais de um treino
//     com o MESMO dia de vencimento (A/B/C, semanas alternadas), todos andam juntos;
//   • o novo vencimento conta a partir do vencimento atual; se o treino JÁ venceu, conta a partir de agora (prorrogar 1 dia um treino vencido há uma semana
//     = vale até amanhã, não até 6 dias atrás);
//   • treino SEM prazo (endDate vazio) não precisa de prorrogação.
import { dateKeyBrt } from '@/lib/agenda';

export const EXTEND_DAYS = [1, 3, 7] as const;
export const MAX_EXTEND_STUDENTS = 60;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** 1, 3 ou 7 (aceita "3" em texto); qualquer outra coisa = null. */
export function parseExtendDays(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  return (EXTEND_DAYS as readonly number[]).includes(n) ? n : null;
}

/** Lista de alunos do pedido: `studentIds` (lista) ou `studentId` (um só), sem repetidos nem vazios; null se passar do limite ou vier vazio. */
export function parseExtendStudents(body: any): string[] | null {
  const raw: unknown[] = Array.isArray(body?.studentIds) ? body.studentIds : body?.studentId ? [body.studentId] : [];
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 80).map((x) => x.trim()))];
  if (!ids.length || ids.length > MAX_EXTEND_STUDENTS) return null;
  return ids;
}

/** Novo vencimento: a partir do atual; se já venceu, a partir de `now`. */
export function computeNewEnd(currentEnd: Date, now: Date, days: number): Date {
  const base = currentEnd.getTime() > now.getTime() ? currentEnd.getTime() : now.getTime();
  return new Date(base + days * DAY_MS);
}

export type ExtendOutcome =
  | { ok: true; count: number; previousEnd: string; newEnd: string; wasExpired: boolean }
  | { ok: false; error: string };

/** Prorroga o treino atual do aluno. `db` = prisma (ou o banco em memória dos testes). */
export async function extendCurrentWorkouts(db: any, studentId: string, days: number, now: Date = new Date()): Promise<ExtendOutcome> {
  const rows: any[] = await db.workout.findMany({ where: { userId: studentId, archived: false }, select: { id: true, endDate: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
  if (!rows.length) return { ok: false, error: 'Esse aluno não tem treino ativo.' };
  const latest = rows[0];
  if (!latest.endDate) return { ok: false, error: 'O treino atual não tem prazo, então não precisa prorrogar.' };
  const key = dateKeyBrt(new Date(latest.endDate));
  const targets = rows.filter((r) => r.endDate && dateKeyBrt(new Date(r.endDate)) === key);
  const previousEnd = new Date(latest.endDate);
  const wasExpired = previousEnd.getTime() <= now.getTime();
  for (const w of targets) await db.workout.update({ where: { id: w.id }, data: { endDate: computeNewEnd(new Date(w.endDate), now, days) } });
  return { ok: true, count: targets.length, previousEnd: previousEnd.toISOString(), newEnd: computeNewEnd(previousEnd, now, days).toISOString(), wasExpired };
}
