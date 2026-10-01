// lib/weeklyBoard.ts
// 📋 (1 out 2026) Painel "FEEDBACK DA SEMANA" do coach: quem respondeu, quem não, quem tem alerta, o que o coach ainda não respondeu e
// uma "auto-avaliação" do próprio coach (respondeu quantos? cobrou quantos? falou com quantos?). Só leitura; recebe o `db` (Prisma) pra testar.
import { MASTER_IDS } from '@/lib/masterIds';
import { answersView, isDueStudentForWeek, needsAttention, weekLabel, weekRange, addDays, evaluatedWeekStart } from '@/lib/weeklyFeedback';
import { brtYmd, describeFacts, type FactLine, type WeeklyFacts } from '@/lib/weeklyFacts';

const DAY_MS = 24 * 60 * 60 * 1000;
export const NUDGE_TYPE = 'WEEKLY_NUDGE';
export const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type BoardRow = {
  studentId: string; name: string; photoUrl: string | null; coachId: string | null;
  answered: boolean; feedbackId: string | null; answeredAt: string | null; score: number | null; flags: string[]; attention: boolean;
  view: ReturnType<typeof answersView>;
  coachSeenAt: string | null; coachReply: string | null; coachReplyAt: string | null; awaitingReply: boolean;
  workoutsDone: number; plannedPerWeek: number | null; daysSinceContact: number | null; openNotes: number; nudgedAt: string | null;
  /** "Dados da semana" (treinos x plano, observações, dieta, check-in) prontos pro coach ler; vazio se ainda não foram levantados */
  factsView: FactLine[]; questionSource: 'AI' | 'RULES' | null;
  /** de onde veio a resposta: o aluno no app, ou o coach transcrevendo o que ele mandou no WhatsApp (com a mensagem original) */
  channel: 'APP' | 'WHATSAPP'; sourceText: string | null;
};

const pct = (num: number, den: number) => (den > 0 ? Math.round((100 * num) / den) : null);
const iso = (d: any) => (d ? new Date(d).toISOString() : null);

