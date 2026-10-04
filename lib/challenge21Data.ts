// lib/challenge21Data.ts
// 🔥 (3 out 2026) Parte do desafio de 21 dias que fala com o banco: junta o que o aluno marcou à mão (ChallengeCheckin) com o que o app já registrou
// sozinho (WorkoutHistory, DailyCheckin) e entrega o resumo pronto (lib/challenge21.ts faz a conta). Recebe o `db` (prisma) por parâmetro para testar.
import {
  CHALLENGE_DAYS, addDays, brtDate, brtDayRange, challengeStartDate, summarize, waterTargetMl, weekPattern, type ChallengeSummary, type DayAuto, type PatternDay,
} from '@/lib/challenge21';

export type LoadResult =
  | { enabled: false; reason: 'PLANO' }
  | { enabled: true; state: 'PREPARING' }
  | { enabled: true; state: 'WAITING' | 'ACTIVE' | 'FINISHED'; summary: ChallengeSummary; waterMl: number };

export const isMissingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /ChallengeCheckin/i.test(String(e?.message || '')) && /does not exist/i.test(String(e?.message || ''));

const isCardioEx = (e: any) => String(e?.category || '').toUpperCase() === 'CARDIO' || String(e?.tags?.target || '').toUpperCase() === 'CARDIO';

/** A semana do aluno a partir das abas do treino dele: abas de musculação (têm algo além de cardio) e abas só de cardio. Sem treino de verdade, undefined. */
export async function loadPattern(db: any, workoutId: string | null | undefined): Promise<PatternDay[] | undefined> {
  if (!workoutId) return undefined;
  const rows: any[] = await db.workoutExercise.findMany({ where: { workoutId }, orderBy: { order: 'asc' }, select: { day: true, exerciseId: true, order: true } });
  if (!rows || !rows.length) return undefined;
  const exs: any[] = await db.exercise.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.exerciseId))] } }, select: { id: true, category: true, tags: true } });
  const cardio = new Map(exs.map((e) => [e.id, isCardioEx(e)]));
  const tabs = new Map<string, boolean>();   // aba -> tem exercício que não é cardio?
  for (const r of rows) { const tab = String(r.day || 'A').trim(); tabs.set(tab, (tabs.get(tab) || false) || !cardio.get(r.exerciseId)); }
  const strength = [...tabs].filter(([, s]) => s).map(([t]) => t), cardioOnly = [...tabs].filter(([, s]) => !s).map(([t]) => t);
  return strength.length ? weekPattern(strength, cardioOnly) : undefined;
}

export async function loadChallenge(db: any, userId: string, now: Date = new Date()): Promise<LoadResult> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, plan: true } });
  if (!user || user.plan !== 'CHALLENGE_21') return { enabled: false, reason: 'PLANO' };

  const workouts = await db.workout.findMany({
    where: { userId, archived: false },
    select: { id: true, name: true, startDate: true, createdAt: true, archived: true, _count: { select: { exercises: true } } },
  });
  const startDate = challengeStartDate((workouts || []).map((w: any) => ({ ...w, exerciseCount: w._count?.exercises })));
  if (!startDate) return { enabled: true, state: 'PREPARING' };

  // a semana (treino / cardio / descanso) vem das abas do treino mais recente de verdade
  const real = (workouts || []).filter((w: any) => !/CONSTRU[ÇC][ÃA]O/i.test(String(w.name || '')) && (w._count?.exercises ?? 1) > 0).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const pattern = await loadPattern(db, real[0]?.id);
  const anamnese = await db.anamnese.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { peso: true, frequencia: true } });
  const waterMl = waterTargetMl(anamnese?.peso);
  const today = brtDate(now);

  const dates = Array.from({ length: CHALLENGE_DAYS }, (_, i) => addDays(startDate, i));
  const [from] = brtDayRange(dates[0]);
  const [, to] = brtDayRange(dates[dates.length - 1]);
  const [checks, dailies, history] = await Promise.all([
    db.challengeCheckin.findMany({ where: { userId, date: { in: dates } } }),
    db.dailyCheckin.findMany({ where: { studentId: userId, date: { in: dates } }, select: { date: true, water_ml: true, dietAdherence: true } }),
    db.workoutHistory.findMany({ where: { userId, date: { gte: from, lt: to } }, select: { date: true } }),
  ]);

  const manualByDate: Record<string, string[]> = {};
  for (const c of checks || []) manualByDate[c.date] = Array.isArray(c.done) ? c.done : [];
  const autoByDate: Record<string, DayAuto> = {};
  for (const d of dailies || []) autoByDate[d.date] = { ...(autoByDate[d.date] || {}), waterMl: Number(d.water_ml) || 0, dietAdherence: d.dietAdherence ?? null };
  for (const h of history || []) { const day = brtDate(new Date(h.date)); autoByDate[day] = { ...(autoByDate[day] || {}), workout: true }; }

  const weeklyWorkouts = pattern ? pattern.filter((p) => p.type !== 'DESCANSO').length * 7 / pattern.length : anamnese?.frequencia ?? undefined;
  const summary = summarize({ startDate, today, profile: { waterMl }, manualByDate, autoByDate, weeklyWorkouts: weeklyWorkouts === undefined ? undefined : Math.round(weeklyWorkouts), pattern });
  return { enabled: true, state: summary.state, summary, waterMl };
}
