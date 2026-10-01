// lib/dashboardFeed.ts
// 💬 (1 out 2026) Feed de atividades do coach (aba FEED do painel): além de "Fulano concluiu TREINO", mostra
//   - o texto que o aluno escreveu ao finalizar o treino (WorkoutHistory.feedback, já vem no log) e as observações que ele deixou
//     em exercícios (ExerciseHistory.note) -- tocar leva ao prontuário (aba TREINOS) já no treino/exercício certo;
//   - as observações enviadas na hora, durante o treino (StudentAlert EXERCISE_NOTE, ainda não resolvidas) -- tocar abre o exercício.
// Aqui ficam só as duas peças puras/de leitura que a rota /api/admin/data usa.

export type NoteDetail = { id: string; exerciseName: string; note: string | null };
export type ExerciseNote = { id: string; exerciseName: string; note: string };

/** A observação é gravada repetida em cada série do exercício: fica uma por exercício (a primeira), no máximo `max`. */
export function uniqueExerciseNotes(details: NoteDetail[] | null | undefined, max = 5): ExerciseNote[] {
  const seen = new Set<string>();
  const out: ExerciseNote[] = [];
  for (const d of details || []) {
    const note = (d?.note || '').trim();
    if (!note) continue;
    const key = String(d.exerciseName || '').trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: d.id, exerciseName: d.exerciseName, note: note.slice(0, 300) });
    if (out.length >= max) break;
  }
  return out;
}

/** Tira os `details` do log (pesado: uma linha por série) e deixa só as observações, uma por exercício. */
export function withExerciseNotes<T extends { details?: NoteDetail[] }>(log: T): Omit<T, 'details'> & { exerciseNotes: ExerciseNote[] } {
  const { details, ...rest } = log;
  return { ...rest, exerciseNotes: uniqueExerciseNotes(details) };
}

/** Observações de exercício enviadas na hora e ainda não resolvidas, dos alunos deste coach (mesma "muralha" dos logs). */
export async function loadRecentExerciseNotes(db: any, userWhere: any, take = 30) {
  try {
    return await db.studentAlert.findMany({
      where: { type: 'EXERCISE_NOTE', isRead: false, user: userWhere },
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { id: true, name: true, photoUrl: true, coachId: true } } },
    });
  } catch (e: any) {
    console.error('[dashboardFeed] observações recentes indisponíveis:', e?.message || e);
    return [];
  }
}

/**
 * 💜 Feedbacks da semana que os alunos responderam nos últimos 14 dias e o coach ainda não viu: entram no FEED ao lado dos treinos.
 * `excerpt` = o que mais importa ler de relance (a dor/dificuldade contada, ou o pedido de ajuste). Falha (tabela ainda não criada) = lista vazia.
 */
export async function loadRecentWeeklyFeedbacks(db: any, userWhere: any, now: Date = new Date(), take = 15) {
  try {
    const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const rows = await db.weeklyFeedback.findMany({
      where: { createdAt: { gte: since }, coachSeenAt: null, user: userWhere },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, userId: true, weekStart: true, createdAt: true, score: true, flags: true, answers: true, user: { select: { id: true, name: true, photoUrl: true, coachId: true } } },
    });
    return rows.map((r: any) => {
      const a = (r.answers && typeof r.answers === 'object' ? r.answers : {}) as Record<string, any>;
      const pick = [a.difficulty_text, a.limitation_text, a.protocol].find((t) => typeof t === 'string' && t.trim());
      const { answers, ...rest } = r;
      return { ...rest, excerpt: pick ? String(pick).trim().slice(0, 140) : null };
    });
  } catch (e: any) {
    if (!/does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''))) console.error('[dashboardFeed] feedbacks da semana indisponíveis:', e?.message || e);
    return [];
  }
}
