// lib/coachAssistant.ts
// 🎙️ (13 out 2026) PERGUNTAS POR VOZ do coach: "quais alunos estão com a cobrança vencendo?", "quem não treina há 10 dias?".
// COMO FUNCIONA (a mesma regra das notas por voz: a IA nunca vê o banco nem a lista de alunos):
//   1) a IA (Haiku) só ESCOLHE uma consulta pronta deste catálogo e os parâmetros (período, nome falado do aluno); se ela falhar, um roteador por palavras-chave faz o mesmo;
//   2) quem busca os dados é o SERVIDOR, só da carteira do coach (mesma "muralha" da central HOJE: ownStudentScope), e SÓ LÊ (nada é alterado);
//   3) a resposta (texto falável + lista) é montada aqui, sem IA: o que está escrito é o que está no banco.
// Perguntas de cobrança/financeiro ficam de fora no iPhone (o controle financeiro do coach no iOS é sem cobrança: regra da Apple 3.1.1) — `noFinance`.
import Anthropic from '@anthropic-ai/sdk';
import { dateKeyBrt, diffDaysKeys, endOfDayBrt, startOfDayBrt, timeKeyBrt, firstName, KIND_LABEL } from '@/lib/agenda';
import { ownStudentScope, ownOfflineScope, withPersons, Db } from '@/lib/agendaStore';
import { matchStudents, norm, TAG_LABEL } from '@/lib/coachNotes';

export const INTENTS = ['COBRANCA', 'SEM_TREINAR', 'TREINO_VENCENDO', 'FEEDBACKS', 'TAREFAS', 'AGENDA_HOJE', 'RESUMO_ALUNO', 'TOTAL_ALUNOS'] as const;
export type Intent = (typeof INTENTS)[number];
/** Perguntas rápidas (botões prontos, sem IA): tudo menos o resumo de aluno (precisa de nome falado) */
export const QUICK_INTENTS = ['COBRANCA', 'SEM_TREINAR', 'TREINO_VENCENDO', 'FEEDBACKS', 'TAREFAS', 'AGENDA_HOJE', 'TOTAL_ALUNOS'] as const;
export const isQuickIntent = (v: any): v is Intent => (QUICK_INTENTS as readonly string[]).includes(String(v));
export const FINANCE_INTENTS: Intent[] = ['COBRANCA'];
export const isIntent = (v: any): v is Intent => (INTENTS as readonly string[]).includes(String(v));

export const MAX_QUESTION = 400;
export const MAX_ITEMS = 12;       // linhas devolvidas na tela (o total vem à parte)
export const MAX_SPOKEN_NAMES = 5; // nomes lidos em voz alta
const DAY = 86400000;

export type Situacao = 'vencendo' | 'atrasada' | 'todas';
export type Params = { dias?: number; situacao?: Situacao; aluno_falado?: string | null };
export type Item = { kind: 'student' | 'offline' | 'note' | 'event'; id: string | null; name: string; detail: string | null; tone: 'late' | 'today' | 'soon' | null; amount?: number | null };
export type Answer = {
  intent: Intent | 'NENHUMA';
  title: string;
  spoken: string;
  items: Item[];
  total: number;
  restricted?: boolean;
  /** Período/situação usados (a tela oferece 7/15/30 dias a partir daqui) */
  params?: { dias: number; situacao: Situacao };
  ambiguous?: { id: string; name: string }[];
};

