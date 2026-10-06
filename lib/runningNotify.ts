// lib/runningNotify.ts
// 🔔 (6 out 2026) Avisos por push do módulo de corrida (fase 1). Todos são "melhor esforço": nunca lançam erro e nunca seguram a resposta da rota que os chamou.
//   • COACH: a aluna respondeu a anamnese (a pendência também aparece em A FAZER); a aluna fechou a semana / vai repetir / concluiu o protocolo;
//   • ALUNO: o coach ativou o protocolo.
// Os textos moram em lib/runningMessages.ts. O toque na notificação abre o modal de corrida do aluno (coach) ou a aba CORRIDA (aluno): ver notificationDeepLink.js.
import { sendPushToUser } from '@/app/utils/sendNotification';
import { progressCoachMessage, anamneseCoachMessage, protocolStudentMessage } from './runningMessages';
import type { ProgressView } from './runningProgress';
import type { PlanType } from './runningPlans';

type Db = any;

const coachOf = async (db: Db, coachId: string | null | undefined) =>
  coachId ? db.user.findUnique({ where: { id: coachId }, select: { id: true, pushToken: true } }) : null;

/** A aluna respondeu a anamnese de corrida: avisa o coach dono dela. Devolve se tentou enviar. */
export async function notifyCoachAnamnese(db: Db, student: { id: string; name?: string | null; coachId?: string | null }, anamnese: any): Promise<boolean> {
  try {
    const coach = await coachOf(db, student.coachId);
    if (!coach) return false;
    const m = anamneseCoachMessage(student.name, anamnese);
    await sendPushToUser(coach, m.title, m.body, { type: 'running_anamnese', studentId: student.id });
    return true;
  } catch (e) { console.error('[running-notify] anamnese:', e); return false; }
}

/** O treino que a aluna acabou de registrar mudou o andamento (semana fechada, repetida, avançou ou protocolo concluído): avisa o coach. */
export async function notifyCoachProgress(db: Db, student: { id: string; name?: string | null; coachId?: string | null }, before: ProgressView, after: ProgressView, actorId?: string | null): Promise<boolean> {
  try {
    if (!student.coachId || actorId === student.coachId) return false;   // o próprio coach registrou: não precisa avisá-lo do que ele fez
    const m = progressCoachMessage(student.name, before, after);
    if (!m) return false;
    const coach = await coachOf(db, student.coachId);
    if (!coach) return false;
    await sendPushToUser(coach, m.title, m.body, { type: 'running_progress', studentId: student.id, kind: m.kind });
    return true;
  } catch (e) { console.error('[running-notify] progresso:', e); return false; }
}

/** O coach ativou o protocolo: avisa a aluna (o app dela já mostra a aba CORRIDA com os treinos). */
export async function notifyStudentProtocol(db: Db, studentId: string, type: PlanType, startWeek: number, trainingDays: string[], renewed: boolean): Promise<boolean> {
  try {
    const student = await db.user.findUnique({ where: { id: studentId }, select: { id: true, name: true, pushToken: true } });
    if (!student) return false;
    const m = protocolStudentMessage(student.name, type, startWeek, trainingDays, renewed);
    await sendPushToUser(student, m.title, m.body, { type: 'running_protocol' });
    return true;
  } catch (e) { console.error('[running-notify] protocolo:', e); return false; }
}
