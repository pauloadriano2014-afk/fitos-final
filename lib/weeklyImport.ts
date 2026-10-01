// lib/weeklyImport.ts
// Conferências comuns das rotas "colar a resposta do WhatsApp" (interpretar e salvar): o aluno precisa estar pendente na semana avaliada.
import { evaluatedWeekStart, isDueStudent, isMissingTable, weekLabel } from '@/lib/weeklyFeedback';

export type PendingCheck = { ok: true; weekStart: string; weekLabel: string } | { ok: false; status: number; error: string };

export async function checkPendingStudent(db: any, student: any, now: Date): Promise<PendingCheck> {
  if (!isDueStudent(student, now)) return { ok: false, status: 400, error: 'Esse aluno não tem feedback pendente.' };
  const weekStart = evaluatedWeekStart(now);
  try {
    const done = await db.weeklyFeedback.findUnique({ where: { userId_weekStart: { userId: student.id, weekStart } }, select: { id: true } });
    if (done) return { ok: false, status: 409, error: 'Esse aluno já respondeu essa semana.' };
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, status: 503, error: 'Recurso ainda não disponível.' };
    throw e;
  }
  return { ok: true, weekStart, weekLabel: weekLabel(weekStart) };
}