// ─────────────────────────── parâmetros ───────────────────────────
const clampDias = (v: any, def: number, min = 1, max = 90) => { const n = parseInt(String(v), 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const isSituacao = (v: any): v is Situacao => v === 'vencendo' || v === 'atrasada' || v === 'todas';

/** Parâmetros já limpos, com os padrões de cada consulta. */
export function cleanParams(intent: Intent, raw: any): Required<Pick<Params, 'dias' | 'situacao'>> & { aluno_falado: string | null } {
  return {
    dias: clampDias(raw && raw.dias, 7, intent === 'SEM_TREINAR' ? 2 : 1),
    situacao: isSituacao(raw && raw.situacao) ? raw.situacao : 'vencendo',
    aluno_falado: raw && typeof raw.aluno_falado === 'string' && raw.aluno_falado.trim() ? raw.aluno_falado.trim().slice(0, 80) : null,
  };
}

// ─────────────────────────── texto ───────────────────────────
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const daysWord = (n: number) => plural(n, 'dia', 'dias');
const dm = (key: string) => key.slice(8, 10) + '/' + key.slice(5, 7);
/** "hoje", "amanhã", "em 3 dias", "há 2 dias" a partir de (hoje → data): left > 0 futuro. */
export function whenWord(left: number): string {
  if (left === 0) return 'hoje';
  if (left === 1) return 'amanhã';
  if (left === -1) return 'ontem';
  return left > 0 ? `em ${daysWord(left)}` : `há ${daysWord(-left)}`;
}
/** "09:30" -> "9h30", "14:00" -> "14h" (a voz lê melhor assim). */
export const hourWord = (hhmm: string) => { const [h, m] = String(hhmm).split(':'); return `${parseInt(h, 10)}h${m && m !== '00' ? m : ''}`; };
const money = (v: number) => (v > 0 ? 'R$ ' + v.toFixed(2).replace('.', ',').replace(/,00$/, '') : '');

/** "Ana, Bruno e Carla" (até `max` nomes; o resto vira "e mais N"). */
export function joinNames(names: string[], max = MAX_SPOKEN_NAMES): string {
  const first = names.slice(0, max);
  const rest = names.length - first.length;
  if (rest > 0) return `${first.join(', ')} e mais ${rest}`;
  if (first.length <= 1) return first.join('');
  return `${first.slice(0, -1).join(', ')} e ${first[first.length - 1]}`;
}

const answer = (intent: Answer['intent'], title: string, spoken: string, items: Item[], total = items.length, extra: Partial<Answer> = {}): Answer => ({ intent, title, spoken, items: items.slice(0, MAX_ITEMS), total, ...extra });

// ─────────────────────────── consultas (só leitura, só da carteira do coach) ───────────────────────────
async function loadStudents(db: Db, coachId: string, select: any): Promise<any[]> {
  return db.user.findMany({ where: { role: 'USER', active: { not: false }, AND: [ownStudentScope(coachId)], NOT: [{ isTestAccount: true }] }, select, orderBy: { name: 'asc' }, take: 800 });
}

async function cobranca(db: Db, coachId: string, p: ReturnType<typeof cleanParams>, todayKey: string): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true, isFinanceActive: true, contractValue: true, paymentDueDate: true, paymentClaimStatus: true });
  let offline: any[] = [];
  try { offline = await db.offlineClient.findMany({ where: { AND: [ownOfflineScope(coachId)] }, select: { id: true, name: true, isFinanceActive: true, contractValue: true, paymentDueDate: true } }); } catch { /* sem a tabela: só os alunos */ }
  const rows = [
    ...students.map((s) => ({ kind: 'student' as const, s })),
    ...offline.map((s) => ({ kind: 'offline' as const, s })),
  ].filter(({ s }) => s.isFinanceActive !== false && Number(s.contractValue) > 0 && s.paymentDueDate)
    .map(({ kind, s }) => { const k = dateKeyBrt(new Date(s.paymentDueDate)); return { kind, s, key: k, left: diffDaysKeys(todayKey, k) }; });
  const late = rows.filter((r) => r.left < 0).sort((a, b) => a.left - b.left);
  const soon = rows.filter((r) => r.left >= 0 && r.left <= p.dias).sort((a, b) => a.left - b.left);
  const toItem = (r: (typeof rows)[number]): Item => ({
    kind: r.kind, id: r.s.id, name: r.s.name || (r.kind === 'student' ? 'Aluno' : 'Cliente'),
    detail: [r.left < 0 ? `venceu ${whenWord(r.left)} (${dm(r.key)})` : `vence ${whenWord(r.left)} (${dm(r.key)})`, money(Number(r.s.contractValue))].filter(Boolean).join(' · '),
    tone: r.left < 0 ? 'late' : r.left === 0 ? 'today' : 'soon', amount: Number(r.s.contractValue) || null,
  });
  const spokenFor = (list: typeof rows, verb: string) => joinNames(list.map((r) => `${firstName(r.s.name || '') || 'Aluno'}, ${r.left < 0 ? `venceu ${whenWord(r.left)}` : `vence ${whenWord(r.left)}`}`));
  if (p.situacao === 'atrasada') {
    if (!late.length) return answer('COBRANCA', 'Cobranças atrasadas', 'Ninguém está com cobrança atrasada.', [], 0);
    return answer('COBRANCA', 'Cobranças atrasadas', `${plural(late.length, 'pessoa com cobrança atrasada', 'pessoas com cobrança atrasada')}: ${spokenFor(late, 'venceu')}.`, late.map(toItem), late.length);
  }
  if (p.situacao === 'todas') {
    const all = [...late, ...soon];
    if (!all.length) return answer('COBRANCA', 'Cobranças', `Nenhuma cobrança atrasada nem vencendo nos próximos ${daysWord(p.dias)}.`, [], 0);
    return answer('COBRANCA', 'Cobranças atrasadas e vencendo', `${plural(all.length, 'cobrança em aberto', 'cobranças em aberto')}, ${late.length} atrasada${late.length === 1 ? '' : 's'} e ${soon.length} vencendo nos próximos ${daysWord(p.dias)}: ${spokenFor(all, '')}.`, all.map(toItem), all.length);
  }
  const title = `Cobranças vencendo em ${daysWord(p.dias)}`;
  if (!soon.length) {
    const extra = late.length ? ` Mas ${plural(late.length, 'pessoa está', 'pessoas estão')} com cobrança atrasada.` : '';
    return answer('COBRANCA', late.length ? 'Cobranças atrasadas' : title, `Ninguém tem cobrança vencendo nos próximos ${daysWord(p.dias)}.${extra}`, late.map(toItem), late.length);
  }
  return answer('COBRANCA', title, `${plural(soon.length, 'pessoa com cobrança vencendo', 'pessoas com cobrança vencendo')} nos próximos ${daysWord(p.dias)}: ${spokenFor(soon, 'vence')}.${late.length ? ` Além disso, ${plural(late.length, 'está atrasada', 'estão atrasadas')}.` : ''}`, soon.map(toItem), soon.length);
}

