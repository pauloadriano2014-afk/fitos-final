// lib/weeklyCron.ts
// ⏰ (1 out 2026) Tarefas agendadas do feedback da semana (chamadas por app/api/cron/weekly-feedback, que um Cron Job do Render aciona):
//   students -- segunda de manhã: MONTA as perguntas de cada aluno (dados reais da semana + IA) e manda o push pra quem ainda não respondeu
//   reminder -- lembrete (ex.: quarta à noite) só pra quem continua sem responder
//   coaches  -- resumo pro coach (ex.: terça de manhã): quantos responderam, com alerta, aguardando a resposta dele
// Recebem `db` e `send` (sendPushToUser/sendPushToUsers) por parâmetro pra testar sem rede.
import { evaluatedWeekStart, isDueStudentForWeek, needsAttention } from '@/lib/weeklyFeedback';

export type PrepareReport = { total: number; ready: number; ai: number; rules: number; skipped: number };

export type CronDeps = {
  db: any;
  sendToUsers: (users: any[], title: string, body: string, data?: any) => Promise<any>;
  sendToUser: (user: any, title: string, body: string, data?: any) => Promise<any>;
  /** monta (e guarda) as perguntas da semana dos alunos pendentes antes do push; quem não der tempo é montado na 1ª abertura do card */
  prepareQuestions?: (students: any[], weekStart: string, now: Date) => Promise<PrepareReport>;
  now?: Date;
};

/**
 * Monta o conjunto de perguntas de cada aluno, algumas por vez, dentro de um orçamento de tempo (o resto fica pra 1ª abertura do card).
 * `ensure` é injetável pra testar sem banco nem IA.
 */
export async function prepareQuestionSets(
  students: any[], weekStart: string, now: Date,
  o: { ensure: (student: any) => Promise<{ source: 'AI' | 'RULES' }>; budgetMs?: number; concurrency?: number },
): Promise<PrepareReport> {
  const deadline = Date.now() + (o.budgetMs ?? 50_000);
  const queue = [...students];
  const report: PrepareReport = { total: students.length, ready: 0, ai: 0, rules: 0, skipped: 0 };
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      if (Date.now() > deadline) { report.skipped++; continue; }
      try {
        const set = await o.ensure(s);
        report.ready++;
        if (set.source === 'AI') report.ai++; else report.rules++;
      } catch (e: any) {
        report.skipped++;
        console.warn('[weeklyCron] não montou as perguntas de', s?.id, e?.message || e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 4) }, worker));
  return report;
}

const TEXT = {
  students: { title: '💜 Feedback da semana', body: 'Leva 1 minuto: conta pra gente como foi sua semana de treino.' },
  reminder: { title: '⏰ Ainda dá tempo do feedback da semana', body: 'Seu coach quer saber como foi sua semana. Leva 1 minuto.' },
};

async function dueStudents(db: any, weekStart: string) {
  const users: any[] = await db.user.findMany({
    where: { role: 'USER', coachId: { not: null } },
    select: { id: true, name: true, coachId: true, pushToken: true, createdAt: true, active: true, accountStatus: true, role: true, dietModule: true },
  });
  return users.filter((u) => isDueStudentForWeek(u, weekStart));
}

/**
 * task "auto": UM único agendamento diário resolve pelo dia da semana (Brasília): segunda = students, terça = coaches, quarta = reminder,
 * nos outros dias não faz nada. Assim basta UM Cron Job no Render (rodando todo dia de manhã) em vez de três.
 */
export function autoTaskFor(now: Date): 'students' | 'coaches' | 'reminder' | null {
  const dow = new Date(now.getTime() - 3 * 60 * 60 * 1000).getUTCDay();   // 0 = domingo
  return dow === 1 ? 'students' : dow === 2 ? 'coaches' : dow === 3 ? 'reminder' : null;
}

export async function runWeeklyTask(task: string, deps: CronDeps): Promise<any> {
  const { db } = deps;
  const now = deps.now || new Date();
  if (task === 'auto') {
    const picked = autoTaskFor(now);
    if (!picked) return { task: 'auto', skipped: true, reason: 'hoje não tem tarefa (só segunda, terça e quarta)' };
    return { auto: true, ...(await runWeeklyTask(picked, deps)) };
  }
  const weekStart = evaluatedWeekStart(now);
  const due = await dueStudents(db, weekStart);
  const feedbacks: any[] = due.length ? await db.weeklyFeedback.findMany({ where: { userId: { in: due.map((u) => u.id) }, weekStart }, select: { userId: true, flags: true, coachSeenAt: true, coachReplyAt: true } }) : [];
  const answeredIds = new Set(feedbacks.map((f) => f.userId));

  if (task === 'students' || task === 'reminder') {
    const pending = due.filter((u) => !answeredIds.has(u.id));
    const t = TEXT[task];
    // segunda: as perguntas já ficam prontas (com IA) antes do aluno abrir o card
    let prepared: PrepareReport | undefined;
    if (task === 'students' && pending.length && deps.prepareQuestions) {
      try { prepared = await deps.prepareQuestions(pending, weekStart, now); }
      catch (e: any) { console.warn('[weeklyCron] falhou ao montar as perguntas; o push sai mesmo assim:', e?.message || e); }   // o aluno monta na 1ª abertura do card
    }
    if (pending.length) await deps.sendToUsers(pending, t.title, t.body, { type: 'weekly_feedback_due' });
    return { task, weekStart, students: due.length, notified: pending.length, ...(prepared ? { prepared } : {}) };
  }

  if (task === 'coaches') {
    const byCoach = new Map<string, any[]>();
    due.forEach((u) => byCoach.set(u.coachId, [...(byCoach.get(u.coachId) || []), u]));
    const coaches: any[] = byCoach.size ? await db.user.findMany({ where: { id: { in: [...byCoach.keys()] } }, select: { id: true, pushToken: true } }) : [];
    const fbBy = new Map<string, any>(feedbacks.map((f) => [f.userId, f]));
    let sent = 0;
    for (const c of coaches) {
      const mine = byCoach.get(c.id) || [];
      const fbs = mine.map((u) => fbBy.get(u.id)).filter(Boolean);
      const answered = fbs.length;
      const attention = fbs.filter((f) => needsAttention(f.flags)).length;
      const awaiting = fbs.filter((f) => !f.coachSeenAt && !f.coachReplyAt).length;
      const pending = mine.length - answered;
      const body = `${answered} de ${mine.length} responderam` + (attention ? ` · ${attention} com alerta` : '') + (awaiting ? ` · ${awaiting} aguardando sua resposta` : '') + (pending ? ` · ${pending} sem retorno (cobre no painel)` : '');
      await deps.sendToUser(c, '📋 Feedback da semana dos seus alunos', body, { type: 'weekly_digest' });
      sent++;
    }
    return { task, weekStart, coaches: sent, students: due.length };
  }

  throw new Error('task inválida');
}
