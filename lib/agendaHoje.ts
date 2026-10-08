// lib/agendaHoje.ts
// ☀️ (6 out 2026) Central HOJE do coach: a agenda do dia + as pendências que não podem ficar sem resposta, montadas AUTOMATICAMENTE a partir do que o app
// já guarda (feedback da semana, observações de exercício, avaliações, cobrança, treino vencendo, teste grátis, presença da agenda, corrida...). Não existe
// "lista de tarefas" para o coach preencher: a pendência aparece enquanto a condição for verdadeira e some sozinha quando ele resolve.
// Cada fonte roda separada: se uma falhar (ex.: tabela ainda não criada) as outras continuam e o nome dela vai em `unavailable`.
import {
  ATENDIMENTO_KINDS, KIND_LABEL, addDaysKey, dateKeyBrt, diffDaysKeys, endOfDayBrt, startOfDayBrt, timeKeyBrt, firstName,
} from '@/lib/agenda';
import { ensureSeriesWindow, ownStudentScope, ownOfflineScope, withPersons, Person, Db } from '@/lib/agendaStore';
import { notDoneNames } from '@/lib/exerciseStatus';

export type Severity = 'late' | 'today' | 'soon' | 'info';
export type Target =
  | { type: 'student'; id: string; openRunning?: boolean } | { type: 'offline'; id: string } | { type: 'event'; id: string }
  | { type: 'weekly' } | { type: 'checkins' } | { type: 'feed' } | { type: 'finance' } | { type: 'students' } | { type: 'agenda' }
  | { type: 'share'; code: string } | { type: 'agenda_setup'; personKind: 'student' | 'offline'; personId: string };
export type Task = {
  key: string; type: string; severity: Severity; title: string; subtitle: string | null;
  person: Pick<Person, 'kind' | 'id' | 'name' | 'phone'> | null; dueAt: string | null; count: number; target: Target;
  /** presença e remarcação trazem o próprio compromisso, para o app abrir o editor sem outra consulta */
  event?: any;
  /** anotação do coach nesta pendência ("já cobrei, falta enviar as fotos") e quando foi escrita */
  note?: string; noteAt?: string;
  /** cobrança / "já paguei": valor da mensalidade (o app já abre a baixa com ele preenchido) */
  amount?: number;
  /** "sem tempo no treino": a ficha e o dia em que o aluno não deu conta (o app abre o editor direto nele) */
  workoutId?: string; day?: string;
  /** … e o treino finalizado em que ele avisou, quanto ele levou (min) e quanto diz ter por sessão (anamnese) */
  historyId?: string; durationMin?: number; availableMin?: number;
  /** "sem tempo" que se repete: quantos ajustes o coach já fez nesse treino e quando foi o último (o 2º aviso mostra o que já foi tentado) */
  adjustments?: number; lastAdjustAt?: string; lastAdjustLines?: string[];
  /** "não tem o aparelho": o exercício e o aviso do aluno (o app abre o editor direto nele) */
  reportId?: string; exerciseId?: string; exerciseName?: string; workoutExerciseId?: string;
};

const DAY = 86400000;
/** A anotação some sozinha tantos dias depois da última edição. */
export const NOTE_DAYS = 90;
const RANK: Record<Severity, number> = { late: 0, today: 1, soon: 2, info: 3 };
/** Mais de uma lista longa do mesmo tipo vira "+N outras" para a central não virar um paredão. */
export const MAX_PER_TYPE = 8;
const PERSONAL = /personal/i;
const brl = (v: any) => (Number(v) > 0 ? ' · ' + Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '');
const daysWord = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);
const names = (arr: string[], max = 3) => { const u = [...new Set(arr.filter(Boolean).map(firstName))]; return u.slice(0, max).join(', ') + (u.length > max ? ` e mais ${u.length - max}` : ''); };