async function semTreinar(db: Db, coachId: string, p: ReturnType<typeof cleanParams>, now: Date): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const ids = students.map((s) => s.id);
  const title = `Sem treinar há ${daysWord(p.dias)} ou mais`;
  if (!ids.length) return answer('SEM_TREINAR', title, 'Você não tem alunos ativos.', [], 0);
  const ws: any[] = await db.workout.findMany({ where: { userId: { in: ids }, archived: false }, select: { userId: true } });
  const withPlan = new Set(ws.map((w) => w.userId));
  const hist: any[] = await db.workoutHistory.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _max: { date: true } });
  const last = new Map<string, Date | null>(hist.map((h) => [h.userId, h._max && h._max.date ? new Date(h._max.date) : null]));
  const rows = students.filter((s) => withPlan.has(s.id)).map((s) => {
    const d = last.get(s.id) || null;
    return { s, days: d ? Math.floor((now.getTime() - d.getTime()) / DAY) : null };
  }).filter((r) => r.days === null || r.days >= p.dias).sort((a, b) => (b.days === null ? 1e6 : b.days) - (a.days === null ? 1e6 : a.days) || String(a.s.name).localeCompare(String(b.s.name)));
  if (!rows.length) return answer('SEM_TREINAR', title, `Todo mundo com treino ativo treinou nos últimos ${daysWord(p.dias)}.`, [], 0);
  const items: Item[] = rows.map((r) => ({ kind: 'student', id: r.s.id, name: r.s.name || 'Aluno', detail: r.days === null ? 'ainda não finalizou nenhum treino' : `último treino há ${daysWord(r.days)}`, tone: r.days === null || r.days >= p.dias * 2 ? 'late' : 'soon' }));
  const spoken = `${plural(rows.length, 'aluno', 'alunos')} sem treinar há ${daysWord(p.dias)} ou mais: ${joinNames(rows.map((r) => `${firstName(r.s.name || '') || 'Aluno'}${r.days === null ? ', nunca treinou' : `, ${daysWord(r.days)}`}`))}.`;
  return answer('SEM_TREINAR', title, spoken, items, rows.length);
}

