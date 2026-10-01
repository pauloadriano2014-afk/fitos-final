// lib/weeklyHistory.ts
// 📈 (1 out 2026) Histórico de ADESÃO do feedback da semana: das últimas semanas, quantos alunos deviam responder e quantos responderam.
// Alimenta a tira de barras do painel do coach (cada barra leva à semana). Só leitura; recebe o `db` (Prisma) para poder ser testado.
import { MASTER_IDS } from '@/lib/masterIds';
import { addDays, evaluatedWeekStart, isDueStudentForWeek, weekLabel } from '@/lib/weeklyFeedback';

export const HISTORY_MIN_WEEKS = 2;
export const HISTORY_MAX_WEEKS = 12;
export const HISTORY_DEFAULT_WEEKS = 8;

export type AdherenceWeek = { weekStart: string; weekLabel: string; students: number; answered: number; pct: number | null };

/** Quantas semanas mostrar: número inteiro entre 2 e 12 (qualquer outra coisa vira 8). */
export function clampWeeks(raw: unknown): number {
  // só número inteiro (ou texto de dígitos): null/vazio/boolean não podem virar 0 (aí a rota sem `weeks` mostraria só 2 semanas)
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  if (!Number.isInteger(n)) return HISTORY_DEFAULT_WEEKS;
  return Math.min(HISTORY_MAX_WEEKS, Math.max(HISTORY_MIN_WEEKS, n));
}

/** As segundas-feiras das últimas `weeks` semanas avaliadas, da mais antiga para a atual. */
export function recentWeekStarts(now: Date, weeks: number): string[] {
  const current = evaluatedWeekStart(now);
  return Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)));
}

/** Conta pura: alunos que deviam responder em cada semana x quem respondeu. `feedbacks` = [{ userId, weekStart }]. */
export function computeAdherence(users: any[], feedbacks: Array<{ userId: string; weekStart: string }>, weekStarts: string[]): AdherenceWeek[] {
  const answeredBy = new Map<string, Set<string>>();
  feedbacks.forEach((f) => {
    if (!answeredBy.has(f.weekStart)) answeredBy.set(f.weekStart, new Set());
    answeredBy.get(f.weekStart)!.add(f.userId);
  });
  return weekStarts.map((ws) => {
    const due = users.filter((u) => isDueStudentForWeek(u, ws));
    const answeredSet = answeredBy.get(ws) || new Set<string>();
    const answered = due.filter((u) => answeredSet.has(u.id)).length;
    return { weekStart: ws, weekLabel: weekLabel(ws), students: due.length, answered, pct: due.length > 0 ? Math.round((100 * answered) / due.length) : null };
  });
}

export async function loadAdherenceHistory(db: any, o: { adminId: string; now?: Date; weeks?: unknown }) {
  const now = o.now || new Date();
  const weeks = clampWeeks(o.weeks);
  const isMaster = MASTER_IDS.includes(o.adminId);
  const weekStarts = recentWeekStarts(now, weeks);

  const users: any[] = await db.user.findMany({
    where: { role: 'USER', ...(isMaster ? { coachId: { in: MASTER_IDS } } : { coachId: o.adminId }) },
    select: { id: true, coachId: true, createdAt: true, active: true, accountStatus: true },
  });
  const ids = users.map((u) => u.id);
  const feedbacks: any[] = ids.length
    ? await db.weeklyFeedback.findMany({ where: { userId: { in: ids }, weekStart: { in: weekStarts } }, select: { userId: true, weekStart: true } })
    : [];
  return { weeks: computeAdherence(users, feedbacks, weekStarts) };
}
