// lib/workoutAdjust.ts
// 🛠️ (9 out 2026) O que acontece quando o coach SALVA uma ficha que já existia: (1) comparamos o antes e o depois para o app poder dizer ao aluno o que mudou
// (lib/workoutDiff.ts) e (2) os avisos "não tenho esse aparelho" cujo exercício saiu da ficha são dados como tratados. Tudo protegido: se algo falhar aqui, o
// SALVAR do treino continua funcionando exatamente como antes.
import prisma from '@/lib/prisma';
import { diffWorkout, type DiffRow, type WorkoutDiff } from '@/lib/workoutDiff';

export async function describeSave(before: DiffRow[], after: DiffRow[], db: any = prisma): Promise<WorkoutDiff | null> {
  try {
    const ids = [...new Set([...before, ...after].map((r) => String(r.exerciseId)))];
    const ex: any[] = ids.length ? await db.exercise.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, category: true } }) : [];
    const names: Record<string, string> = {}; const cardio = new Set<string>();
    ex.forEach((e) => { names[e.id] = e.name; if (String(e.category || '').toUpperCase() === 'CARDIO') cardio.add(e.id); });
    return diffWorkout(before, after, names, { cardio });
  } catch (e) { console.error('[workoutAdjust] comparação falhou:', (e as any)?.message || e); return null; }
}

export interface AutoResolved { id: string; exerciseName: string; taskKey: string; studentId: string }

/** Avisos de aparelho EM ABERTO desta ficha cujo exercício já não está nela: viram tratados e vão para "Resolvidas" do coach. */
export async function autoResolveEquipment(o: { userId: string; workoutId: string; keepExerciseIds: string[] }, db: any = prisma): Promise<AutoResolved[]> {
  try {
    const open: any[] = await db.equipmentReport.findMany({ where: { userId: o.userId, workoutId: o.workoutId, status: 'OPEN' }, select: { id: true, exerciseName: true, exerciseId: true, coachId: true, day: true } });
    const gone = open.filter((r) => !o.keepExerciseIds.includes(String(r.exerciseId)));
    if (!gone.length) return [];
    const student: any = await db.user.findUnique({ where: { id: o.userId }, select: { name: true, coachId: true } });
    const out: AutoResolved[] = [];
    for (const r of gone) {
      await db.equipmentReport.update({ where: { id: r.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolution: 'Exercício trocado na ficha' } });
      const taskKey = `aparelho:${r.id}`;
      const coachId = r.coachId || student?.coachId;
      if (coachId) {
        const data = { type: 'aparelho', title: `${String(student?.name || 'Aluno').split(/\s+/)[0]} não tem: ${r.exerciseName}`, subtitle: r.day ? `Treino ${r.day} · exercício trocado na ficha` : 'exercício trocado na ficha', personKind: 'student', personId: o.userId, personName: student?.name || null, note: 'Exercício trocado na ficha' };
        await db.agendaTaskResolved.upsert({ where: { coachId_taskKey: { coachId, taskKey } }, update: { ...data, resolvedAt: new Date() }, create: { coachId, taskKey, ...data } });
      }
      out.push({ id: r.id, exerciseName: r.exerciseName, taskKey, studentId: o.userId });
    }
    return out;
  } catch (e) { console.error('[workoutAdjust] aviso de aparelho:', (e as any)?.message || e); return []; }
}
