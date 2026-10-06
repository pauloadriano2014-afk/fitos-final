// lib/agendaCron.ts
// ⏰ (6 out 2026) Avisos da agenda, chamados por app/api/cron/agenda (um Cron Job do Render a cada 5 minutos):
//   reminders -- lembrete antes do compromisso: ao coach (X min antes, qualquer hora) e ao aluno COM app (nunca de madrugada ou à noite)
//   summary   -- resumo do dia ao coach (padrão 07h de Brasília): quantos compromissos e quantas pendências
//   workouts  -- (7 out 2026) lembrete ao aluno que INICIOU o treino e esqueceu de finalizar (lib/workoutSessions.ts); mesmo cron, sem agendamento novo
// Cada aviso é "reservado" no banco ANTES de enviar (updateMany com o campo ainda vazio): duas execuções ao mesmo tempo nunca mandam o mesmo aviso duas vezes.
// `db` e `sendToUser` entram por parâmetro para testar sem rede.
import {
  ATENDIMENTO_KINDS, coachReminderAt, coachReminderText, studentReminderAt, studentReminderText, summaryText, isQuietNow, dateKeyBrt, minutesOfDayBrt, startOfDayBrt, endOfDayBrt,
} from '@/lib/agenda';
import { DEFAULT_SETTINGS, loadPersons, personOf, ensureAllSeries, Db } from '@/lib/agendaStore';
import { buildHoje } from '@/lib/agendaHoje';
import { runWorkoutReminders } from '@/lib/workoutSessions';

export type CronDeps = { db: Db; sendToUser: (user: any, title: string, body: string, data?: any) => Promise<any>; now?: Date };

export async function runAgendaReminders(deps: CronDeps) {
  const { db } = deps, now = deps.now || new Date();
  await ensureAllSeries(db, now, 3);
  const rows: any[] = await db.agendaEvent.findMany({
    where: { status: 'SCHEDULED', startsAt: { gt: now, lte: new Date(now.getTime() + 48 * 3600000) }, OR: [{ coachRemindedAt: null }, { studentRemindedAt: null }] },
    orderBy: { startsAt: 'asc' }, take: 500,
  });
  const out = { checked: rows.length, coach: 0, student: 0 };
  if (!rows.length) return out;
  const coachIds = [...new Set(rows.map((r) => r.coachId))];
  const sets: any[] = await db.agendaSettings.findMany({ where: { coachId: { in: coachIds } } });
  const setOf = (id: string) => ({ ...DEFAULT_SETTINGS, ...(sets.find((s) => s.coachId === id) || {}) });
  const persons = await loadPersons(db, rows);
  const studentIds = [...new Set(rows.filter((r) => r.studentId && ATENDIMENTO_KINDS.includes(r.kind)).map((r) => r.studentId))];
  const userRows: any[] = await db.user.findMany({ where: { id: { in: [...coachIds, ...studentIds] } }, select: { id: true, name: true, pushToken: true } });
  const userOf = new Map(userRows.map((u) => [u.id, u]));

  for (const ev of rows) {
    const st = setOf(ev.coachId), startsAt = new Date(ev.startsAt), endsAt = new Date(ev.endsAt);
    const personName = personOf(persons, ev)?.name || null;

    if (!ev.coachRemindedAt && ev.notifyCoach !== false && ev.kind !== 'BLOQUEIO' && st.remindCoachMin > 0 && now >= coachReminderAt(startsAt, st.remindCoachMin)) {
      const claim = await db.agendaEvent.updateMany({ where: { id: ev.id, coachRemindedAt: null }, data: { coachRemindedAt: now } });
      const coach = userOf.get(ev.coachId);
      if (claim.count === 1 && coach) {
        const t = coachReminderText({ kind: ev.kind, title: ev.title, startsAt, endsAt, location: ev.location }, personName, now);
        await deps.sendToUser(coach, t.title, t.body, { type: 'agenda_event', eventId: ev.id });
        out.coach++;
      }
    }

    if (!ev.studentRemindedAt && ev.notifyStudent !== false && ev.studentId && ATENDIMENTO_KINDS.includes(ev.kind) && st.remindStudentMin > 0 && now >= studentReminderAt(startsAt, st.remindStudentMin) && !isQuietNow(now)) {
      const claim = await db.agendaEvent.updateMany({ where: { id: ev.id, studentRemindedAt: null }, data: { studentRemindedAt: now } });
      const student = userOf.get(ev.studentId);
      if (claim.count === 1 && student) {
        const t = studentReminderText({ kind: ev.kind, startsAt }, userOf.get(ev.coachId)?.name || null, now);
        await deps.sendToUser(student, t.title, t.body, { type: 'agenda_event_student', eventId: ev.id });
        out.student++;
      }
    }
  }
  return out;
}

