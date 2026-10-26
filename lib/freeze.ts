// lib/freeze.ts
// ❄️ (26 out 2026) CONGELAR O PLANO DO ALUNO (cirurgia, lesão, viagem...). O coach congela e descongela; o tempo parado NÃO conta no plano que o aluno já pagou.
//   • congelar: guarda quando começou (frozenAt), a volta prevista (frozenUntil, opcional) e o motivo; deixa o aluno fora do financeiro (isFinanceActive = false, lembrando como estava)
//     e, se o coach quiser, cancela a cobrança automática na Asaas (mesmo caminho do "parar de cobrar", lib/stopBilling.ts);
//   • descongelar: conta os dias parados (arredondados em dias inteiros) e empurra o fim e o início do treino, o próximo vencimento e a próxima avaliação por esses dias.
// Aqui só tem contas e a gravação (recebe o `db` para testar sem banco); quem confere permissão e fala com a Asaas é a rota.
export const DAY_MS = 24 * 60 * 60 * 1000;
export const REASON_MAX = 200;
export const MAX_FREEZE_DAYS = 365;
const PLAN_LIMIT: Record<string, number> = { FICHA_8S: 56, CHALLENGE_21: 21 };   // o relógio dessas fichas anda pelo início do treino (planClock do app): vencida não "ressuscita"

export type FreezeAction = 'FREEZE' | 'UNFREEZE';
export interface FreezeInput { userId: string; action: FreezeAction; until: Date | null; reason: string | null; confirm: boolean; cancelBilling: boolean }

