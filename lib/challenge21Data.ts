// lib/challenge21Data.ts
// 🔥 (3 out 2026) Parte do desafio de 21 dias que fala com o banco: junta o que o aluno marcou à mão (ChallengeCheckin) com o que o app já registrou
// sozinho (WorkoutHistory, DailyCheckin) e entrega o resumo pronto (lib/challenge21.ts faz a conta). Recebe o `db` (prisma) por parâmetro para testar.
import {
  CHALLENGE_DAYS, addDays, brtDate, brtDayRange, challengeStartDate, summarize, waterTargetMl, type ChallengeSummary, type DayAuto,
} from '@/lib/challenge21';

export type LoadResult =
  | { enabled: false; reason: 'PLANO' }
  | { enabled: true; state: 'PREPARING' }
  | { enabled: true; state: 'WAITING' | 'ACTIVE' | 'FINISHED'; summary: ChallengeSummary; waterMl: number };

export const isMissingTable = (e: any) => e?.code === 'P2021' || e?.code === 'P2022' || /ChallengeCheckin/i.test(String(e?.message || '')) && /does not exist/i.test(String(e?.message || ''));

export async function loadChallenge(db: any, userId: string, now: Date = new Date()): Promise<LoadResult> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, plan: true } });
  if (!user || user.plan !== 'CHALLENGE_21') return { enabled: false, reason: 'PLANO' };

  const workouts = await db.workout.findMany({
    where: { userId, archived: false },
    select: { name: true, startDate: true, createdAt: true, archived: true, _count: { select: { exercises: true } } },
  });
  const startDate = challengeStartDate((workouts || []).map((w: any) => ({ ...w, exerciseCount: w._count?.exercises })));
  if (!startDate) return { enabled: true, state: 'PREPARING' };

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

  const summary = summarize({ startDate, today, profile: { waterMl }, manualByDate, autoByDate, weeklyWorkouts: anamnese?.frequencia ?? undefined });
  return { enabled: true, state: summary.state, summary, waterMl };
}
