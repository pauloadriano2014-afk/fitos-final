// lib/challengeCron.ts
// 🔥 (3 out 2026) Lembrete diário do desafio de 21 dias: "Dia X de 21 · desafio de hoje: ...". Roda junto com o agendamento diário que já existe do
// feedback da semana (app/api/cron/weekly-feedback?task=auto), então não precisa de Cron Job novo. Também dá pra chamar sozinho com ?task=challenge.
// Recebe `db` e `sendToUser` por parâmetro para testar sem banco nem rede.
import { brtDate, challengeStartDate, dayIndexOf, reminderText } from '@/lib/challenge21';

export type ChallengeCronDeps = {
  db: any;
  sendToUser: (user: any, title: string, body: string, data?: any) => Promise<any>;
  now?: Date;
};
export type ChallengeCronReport = { candidates: number; sent: number; skipped: number; errors: number };

export async function runChallengeMorning({ db, sendToUser, now = new Date() }: ChallengeCronDeps): Promise<ChallengeCronReport> {
  const report: ChallengeCronReport = { candidates: 0, sent: 0, skipped: 0, errors: 0 };
  const students: any[] = await db.user.findMany({ where: { plan: 'CHALLENGE_21', role: 'USER', active: true }, select: { id: true, pushToken: true }, take: 2000 });
  report.candidates = students.length;
  if (!students.length) return report;

  const workouts: any[] = await db.workout.findMany({
    where: { userId: { in: students.map((s) => s.id) }, archived: false },
    select: { userId: true, name: true, startDate: true, createdAt: true, archived: true, _count: { select: { exercises: true } } },
  });
  const byUser = new Map<string, any[]>();
  for (const w of workouts) { if (!byUser.has(w.userId)) byUser.set(w.userId, []); byUser.get(w.userId)!.push({ ...w, exerciseCount: w._count?.exercises }); }

  const today = brtDate(now);
  for (const s of students) {
    const start = challengeStartDate(byUser.get(s.id) || []);
    const msg = start ? reminderText(dayIndexOf(start, today), 'morning') : null;
    if (!msg) { report.skipped++; continue; }
    try { await sendToUser(s, msg.title, msg.body, { type: 'challenge_daily' }); report.sent++; }
    catch (e: any) { report.errors++; console.warn('[challengeCron] push falhou para', s.id, e?.message || e); }
  }
  return report;
}