/** Data "AAAA-MM-DD" (ou ISO) -> meio-dia de Brasília (15:00 UTC), para não virar o dia anterior em nenhum fuso; null se vazia/inválida. */
export function parseDay(v: unknown): Date | null | 'invalid' {
  if (v === undefined || v === null || v === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (!m) return 'invalid';
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T15:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? 'invalid' : d;
}

export function parseFreezeBody(body: any, now: Date = new Date()): { ok: true; value: FreezeInput } | { ok: false; error: string } {
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return { ok: false, error: 'userId é obrigatório' };
  const action = String(body?.action || '').toUpperCase();
  if (action !== 'FREEZE' && action !== 'UNFREEZE') return { ok: false, error: 'action deve ser FREEZE ou UNFREEZE' };
  let until: Date | null = null;
  if (action === 'FREEZE') {
    const u = parseDay(body?.until);
    if (u === 'invalid') return { ok: false, error: 'Data de volta inválida (use AAAA-MM-DD).' };
    if (u) {
      if (u.getTime() < now.getTime() - DAY_MS) return { ok: false, error: 'A data de volta não pode estar no passado.' };
      if (u.getTime() > now.getTime() + MAX_FREEZE_DAYS * DAY_MS) return { ok: false, error: `A volta prevista passa de ${MAX_FREEZE_DAYS} dias.` };
    }
    until = u;
  }
  const reasonRaw = typeof body?.reason === 'string' ? body.reason.trim().slice(0, REASON_MAX) : '';
  return { ok: true, value: { userId, action, until, reason: reasonRaw || null, confirm: body?.confirm === true, cancelBilling: body?.cancelBilling !== false } };
}

/** Dias inteiros parados entre `frozenAt` e `now` (nunca negativo). */
export const frozenDays = (frozenAt: Date | string, now: Date): number => Math.max(0, Math.round((now.getTime() - new Date(frozenAt).getTime()) / DAY_MS));
const addDays = (d: Date | string, days: number) => new Date(new Date(d).getTime() + days * DAY_MS);

export interface Move { from: string; to: string }
export interface WorkoutMove { id: string; name: string | null; startDate: Move | null; endDate: Move | null }
export interface UnfreezePlan {
  days: number;
  workouts: WorkoutMove[];
  paymentDueDate: Move | null;
  nextCheckInDate: Move | null;
  notes: string[];          // avisos em português para o coach (o que NÃO foi empurrado e por quê)
}
const mv = (from: Date | string, to: Date): Move => ({ from: new Date(from).toISOString(), to: to.toISOString() });

/** O que o descongelar vai mudar. Só contas: não grava nada. */
export function planUnfreeze(
  user: { frozenAt: Date | string; plan?: string | null; paymentDueDate?: Date | string | null; nextCheckInDate?: Date | string | null; frozenFinanceWasActive?: boolean | null },
  workouts: { id: string; name?: string | null; startDate?: Date | string | null; endDate?: Date | string | null; archived?: boolean | null }[],
  now: Date,
): UnfreezePlan {
  const frozenAt = new Date(user.frozenAt);
  const days = frozenDays(frozenAt, now);
  const notes: string[] = [];
  const out: UnfreezePlan = { days, workouts: [], paymentDueDate: null, nextCheckInDate: null, notes };
  if (days <= 0) { notes.push('Ficou congelado menos de meio dia: nenhuma data foi empurrada.'); return out; }

  const live = workouts.filter((w) => !w.archived);
  // treino vivo no dia em que congelou = sem prazo ou com prazo que ainda não tinha chegado
  let alive = live.filter((w) => !w.endDate || new Date(w.endDate).getTime() >= frozenAt.getTime());
  const limit = PLAN_LIMIT[String(user.plan || '')];
  if (limit && alive.length) {
    const starts = alive.map((w) => (w.startDate ? new Date(w.startDate).getTime() : NaN)).filter((n) => !Number.isNaN(n));
    if (starts.length && Math.floor((frozenAt.getTime() - Math.min(...starts)) / DAY_MS) >= limit) { notes.push('A ficha já estava vencida quando congelou: o treino não foi empurrado (precisa de um novo).'); alive = []; }
  }
  if (live.length && !alive.length && !notes.length) notes.push('O treino já tinha vencido quando congelou: não foi empurrado.');
  for (const w of alive) {
    out.workouts.push({
      id: w.id, name: w.name ?? null,
      startDate: w.startDate ? mv(w.startDate, addDays(w.startDate, days)) : null,
      endDate: w.endDate ? mv(w.endDate, addDays(w.endDate, days)) : null,
    });
  }
  if (user.paymentDueDate) {
    if (user.frozenFinanceWasActive === false) notes.push('Ele estava inativo no financeiro antes de congelar: o vencimento não foi mexido.');
    else if (new Date(user.paymentDueDate).getTime() >= frozenAt.getTime()) out.paymentDueDate = mv(user.paymentDueDate, addDays(user.paymentDueDate, days));
    else notes.push('O vencimento já estava atrasado quando congelou: não foi empurrado (confira se ele deve esse período).');
  }
  if (user.nextCheckInDate && new Date(user.nextCheckInDate).getTime() >= frozenAt.getTime()) out.nextCheckInDate = mv(user.nextCheckInDate, addDays(user.nextCheckInDate, days));
  return out;
}

export const isFrozen = (u: { frozenAt?: Date | string | null } | null | undefined) => !!(u && u.frozenAt);

/** Congela: grava os marcadores e tira o aluno do financeiro (lembrando como estava). */
export async function applyFreeze(db: any, user: { id: string; isFinanceActive?: boolean | null }, i: { until: Date | null; reason: string | null }, now: Date = new Date()) {
  return db.user.update({
    where: { id: user.id },
    data: { frozenAt: now, frozenUntil: i.until, frozenReason: i.reason, frozenFinanceWasActive: user.isFinanceActive !== false, isFinanceActive: false },
  });
}

/** Descongela: empurra as datas do plano e limpa os marcadores, tudo junto (se uma parte falhar, nada fica pela metade). */
export async function applyUnfreeze(db: any, user: { id: string; frozenFinanceWasActive?: boolean | null }, plan: UnfreezePlan) {
  const ops: any[] = [];
  for (const w of plan.workouts) {
    const data: any = {};
    if (w.startDate) data.startDate = new Date(w.startDate.to);
    if (w.endDate) data.endDate = new Date(w.endDate.to);
    if (Object.keys(data).length) ops.push(db.workout.update({ where: { id: w.id }, data }));
  }
  const userData: any = { frozenAt: null, frozenUntil: null, frozenReason: null, frozenFinanceWasActive: null, isFinanceActive: user.frozenFinanceWasActive !== false };
  if (plan.paymentDueDate) userData.paymentDueDate = new Date(plan.paymentDueDate.to);
  if (plan.nextCheckInDate) userData.nextCheckInDate = new Date(plan.nextCheckInDate.to);
  ops.push(db.user.update({ where: { id: user.id }, data: userData }));
  await db.$transaction(ops);
}