async function treinoVencendo(db: Db, coachId: string, p: ReturnType<typeof cleanParams>, todayKey: string): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = `Treinos vencendo em ${daysWord(p.dias)}`;
  if (!students.length) return answer('TREINO_VENCENDO', title, 'Você não tem alunos ativos.', [], 0);
  const ws: any[] = await db.workout.findMany({ where: { userId: { in: students.map((s) => s.id) }, archived: false }, select: { userId: true, endDate: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
  const latest = new Map<string, any>();
  ws.forEach((w) => { if (!latest.has(w.userId)) latest.set(w.userId, w); });   // o treino mais novo do aluno (igual à central HOJE)
  const rows = [...latest.entries()].filter(([, w]) => w.endDate).map(([uid, w]) => { const k = dateKeyBrt(new Date(w.endDate)); return { s: byId.get(uid)!, key: k, left: diffDaysKeys(todayKey, k) }; })
    .filter((r) => r.s && r.left <= p.dias).sort((a, b) => a.left - b.left);
  if (!rows.length) return answer('TREINO_VENCENDO', title, `Nenhum treino vence nos próximos ${daysWord(p.dias)}.`, [], 0);
  const items: Item[] = rows.map((r) => ({ kind: 'student', id: r.s.id, name: r.s.name || 'Aluno', detail: r.left < 0 ? `treino venceu ${whenWord(r.left)} (${dm(r.key)})` : `treino vence ${whenWord(r.left)} (${dm(r.key)})`, tone: r.left < 0 ? 'late' : r.left === 0 ? 'today' : 'soon' }));
  const overdue = rows.filter((r) => r.left < 0).length;
  const spoken = `${plural(rows.length, 'treino vencendo ou vencido', 'treinos vencendo ou vencidos')}${overdue ? `, ${overdue} já vencido${overdue === 1 ? '' : 's'}` : ''}: ${joinNames(rows.map((r) => `${firstName(r.s.name || '') || 'Aluno'}, ${r.left < 0 ? `venceu ${whenWord(r.left)}` : `vence ${whenWord(r.left)}`}`))}.`;
  return answer('TREINO_VENCENDO', title, spoken, items, rows.length);
}

async function feedbacks(db: Db, coachId: string, now: Date): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = 'Feedbacks da semana aguardando';
  if (!students.length) return answer('FEEDBACKS', title, 'Você não tem alunos ativos.', [], 0);
  const rows: any[] = await db.weeklyFeedback.findMany({ where: { userId: { in: students.map((s) => s.id) }, createdAt: { gte: new Date(now.getTime() - 14 * DAY) }, coachSeenAt: null, coachReplyAt: null }, select: { id: true, userId: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  const mine = rows.filter((r) => byId.has(r.userId));
  if (!mine.length) return answer('FEEDBACKS', title, 'Nenhum feedback da semana aguardando você.', [], 0);
  const items: Item[] = mine.map((r) => { const age = Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / DAY); return { kind: 'student', id: r.userId, name: byId.get(r.userId).name || 'Aluno', detail: age <= 0 ? 'chegou hoje' : `chegou há ${daysWord(age)}`, tone: age >= 2 ? 'late' : 'today' }; });
  return answer('FEEDBACKS', title, `${plural(mine.length, 'feedback da semana aguardando', 'feedbacks da semana aguardando')} você: ${joinNames(items.map((i) => firstName(i.name) || 'Aluno'))}.`, items, mine.length);
}

async function tarefas(db: Db, coachId: string, todayKey: string): Promise<Answer> {
  const title = 'Suas tarefas abertas';
  const rows: any[] = await db.coachNote.findMany({ where: { coachId, kind: 'TAREFA', status: 'OPEN' }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }], take: 60 });
  if (!rows.length) return answer('TAREFAS', title, 'Você não tem tarefas abertas.', [], 0);
  const items: Item[] = rows.map((r) => {
    const left = r.dueDate ? diffDaysKeys(todayKey, r.dueDate) : null;
    const when = left === null ? null : left < 0 ? `era para ${whenWord(left)}` : left === 0 ? 'para hoje' : `para ${dm(r.dueDate)}`;
    return { kind: 'note', id: r.id, name: r.studentName || 'Sem aluno', detail: [r.tag && (TAG_LABEL as any)[r.tag], String(r.body || '').slice(0, 110), when].filter(Boolean).join(' · '), tone: left !== null && left < 0 ? 'late' : left === 0 ? 'today' : 'soon' };
  });
  const dueNow = rows.filter((r) => r.dueDate && diffDaysKeys(todayKey, r.dueDate) <= 0).length;
  return answer('TAREFAS', title, `${plural(rows.length, 'tarefa aberta', 'tarefas abertas')}${dueNow ? `, ${dueNow} para hoje ou atrasada${dueNow === 1 ? '' : 's'}` : ''}. ${rows.slice(0, 3).map((r) => `${r.studentName ? firstName(r.studentName) + ': ' : ''}${String(r.body || '').slice(0, 90)}`).join('. ')}.`, items, rows.length);
}

async function agendaHoje(db: Db, coachId: string, todayKey: string): Promise<Answer> {
  const title = 'Agenda de hoje';
  const rows: any[] = await db.agendaEvent.findMany({ where: { coachId, startsAt: { gte: startOfDayBrt(todayKey), lt: endOfDayBrt(todayKey) }, status: { not: 'CANCELLED' } }, orderBy: { startsAt: 'asc' } });
  if (!rows.length) return answer('AGENDA_HOJE', title, 'Você não tem nada na agenda hoje.', [], 0);
  const full = await withPersons(db, rows);
  const items: Item[] = full.map((e: any) => ({ kind: 'event', id: e.id, name: (e.person && e.person.name) || e.title || KIND_LABEL[e.kind] || 'Compromisso', detail: `${timeKeyBrt(e.startsAt)} · ${KIND_LABEL[e.kind] || e.kind}`, tone: null }));
  return answer('AGENDA_HOJE', title, `${plural(full.length, 'compromisso hoje', 'compromissos hoje')}: ${joinNames(items.map((i) => `${i.name} às ${hourWord((i.detail || '').slice(0, 5))}`), 6)}.`, items, full.length);
}

async function totalAlunos(db: Db, coachId: string): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true });
  return answer('TOTAL_ALUNOS', 'Seus alunos', `Você tem ${plural(students.length, 'aluno ativo', 'alunos ativos')}.`, [], students.length);
}

