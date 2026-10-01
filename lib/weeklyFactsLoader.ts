// lib/weeklyFactsLoader.ts
// 📥 (1 out 2026) Lê do banco o que o aluno fez na semana avaliada e entrega pro computeFacts (lib/weeklyFacts.ts).
//
// Duas famílias de consulta:
//   - NÚCLEO (plano, treinos registrados): se falhar, o erro SOBE -- melhor não gerar fatos do que dizer "0 treinos" por causa de uma falha de banco.
//   - AUXILIARES (observações em tempo real, dieta, check-in, anamnese): se falharem, aquela parte simplesmente fica de fora.
// Recebe o `db` (Prisma) por parâmetro pra testar sem banco.
import { addDays, weekRange } from '@/lib/weeklyFeedback';
import { brtYmd, diffDays, computeFacts, type WeeklyFacts, type NoteIn, type SessionIn } from '@/lib/weeklyFacts';

const DAY_MS = 24 * 60 * 60 * 1000;
const isRestDay = (d: string) => d === 'OFF' || d.includes('DESCANSO');

/**
 * Fichas que o aluno enxergava na semana: mesma regra da tela de treino do app (não arquivada, dentro de startDate/endDate) e, entre as que
 * alternam por semana (alternateSlot), só a do slot daquela semana.
 */
export function activeWorkoutsForWeek<T extends { archived?: boolean | null; startDate?: Date | string | null; createdAt?: Date | string | null; endDate?: Date | string | null; alternateSlot?: number | null }>(workouts: T[], weekStart: string): T[] {
  const { start, end } = weekRange(weekStart);
  const active = workouts.filter((w) => {
    if (w.archived) return false;
    if (w.startDate && new Date(w.startDate).getTime() >= end.getTime()) return false;
    if (w.endDate && new Date(w.endDate).getTime() < start.getTime()) return false;
    return true;
  });
  const always = active.filter((w) => w.alternateSlot === null || w.alternateSlot === undefined);
  const alternating = active.filter((w) => w.alternateSlot !== null && w.alternateSlot !== undefined);
  if (!alternating.length) return always;
  const anchor = alternating.map((w) => brtYmd((w.startDate || w.createdAt || start) as Date)).sort()[0];
  const weekIndex = Math.floor(diffDays(anchor, addDays(weekStart, 3)) / 7);   // referência: quinta-feira da semana avaliada
  const slots = [...new Set(alternating.map((w) => w.alternateSlot as number))].sort((a, b) => a - b);
  const activeSlot = slots[((weekIndex % slots.length) + slots.length) % slots.length];
  return [...always, ...alternating.filter((w) => w.alternateSlot === activeSlot)];
}

