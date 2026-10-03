// lib/workoutShareNotify.ts
// 🔗 (3 out 2026) Avisos do LINK DO TREINO para o coach (push): "abriram o link" (1ª abertura) e "concluíram o treino". Quem manda o aviso é sempre quem criou
// o link (`createdById`). Os textos ficam em lib/workoutShare.ts (openPushText / donePushText).
import prisma from '@/lib/prisma';
import { sendPushToUser } from '@/app/utils/sendNotification';
import { parseQuickData, quickAvailableDays, firstName } from '@/lib/workoutShare';

/** Push para quem criou o link. Nunca lança erro: aviso é "best effort" e não pode derrubar a página do aluno. */
export async function pushToShareCreator(share: { createdById?: string | null }, title: string, body: string, data: any = {}) {
  try {
    if (!share || !share.createdById) return;
    const user = await prisma.user.findUnique({ where: { id: share.createdById }, select: { id: true, pushToken: true } });
    if (user) await sendPushToUser(user, title, body, data);
  } catch (e) { console.error('[workout-share] falha ao avisar o coach:', (e as any)?.message || e); }
}

/** O nome que a pessoa vê no topo da página (ou null): o que o coach digitou, ou o 1º nome do aluno quando o nome está ligado. */
export const whoSees = (share: { showName?: boolean | null; displayName?: string | null }, studentName?: string | null): string | null =>
  share.showName ? (share.displayName || firstName(studentName) || null) : null;

/** Nome do treino, nome do aluno (treino de aluno) e dias do treino de hoje, para validar e escrever o aviso de conclusão. */
export async function loadShareContext(share: { workoutId?: string | null; quickWorkoutId?: string | null }): Promise<{ workoutName: string; studentName: string | null; days: string[] } | null> {
  if (share.quickWorkoutId) {
    const q = await prisma.quickWorkout.findUnique({ where: { id: share.quickWorkoutId }, select: { name: true, data: true } });
    if (!q) return null;
    const parsed = parseQuickData(q.data);
    return { workoutName: q.name, studentName: null, days: parsed.ok ? quickAvailableDays(parsed.days) : [] };
  }
  if (share.workoutId) {
    const w = await prisma.workout.findUnique({ where: { id: share.workoutId }, select: { name: true, userId: true } });
    if (!w) return null;
    const [student, rows] = await Promise.all([
      prisma.user.findUnique({ where: { id: w.userId }, select: { name: true } }),
      prisma.workoutExercise.findMany({ where: { workoutId: share.workoutId }, select: { day: true }, orderBy: { order: 'asc' } }),
    ]);
    const days: string[] = [];
    rows.forEach((r: any) => { const d = String(r.day); if (!days.includes(d)) days.push(d); });
    return { workoutName: w.name, studentName: student?.name || null, days };
  }
  return null;
}