/** Resumo de UM aluno: último treino, validade do treino, tarefas abertas, últimas anotações do diário (e a cobrança, fora do iPhone). */
async function resumoAluno(db: Db, coachId: string, p: ReturnType<typeof cleanParams>, o: { todayKey: string; now: Date; noFinance: boolean; studentId?: string | null }): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true, isFinanceActive: true, contractValue: true, paymentDueDate: true });
  let target: any = null;
  if (o.studentId) target = students.find((s) => s.id === o.studentId) || null;
  else {
    if (!p.aluno_falado) return answer('RESUMO_ALUNO', 'Resumo do aluno', 'De qual aluno você quer o resumo? Diga o nome, por exemplo: resumo do Samuel.', [], 0);
    const cands = matchStudents(p.aluno_falado, students.map((s) => ({ id: s.id, name: String(s.name || '') })));
    if (!cands.length) return answer('RESUMO_ALUNO', 'Resumo do aluno', `Não encontrei nenhum aluno chamado ${p.aluno_falado}.`, [], 0);
    const top = cands[0], tied = cands.filter((c) => c.score >= top.score - 0.0001);
    if (tied.length > 1) return answer('RESUMO_ALUNO', 'Qual aluno?', `Encontrei mais de um aluno com esse nome: ${joinNames(tied.map((c) => c.name))}. Toque no que você quer.`, tied.map((c) => ({ kind: 'student' as const, id: c.id, name: c.name, detail: 'toque para ver o resumo', tone: null })), tied.length, { ambiguous: tied.map((c) => ({ id: c.id, name: c.name })) });
    target = students.find((s) => s.id === top.id) || null;
  }
  if (!target) return answer('RESUMO_ALUNO', 'Resumo do aluno', 'Não encontrei esse aluno entre os seus.', [], 0);
  const nm = target.name || 'Aluno';
  const lines: string[] = [];
  const hist: any[] = await db.workoutHistory.findMany({ where: { userId: target.id }, orderBy: { date: 'desc' }, take: 1, select: { date: true } });
  lines.push(hist[0] ? `Último treino finalizado ${whenWord(-Math.floor((o.now.getTime() - new Date(hist[0].date).getTime()) / DAY))}.` : 'Ainda não finalizou nenhum treino.');
  const ws: any[] = await db.workout.findMany({ where: { userId: target.id, archived: false }, orderBy: { createdAt: 'desc' }, take: 1, select: { endDate: true } });
  if (ws[0] && ws[0].endDate) { const k = dateKeyBrt(new Date(ws[0].endDate)), left = diffDaysKeys(o.todayKey, k); lines.push(left < 0 ? `O treino venceu ${whenWord(left)}.` : `O treino vence ${whenWord(left)} (${dm(k)}).`); }
  else if (!ws[0]) lines.push('Não tem treino ativo.');
  if (!o.noFinance && target.isFinanceActive !== false && Number(target.contractValue) > 0 && target.paymentDueDate) { const k = dateKeyBrt(new Date(target.paymentDueDate)), left = diffDaysKeys(o.todayKey, k); lines.push(left < 0 ? `A cobrança venceu ${whenWord(left)}.` : `A cobrança vence ${whenWord(left)} (${dm(k)}).`); }
  const open: any[] = await db.coachNote.findMany({ where: { coachId, studentId: target.id, kind: 'TAREFA', status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 5 });
  if (open.length) lines.push(`${plural(open.length, 'tarefa aberta', 'tarefas abertas')} sobre ele.`);
  const notes: any[] = await db.coachNote.findMany({ where: { coachId, studentId: target.id }, orderBy: { createdAt: 'desc' }, take: 3 });
  const items: Item[] = [
    ...lines.map((l) => ({ kind: 'student' as const, id: target.id, name: nm, detail: l.replace(/\.$/, ''), tone: null as Item['tone'] })),
    ...notes.map((n) => ({ kind: 'note' as const, id: n.id, name: `Anotação · ${dm(dateKeyBrt(new Date(n.createdAt)))}`, detail: String(n.body || '').slice(0, 140), tone: null as Item['tone'] })),
  ];
  const spoken = `${nm}. ${lines.join(' ')}${notes[0] ? ` Última anotação: ${String(notes[0].body || '').slice(0, 140)}.` : ''}`;
  return answer('RESUMO_ALUNO', `Resumo: ${nm}`, spoken, items, items.length, { ambiguous: undefined });
}