export async function loadWeeklyBoard(db: any, o: { adminId: string; weekStart: string; now?: Date }) {
  const now = o.now || new Date();
  const { weekStart } = o;
  const isMaster = MASTER_IDS.includes(o.adminId);
  const range = weekRange(weekStart);
  // os "nudges" (cobranças) acontecem na semana SEGUINTE à avaliada, que é quando o aluno é cobrado
  const nudgeFrom = range.end, nudgeTo = new Date(range.end.getTime() + 7 * DAY_MS);

  const users: any[] = await db.user.findMany({
    where: { role: 'USER', ...(isMaster ? { coachId: { in: MASTER_IDS } } : { coachId: o.adminId }) },
    select: { id: true, name: true, photoUrl: true, coachId: true, createdAt: true, active: true, accountStatus: true, lastContactDate: true },
  });
  const students = users.filter((u) => isDueStudentForWeek(u, weekStart));
  const ids = students.map((u) => u.id);

  const empty = { weekStart, weekLabel: weekLabel(weekStart), prevWeek: addDays(weekStart, -7), nextWeek: weekStart < evaluatedWeekStart(now) ? addDays(weekStart, 7) : null };
  if (ids.length === 0) return { ...empty, rows: [] as BoardRow[], totals: { students: 0, answered: 0, pending: 0, attention: 0, awaitingReply: 0, nudged: 0, contacted7d: 0 }, coach: { repliedPct: null, nudgedPct: null, contactedPct: null } };

  const [feedbacks, histories, anamneses, notes, nudges, sets]: any[][] = await Promise.all([
    db.weeklyFeedback.findMany({
      where: { userId: { in: ids }, weekStart },
      select: { id: true, userId: true, questions: true, answers: true, score: true, flags: true, facts: true, channel: true, sourceText: true, coachSeenAt: true, coachReply: true, coachReplyAt: true, createdAt: true },
    }),
    db.workoutHistory.findMany({ where: { userId: { in: ids }, date: { gte: range.start, lt: range.end } }, select: { id: true, userId: true, day: true, date: true } }),
    db.anamnese.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { userId: true, frequencia: true } }).catch(() => []),
    db.studentAlert.findMany({ where: { userId: { in: ids }, type: 'EXERCISE_NOTE', isRead: false }, select: { userId: true } }).catch(() => []),
    db.studentAlert.findMany({ where: { userId: { in: ids }, type: NUDGE_TYPE, createdAt: { gte: nudgeFrom, lt: nudgeTo } }, orderBy: { createdAt: 'desc' }, select: { userId: true, createdAt: true } }).catch(() => []),
    db.weeklyQuestionSet.findMany({ where: { userId: { in: ids }, weekStart }, select: { userId: true, facts: true, source: true } }).catch(() => []),
  ]);

  const fbBy = new Map<string, any>(feedbacks.map((f) => [f.userId, f]));
  // o mesmo treino (mesma letra, mesmo dia) finalizado mais de uma vez conta UMA vez (duplicatas antigas de toques repetidos no "finalizar")
  const doneBy = new Map<string, number>(); const seenDone = new Set<string>();
  histories.forEach((h, i) => {
    const key = h.day && h.date ? `${h.userId}|${brtYmd(h.date)}|${h.day}` : `${h.userId}|id|${h.id ?? i}`;
    if (seenDone.has(key)) return;
    seenDone.add(key); doneBy.set(h.userId, (doneBy.get(h.userId) || 0) + 1);
  });
  const freqBy = new Map<string, number>(); anamneses.forEach((a) => { if (!freqBy.has(a.userId) && Number(a.frequencia) > 0) freqBy.set(a.userId, Number(a.frequencia)); });
  const notesBy = new Map<string, number>(); notes.forEach((a) => notesBy.set(a.userId, (notesBy.get(a.userId) || 0) + 1));
  const setBy = new Map<string, any>(sets.map((x) => [x.userId, x]));
  const nudgeBy = new Map<string, any>(); nudges.forEach((n) => { if (!nudgeBy.has(n.userId)) nudgeBy.set(n.userId, n.createdAt); });

  const rows: BoardRow[] = students.map((u) => {
    const f = fbBy.get(u.id);
    const flags: string[] = f?.flags || [];
    const answered = !!f;
    const contact = u.lastContactDate ? Math.floor((now.getTime() - new Date(u.lastContactDate).getTime()) / DAY_MS) : null;
    const qset = setBy.get(u.id);
    const facts: WeeklyFacts | null = (f?.facts as WeeklyFacts) || (qset?.facts as WeeklyFacts) || null;   // o que o aluno respondeu "congela" os fatos daquele momento
    return {
      studentId: u.id, name: u.name || 'Aluno', photoUrl: u.photoUrl || null, coachId: u.coachId || null,
      answered, feedbackId: f?.id || null, answeredAt: iso(f?.createdAt), score: f?.score ?? null, flags, attention: answered && needsAttention(flags),
      view: answered ? answersView(f.questions, f.answers) : [],
      coachSeenAt: iso(f?.coachSeenAt), coachReply: f?.coachReply || null, coachReplyAt: iso(f?.coachReplyAt),
      awaitingReply: answered && !f.coachSeenAt && !f.coachReplyAt,
      workoutsDone: facts ? facts.training.done : doneBy.get(u.id) || 0,
      plannedPerWeek: facts ? facts.training.planned ?? null : freqBy.get(u.id) ?? null,
      daysSinceContact: contact, openNotes: notesBy.get(u.id) || 0, nudgedAt: iso(nudgeBy.get(u.id)),
      factsView: describeFacts(facts), questionSource: qset ? (qset.source === 'AI' ? 'AI' : 'RULES') : null,
      channel: f?.channel === 'WHATSAPP' ? 'WHATSAPP' : 'APP', sourceText: f?.channel === 'WHATSAPP' ? f.sourceText || null : null,
    };
  });

  // quem precisa de você primeiro: respondeu com alerta e aguarda resposta > respondeu e aguarda > não respondeu > já tratado
  const rank = (r: BoardRow) => (r.awaitingReply && r.attention ? 0 : r.awaitingReply ? 1 : !r.answered ? 2 : r.attention ? 3 : 4);
  rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR'));

  const answered = rows.filter((r) => r.answered).length;
  const pending = rows.length - answered;
  const awaitingReply = rows.filter((r) => r.awaitingReply).length;
  const nudged = rows.filter((r) => !r.answered && r.nudgedAt).length;
  const contacted7d = rows.filter((r) => r.daysSinceContact !== null && r.daysSinceContact < 7).length;
  return {
    ...empty,
    rows,
    totals: { students: rows.length, answered, pending, attention: rows.filter((r) => r.attention).length, awaitingReply, nudged, contacted7d },
    // auto-avaliação do coach, calculada do que ele fez (não é nota dada por ninguém)
    coach: { repliedPct: pct(answered - awaitingReply, answered), nudgedPct: pct(nudged, pending), contactedPct: pct(contacted7d, rows.length) },
  };
}
