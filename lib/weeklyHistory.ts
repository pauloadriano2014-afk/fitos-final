// lib/weeklyHistory.ts
// 📈 (1 out 2026) Histórico de ADESÃO do feedback da semana: das últimas semanas, quantos alunos deviam responder e quantos responderam.
// Alimenta a tira de barras do painel do coach (cada barra leva à semana). Só leitura; recebe o `db` (Prisma) para poder ser testado.
import { MASTER_IDS } from '@/lib/masterIds';
import { addDays, brtYearMonth, evaluatedWeekStart, isDueStudentForWeek, mondayOf, weekLabel } from '@/lib/weeklyFeedback';

export const HISTORY_MIN_WEEKS = 2;
export const HISTORY_MAX_WEEKS = 12;
export const HISTORY_DEFAULT_WEEKS = 4;      // padrão: as últimas 4 semanas (o coach pode escolher um mês inteiro)
export const HISTORY_MONTH_CHOICES = 6;      // quantos meses recentes o coach pode escolher

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export type MonthChoice = { key: string; label: string; short: string };

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

/** "2026-09" -> { year: 2026, month: 9 }; qualquer outra coisa (ou mês fora de 1-12) -> null. */
export function parseMonth(raw: unknown): { year: number; month: number } | null {
  const m = typeof raw === 'string' ? /^(\d{4})-(\d{2})$/.exec(raw.trim()) : null;
  if (!m) return null;
  const year = Number(m[1]); const month = Number(m[2]);
  return year >= 2020 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
}

export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/**
 * As segundas-feiras das semanas (segunda a domingo) que TOCAM o mês, da primeira à última, só até a semana já avaliada
 * (a semana corrente ainda não fechou). Ex.: setembro/2026 = 31/08, 07/09, 14/09, 21/09 (e 28/09 depois que fechar).
 */
export function monthWeekStarts(year: number, month: number, now: Date): string[] {
  const lastDay = `${monthKey(year, month)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  const limit = evaluatedWeekStart(now);
  const out: string[] = [];
  for (let ws = mondayOf(new Date(Date.UTC(year, month - 1, 1, 12))); ws <= lastDay; ws = addDays(ws, 7)) {
    if (ws <= limit) out.push(ws);
  }
  return out;
}

/** Os meses que o coach pode escolher: dos últimos `count` meses, os que já têm ao menos uma semana fechada; do mais novo para o mais antigo. */
export function recentMonths(now: Date, count = HISTORY_MONTH_CHOICES): MonthChoice[] {
  const cur = brtYearMonth(now);
  const out: MonthChoice[] = [];
  for (let i = 0; i < count; i++) {
    const idx = cur.year * 12 + (cur.month - 1) - i;
    const year = Math.floor(idx / 12); const month = (idx % 12) + 1;
    if (!monthWeekStarts(year, month, now).length) continue;
    out.push({ key: monthKey(year, month), label: `${MONTH_NAMES[month - 1]} ${year}`, short: `${MONTH_NAMES[month - 1].slice(0, 3).toUpperCase()}${year === cur.year ? '' : `/${String(year).slice(2)}`}` });
  }
  return out;
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

export async function loadAdherenceHistory(db: any, o: { adminId: string; now?: Date; weeks?: unknown; month?: unknown }) {
  const now = o.now || new Date();
  const weeks = clampWeeks(o.weeks);
  const isMaster = MASTER_IDS.includes(o.adminId);
  const month = parseMonth(o.month);
  const weekStarts = month ? monthWeekStarts(month.year, month.month, now) : recentWeekStarts(now, weeks);

  const users: any[] = await db.user.findMany({
    where: { role: 'USER', ...(isMaster ? { coachId: { in: MASTER_IDS } } : { coachId: o.adminId }) },
    select: { id: true, coachId: true, createdAt: true, active: true, accountStatus: true },
  });
  const ids = users.map((u) => u.id);
  const feedbacks: any[] = ids.length && weekStarts.length
    ? await db.weeklyFeedback.findMany({ where: { userId: { in: ids }, weekStart: { in: weekStarts } }, select: { userId: true, weekStart: true } })
    : [];
  const picked = month ? monthKey(month.year, month.month) : null;
  return {
    weeks: computeAdherence(users, feedbacks, weekStarts),
    month: picked,                                                                  // o mês pedido (null = as últimas semanas); apps antigos nem recebem
    monthLabel: month ? `${MONTH_NAMES[month.month - 1]} ${month.year}` : null,
    months: recentMonths(now),                                                      // os meses que o coach pode escolher
  };
}