/** Consultas que aceitam período (a tela oferece 7/15/30 dias) */
export const TAKES_DIAS: Intent[] = ['COBRANCA', 'SEM_TREINAR', 'TREINO_VENCENDO'];

export type RunOpts = { now?: Date; noFinance?: boolean; studentId?: string | null };

/** Roda a consulta escolhida. Nunca lança por causa de uma tabela ausente: devolve "indisponível". */
export async function runIntent(db: Db, coachId: string, intent: Intent | 'NENHUMA', rawParams: any, o: RunOpts = {}): Promise<Answer> {
  const now = o.now || new Date();
  const todayKey = dateKeyBrt(now);
  if (intent === 'NENHUMA' || !isIntent(intent)) return NOT_UNDERSTOOD;
  const p = cleanParams(intent, rawParams);
  if (o.noFinance && FINANCE_INTENTS.includes(intent)) {
    return answer(intent, 'Disponível na versão web', 'As perguntas sobre cobrança e financeiro ficam disponíveis na versão web e no Android. No iPhone, use o painel financeiro do app.', [], 0, { restricted: true });
  }
  try {
    const withParams = (a: Answer): Answer => (TAKES_DIAS.includes(intent) ? { ...a, params: { dias: p.dias, situacao: p.situacao } } : a);
    switch (intent) {
      case 'COBRANCA': return withParams(await cobranca(db, coachId, p, todayKey));
      case 'SEM_TREINAR': return withParams(await semTreinar(db, coachId, p, now));
      case 'TREINO_VENCENDO': return withParams(await treinoVencendo(db, coachId, p, todayKey));
      case 'FEEDBACKS': return await feedbacks(db, coachId, now);
      case 'TAREFAS': return await tarefas(db, coachId, todayKey);
      case 'AGENDA_HOJE': return await agendaHoje(db, coachId, todayKey);
      case 'TOTAL_ALUNOS': return await totalAlunos(db, coachId);
      case 'RESUMO_ALUNO': return await resumoAluno(db, coachId, p, { todayKey, now, noFinance: !!o.noFinance, studentId: o.studentId });
    }
  } catch (e: any) {
    if (/does not exist|P2021|P2022/i.test(String(e?.code || '') + String(e?.message || ''))) return answer(intent, 'Indisponível', 'Essa consulta ainda não está disponível no servidor.', [], 0);
    throw e;
  }
  return NOT_UNDERSTOOD;
}