export async function loadWeeklyFacts(db: any, student: { id: string; dietModule?: boolean | null }, weekStart: string, now: Date): Promise<WeeklyFacts> {
  const range = weekRange(weekStart);
  const endYmd = addDays(weekStart, 6);
  const aux = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

  // ── núcleo ──
  const [workouts, histories]: any[][] = await Promise.all([
    db.workout.findMany({
      where: { userId: student.id, archived: false },
      select: { id: true, startDate: true, createdAt: true, endDate: true, archived: true, alternateSlot: true, exercises: { select: { day: true, exerciseId: true } } },
    }),
    db.workoutHistory.findMany({
      where: { userId: student.id, date: { gte: range.start, lt: range.end } },
      orderBy: { date: 'asc' },
      select: {
        id: true, date: true, day: true, rpe: true, feedback: true, feedbackResolvedAt: true, coachReplyAt: true,
        details: { select: { exerciseId: true, exerciseName: true, note: true, resolvedAt: true, coachReplyAt: true } },
      },
    }),
  ]);

  // ── auxiliares ──
  const [alerts, lastCheckIn, userRow, anamnese, mealLogs, daily]: any[] = await Promise.all([
    aux(db.studentAlert.findMany({ where: { userId: student.id, type: 'EXERCISE_NOTE', createdAt: { gte: range.start, lt: range.end } }, select: { exerciseName: true, message: true, createdAt: true, isRead: true } }), []),
    aux(db.checkIn.findFirst({ where: { userId: student.id }, orderBy: { date: 'desc' }, select: { date: true } }), 'ERR'),
    aux(db.user.findUnique({ where: { id: student.id }, select: { nextCheckInDate: true, disableCheckIn: true, createdAt: true, dietModule: true } }), null),
    aux(db.anamnese.findFirst({ where: { userId: student.id }, orderBy: { createdAt: 'desc' }, select: { limitacoes: true, sleepQuality: true, frequencia: true, stressLevel: true, stressEating: true, nightBinge: true, pmsSymptoms: true, waterIntake: true } }), null),
    student.dietModule ? aux(db.dietMealLog.findMany({ where: { userId: student.id, date: { gte: weekStart, lte: endYmd } }, select: { date: true, status: true } }), null) : Promise.resolve(null),
    student.dietModule ? aux(db.dailyCheckin.findMany({ where: { studentId: student.id, date: { gte: weekStart, lte: endYmd } }, select: { date: true, dietAdherence: true, dietNote: true } }), null) : Promise.resolve(null),
  ]);

  const visible = activeWorkoutsForWeek(workouts, weekStart);
  const planDayExercises: Record<string, string[]> = {};
  visible.forEach((w: any) => (w.exercises || []).forEach((e: any) => {
    const day = String(e.day || '').trim().toUpperCase();
    if (!day || isRestDay(day)) return;
    (planDayExercises[day] ||= []).push(e.exerciseId);
  }));
  const planDays = Object.keys(planDayExercises).sort();

  // semana "parcial": o aluno entrou, ou a ficha atual começou, depois da segunda -- não dá pra cobrar o plano inteiro
  const withExercises = visible.filter((w: any) => (w.exercises || []).length);
  const planStart = withExercises.length ? Math.min(...withExercises.map((w: any) => new Date(w.startDate || w.createdAt || range.start).getTime())) : null;
  const createdAt = userRow?.createdAt ? new Date(userRow.createdAt).getTime() : null;
  const activeFrom = Math.max(createdAt ?? 0, planStart ?? 0);
  const partialWeek = activeFrom > range.start.getTime() + DAY_MS;

  const sessions: SessionIn[] = histories.map((h: any) => ({ id: h.id, date: h.date, day: h.day, rpe: h.rpe, exerciseIds: [...new Set<string>((h.details || []).map((d: any) => d.exerciseId))] }));

  const notes: NoteIn[] = [];
  histories.forEach((h: any) => {
    const seen = new Set<string>();
    (h.details || []).forEach((d: any) => {
      if (d.note && String(d.note).trim() && !seen.has(d.exerciseId)) {
        seen.add(d.exerciseId);
        notes.push({ kind: 'EXERCISE', exercise: d.exerciseName, text: d.note, date: h.date, handled: !!(d.resolvedAt || d.coachReplyAt) });
      }
    });
    if (h.feedback && String(h.feedback).trim()) notes.push({ kind: 'WORKOUT', text: h.feedback, date: h.date, handled: !!(h.feedbackResolvedAt || h.coachReplyAt) });
  });
  (alerts || []).forEach((a: any) => notes.push({ kind: 'EXERCISE', exercise: a.exerciseName, text: a.message, date: a.createdAt, handled: !!a.isRead }));

  return computeFacts({
    weekStart, now, planDays, planDayExercises, declaredFreq: anamnese?.frequencia ?? null, partialWeek, sessions, notes,
    checkin: userRow && lastCheckIn !== 'ERR' ? { disabled: !!userRow.disableCheckIn, nextCheckInDate: userRow.nextCheckInDate, hasAny: !!lastCheckIn, accountCreatedAt: userRow.createdAt } : null,
    diet: student.dietModule ? { enabled: true, mealLogs: mealLogs || [], daily: (daily || []).map((x: any) => ({ date: x.date, adherence: x.dietAdherence, note: x.dietNote })) } : null,
    limitations: anamnese?.limitacoes, sleepQuality: anamnese?.sleepQuality, anamnese,
  });
}
