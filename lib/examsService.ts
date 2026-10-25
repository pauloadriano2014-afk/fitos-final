// lib/examsService.ts
// 🩺 (25 out 2026) Miolo compartilhado das rotas de exames: carregar aluno/envio, conferir quem é quem e avisar (push) sem derrubar a ação principal.
import prisma from '@/lib/prisma';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { examRole, actsAsExamStudent, Role } from '@/lib/exams';

export const UNAVAILABLE = { error: 'Os exames ainda não estão habilitados no servidor (falta criar as tabelas novas: npx prisma db push).', unavailable: true };
export const missing = (e: any) => /does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''));

export const loadStudent = (db: any, id: string) => db.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, coachId: true, nutritionistId: true, isTestAccount: true } });

/** O envio + o aluno + o papel de quem chama. `role` nulo = sem acesso (a rota responde 404 para não revelar que o envio existe). */
export async function loadForUser(db: any, user: { id: string }, submissionId: string) {
  const sub: any = await db.examSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) return { sub: null, student: null, role: null as Role | null };
  const student: any = await loadStudent(db, sub.userId);
  return { sub, student, role: examRole(user, sub, student) };
}

export async function notifyUser(db: any, userId: string, title: string, body: string, data: any, send: any = sendPushToUser) {
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, pushToken: true } });
    if (u) await send(u, title, body, data);
  } catch (e) { console.error('[exams] push:', (e as any)?.message || e); }
}

export async function replyCounts(db: any, ids: string[]): Promise<Map<string, { total: number; unread: number }>> {
  const out = new Map<string, { total: number; unread: number }>();
  if (!ids.length) return out;
  const rows: any[] = await db.examReply.findMany({ where: { submissionId: { in: ids } }, select: { submissionId: true, studentReadAt: true } });
  for (const r of rows) { const c = out.get(r.submissionId) || { total: 0, unread: 0 }; c.total++; if (!r.studentReadAt) c.unread++; out.set(r.submissionId, c); }
  return out;
}
export { prisma, actsAsExamStudent };