export const NOT_UNDERSTOOD: Answer = {
  intent: 'NENHUMA', title: 'Ainda não sei responder isso',
  spoken: 'Ainda não sei responder essa pergunta. Posso falar de cobrança, treinos, feedbacks, tarefas, agenda de hoje e resumo de um aluno.',
  items: [], total: 0,
};

// ─────────────────────────── roteador: pergunta -> consulta ───────────────────────────
export type Route = { intent: Intent | 'NENHUMA'; params: Params };

/** Sem IA: palavras-chave. Serve de rede de segurança (IA fora do ar) e deixa as perguntas mais comuns funcionarem sempre. */
export function ruleRoute(text: string): Route {
  const t = norm(text);
  const has = (re: RegExp) => re.test(t);
  const num = (() => { const m = t.match(/\b(\d{1,2})\s*(dias?|semanas?)\b/); if (!m) return undefined; const n = parseInt(m[1], 10); return /semana/.test(m[2]) ? n * 7 : n; })();
  const dias = num ?? (has(/\bsemana\b/) ? 7 : has(/\bmes\b/) ? 30 : undefined);
  if (has(/\b(cobranca|cobrancas|mensalidade|mensalidades|pagamento|pagamentos|financeiro|plano|planos|vencimento|inadimpl|devendo|pagou|pagar|receber)\b/) && !has(/\btreino\b/)) {
    const situacao: Situacao = has(/atrasad|vencid|devendo|inadimpl|em atraso/) ? 'atrasada' : has(/\b(todas|todos)\b/) ? 'todas' : 'vencendo';
    return { intent: 'COBRANCA', params: { situacao, dias } };
  }
  if (has(/\b(sem treinar|nao treina|nao treinou|nao treinaram|parou de treinar|sumiu|sumiram|sumido|ausente|ausentes|faltou|faltaram|nao aparece|inativ)\b/)) return { intent: 'SEM_TREINAR', params: { dias } };
  if (has(/\btreinos?\b/) && has(/venc|expir|acab|renov|trocar|vence/)) return { intent: 'TREINO_VENCENDO', params: { dias } };
  if (has(/\bfeedbacks?\b/)) return { intent: 'FEEDBACKS', params: {} };
  if (has(/\bagenda\b|\bcompromissos?\b|\bhorarios?\b|\batendimentos?\b/)) return { intent: 'AGENDA_HOJE', params: {} };
  if (has(/\btarefas?\b|\bpendencias?\b|\bpendente|\bmeus lembretes\b|\bo que (eu )?(preciso|tenho que|falta) fazer\b/)) return { intent: 'TAREFAS', params: {} };
  if (has(/\bquantos alunos\b|\btotal de alunos\b|\bnumero de alunos\b/)) return { intent: 'TOTAL_ALUNOS', params: {} };
  const who = t.match(/(?:resumo|situacao|como (?:esta|anda|vai)|me (?:fala|conta|diz) (?:do|da|sobre)|o que (?:eu )?anotei (?:do|da|sobre)|anotacoes? (?:do|da|sobre))\s+(?:o |a |do |da |sobre o |sobre a )?([a-z]+(?:\s+[a-z]+)?)/);
  if (who && who[1]) return { intent: 'RESUMO_ALUNO', params: { aluno_falado: who[1].replace(/\b[a-z]/g, (c) => c.toUpperCase()) } };
  return { intent: 'NENHUMA', params: {} };
}

/** A pergunta parece uma PERGUNTA (e não uma anotação)? Usado pelo app para sugerir o modo; o coach sempre pode trocar. */
export function looksLikeQuestion(text: string): boolean {
  const raw = String(text || '').trim();
  const t = norm(raw);
  if (!t) return false;
  if (/\?\s*$/.test(raw)) return true;
  return /^(quais|qual|quem|quantos|quantas|quando|como (esta|estao|anda|andam|vai)|me (diz|diga|fala|fale|mostra|mostre|conta|lista|liste)|mostra|mostre|lista|liste|tem algum|tem alguem|alguem|resumo|o que (eu )?(anotei|tenho|preciso))\b/.test(t);
}

