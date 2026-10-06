// lib/workoutSessions.ts
// 🔔 (7 out 2026) SESSÃO DE TREINO + LEMBRETE DE "FINALIZAR". Problema: o aluno toca em INICIAR TREINO, treina e esquece de finalizar. O servidor só
// conhecia o treino DEPOIS de finalizado, então quem esquecia sumia (o tempo e as cargas ficavam só no celular) e ninguém avisava.
//   • O app avisa o servidor quando o aluno INICIA (rota /api/workout/start): nasce uma WorkoutSession com a MESMA chave que o app manda ao finalizar.
//   • Ao finalizar (rota /api/workout/finish) a sessão é fechada.
//   • Se a sessão fica aberta por horas, o cron (a cada 5 min, o mesmo da agenda) manda um push ao aluno: 1º aviso 2h30 depois de iniciar, 2º aviso
//     no dia seguinte (20 h depois de iniciar e 12 h depois do 1º). Nunca de madrugada/à noite (isQuietNow); depois de 40 h desiste.
// Cada aviso é "reservado" no banco ANTES de enviar (updateMany com o contador ainda igual): duas execuções ao mesmo tempo nunca mandam o mesmo aviso duas vezes.
import { isQuietNow } from '@/lib/agenda';
import { cleanDay, cleanWorkoutId, sanitizeClientKey } from '@/lib/finishWorkout';

type Db = any;

const H = 3600000;
export const FIRST_REMINDER_H = 2.5;
export const SECOND_REMINDER_AFTER_START_H = 20;
export const SECOND_REMINDER_AFTER_FIRST_H = 12;
export const GIVE_UP_H = 40;
export const MAX_REMINDERS = 2;
/** O app manda a hora real em que o aluno iniciou; aceita até 18 h para trás (treino que ficou aberto de um dia para o outro) e 2 min à frente (relógio adiantado). */
export const MAX_BACKDATE_H = 18;
const MAX_AHEAD_MS = 2 * 60000;
const KEEP_DAYS = 60;

export type SessionInput = { clientKey: string; workoutId: string | null; day: string | null; workoutName: string | null; startedAt: Date };

/** Confere o corpo da rota de início. `startedAt` fora da faixa (ou ausente) vira "agora". */
export function parseSessionInput(body: any, now: Date = new Date()): { ok: true; value: SessionInput } | { ok: false; error: string } {
  const clientKey = sanitizeClientKey(body?.clientKey);
  if (!clientKey) return { ok: false, error: 'clientKey inválida.' };
  const raw = Number(body?.startedAt);
  const t = Number.isFinite(raw) && raw > 0 ? raw : NaN;
  const startedAt = Number.isFinite(t) && t >= now.getTime() - MAX_BACKDATE_H * H && t <= now.getTime() + MAX_AHEAD_MS ? new Date(t) : now;
  const name = typeof body?.workoutName === 'string' ? body.workoutName.trim().slice(0, 80) : '';
  return { ok: true, value: { clientKey, workoutId: cleanWorkoutId(body?.workoutId), day: cleanDay(body?.day), workoutName: name || null, startedAt } };
}

/** Abre a sessão (idempotente: o mesmo início enviado duas vezes não duplica nem reinicia o relógio). */
export async function startSession(db: Db, userId: string, input: SessionInput): Promise<{ created: boolean }> {
  const existing = await db.workoutSession.findFirst({ where: { userId, clientKey: input.clientKey }, select: { id: true } });
  if (existing) return { created: false };
  try {
    await db.workoutSession.create({ data: { userId, clientKey: input.clientKey, workoutId: input.workoutId, day: input.day, workoutName: input.workoutName, startedAt: input.startedAt } });
    return { created: true };
  } catch (e: any) {
    if (e && e.code === 'P2002') return { created: false };   // dois pedidos juntos: o outro criou primeiro
    throw e;
  }
}

