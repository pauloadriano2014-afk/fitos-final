// lib/ai/genSnapshots.ts
// 🧠 (23 out 2026) Guarda o treino que a IA gerou e, quando o coach salva nos 3 dias seguintes, o que ele corrigiu (etapa 2 de "a IA aprende com as correções do Paulo").
// TUDO aqui é "melhor esforço": se a tabela ainda não existe (falta o `npx prisma db push`) ou qualquer coisa falha, devolve null e o treino segue normalmente.
import prisma from '@/lib/prisma';
import { normalizeGenerated, normalizeSaved, diffPlans, summarizeEdits, Plan, Edit } from '@/lib/ai/genLearning';

export const EDIT_WINDOW_MS = 3 * 24 * 3600 * 1000;   // só conta como "correção da IA" o que o coach salva nos 3 dias seguintes à geração
export const KEEP_MS = 120 * 24 * 3600 * 1000;
const P = prisma as any;

/** Guarda a cópia do treino gerado; devolve o id (ou null). */
export async function recordGenerated(input: { coachId: string; studentId: string; engine?: string | null; exercisesByDay: Record<string, any[]>; workoutTabs?: string[] }): Promise<string | null> {
  try {
    if (!P.workoutGenSnapshot) return null;
    const generated = normalizeGenerated(input.exercisesByDay, input.workoutTabs);
    if (!Object.values(generated).some((l) => l.length)) return null;
    const row = await P.workoutGenSnapshot.create({ data: { coachId: input.coachId, studentId: input.studentId, engine: input.engine || null, generated } });
    P.workoutGenSnapshot.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } } }).catch(() => {});
    return row?.id || null;
  } catch (e) { return null; }
}

/** Liga a cópia ao treino criado a partir dela (treino automático). */
export async function linkSnapshotToWorkout(snapshotId: string | null | undefined, workoutId: string): Promise<void> {
  try { if (snapshotId && P.workoutGenSnapshot) await P.workoutGenSnapshot.update({ where: { id: snapshotId }, data: { workoutId } }); } catch (e) { /* sem registro */ }
}

/** Chamado quando o coach salva um treino: se veio da IA (nos últimos 3 dias), registra o que ele mudou. Devolve o resumo ou null. */
export async function recordCoachSave(input: { studentId: string; workoutId: string; rows: any[] }): Promise<ReturnType<typeof summarizeEdits> | null> {
  try {
    if (!P.workoutGenSnapshot || !Array.isArray(input.rows) || !input.rows.length) return null;
    const since = new Date(Date.now() - EDIT_WINDOW_MS);
    let snap = await P.workoutGenSnapshot.findFirst({ where: { workoutId: input.workoutId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
    if (!snap) snap = await P.workoutGenSnapshot.findFirst({ where: { studentId: input.studentId, workoutId: null, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
    if (!snap) return null;
    const generated = snap.generated as Plan;
    const known: Record<string, { n?: string; g?: string }> = {};
    Object.values(generated || {}).flat().forEach((x: any) => { known[x.id] = { n: x.n, g: x.g }; });
    const unknown = Array.from(new Set(input.rows.map((r) => String(r.exerciseId)).filter((id) => id && !known[id])));
    if (unknown.length) {
      const found = await P.exercise.findMany({ where: { id: { in: unknown } }, select: { id: true, name: true, subCategory: true, category: true } }).catch(() => []);
      for (const e of found || []) known[e.id] = { n: e.name, g: e.subCategory || e.category || '' };
    }
    const saved = normalizeSaved(input.rows, known);
    const edits: Edit[] = diffPlans(generated, saved);
    const summary = summarizeEdits(edits);
    await P.workoutGenSnapshot.update({ where: { id: snap.id }, data: { workoutId: input.workoutId, saved, edits, editCount: summary.total, savedAt: new Date() } });
    return summary;
  } catch (e) { return null; }
}