export const ROUTER_MODEL = 'claude-haiku-5-5';
const ROUTER_TOOL = 'escolher_consulta';

export const routerPrompt = (todayKey: string) => `Você ajuda um coach (personal trainer ou nutricionista) a CONSULTAR os dados do app dele por voz, em português do Brasil. O texto é a pergunta falada, transcrita. Chame a ferramenta ${ROUTER_TOOL} escolhendo UMA consulta pronta. Você não responde a pergunta: só escolhe a consulta e os parâmetros.

CONSULTAS
- COBRANCA: mensalidade, plano financeiro, pagamento, cobrança, quem está devendo. situacao = "vencendo" (a vencer, padrão), "atrasada" (já venceu, devendo) ou "todas". dias = janela de "vencendo" (padrão 7; "esta semana" = 7; "este mês" = 30).
- SEM_TREINAR: alunos que não treinam há um tempo ("sumidos", "parados", "faltando"). dias = quantos dias sem treinar (padrão 7).
- TREINO_VENCENDO: fichas/treinos que estão vencendo ou venceram (precisam renovar). dias = janela (padrão 7).
- FEEDBACKS: feedbacks da semana dos alunos aguardando resposta.
- TAREFAS: tarefas e pendências anotadas pelo próprio coach.
- AGENDA_HOJE: compromissos e atendimentos de hoje.
- TOTAL_ALUNOS: quantos alunos ativos o coach tem.
- RESUMO_ALUNO: situação de UM aluno (último treino, treino, cobrança, anotações). aluno_falado = o nome como foi dito.
- NENHUMA: a pergunta não cabe em nenhuma consulta acima, ou não é uma pergunta sobre os dados.
Hoje é ${todayKey}. Ignore hesitações ("é", "né", "tipo"). Nunca invente consulta nova.`;

export const ROUTER_TOOL_DEF: any = {
  name: ROUTER_TOOL,
  description: 'Escolhe a consulta pronta que responde à pergunta do coach.',
  input_schema: {
    type: 'object',
    properties: {
      consulta: { type: 'string', enum: [...INTENTS, 'NENHUMA'] },
      situacao: { type: ['string', 'null'], enum: ['vencendo', 'atrasada', 'todas', null], description: 'Só para COBRANCA.' },
      dias: { type: ['integer', 'null'], description: 'Janela em dias (1 a 90), quando a pergunta cita um período.' },
      aluno_falado: { type: ['string', 'null'], description: 'Só para RESUMO_ALUNO: o nome do aluno como foi dito.' },
    },
    required: ['consulta'],
  },
};

export type RouterUsage = { model: string; inputTokens: number; outputTokens: number; ms: number };

/** Uma chamada. Lança erro se a IA não estiver configurada/recusar: quem chama cai no `ruleRoute`. */
export async function aiRoute(text: string, todayKey: string, o: { client?: any } = {}): Promise<{ route: Route; usage: RouterUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!o.client && !apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  const client = o.client || new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  const t0 = Date.now();
  const resp: any = await client.messages.create({
    model: ROUTER_MODEL, max_tokens: 300, system: routerPrompt(todayKey), tools: [ROUTER_TOOL_DEF], tool_choice: { type: 'tool', name: ROUTER_TOOL },
    output_config: { effort: 'low' }, messages: [{ role: 'user', content: text }],
  });
  if (resp?.stop_reason === 'refusal') throw new Error('A IA recusou interpretar esse texto.');
  const block = (resp?.content || []).find((b: any) => b.type === 'tool_use' && b.name === ROUTER_TOOL);
  if (!block?.input) throw new Error('A IA não devolveu a consulta.');
  const i = block.input;
  const intent = isIntent(i.consulta) ? i.consulta : 'NENHUMA';
  return { route: { intent, params: { situacao: i.situacao, dias: i.dias, aluno_falado: i.aluno_falado } as any }, usage: { model: ROUTER_MODEL, inputTokens: resp?.usage?.input_tokens ?? 0, outputTokens: resp?.usage?.output_tokens ?? 0, ms: Date.now() - t0 } };
}

