// lib/studentMessages.ts
// 💬 (9 out 2026) Mensagem do coach para UM aluno ("ajustei o seu treino", "troquei o exercício que você não tinha"). O coach sempre revisa o texto antes de sair;
// aqui só validamos, gravamos e mandamos o push. Falha no push nunca desfaz a mensagem (ela fica esperando o aluno na aba Treinos).
import prisma from '@/lib/prisma';
import { sendPushToUser } from '@/app/utils/sendNotification';

export const MESSAGE_KINDS = ['AJUSTE_TREINO', 'APARELHO_TROCADO', 'LIVRE'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export const MAX_TITLE = 120;
export const MAX_BODY = 1500;
export const MAX_CHANGES = 30;

export const PUSH_TITLE: Record<MessageKind, string> = { AJUSTE_TREINO: '🛠️ Seu coach ajustou seu treino', APARELHO_TROCADO: '🔁 Seu coach trocou um exercício', LIVRE: '💬 Mensagem do seu coach' };

export interface MessageInput { studentId?: any; kind?: any; title?: any; body?: any; changes?: any; workoutId?: any; day?: any; sourceTaskKey?: any; followUp?: any }
export interface CleanMessage { kind: MessageKind; title: string; body: string; changes: any[] | null; workoutId: string | null; day: string | null; sourceTaskKey: string | null; followUp: boolean }

const text = (v: any, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

/** Valida e limpa o que veio do app. Devolve o motivo em português quando não dá. */
export function cleanMessage(input: MessageInput): { ok: true; value: CleanMessage } | { ok: false; error: string } {
  const kind = MESSAGE_KINDS.includes(input.kind) ? (input.kind as MessageKind) : null;
  if (!kind) return { ok: false, error: 'Tipo de mensagem inválido.' };
  const title = text(input.title, MAX_TITLE);
  const body = text(input.body, MAX_BODY);
  if (!title) return { ok: false, error: 'A mensagem precisa de um título.' };
  if (!body) return { ok: false, error: 'Escreva a mensagem para o aluno.' };
  let changes: any[] | null = null;
  if (Array.isArray(input.changes)) {
    changes = input.changes.slice(0, MAX_CHANGES).map((c: any) => ({ type: text(c?.type, 20), day: text(c?.day, 40), exercise: text(c?.exercise, 120), text: text(c?.text, 200) })).filter((c: any) => c.text);
    if (!changes!.length) changes = null;
  }
  return { ok: true, value: { kind, title, body, changes, workoutId: text(input.workoutId, 80) || null, day: text(input.day, 40) || null, sourceTaskKey: text(input.sourceTaskKey, 120) || null, followUp: input.followUp === true } };
}

/** Grava a mensagem e avisa o aluno por push (melhor esforço). */
export async function createStudentMessage(coachId: string, studentId: string, m: CleanMessage, db: any = prisma) {
  const row = await db.studentCoachMessage.create({
    data: { userId: studentId, coachId, kind: m.kind, title: m.title, body: m.body, changes: m.changes ?? undefined, workoutId: m.workoutId, day: m.day, sourceTaskKey: m.sourceTaskKey, followUp: m.followUp },
  });
  let pushed = false;
  try {
    const student = await db.user.findUnique({ where: { id: studentId }, select: { id: true, pushToken: true } });
    if (student) { await sendPushToUser(student, PUSH_TITLE[m.kind], m.title, { type: 'coach_message', messageId: row.id, kind: m.kind, workoutId: m.workoutId, day: m.day }); pushed = !!student.pushToken; }
  } catch (e) { console.error('[studentMessages] push:', (e as any)?.message || e); }
  return { row, pushed };
}

// ── "o ajuste funcionou?" ──
const norm = (s: any) => String(s ?? '').trim().toUpperCase();

/**
 * Olha o primeiro treino finalizado DEPOIS do aviso em que o aluno respondeu à pergunta "deu tempo?" (a pergunta é opcional: sem resposta não prova nada).
 * Só vale o treino do mesmo dia/ficha do ajuste. Grava e devolve o resultado: WORKED (coube) ou STILL_SHORT (faltou de novo); null = ainda sem resposta.
 */
export async function settleAdjustment(msg: any, db: any = prisma): Promise<{ outcome: 'WORKED' | 'STILL_SHORT' | null; outcomeAt: Date | null }> {
  if (msg.kind !== 'AJUSTE_TREINO') return { outcome: null, outcomeAt: null };
  if (msg.outcome) return { outcome: msg.outcome, outcomeAt: msg.outcomeAt || null };
  const rows: any[] = await db.workoutHistory.findMany({ where: { userId: msg.userId, date: { gt: new Date(msg.createdAt) } }, orderBy: { date: 'asc' }, select: { id: true, date: true, day: true, workoutId: true, timeOk: true } });
  const hit = rows.find((h) => h.timeOk !== null && h.timeOk !== undefined
    && (!msg.day || !h.day || norm(h.day) === norm(msg.day))
    && (!msg.workoutId || !h.workoutId || h.workoutId === msg.workoutId));
  if (!hit) return { outcome: null, outcomeAt: null };
  const outcome = hit.timeOk === true ? 'WORKED' : 'STILL_SHORT';
  try { await db.studentCoachMessage.update({ where: { id: msg.id }, data: { outcome, outcomeAt: hit.date } }); } catch (e) { /* o resultado só não fica guardado: recalcula na próxima */ }
  return { outcome, outcomeAt: hit.date };
}