export async function runAgendaSummary(deps: CronDeps) {
  const { db } = deps, now = deps.now || new Date();
  const todayKey = dateKeyBrt(now), nowMin = minutesOfDayBrt(now);
  const out = { coaches: 0, sent: 0, skipped: 0 };
  // só quem já usa a agenda: tem série ativa, compromisso hoje ou ajustes salvos
  const [series, todays, sets]: any[][] = await Promise.all([
    db.agendaSeries.findMany({ where: { active: true }, select: { coachId: true } }),
    db.agendaEvent.findMany({ where: { startsAt: { gte: startOfDayBrt(todayKey), lt: endOfDayBrt(todayKey) } }, select: { coachId: true } }),
    db.agendaSettings.findMany({}),
  ]);
  const coachIds = [...new Set([...series, ...todays, ...sets].map((r: any) => r.coachId))] as string[];
  out.coaches = coachIds.length;
  for (const coachId of coachIds) {
    const st: any = { ...DEFAULT_SETTINGS, ...(sets.find((s: any) => s.coachId === coachId) || {}) };
    // chegou a hora do resumo (e ainda é de manhã): fora disso espera a próxima execução
    if (!st.dailySummary || nowMin < st.summaryHour * 60 || nowMin >= 12 * 60 || st.summarySentOn === todayKey) { out.skipped++; continue; }
    await db.agendaSettings.upsert({ where: { coachId }, update: {}, create: { coachId } });
    const claim = await db.agendaSettings.updateMany({ where: { coachId, OR: [{ summarySentOn: null }, { summarySentOn: { not: todayKey } }] }, data: { summarySentOn: todayKey } });
    if (claim.count !== 1) { out.skipped++; continue; }
    try {
      const hoje = await buildHoje(db, coachId, now);
      const events = hoje.agenda.filter((e: any) => e.status === 'SCHEDULED' || e.status === 'DONE');
      if (!events.length && !hoje.counts.late && !hoje.counts.today) { out.skipped++; continue; }
      const coach = await db.user.findUnique({ where: { id: coachId }, select: { id: true, pushToken: true } });
      if (!coach) { out.skipped++; continue; }
      const t = summaryText({ events, late: hoje.counts.late, today: hoje.counts.today });
      await deps.sendToUser(coach, t.title, t.body, { type: 'agenda_summary' });
      out.sent++;
    } catch (e: any) { console.error('[agendaCron] resumo de', coachId, 'falhou:', e?.message || e); }
  }
  return out;
}

export async function runAgendaCron(task: string, deps: CronDeps) {
  const res: any = {};
  if (task === 'reminders' || task === 'all') res.reminders = await runAgendaReminders(deps);
  if (task === 'summary' || task === 'all') res.summary = await runAgendaSummary(deps);
  // cada parte roda separada: se a tabela de sessões ainda não existir (db push pendente), a agenda continua funcionando
  if (task === 'workouts' || task === 'all') {
    try { res.workouts = await runWorkoutReminders(deps); }
    catch (e: any) { res.workouts = { error: String(e?.message || e).slice(0, 120) }; console.error('[agendaCron] lembrete de treino falhou:', e?.message || e); }
  }
  return res;
}
