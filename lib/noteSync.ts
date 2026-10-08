// lib/noteSync.ts
// 🔗 (9 out 2026) O comentário do aluno num exercício existia em DOIS lugares com "resolvido" separado: o cartão do Prontuário (ExerciseHistory.resolvedAt) e o aviso imediato do
// Feed / A FAZER (StudentAlert EXERCISE_NOTE, isRead). Responder por um não resolvia o outro, e o cartão do Prontuário continuava pedindo "RESOLVER / RESPONDER" para algo que já tinha
// sido respondido. Aqui os dois passam a andar juntos. Tudo protegido: se algo falhar, a ação principal (responder, salvar) continua valendo.
import prisma from '@/lib/prisma';

const HOUR = 3600000;
/** O aviso imediato nasce DURANTE o treino (antes de finalizar) ou na hora de finalizar: janela em torno da data do treino finalizado. */
const BEFORE_FINISH_H = 12;
const AFTER_FINISH_H = 1;

/** Marca como lidos os avisos imediatos (StudentAlert) do mesmo exercício e do mesmo treino. Devolve quantos. */
export async function markAlertsReadForNote(o: { userId: string; exerciseName: string; finishedAt: Date }, db: any = prisma): Promise<number> {
  try {
    const at = new Date(o.finishedAt).getTime();
    const r = await db.studentAlert.updateMany({
      where: { userId: o.userId, type: 'EXERCISE_NOTE', isRead: false, exerciseName: o.exerciseName, createdAt: { gte: new Date(at - BEFORE_FINISH_H * HOUR), lte: new Date(at + AFTER_FINISH_H * HOUR) } },
      data: { isRead: true },
    });
    return r.count || 0;
  } catch (e) { console.error('[noteSync] alertas:', (e as any)?.message || e); return 0; }
}

/**
 * Resolve o comentário de UM exercício num treino finalizado: todas as linhas do exercício naquele treino (a nota vem repetida em cada série) ganham resolvedAt (e a resposta, se houver)
 * e o aviso imediato correspondente sai da fila do Feed / A FAZER.
 */
export async function resolveExerciseNote(o: { workoutHistory: { id: string; userId: string; date: Date }; exerciseName: string; reply?: string | null; now?: Date }, db: any = prisma) {
  const now = o.now || new Date();
  const reply = o.reply ? String(o.reply).trim().slice(0, 1000) : '';
  try {
    await db.exerciseHistory.updateMany({
      where: { workoutHistoryId: o.workoutHistory.id, exerciseName: o.exerciseName, resolvedAt: null },
      data: { resolvedAt: now, ...(reply ? { coachReply: reply, coachReplyAt: now } : {}) },
    });
  } catch (e) { console.error('[noteSync] linhas do exercício:', (e as any)?.message || e); }
  return markAlertsReadForNote({ userId: o.workoutHistory.userId, exerciseName: o.exerciseName, finishedAt: o.workoutHistory.date }, db);
}

/**
 * O caminho contrário: o coach respondeu/resolveu o AVISO IMEDIATO (Feed ou A FAZER) → o cartão do Prontuário daquele exercício, no treino que o aluno finalizou logo depois, também
 * fica resolvido (com a mesma resposta). Devolve quantas linhas.
 */
export async function resolveHistoryNotesForAlert(alert: { userId: string; exerciseName?: string | null; createdAt: Date }, reply: string | null, db: any = prisma): Promise<number> {
  try {
    if (!alert.exerciseName) return 0;
    const at = new Date(alert.createdAt).getTime();
    const histories: any[] = await db.workoutHistory.findMany({ where: { userId: alert.userId, date: { gte: new Date(at - AFTER_FINISH_H * HOUR), lte: new Date(at + BEFORE_FINISH_H * HOUR) } }, select: { id: true } });
    if (!histories.length) return 0;
    const now = new Date();
    const r = await db.exerciseHistory.updateMany({
      where: { workoutHistoryId: { in: histories.map((h) => h.id) }, exerciseName: alert.exerciseName, note: { not: null }, resolvedAt: null },
      data: { resolvedAt: now, ...(reply ? { coachReply: reply, coachReplyAt: now } : {}) },
    });
    return r.count || 0;
  } catch (e) { console.error('[noteSync] histórico:', (e as any)?.message || e); return 0; }
}