async function safe<T>(label: string, unavailable: string[], fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); }
  catch (e: any) {
    unavailable.push(label);
    if (!/does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''))) console.error(`[agendaHoje] ${label} indisponível:`, e?.message || e);
    return fallback;
  }
}

/** Lista longa de um tipo: fica com as `MAX_PER_TYPE` mais urgentes e junta o resto numa linha só. */
function capType(tasks: Task[], type: string, moreTitle: (n: number) => string, target: Target): Task[] {
  const mine = tasks.filter((t) => t.type === type);
  if (mine.length <= MAX_PER_TYPE) return tasks;
  const sorted = [...mine].sort((a, b) => RANK[a.severity] - RANK[b.severity] || String(a.dueAt).localeCompare(String(b.dueAt)));
  const keep = new Set(sorted.slice(0, MAX_PER_TYPE).map((t) => t.key));
  const rest = sorted.slice(MAX_PER_TYPE);
  const more: Task = { key: `${type}:mais`, type: `${type}_mais`, severity: rest.some((t) => t.severity === 'late') ? 'late' : 'soon', title: moreTitle(rest.length), subtitle: null, person: null, dueAt: null, count: rest.length, target };
  return [...tasks.filter((t) => t.type !== type || keep.has(t.key)), more];
}

export async function buildHoje(db: Db, coachId: string, now: Date = new Date()) {
  const unavailable: string[] = [];
  const todayKey = dateKeyBrt(now);
  const startToday = startOfDayBrt(todayKey), endToday = endOfDayBrt(todayKey);
  const tasks: Task[] = [];
  const push = (t: Omit<Task, 'count'> & { count?: number }) => tasks.push({ count: 1, ...t } as Task);
  const person = (kind: 'student' | 'offline', row: any): Task['person'] => ({ kind, id: row.id, name: row.name || (kind === 'student' ? 'Aluno' : 'Cliente'), phone: row.phone || null });

  // ── a agenda de hoje + presença que ficou por marcar ──
  let agendaToday: any[] = [];
  await safe('agenda', unavailable, async () => {
    await ensureSeriesWindow(db, coachId, addDaysKey(todayKey, -7), addDaysKey(todayKey, 7));
    const rows: any[] = await db.agendaEvent.findMany({ where: { coachId, startsAt: { gte: startOfDayBrt(addDaysKey(todayKey, -7)), lt: endOfDayBrt(addDaysKey(todayKey, 7)) } }, orderBy: { startsAt: 'asc' } });
    const full = await withPersons(db, rows);
    agendaToday = full.filter((e) => e.startsAt >= startToday && e.startsAt < endToday && e.status !== 'CANCELLED');
    for (const e of full) {
      if (!ATENDIMENTO_KINDS.includes(e.kind)) continue;
      const label = e.person?.name || e.title || KIND_LABEL[e.kind];
      const when = `${KIND_LABEL[e.kind]} · ${dateKeyBrt(e.startsAt) === todayKey ? 'hoje' : dateKeyBrt(e.startsAt).split('-').reverse().slice(0, 2).join('/')} às ${timeKeyBrt(e.startsAt)}`;
      if (e.status === 'SCHEDULED' && e.endsAt < now) {
        push({ key: `presenca:${e.id}`, type: 'presenca', severity: e.endsAt < new Date(now.getTime() - DAY) ? 'late' : 'today', title: `Marcar presença: ${label}`, subtitle: when, person: e.person, dueAt: e.endsAt.toISOString(), target: { type: 'event', id: e.id }, event: e });
      } else if (e.status === 'SCHEDULED' && e.studentResponse === 'RESCHEDULE' && e.startsAt > now) {
        push({ key: `remarcar:${e.id}`, type: 'remarcar', severity: 'today', title: `${label} pediu para remarcar`, subtitle: when, person: e.person, dueAt: e.startsAt.toISOString(), target: { type: 'event', id: e.id }, event: e });
      }
    }
  }, undefined);

  // ── alunos do coach (uma consulta só; o resto filtra por estes ids) ──
  const students: any[] = await safe('alunos', unavailable, () => db.user.findMany({
    where: { role: 'USER', active: { not: false }, AND: [ownStudentScope(coachId)] },
    select: { id: true, name: true, phone: true, isFinanceActive: true, isTestAccount: true, contractValue: true, paymentDueDate: true, paymentClaimStatus: true, financeCategory: true, nextCheckInDate: true, disableCheckIn: true },
  }), [] as any[]);
  const real = students.filter((s) => !s.isTestAccount);
  const ids = real.map((s) => s.id);
  const byId = new Map(real.map((s) => [s.id, s]));

  // ── feedback da semana aguardando ──
  await safe('feedback da semana', unavailable, async () => {
    if (!ids.length) return;
    const rows: any[] = await db.weeklyFeedback.findMany({ where: { userId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 14 * DAY) }, coachSeenAt: null, coachReplyAt: null }, select: { id: true, userId: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    if (!rows.length) return;
    const oldest = rows.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), rows[0].createdAt);
    push({ key: `semanal:${rows[0].id}`, type: 'semanal', severity: oldest < new Date(now.getTime() - 2 * DAY) ? 'late' : 'today', title: `${rows.length} ${rows.length === 1 ? 'feedback da semana aguardando' : 'feedbacks da semana aguardando'} você`, subtitle: names(rows.map((r) => byId.get(r.userId)?.name)), person: null, dueAt: new Date(oldest).toISOString(), count: rows.length, target: { type: 'weekly' } });
  }, undefined);

  // ── observações de exercício sem resposta ──
  await safe('observações', unavailable, async () => {
    if (!ids.length) return;
    const rows: any[] = await db.studentAlert.findMany({ where: { type: 'EXERCISE_NOTE', isRead: false, userId: { in: ids } }, select: { id: true, userId: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    if (!rows.length) return;
    const oldest = rows.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), rows[0].createdAt);
    push({ key: `obs:${rows[0].id}`, type: 'obs', severity: oldest < new Date(now.getTime() - 2 * DAY) ? 'late' : 'today', title: `${rows.length} ${rows.length === 1 ? 'observação de exercício sem resposta' : 'observações de exercício sem resposta'}`, subtitle: names(rows.map((r) => byId.get(r.userId)?.name)), person: null, dueAt: new Date(oldest).toISOString(), count: rows.length, target: { type: 'feed' } });
  }, undefined);

  // ── avaliações (check-in) sem retorno ──
  await safe('avaliações', unavailable, async () => {
    if (!ids.length) return;
    const rows: any[] = await db.checkIn.findMany({ where: { userId: { in: ids }, coachFeedback: null, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { id: true, userId: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    if (!rows.length) return;
    const oldest = rows.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), rows[0].createdAt);
    push({ key: `avaliacao:${rows[0].id}`, type: 'avaliacao', severity: oldest < new Date(now.getTime() - 2 * DAY) ? 'late' : 'today', title: `${rows.length} ${rows.length === 1 ? 'avaliação sem retorno' : 'avaliações sem retorno'}`, subtitle: names(rows.map((r) => byId.get(r.userId)?.name)), person: null, dueAt: new Date(oldest).toISOString(), count: rows.length, target: { type: 'checkins' } });
  }, undefined);

  // ── avaliação marcada para uma data que já passou ──
  for (const s of real) {
    if (!s.nextCheckInDate || s.disableCheckIn === true) continue;
    const k = dateKeyBrt(new Date(s.nextCheckInDate)), late = diffDaysKeys(k, todayKey);
    if (late <= 0) continue;
    push({ key: `checkin:${s.id}:${k}`, type: 'checkin', severity: late > 7 ? 'late' : 'today', title: `Avaliação atrasada: ${s.name || 'Aluno'}`, subtitle: `era para ${daysWord(late)} atrás`, person: person('student', s), dueAt: new Date(s.nextCheckInDate).toISOString(), target: { type: 'student', id: s.id } });
  }

  // ── treino vencendo ──
  await safe('treinos', unavailable, async () => {
    if (!ids.length) return;
    const ws: any[] = await db.workout.findMany({ where: { userId: { in: ids }, archived: false }, select: { userId: true, endDate: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    const latest = new Map<string, any>();
    ws.forEach((w) => { if (!latest.has(w.userId)) latest.set(w.userId, w); });
    for (const [uid, w] of latest) {
      if (!w.endDate) continue;
      const k = dateKeyBrt(new Date(w.endDate)), left = diffDaysKeys(todayKey, k), s = byId.get(uid)!;
      if (left > 3) continue;
      push({ key: `treino:${uid}:${k}`, type: 'treino', severity: left < 0 ? 'late' : left === 0 ? 'today' : 'soon', title: left < 0 ? `Treino vencido: ${s.name || 'Aluno'}` : `Treino vence ${left === 0 ? 'hoje' : 'em ' + daysWord(left)}: ${s.name || 'Aluno'}`, subtitle: left < 0 ? `venceu há ${daysWord(-left)}` : null, person: person('student', s), dueAt: new Date(w.endDate).toISOString(), target: { type: 'student', id: s.id } });
    }
  }, undefined);

  // ── corrida: anamnese respondida sem protocolo (montar) e protocolo concluído (escolher o próximo desafio) ──
  // Some sozinha: ativar um protocolo novo desativa o anterior. Só olha o último mês, para uma anamnese esquecida há muito tempo não virar atraso eterno.
  await safe('corrida', unavailable, async () => {
    if (!ids.length) return;
    const since = new Date(now.getTime() - 30 * DAY);
    const anams: any[] = await db.runningAnamnese.findMany({ where: { userId: { in: ids }, filled: true, filledAt: { gte: since } }, select: { userId: true, filledAt: true } });
    const protos: any[] = await db.runningProtocol.findMany({ where: { userId: { in: ids }, isActive: true }, select: { userId: true, protocolType: true, completedAt: true } });
    const active = new Map<string, any>(protos.map((p) => [p.userId, p]));
    for (const a of anams) {
      if (active.has(a.userId) || !a.filledAt) continue;
      const s = byId.get(a.userId)!, k = dateKeyBrt(new Date(a.filledAt)), ago = diffDaysKeys(k, todayKey);
      push({ key: `corrida_montar:${s.id}:${k}`, type: 'corrida_montar', severity: ago >= 2 ? 'late' : 'today', title: `Montar protocolo de corrida: ${s.name || 'Aluno'}`, subtitle: ago <= 0 ? 'respondeu a anamnese hoje' : `respondeu a anamnese há ${daysWord(ago)}`, person: person('student', s), dueAt: new Date(a.filledAt).toISOString(), target: { type: 'student', id: s.id, openRunning: true } });
    }
    for (const p of protos) {
      if (!p.completedAt || new Date(p.completedAt) < since) continue;
      const s = byId.get(p.userId)!, k = dateKeyBrt(new Date(p.completedAt));
      push({ key: `corrida_fim:${s.id}:${k}`, type: 'corrida_fim', severity: 'today', title: `${s.name || 'Aluno'} concluiu o protocolo de ${p.protocolType || '5K'}`, subtitle: 'escolha o próximo desafio', person: person('student', s), dueAt: new Date(p.completedAt).toISOString(), target: { type: 'student', id: s.id, openRunning: true } });
    }
  }, undefined);

  // ── aluno avisou que NÃO deu tempo de fazer o treino todo (pergunta opcional ao finalizar) ──
  // Uma pendência por aluno (a resposta mais recente dos últimos 10 dias). "JÁ TRATEI" (adiar) some com ela; uma nova resposta "não deu tempo" cria outra.
  await safe('sem tempo no treino', unavailable, async () => {
    if (!ids.length) return;
    const rows: any[] = await db.workoutHistory.findMany({ where: { userId: { in: ids }, timeOk: false, date: { gte: new Date(now.getTime() - 10 * DAY) } }, select: { id: true, userId: true, day: true, workoutId: true, date: true, timeNote: true, duration: true }, orderBy: { date: 'desc' } });
    // quanto cada aluno diz ter por sessão (anamnese mais recente); se falhar, o cartão só não mostra o "de 60"
    const avail = new Map<string, number>();
    try {
      const an: any[] = await db.anamnese.findMany({ where: { userId: { in: [...new Set(rows.map((r) => r.userId))] } }, orderBy: { createdAt: 'desc' }, select: { userId: true, tempoDisponivel: true } });
      an.forEach((a) => { if (!avail.has(a.userId) && Number(a.tempoDisponivel) > 0) avail.set(a.userId, Number(a.tempoDisponivel)); });
    } catch (e) { /* sem o tempo disponível */ }
    // 🧾 o que o aluno confirmou que NÃO fez (pulou / marcou "não fiz" no fim do treino). Consulta à parte e protegida: se a coluna ainda não existir, o cartão sai igual a antes.
    const notDone = new Map<string, string[]>();
    try {
      const st: any[] = await db.workoutHistory.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, exerciseStatus: true } });
      st.forEach((x) => { const names = notDoneNames(x.exerciseStatus); if (names.length) notDone.set(x.id, names); });
    } catch (e) { /* sem a lista do que ficou de fora */ }
    // 🛠️ ajustes que o coach já fez e avisou ao aluno (StudentCoachMessage): se faltou tempo DE NOVO depois de um, é o "2º aviso" (só avisa; o coach decide o que mudar)
    const adjusts: any[] = [];
    try {
      adjusts.push(...await db.studentCoachMessage.findMany({ where: { userId: { in: [...new Set(rows.map((r) => r.userId))] }, kind: 'AJUSTE_TREINO', createdAt: { gte: new Date(now.getTime() - 45 * DAY) } }, orderBy: { createdAt: 'desc' }, select: { id: true, userId: true, day: true, workoutId: true, createdAt: true, changes: true } }));
    } catch (e) { /* tabela ainda não criada: sem o histórico de ajustes */ }
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.userId)) continue;
      seen.add(r.userId);
      const s = byId.get(r.userId);
      if (!s) continue;
      const before = adjusts.filter((a) => a.userId === r.userId && new Date(a.createdAt) < new Date(r.date)
        && (!a.day || !r.day || String(a.day).trim().toUpperCase() === String(r.day).trim().toUpperCase())
        && (!a.workoutId || !r.workoutId || a.workoutId === r.workoutId));
      const dayTxt = r.day ? (String(r.day).length <= 3 ? `Treino ${r.day}` : String(r.day)) : null;
      const skipNames = notDone.get(r.id) || [];
      const skipTxt = skipNames.length ? `não fez: ${skipNames.slice(0, 2).join(', ')}${skipNames.length > 2 ? ` +${skipNames.length - 2}` : ''}` : null;
      const note = r.timeNote ? `“${String(r.timeNote).slice(0, 90)}”` : 'não deu tempo de fazer tudo';
      const ageDays = Math.floor((now.getTime() - new Date(r.date).getTime()) / DAY);
      const took = r.duration > 0 ? Number(r.duration) : 0, has = avail.get(r.userId) || 0;
      const timeTxt = took ? `treinou ${took} min${has ? ` de ${has}` : ''}` : null;
      const last = before[0];
      const lastLines: string[] = last && Array.isArray(last.changes) ? last.changes.slice(0, 3).map((c: any) => String(c?.text || '')).filter(Boolean) : [];
      const again = before.length > 0;
      const adjTxt = last ? `já ajustei em ${dateKeyBrt(new Date(last.createdAt)).split('-').reverse().slice(0, 2).join('/')}${lastLines.length ? ': ' + lastLines.join('; ') : ''}` : null;
      push({ key: `tempo:${r.id}`, type: 'tempo', severity: again ? (ageDays <= 7 ? 'today' : 'soon') : (ageDays <= 3 ? 'today' : 'soon'), title: again ? `${before.length + 1}º aviso de falta de tempo: ${s.name || 'Aluno'}` : `Sem tempo no treino: ${s.name || 'Aluno'}`, subtitle: [dayTxt, timeTxt, note, skipTxt, adjTxt].filter(Boolean).join(' · '), person: person('student', s), dueAt: new Date(r.date).toISOString(), workoutId: r.workoutId || undefined, day: r.day || undefined, historyId: r.id, durationMin: took || undefined, availableMin: has || undefined, ...(again ? { adjustments: before.length, lastAdjustAt: new Date(last.createdAt).toISOString(), lastAdjustLines: lastLines } : {}), target: { type: 'student', id: s.id } });
    }
  }, undefined);

  // ── cobrança (mensal): atrasada, vencendo e "já paguei" ──
  // ── aluno avisou que NÃO tem o aparelho / exercício na academia ──
  // Uma pendência por aviso em aberto. Resolver (RESOLVIDO ou trocar o exercício na ficha) tira da lista; o exercício NUNCA é apagado da biblioteca nem do treino.
  await safe('aparelho indisponível', unavailable, async () => {
    if (!ids.length) return;
    const rows: any[] = await db.equipmentReport.findMany({ where: { userId: { in: ids }, status: 'OPEN' }, orderBy: { lastReportedAt: 'desc' }, select: { id: true, userId: true, exerciseId: true, exerciseName: true, workoutId: true, workoutExerciseId: true, day: true, note: true, count: true, lastReportedAt: true } });
    for (const r of rows) {
      const s = byId.get(r.userId);
      if (!s) continue;
      const ageDays = Math.floor((now.getTime() - new Date(r.lastReportedAt).getTime()) / DAY);
      const when = dateKeyBrt(new Date(r.lastReportedAt)).split('-').reverse().slice(0, 2).join('/');
      const dayTxt = r.day ? (String(r.day).length <= 3 ? `Treino ${r.day}` : String(r.day)) : null;
      const sub = [dayTxt, `avisou em ${when}`, r.count > 1 ? `${r.count} vezes` : null, r.note ? `“${String(r.note).slice(0, 80)}”` : null].filter(Boolean).join(' · ');
      push({ key: `aparelho:${r.id}`, type: 'aparelho', severity: ageDays <= 3 ? 'today' : 'soon', title: `${firstName(s.name || 'Aluno')} não tem: ${r.exerciseName}`, subtitle: sub, person: person('student', s), dueAt: new Date(r.lastReportedAt).toISOString(), workoutId: r.workoutId || undefined, day: r.day || undefined, reportId: r.id, exerciseId: r.exerciseId, exerciseName: r.exerciseName, workoutExerciseId: r.workoutExerciseId || undefined, target: { type: 'student', id: s.id } });
    }
  }, undefined);

  const money = (kind: 'student' | 'offline', s: any) => {
    if (s.isFinanceActive === false || !(Number(s.contractValue) > 0) || !s.paymentDueDate) return;
    const k = dateKeyBrt(new Date(s.paymentDueDate)), left = diffDaysKeys(todayKey, k);
    if (left > 2) return;
    const nm = s.name || (kind === 'student' ? 'Aluno' : 'Cliente');
    push({ key: `cobranca:${kind[0]}${s.id}:${k}`, type: 'cobranca', severity: left < 0 ? 'late' : left === 0 ? 'today' : 'soon', title: left < 0 ? `Cobrança atrasada: ${nm}` : left === 0 ? `Cobrança vence hoje: ${nm}` : `Cobrança vence em ${daysWord(left)}: ${nm}`, subtitle: (left < 0 ? `venceu há ${daysWord(-left)}` : `vence ${k.split('-').reverse().slice(0, 2).join('/')}`) + brl(s.contractValue), person: person(kind, s), dueAt: new Date(s.paymentDueDate).toISOString(), amount: Number(s.contractValue) || 0, target: { type: 'finance' } });
  };
  for (const s of real) {
    if (s.paymentClaimStatus === 'PENDING') push({ key: `paguei:${s.id}`, type: 'paguei', severity: 'today', title: `${s.name || 'Aluno'} informou que pagou`, subtitle: 'confirme ou recuse no financeiro', person: person('student', s), dueAt: null, amount: Number(s.contractValue) || 0, target: { type: 'finance' } });
    else money('student', s);
  }
  const offlines: any[] = await safe('clientes do financeiro', unavailable, () => db.offlineClient.findMany({ where: { AND: [ownOfflineScope(coachId)] }, select: { id: true, name: true, phone: true, financeCategory: true, isFinanceActive: true, contractValue: true, paymentDueDate: true } }), [] as any[]);
  offlines.forEach((o) => money('offline', o));

  // ── teste grátis (links do treino avulso) ──
  await safe('teste grátis', unavailable, async () => {
    const shares: any[] = await db.workoutShare.findMany({ where: { trial: true, createdById: coachId, revokedAt: null, createdAt: { gte: new Date(now.getTime() - 21 * DAY) } }, select: { id: true, code: true, displayName: true, viewCount: true, doneCount: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } });
    for (const sh of shares) {
      const nm = sh.displayName || 'sem nome', exp = sh.expiresAt ? new Date(sh.expiresAt) : null, left = exp ? (exp.getTime() - now.getTime()) / DAY : null;
      const tgt: Target = { type: 'share', code: sh.code };
      if (sh.doneCount >= 1 && (sh.doneCount >= 3 || (left !== null && left < 2))) push({ key: `teste_resultado:${sh.id}:${sh.doneCount}`, type: 'teste_resultado', severity: 'today', title: `Resultado do teste de ${nm} pronto`, subtitle: `${sh.doneCount} ${sh.doneCount === 1 ? 'treino concluído' : 'treinos concluídos'} · mande o resumo e a conversa da consultoria`, person: null, dueAt: null, target: tgt });
      else if (sh.viewCount === 0 && new Date(sh.createdAt) < new Date(now.getTime() - DAY) && (left === null || left > 0)) push({ key: `teste_parado:${sh.id}`, type: 'teste_parado', severity: 'today', title: `Teste de ${nm} ainda não foi aberto`, subtitle: 'reenvie o link no WhatsApp', person: null, dueAt: new Date(sh.createdAt).toISOString(), target: tgt });
      else if (sh.viewCount > 0 && sh.doneCount === 0 && left !== null && left > 0 && left < 2) push({ key: `teste_fim:${sh.id}`, type: 'teste_fim', severity: 'soon', title: `Teste de ${nm} termina em breve sem treino feito`, subtitle: 'chame para saber se travou em alguma coisa', person: null, dueAt: exp!.toISOString(), target: tgt });
    }
  }, undefined);

  // ── personal sem horário na agenda ──
  await safe('personais sem horário', unavailable, async () => {
    const wantS = real.filter((s) => PERSONAL.test(s.financeCategory || '') && s.isFinanceActive !== false);
    const wantO = offlines.filter((o) => PERSONAL.test(o.financeCategory || '') && o.isFinanceActive !== false);
    if (!wantS.length && !wantO.length) return;
    const series: any[] = await db.agendaSeries.findMany({ where: { coachId, active: true }, select: { studentId: true, offlineClientId: true } });
    const upcoming: any[] = await db.agendaEvent.findMany({ where: { coachId, status: 'SCHEDULED', startsAt: { gte: now } }, select: { studentId: true, offlineClientId: true } });
    const hasS = new Set([...series, ...upcoming].map((x) => x.studentId).filter(Boolean)), hasO = new Set([...series, ...upcoming].map((x) => x.offlineClientId).filter(Boolean));
    wantS.filter((s) => !hasS.has(s.id)).forEach((s) => push({ key: `semhorario:s${s.id}`, type: 'semhorario', severity: 'info', title: `Sem horário na agenda: ${s.name || 'Aluno'}`, subtitle: 'personal ativo sem atendimento marcado', person: person('student', s), dueAt: null, target: { type: 'agenda_setup', personKind: 'student', personId: s.id } }));
    wantO.filter((o) => !hasO.has(o.id)).forEach((o) => push({ key: `semhorario:o${o.id}`, type: 'semhorario', severity: 'info', title: `Sem horário na agenda: ${o.name || 'Cliente'}`, subtitle: 'personal ativo sem atendimento marcado', person: person('offline', o), dueAt: null, target: { type: 'agenda_setup', personKind: 'offline', personId: o.id } }));
  }, undefined);

  // ── adiadas ──
  const snoozed = await safe('adiadas', unavailable, async () => new Set<string>((await db.agendaTaskSnooze.findMany({ where: { coachId, until: { gt: now } }, select: { taskKey: true } })).map((r: any) => r.taskKey)), new Set<string>());

  const notes = await safe('anotações', unavailable, async () => new Map<string, { note: string; noteAt: string }>((await db.agendaTaskNote.findMany({ where: { coachId, updatedAt: { gte: new Date(now.getTime() - NOTE_DAYS * DAY) } }, select: { taskKey: true, note: true, updatedAt: true } })).map((r: any) => [r.taskKey, { note: r.note, noteAt: new Date(r.updatedAt).toISOString() }] as [string, { note: string; noteAt: string }])), new Map<string, { note: string; noteAt: string }>());

  // ✅ resolvidas pelo coach (botão RESOLVIDO): somem da lista até ele REABRIR. Uma pendência nova com outra chave (ex.: novo "não deu tempo") aparece normalmente.
  const resolved = await safe('resolvidas', unavailable, async () => new Set<string>((await db.agendaTaskResolved.findMany({ where: { coachId }, select: { taskKey: true } })).map((r: any) => r.taskKey)), new Set<string>());

  let list = tasks.filter((t) => !snoozed.has(t.key) && !resolved.has(t.key));
  list = capType(list, 'presenca', (n) => `+ ${n} atendimentos sem presença marcada`, { type: 'agenda' });
  list = capType(list, 'cobranca', (n) => `+ ${n} cobranças em aberto no financeiro`, { type: 'finance' });
  list = capType(list, 'treino', (n) => `+ ${n} treinos vencendo ou vencidos`, { type: 'students' });
  list = capType(list, 'checkin', (n) => `+ ${n} avaliações atrasadas`, { type: 'checkins' });
  list = capType(list, 'tempo', (n) => `+ ${n} alunos sem tempo para o treino`, { type: 'students' });
  list = capType(list, 'aparelho', (n) => `+ ${n} avisos de aparelho que o aluno não tem`, { type: 'students' });
  list = capType(list, 'semhorario', (n) => `+ ${n} sem horário na agenda`, { type: 'agenda' });
  list = list.map((t) => { const n = notes.get(t.key); return n ? { ...t, note: n.note, noteAt: n.noteAt } : t; });
  list.sort((a, b) => RANK[a.severity] - RANK[b.severity] || String(a.dueAt || '9').localeCompare(String(b.dueAt || '9')));
  const counts = { late: 0, today: 0, soon: 0, info: 0 };
  list.forEach((t) => { counts[t.severity]++; });
  return { now: now.toISOString(), date: todayKey, agenda: agendaToday, tasks: list, counts, unavailable };
}