/** Fecha as sessões abertas do treino que acabou de ser finalizado: pela chave e, por garantia, pela mesma ficha + dia (app que mudou de chave). */
export async function closeSessions(db: Db, userId: string, p: { clientKey: string | null; workoutId: string | null; day: string | null }, now: Date = new Date()): Promise<number> {
  const or: any[] = [];
  if (p.clientKey) or.push({ clientKey: p.clientKey });
  if (p.workoutId && p.day) or.push({ workoutId: p.workoutId, day: p.day });
  if (!or.length) return 0;
  const r = await db.workoutSession.updateMany({ where: { userId, finishedAt: null, OR: or }, data: { finishedAt: now } });
  return r && typeof r.count === 'number' ? r.count : 0;
}

/** Qual aviso está na hora para esta sessão: 1, 2 ou null (nenhum). */
export function reminderStage(s: { startedAt: Date | string; finishedAt?: Date | string | null; reminderCount?: number | null; remindedAt?: Date | string | null }, now: Date = new Date()): 1 | 2 | null {
  if (s.finishedAt) return null;
  const age = now.getTime() - new Date(s.startedAt).getTime();
  if (age > GIVE_UP_H * H) return null;
  const count = s.reminderCount || 0;
  if (count === 0) return age >= FIRST_REMINDER_H * H ? 1 : null;
  if (count === 1) {
    const sinceFirst = s.remindedAt ? now.getTime() - new Date(s.remindedAt).getTime() : Infinity;
    return age >= SECOND_REMINDER_AFTER_START_H * H && sinceFirst >= SECOND_REMINDER_AFTER_FIRST_H * H ? 2 : null;
  }
  return null;
}

const first = (n: any) => String(n ?? '').trim().split(/\s+/)[0] || '';
const labelOf = (s: { workoutName?: string | null; day?: string | null }) => (s.workoutName && s.workoutName.trim()) || (s.day ? `Treino ${s.day}` : 'de hoje');

/** O texto do aviso ao aluno (curto, acolhedor, sem cobrança). */
export function unfinishedMessage(name: any, s: { workoutName?: string | null; day?: string | null }, stage: 1 | 2): { title: string; body: string } {
  const nm = first(name), label = labelOf(s);
  if (stage === 1) return { title: 'Você terminou o treino? 💪', body: `${nm ? nm + ', seu' : 'Seu'} treino "${label}" ficou aberto. Toque para finalizar e salvar as suas cargas.` };
  return { title: 'Seu treino ainda está aberto', body: `Salve o que você já fez em "${label}" para o seu coach acompanhar a sua evolução. Leva 1 minuto.` };
}

export type RemindDeps = { db: Db; sendToUser: (user: any, title: string, body: string, data?: any) => Promise<any>; now?: Date };

/** Cron: manda os lembretes que estão na hora e limpa sessões antigas. */
export async function runWorkoutReminders(deps: RemindDeps) {
  const { db } = deps, now = deps.now || new Date();
  const out = { checked: 0, sent: 0, quiet: 0, cleaned: 0 };
  const rows: any[] = await db.workoutSession.findMany({
    where: { finishedAt: null, reminderCount: { lt: MAX_REMINDERS }, startedAt: { gte: new Date(now.getTime() - GIVE_UP_H * H), lte: new Date(now.getTime() - FIRST_REMINDER_H * H) } },
    orderBy: { startedAt: 'asc' }, take: 500,
  });
  out.checked = rows.length;
  const quiet = isQuietNow(now);
  for (const s of rows) {
    const stage = reminderStage(s, now);
    if (!stage) continue;
    if (quiet) { out.quiet++; continue; }
    const claim = await db.workoutSession.updateMany({ where: { id: s.id, finishedAt: null, reminderCount: s.reminderCount || 0 }, data: { reminderCount: stage, remindedAt: now } });
    if (!claim || claim.count !== 1) continue;
    const user = await db.user.findUnique({ where: { id: s.userId }, select: { id: true, name: true, pushToken: true, active: true } });
    if (!user || user.active === false) continue;
    const m = unfinishedMessage(user.name, s, stage);
    await deps.sendToUser(user, m.title, m.body, { type: 'workout_unfinished', workoutId: s.workoutId || undefined, day: s.day || undefined, workoutName: s.workoutName || undefined });
    out.sent++;
  }
  const old = await db.workoutSession.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - KEEP_DAYS * 24 * H) } } });
  out.cleaned = old && typeof old.count === 'number' ? old.count : 0;
  return out;
}
