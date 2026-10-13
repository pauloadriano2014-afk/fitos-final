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
import { buildHoje } from '@/lib/agendaHoje';
import { getPromoState } from '@/lib/launchPromo';
import { MASTER_IDS } from '@/lib/masterIds';
import { CATALOG_INTENTS } from '@/lib/assistantCatalog';

/** Consultas sobre os COACHES da plataforma: só o time master (Paulo/Adri). O servidor confere em `runIntent`, não só o app. */
export const MASTER_INTENTS = ['COACHES_RESUMO', 'COACHES_PENDENTES', 'COACHES_COBRANCA', 'COACHES_ALUNOS', 'COACHES_NOVOS', 'COACHES_FUNDADORES', 'RESUMO_COACH'] as const;
export const INTENTS = ['COBRANCA', 'SEM_TREINAR', 'TREINO_VENCENDO', 'FEEDBACKS', 'TAREFAS', 'AGENDA_HOJE', 'RESUMO_ALUNO', 'TOTAL_ALUNOS',
  'RESUMO_HOJE', 'NOVOS_ALUNOS', 'ANIVERSARIANTES', 'SEM_TREINO_MONTADO', 'DELOAD_CHOQUE', 'PAGAMENTOS_AGUARDANDO', 'APARELHOS', 'VIDEOS_AGUARDANDO', 'COMENTARIOS_EXERCICIO',
  'CORRIDA_ATIVOS', 'SEM_DIETA', 'DIETA_FEEDBACKS', 'CHECKINS_AGUARDANDO', 'CHECKIN_ATRASADO', 'TESTE_GRATIS', ...MASTER_INTENTS] as const;
export type Intent = (typeof INTENTS)[number];
/** Perguntas rápidas (botões prontos, sem IA): tudo menos o resumo de aluno (precisa de nome falado) */
export const QUICK_INTENTS: readonly string[] = CATALOG_INTENTS;   // os botões do catálogo (lib/assistantCatalog.ts)
export const isQuickIntent = (v: any): v is Intent => QUICK_INTENTS.includes(String(v));
export const isMasterIntent = (v: any): boolean => (MASTER_INTENTS as readonly string[]).includes(String(v));
export const isMasterCoachId = (id: string | null | undefined): boolean => !!id && MASTER_IDS.includes(id);
/** Consultas de dinheiro: some no app do iPhone (Apple 3.1.1) */
export const FINANCE_INTENTS: Intent[] = ['COBRANCA', 'PAGAMENTOS_AGUARDANDO', 'COACHES_COBRANCA', 'COACHES_FUNDADORES'];
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


// ─────────────────────────── consultas novas (assistente único) ───────────────────────────
const tone = (late: boolean, today?: boolean): Item['tone'] => (late ? 'late' : today ? 'today' : 'soon');
const ageDays = (d: any, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(d).getTime()) / DAY));
const studentItem = (s: any, detail: string | null, t: Item['tone']): Item => ({ kind: 'student', id: s.id, name: s.name || 'Aluno', detail, tone: t });
const names = (items: Item[]) => joinNames(items.map((i) => firstName(i.name) || i.name));

const HOJE_LABEL: Record<string, [string, string]> = {
  cobranca: ['cobrança', 'cobranças'], paguei: ['pagamento para confirmar', 'pagamentos para confirmar'], semanal: ['feedback da semana', 'feedbacks da semana'],
  obs: ['observação de exercício', 'observações de exercício'], avaliacao: ['avaliação sem retorno', 'avaliações sem retorno'], checkin: ['avaliação atrasada', 'avaliações atrasadas'],
  treino: ['treino vencendo', 'treinos vencendo'], aparelho: ['aparelho que o aluno não tem', 'aparelhos que o aluno não tem'], video: ['vídeo de execução', 'vídeos de execução'],
  videopedido: ['vídeo pedido', 'vídeos pedidos'], nota: ['tarefa das suas anotações', 'tarefas das suas anotações'], presenca: ['presença para marcar', 'presenças para marcar'],
  tempo: ['aluno sem tempo no treino', 'alunos sem tempo no treino'], teste_fim: ['teste grátis terminando', 'testes grátis terminando'], teste_resultado: ['resultado de teste grátis', 'resultados de teste grátis'],
};
const HOJE_FINANCE = ['cobranca', 'paguei'];

/** "O que tenho hoje?": a mesma central HOJE do app (agenda + pendências), resumida. */
async function resumoHoje(db: Db, coachId: string, now: Date, noFinance: boolean): Promise<Answer> {
  const h: any = await buildHoje(db, coachId, now);
  const tasks = (h.tasks || []).filter((t: any) => !(noFinance && HOJE_FINANCE.includes(t.type)));
  const agenda = (h.agenda || []).length;
  const title = 'O que você tem hoje';
  if (!tasks.length && !agenda) return answer('RESUMO_HOJE', title, 'Você não tem nada na agenda nem pendências agora. Dia livre.', [], 0);
  const by = new Map<string, number>();
  tasks.forEach((t: any) => by.set(t.type, (by.get(t.type) || 0) + (t.count || 1)));
  const parts = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => { const l = HOJE_LABEL[k]; return l ? plural(n, l[0], l[1]) : null; }).filter(Boolean);
  const spoken = `${agenda ? plural(agenda, 'compromisso na agenda hoje', 'compromissos na agenda hoje') : 'Nada na agenda hoje'}${tasks.length ? ` e ${plural(tasks.length, 'pendência', 'pendências')}` : ''}${parts.length ? `: ${parts.join(', ')}` : ''}.`;
  const items: Item[] = tasks.slice(0, MAX_ITEMS).map((t: any) => ({ kind: t.person && t.person.kind === 'offline' ? 'offline' as const : t.person && t.person.kind === 'student' ? 'student' as const : 'note' as const, id: t.person ? t.person.id : null, name: t.title, detail: t.subtitle || null, tone: t.severity === 'late' ? 'late' as const : t.severity === 'today' ? 'today' as const : t.severity === 'soon' ? 'soon' as const : null }));
  return answer('RESUMO_HOJE', title, spoken, items, tasks.length);
}

async function novosAlunos(db: Db, coachId: string, p: ReturnType<typeof cleanParams>, now: Date): Promise<Answer> {
  const since = new Date(now.getTime() - p.dias * DAY);
  const rows = (await loadStudents(db, coachId, { id: true, name: true, createdAt: true, plan: true })).filter((s) => s.createdAt && new Date(s.createdAt) >= since).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const title = `Alunos novos nos últimos ${daysWord(p.dias)}`;
  if (!rows.length) return answer('NOVOS_ALUNOS', title, `Nenhum aluno novo nos últimos ${daysWord(p.dias)}.`, [], 0);
  const items = rows.map((s) => studentItem(s, `entrou ${whenWord(-ageDays(s.createdAt, now))}${s.plan ? ` · plano ${String(s.plan).toLowerCase()}` : ''}`, 'soon'));
  return answer('NOVOS_ALUNOS', title, `${plural(rows.length, 'aluno novo', 'alunos novos')} nos últimos ${daysWord(p.dias)}: ${names(items)}.`, items, rows.length);
}

/** "DD/MM/AAAA", "DD/MM", "AAAA-MM-DD", "DDMMAAAA" -> { d, m } (mês 1 a 12) */
export function parseBirth(raw: any): { d: number; m: number } | null {
  const t = String(raw == null ? '' : raw).trim();
  if (!t) return null;
  let d = NaN, m = NaN, mt: RegExpMatchArray | null;
  if (t.includes('/')) { const x = t.split('/').map((v) => parseInt(v.trim(), 10)); d = x[0]; m = x[1]; }
  else if ((mt = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) { m = parseInt(mt[2], 10); d = parseInt(mt[3], 10); }
  else if (/^\d{8}$/.test(t) || /^\d{4}$/.test(t)) { d = parseInt(t.slice(0, 2), 10); m = parseInt(t.slice(2, 4), 10); }
  return d >= 1 && d <= 31 && m >= 1 && m <= 12 ? { d, m } : null;
}
async function aniversariantes(db: Db, coachId: string, p: ReturnType<typeof cleanParams>, todayKey: string): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true, birthDate: true });
  const year = parseInt(todayKey.slice(0, 4), 10);
  const rows = students.map((s) => {
    const b = parseBirth(s.birthDate); if (!b) return null;
    const key = (y: number) => `${y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}`;
    let left = diffDaysKeys(todayKey, key(year)); let k = key(year);
    if (left < 0) { k = key(year + 1); left = diffDaysKeys(todayKey, k); }
    return { s, left, k };
  }).filter((r): r is NonNullable<typeof r> => !!r && r.left <= p.dias).sort((a, b) => a.left - b.left);
  const title = `Aniversariantes nos próximos ${daysWord(p.dias)}`;
  if (!rows.length) return answer('ANIVERSARIANTES', title, `Ninguém faz aniversário nos próximos ${daysWord(p.dias)}.`, [], 0);
  const items = rows.map((r) => studentItem(r.s, `faz aniversário ${whenWord(r.left)} (${dm(r.k)})`, r.left === 0 ? 'today' : 'soon'));
  return answer('ANIVERSARIANTES', title, `${plural(rows.length, 'aniversariante', 'aniversariantes')} nos próximos ${daysWord(p.dias)}: ${joinNames(rows.map((r) => `${firstName(r.s.name || '') || 'Aluno'}, ${whenWord(r.left)}`))}.`, items, rows.length);
}

async function semTreinoMontado(db: Db, coachId: string): Promise<Answer> {
  const students = (await loadStudents(db, coachId, { id: true, name: true, studentModules: true, createdAt: true })).filter((s) => !s.studentModules || String(s.studentModules).toUpperCase().includes('TREINO'));
  const title = 'Alunos sem treino montado';
  if (!students.length) return answer('SEM_TREINO_MONTADO', title, 'Você não tem alunos ativos.', [], 0);
  const ws: any[] = await db.workout.findMany({ where: { userId: { in: students.map((s) => s.id) }, archived: false }, select: { userId: true } });
  const has = new Set(ws.map((w) => w.userId));
  const rows = students.filter((s) => !has.has(s.id));
  if (!rows.length) return answer('SEM_TREINO_MONTADO', title, 'Todos os seus alunos têm treino ativo.', [], 0);
  const items = rows.map((s) => studentItem(s, 'sem treino ativo', 'today'));
  return answer('SEM_TREINO_MONTADO', title, `${plural(rows.length, 'aluno sem treino montado', 'alunos sem treino montado')}: ${names(items)}.`, items, rows.length);
}

async function deloadChoque(db: Db, coachId: string, now: Date): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true, isMenstruating: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = 'Alunos em deload ou semana de choque';
  if (!students.length) return answer('DELOAD_CHOQUE', title, 'Você não tem alunos ativos.', [], 0);
  const ws: any[] = await db.workout.findMany({ where: { userId: { in: students.map((s) => s.id) }, archived: false, intensityEndDate: { gte: now } }, select: { userId: true, intensityMultiplier: true, intensityEndDate: true } });
  const seen = new Set<string>();
  const items: Item[] = [];
  ws.filter((w) => Number(w.intensityMultiplier) !== 1).forEach((w) => {
    if (seen.has(w.userId) || !byId.has(w.userId)) return; seen.add(w.userId);
    const up = Number(w.intensityMultiplier) > 1;
    items.push(studentItem(byId.get(w.userId), `${up ? 'semana de choque' : 'deload'} até ${dm(dateKeyBrt(new Date(w.intensityEndDate)))}`, 'soon'));
  });
  students.filter((s) => s.isMenstruating && !seen.has(s.id)).forEach((s) => items.push(studentItem(s, 'deload menstrual ativo', 'soon')));
  if (!items.length) return answer('DELOAD_CHOQUE', title, 'Ninguém está em deload nem em semana de choque agora.', [], 0);
  return answer('DELOAD_CHOQUE', title, `${plural(items.length, 'aluno', 'alunos')} em deload ou choque: ${names(items)}.`, items, items.length);
}

async function pagamentosAguardando(db: Db, coachId: string, now: Date): Promise<Answer> {
  const rows = (await loadStudents(db, coachId, { id: true, name: true, contractValue: true, paymentClaimedAt: true, paymentClaimStatus: true })).filter((s) => s.paymentClaimStatus === 'PENDING');
  const title = 'Pagamentos para confirmar';
  if (!rows.length) return answer('PAGAMENTOS_AGUARDANDO', title, 'Nenhum aluno informou pagamento para você confirmar.', [], 0);
  const items = rows.map((s) => studentItem(s, [s.paymentClaimedAt ? `avisou ${whenWord(-ageDays(s.paymentClaimedAt, now))}` : 'avisou', money(Number(s.contractValue))].filter(Boolean).join(' · '), 'today'));
  return answer('PAGAMENTOS_AGUARDANDO', title, `${plural(rows.length, 'aluno informou que pagou', 'alunos informaram que pagaram')} e aguarda${rows.length === 1 ? '' : 'm'} sua confirmação: ${names(items)}.`, items, rows.length);
}

async function aparelhos(db: Db, coachId: string, now: Date): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = 'Aparelho que o aluno não tem';
  if (!students.length) return answer('APARELHOS', title, 'Você não tem alunos ativos.', [], 0);
  const rows: any[] = await db.equipmentReport.findMany({ where: { userId: { in: students.map((s) => s.id) }, status: 'OPEN' }, orderBy: { lastReportedAt: 'desc' }, take: 60 });
  const mine = rows.filter((r) => byId.has(r.userId));
  if (!mine.length) return answer('APARELHOS', title, 'Nenhum aluno avisou que falta aparelho.', [], 0);
  const items = mine.map((r) => studentItem(byId.get(r.userId), `não tem: ${r.exerciseName}${r.count > 1 ? ` (avisou ${r.count} vezes)` : ''} · ${whenWord(-ageDays(r.lastReportedAt, now))}`, ageDays(r.lastReportedAt, now) >= 3 ? 'late' : 'today'));
  return answer('APARELHOS', title, `${plural(mine.length, 'aviso de aparelho que falta', 'avisos de aparelho que falta')}: ${joinNames(mine.map((r) => `${firstName(byId.get(r.userId).name || '') || 'Aluno'}, ${r.exerciseName}`))}.`, items, mine.length);
}

async function videosAguardando(db: Db, coachId: string, now: Date): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = 'Vídeos de execução para responder';
  if (!students.length) return answer('VIDEOS_AGUARDANDO', title, 'Você não tem alunos ativos.', [], 0);
  const rows: any[] = await db.executionVideo.findMany({ where: { userId: { in: students.map((s) => s.id) }, status: 'READY', coachViewedAt: null, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { createdAt: 'desc' }, take: 60 });
  const mine = rows.filter((r) => byId.has(r.userId));
  if (!mine.length) return answer('VIDEOS_AGUARDANDO', title, 'Nenhum vídeo de execução esperando você.', [], 0);
  const items = mine.map((r) => studentItem(byId.get(r.userId), `${r.exerciseName} · ${whenWord(-ageDays(r.createdAt, now))}${r.priority ? ' · prioridade' : ''}`, r.priority || ageDays(r.createdAt, now) >= 2 ? 'late' : 'today'));
  return answer('VIDEOS_AGUARDANDO', title, `${plural(mine.length, 'vídeo de execução esperando', 'vídeos de execução esperando')} você: ${joinNames(mine.map((r) => `${firstName(byId.get(r.userId).name || '') || 'Aluno'}, ${r.exerciseName}`))}.`, items, mine.length);
}

async function comentariosExercicio(db: Db, coachId: string, now: Date): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = 'Observações de exercício sem resposta';
  if (!students.length) return answer('COMENTARIOS_EXERCICIO', title, 'Você não tem alunos ativos.', [], 0);
  const rows: any[] = await db.studentAlert.findMany({ where: { type: 'EXERCISE_NOTE', isRead: false, userId: { in: students.map((s) => s.id) } }, orderBy: { createdAt: 'desc' }, take: 60 });
  const mine = rows.filter((r) => byId.has(r.userId));
  if (!mine.length) return answer('COMENTARIOS_EXERCICIO', title, 'Nenhuma observação de exercício esperando resposta.', [], 0);
  const items = mine.map((r) => studentItem(byId.get(r.userId), `${r.exerciseName ? r.exerciseName + ': ' : ''}${String(r.message || '').slice(0, 110)} · ${whenWord(-ageDays(r.createdAt, now))}`, ageDays(r.createdAt, now) >= 2 ? 'late' : 'today'));
  return answer('COMENTARIOS_EXERCICIO', title, `${plural(mine.length, 'observação de exercício sem resposta', 'observações de exercício sem resposta')}: ${names(items)}.`, items, mine.length);
}

async function corridaAtivos(db: Db, coachId: string): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = 'Alunos no protocolo de corrida';
  if (!students.length) return answer('CORRIDA_ATIVOS', title, 'Você não tem alunos ativos.', [], 0);
  const rows: any[] = await db.runningProtocol.findMany({ where: { userId: { in: students.map((s) => s.id) }, isActive: true, completedAt: null }, orderBy: { startDate: 'desc' } });
  const mine = rows.filter((r) => byId.has(r.userId));
  if (!mine.length) return answer('CORRIDA_ATIVOS', title, 'Nenhum aluno está com protocolo de corrida ativo.', [], 0);
  const items = mine.map((r) => studentItem(byId.get(r.userId), `${r.protocolType || 'Corrida'} · semana ${r.currentWeek || r.startWeek || 1}`, null));
  return answer('CORRIDA_ATIVOS', title, `${plural(mine.length, 'aluno com protocolo de corrida ativo', 'alunos com protocolo de corrida ativo')}: ${names(items)}.`, items, mine.length);
}

async function semDieta(db: Db, coachId: string): Promise<Answer> {
  const students = (await loadStudents(db, coachId, { id: true, name: true, dietModule: true })).filter((s) => s.dietModule);
  const title = 'Alunos sem dieta ativa';
  if (!students.length) return answer('SEM_DIETA', title, 'Nenhum aluno seu tem o módulo de dieta ligado.', [], 0);
  const ds: any[] = await db.diet.findMany({ where: { userId: { in: students.map((s) => s.id) }, isActive: true, isStrategy: false }, select: { userId: true } });
  const has = new Set(ds.map((d) => d.userId));
  const rows = students.filter((s) => !has.has(s.id));
  if (!rows.length) return answer('SEM_DIETA', title, 'Todos os alunos com módulo de dieta têm dieta ativa.', [], 0);
  const items = rows.map((s) => studentItem(s, 'sem dieta ativa', 'today'));
  return answer('SEM_DIETA', title, `${plural(rows.length, 'aluno com dieta ligada e sem dieta ativa', 'alunos com dieta ligada e sem dieta ativa')}: ${names(items)}.`, items, rows.length);
}

async function dietaFeedbacks(db: Db, coachId: string, now: Date): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = 'Feedbacks de dieta não lidos';
  if (!students.length) return answer('DIETA_FEEDBACKS', title, 'Você não tem alunos ativos.', [], 0);
  const rows: any[] = await db.dietFeedback.findMany({ where: { userId: { in: students.map((s) => s.id) }, read: false }, orderBy: { createdAt: 'desc' }, take: 60 });
  const mine = rows.filter((r) => byId.has(r.userId));
  if (!mine.length) return answer('DIETA_FEEDBACKS', title, 'Nenhum feedback de dieta esperando leitura.', [], 0);
  const items = mine.map((r) => studentItem(byId.get(r.userId), `${String(r.requestedChanges || '').slice(0, 100) || [r.satiety && `saciedade: ${r.satiety}`, r.difficulty && `dificuldade: ${r.difficulty}`].filter(Boolean).join(' · ') || 'feedback da dieta'} · ${whenWord(-ageDays(r.createdAt, now))}`, ageDays(r.createdAt, now) >= 2 ? 'late' : 'today'));
  return answer('DIETA_FEEDBACKS', title, `${plural(mine.length, 'feedback de dieta não lido', 'feedbacks de dieta não lidos')}: ${names(items)}.`, items, mine.length);
}

async function checkinsAguardando(db: Db, coachId: string, now: Date): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true });
  const byId = new Map(students.map((s) => [s.id, s]));
  const title = 'Avaliações sem retorno';
  if (!students.length) return answer('CHECKINS_AGUARDANDO', title, 'Você não tem alunos ativos.', [], 0);
  const rows: any[] = await db.checkIn.findMany({ where: { userId: { in: students.map((s) => s.id) }, coachFeedback: null, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { createdAt: 'asc' }, take: 60 });
  const mine = rows.filter((r) => byId.has(r.userId));
  if (!mine.length) return answer('CHECKINS_AGUARDANDO', title, 'Nenhuma avaliação esperando o seu retorno.', [], 0);
  const items = mine.map((r) => studentItem(byId.get(r.userId), `enviou ${whenWord(-ageDays(r.createdAt, now))}`, ageDays(r.createdAt, now) >= 2 ? 'late' : 'today'));
  return answer('CHECKINS_AGUARDANDO', title, `${plural(mine.length, 'avaliação esperando', 'avaliações esperando')} seu retorno: ${names(items)}.`, items, mine.length);
}

async function checkinAtrasado(db: Db, coachId: string, todayKey: string): Promise<Answer> {
  const students = await loadStudents(db, coachId, { id: true, name: true, nextCheckInDate: true, disableCheckIn: true });
  const rows = students.filter((s) => !s.disableCheckIn && s.nextCheckInDate).map((s) => ({ s, left: diffDaysKeys(todayKey, dateKeyBrt(new Date(s.nextCheckInDate))) })).filter((r) => r.left < 0).sort((a, b) => a.left - b.left);
  const title = 'Avaliações atrasadas';
  if (!rows.length) return answer('CHECKIN_ATRASADO', title, 'Nenhum aluno está com a avaliação atrasada.', [], 0);
  const items = rows.map((r) => studentItem(r.s, `era para ${whenWord(r.left)}`, 'late'));
  return answer('CHECKIN_ATRASADO', title, `${plural(rows.length, 'aluno com avaliação atrasada', 'alunos com avaliação atrasada')}: ${joinNames(rows.map((r) => `${firstName(r.s.name || '') || 'Aluno'}, ${whenWord(r.left)}`))}.`, items, rows.length);
}

async function testeGratis(db: Db, coachId: string, now: Date): Promise<Answer> {
  const title = 'Links de teste grátis';
  const rows: any[] = await db.workoutShare.findMany({ where: { createdById: coachId, trial: true, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { createdAt: 'desc' }, take: 40 });
  if (!rows.length) return answer('TESTE_GRATIS', title, 'Você não criou links de teste grátis nos últimos 30 dias.', [], 0);
  const opened = rows.filter((r) => (r.viewCount || 0) > 0).length, done = rows.filter((r) => (r.doneCount || 0) > 0).length;
  const items: Item[] = rows.map((r) => ({ kind: 'note', id: r.id, name: r.displayName || 'Teste grátis', detail: [`criado ${whenWord(-ageDays(r.createdAt, now))}`, (r.viewCount || 0) > 0 ? `abriu ${r.viewCount}x` : 'ainda não abriu', (r.doneCount || 0) > 0 ? `concluiu ${r.doneCount}` : null].filter(Boolean).join(' · '), tone: (r.doneCount || 0) > 0 ? 'today' : null }));
  return answer('TESTE_GRATIS', title, `${plural(rows.length, 'link de teste', 'links de teste')} nos últimos 30 dias: ${opened} aberto${opened === 1 ? '' : 's'} e ${done} concluído${done === 1 ? '' : 's'}.`, items, rows.length);
}

// ─────────────────────────── consultas sobre os COACHES (só time master) ───────────────────────────
const PLAN_LABEL: Record<string, string> = { PERSONAL: 'Personal', NUTRICIONISTA: 'Nutricionista', ELITE: 'Elite' };
const planWord = (p: any) => PLAN_LABEL[String(p || '').toUpperCase()] || String(p || 'sem plano');
const BILLING_LABEL: Record<string, string> = { ACTIVE: 'em dia', OVERDUE: 'em atraso', CANCELLED: 'cancelado', TRIAL: 'em teste grátis', PENDING: 'aguardando pagamento' };
const billingWord = (b: any) => BILLING_LABEL[String(b || '').toUpperCase()] || String(b || 'sem status').toLowerCase();
const realCoaches = (select: any, where: any = {}) => ({ where: { role: 'COACH', NOT: [{ isTestAccount: true }], ...where }, select, orderBy: { name: 'asc' as const }, take: 500 });
const coachItem = (c: any, detail: string | null, t: Item['tone']): Item => ({ kind: 'note', id: c.id, name: c.name || c.email || 'Coach', detail, tone: t });

async function studentCounts(db: Db): Promise<Map<string, number>> {
  const g: any[] = await db.user.groupBy({ by: ['coachId'], where: { role: 'USER', active: { not: false }, coachId: { not: null }, NOT: [{ isTestAccount: true }] }, _count: { _all: true } });
  return new Map(g.map((r) => [r.coachId, r._count._all]));
}

async function coachesResumo(db: Db): Promise<Answer> {
  const coaches: any[] = await db.user.findMany(realCoaches({ id: true, accountStatus: true, coachPlan: true, coachBillingStatus: true }));
  const title = 'Visão geral dos coaches';
  const mine = coaches.filter((c) => !MASTER_IDS.includes(c.id));
  if (!mine.length) return answer('COACHES_RESUMO', title, 'Ainda não há coaches parceiros cadastrados.', [], 0);
  const by = (f: (c: any) => string) => { const m = new Map<string, number>(); mine.forEach((c) => m.set(f(c), (m.get(f(c)) || 0) + 1)); return m; };
  const st = by((c) => String(c.accountStatus || 'ACTIVE'));
  const active = mine.filter((c) => c.accountStatus === 'ACTIVE');
  const plans = by((c) => planWord(c.coachPlan));
  const counts = await studentCounts(db);
  const totalStudents = active.reduce((n, c) => n + (counts.get(c.id) || 0), 0);
  const items: Item[] = [
    { kind: 'note', id: null, name: 'Coaches ativos', detail: String(st.get('ACTIVE') || 0), tone: null },
    { kind: 'note', id: null, name: 'Aguardando aprovação', detail: String(st.get('PENDING_APPROVAL') || 0), tone: (st.get('PENDING_APPROVAL') || 0) > 0 ? 'today' : null },
    { kind: 'note', id: null, name: 'Recusados', detail: String(st.get('REJECTED') || 0), tone: null },
    ...[...plans.entries()].map(([k, n]) => ({ kind: 'note' as const, id: null, name: `Plano ${k}`, detail: String(n), tone: null as Item['tone'] })),
    { kind: 'note', id: null, name: 'Alunos dos coaches', detail: String(totalStudents), tone: null },
  ];
  const pend = st.get('PENDING_APPROVAL') || 0;
  return answer('COACHES_RESUMO', title, `${plural(active.length, 'coach ativo', 'coaches ativos')} com ${plural(totalStudents, 'aluno', 'alunos')} no total${pend ? `, e ${plural(pend, 'cadastro aguardando', 'cadastros aguardando')} aprovação` : ''}. Planos: ${[...plans.entries()].map(([k, n]) => `${n} ${k}`).join(', ')}.`, items, items.length);
}

async function coachesPendentes(db: Db, now: Date): Promise<Answer> {
  const rows: any[] = await db.user.findMany(realCoaches({ id: true, name: true, email: true, coachPlan: true, createdAt: true }, { accountStatus: 'PENDING_APPROVAL' }));
  const title = 'Cadastros de coach para aprovar';
  if (!rows.length) return answer('COACHES_PENDENTES', title, 'Nenhum cadastro de coach esperando aprovação.', [], 0);
  const items = rows.map((c) => coachItem(c, `plano ${planWord(c.coachPlan)} · pediu ${whenWord(-ageDays(c.createdAt, now))}`, ageDays(c.createdAt, now) >= 2 ? 'late' : 'today'));
  return answer('COACHES_PENDENTES', title, `${plural(rows.length, 'cadastro de coach esperando', 'cadastros de coach esperando')} aprovação: ${joinNames(items.map((i) => i.name))}.`, items, rows.length);
}

async function coachesCobranca(db: Db, p: ReturnType<typeof cleanParams>, now: Date, todayKey: string): Promise<Answer> {
  const rows: any[] = await db.user.findMany(realCoaches({ id: true, name: true, email: true, coachBillingStatus: true, coachBillingEnd: true, trialEndsAt: true, coachPlan: true }, { accountStatus: 'ACTIVE', id: { notIn: MASTER_IDS } }));
  const title = `Coaches em atraso ou vencendo em ${daysWord(p.dias)}`;
  const items: Item[] = [];
  rows.forEach((c) => {
    const st = String(c.coachBillingStatus || '').toUpperCase();
    if (st === 'OVERDUE' || st === 'CANCELLED') { items.push(coachItem(c, `${st === 'OVERDUE' ? 'em atraso' : 'cancelado'} · plano ${planWord(c.coachPlan)}`, 'late')); return; }
    const end = st === 'TRIAL' ? c.trialEndsAt : c.coachBillingEnd;
    if (!end) return;
    const left = diffDaysKeys(todayKey, dateKeyBrt(new Date(end)));
    if (left <= p.dias) items.push(coachItem(c, `${st === 'TRIAL' ? 'teste grátis termina' : 'plano vence'} ${whenWord(left)} (${dm(dateKeyBrt(new Date(end)))})`, left < 0 ? 'late' : left === 0 ? 'today' : 'soon'));
  });
  if (!items.length) return answer('COACHES_COBRANCA', title, `Nenhum coach em atraso nem com plano ou teste vencendo nos próximos ${daysWord(p.dias)}.`, [], 0);
  const order = { late: 0, today: 1, soon: 2 } as any;
  items.sort((a, b) => order[a.tone || 'soon'] - order[b.tone || 'soon']);
  return answer('COACHES_COBRANCA', title, `${plural(items.length, 'coach', 'coaches')} em atraso ou com plano vencendo: ${joinNames(items.map((i) => `${i.name}, ${String(i.detail).split(' · ')[0]}`))}.`, items, items.length);
}

async function coachesAlunos(db: Db): Promise<Answer> {
  const coaches: any[] = await db.user.findMany(realCoaches({ id: true, name: true, coachPlan: true }, { accountStatus: 'ACTIVE', id: { notIn: MASTER_IDS } }));
  const title = 'Alunos por coach';
  if (!coaches.length) return answer('COACHES_ALUNOS', title, 'Ainda não há coaches parceiros ativos.', [], 0);
  const counts = await studentCounts(db);
  const rows = coaches.map((c) => ({ c, n: counts.get(c.id) || 0 })).sort((a, b) => b.n - a.n || String(a.c.name).localeCompare(String(b.c.name)));
  const zero = rows.filter((r) => r.n === 0);
  const items = rows.map((r) => coachItem(r.c, `${plural(r.n, 'aluno ativo', 'alunos ativos')} · plano ${planWord(r.c.coachPlan)}`, r.n === 0 ? 'late' : null));
  return answer('COACHES_ALUNOS', title, `${plural(coaches.length, 'coach ativo', 'coaches ativos')}. Mais alunos: ${joinNames(rows.slice(0, 3).map((r) => `${r.c.name || 'Coach'}, ${r.n}`), 3)}.${zero.length ? ` ${plural(zero.length, 'coach ainda sem nenhum aluno', 'coaches ainda sem nenhum aluno')}.` : ''}`, items, rows.length);
}

async function coachesNovos(db: Db, p: ReturnType<typeof cleanParams>, now: Date): Promise<Answer> {
  const since = new Date(now.getTime() - p.dias * DAY);
  const rows: any[] = await db.user.findMany(realCoaches({ id: true, name: true, coachPlan: true, accountStatus: true, createdAt: true }, { createdAt: { gte: since }, id: { notIn: MASTER_IDS } }));
  const title = `Coaches novos nos últimos ${daysWord(p.dias)}`;
  if (!rows.length) return answer('COACHES_NOVOS', title, `Nenhum coach novo nos últimos ${daysWord(p.dias)}.`, [], 0);
  rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const items = rows.map((c) => coachItem(c, `${c.accountStatus === 'PENDING_APPROVAL' ? 'aguardando aprovação' : c.accountStatus === 'REJECTED' ? 'recusado' : 'ativo'} · plano ${planWord(c.coachPlan)} · entrou ${whenWord(-ageDays(c.createdAt, now))}`, c.accountStatus === 'PENDING_APPROVAL' ? 'today' : 'soon'));
  return answer('COACHES_NOVOS', title, `${plural(rows.length, 'coach novo', 'coaches novos')} nos últimos ${daysWord(p.dias)}: ${joinNames(items.map((i) => i.name))}.`, items, rows.length);
}

async function coachesFundadores(db: Db, now: Date): Promise<Answer> {
  const st = await getPromoState(db, now);
  const founders: any[] = await db.user.findMany(realCoaches({ id: true, name: true, createdAt: true }, { isLaunchPromo: true }));
  const title = 'Vagas de Fundador';
  const items = founders.map((c) => coachItem(c, 'Fundador', null));
  return answer('COACHES_FUNDADORES', title, `${st.used} de ${st.max} vagas de Fundador usadas${st.reserved ? `, ${st.reserved} reservada${st.reserved === 1 ? '' : 's'}` : ''}. ${plural(st.available, 'vaga livre', 'vagas livres')}.`, items, items.length);
}

/** Resumo de UM coach (só master): situação da conta, plano, cobrança, alunos e recursos ligados. */
async function resumoCoach(db: Db, p: ReturnType<typeof cleanParams>, o: { todayKey: string; noFinance: boolean; targetId?: string | null }): Promise<Answer> {
  const coaches: any[] = await db.user.findMany(realCoaches({ id: true, name: true, email: true, accountStatus: true, coachPlan: true, coachBillingStatus: true, coachBillingEnd: true, isLaunchPromo: true, createdAt: true }));
  let target: any = null;
  if (o.targetId) target = coaches.find((c) => c.id === o.targetId) || null;
  else {
    if (!p.aluno_falado) return answer('RESUMO_COACH', 'Resumo do coach', 'De qual coach você quer o resumo? Diga o nome, por exemplo: resumo da coach Camila.', [], 0);
    const cands = matchStudents(p.aluno_falado, coaches.map((c) => ({ id: c.id, name: String(c.name || '') })));
    if (!cands.length) return answer('RESUMO_COACH', 'Resumo do coach', `Não encontrei nenhum coach chamado ${p.aluno_falado}.`, [], 0);
    const top = cands[0], tied = cands.filter((c) => c.score >= top.score - 0.0001);
    if (tied.length > 1) return answer('RESUMO_COACH', 'Qual coach?', `Encontrei mais de um coach com esse nome: ${joinNames(tied.map((c) => c.name))}. Toque no que você quer.`, tied.map((c) => ({ kind: 'student' as const, id: c.id, name: c.name, detail: 'toque para ver o resumo', tone: null })), tied.length, { ambiguous: tied.map((c) => ({ id: c.id, name: c.name })) });
    target = coaches.find((c) => c.id === top.id) || null;
  }
  if (!target) return answer('RESUMO_COACH', 'Resumo do coach', 'Não encontrei esse coach.', [], 0);
  const nm = target.name || 'Coach';
  const n = await db.user.count({ where: { role: 'USER', active: { not: false }, coachId: target.id, NOT: [{ isTestAccount: true }] } });
  let feats: string[] = [];
  try { const f: any[] = await db.coachFeature.findMany({ where: { coachId: target.id, revokedAt: null } }); feats = f.map((x) => String(x.feature)); } catch { /* tabela ainda não criada */ }
  const lines = [
    `Conta ${target.accountStatus === 'ACTIVE' ? 'ativa' : target.accountStatus === 'PENDING_APPROVAL' ? 'aguardando aprovação' : target.accountStatus === 'REJECTED' ? 'recusada' : String(target.accountStatus || '').toLowerCase()}, plano ${planWord(target.coachPlan)}${target.isLaunchPromo ? ', Fundador' : ''}.`,
    `${plural(n, 'aluno ativo', 'alunos ativos')}.`,
  ];
  if (!o.noFinance) {
    lines.push(`Mensalidade ${billingWord(target.coachBillingStatus)}${target.coachBillingEnd ? `, vai até ${dm(dateKeyBrt(new Date(target.coachBillingEnd)))}` : ''}.`);
  }
  if (feats.length) lines.push(`Recursos liberados: ${feats.join(', ')}.`);
  const items: Item[] = lines.map((l) => ({ kind: 'note' as const, id: target.id, name: nm, detail: l.replace(/\.$/, ''), tone: null as Item['tone'] }));
  return answer('RESUMO_COACH', `Resumo: ${nm}`, `${nm}. ${lines.join(' ')}`, items, items.length, { ambiguous: undefined });
}

/** Consultas que aceitam período (a tela oferece 7/15/30 dias) */
export const TAKES_DIAS: Intent[] = ['COBRANCA', 'SEM_TREINAR', 'TREINO_VENCENDO', 'NOVOS_ALUNOS', 'ANIVERSARIANTES', 'COACHES_COBRANCA', 'COACHES_NOVOS'];

export type RunOpts = { now?: Date; noFinance?: boolean; studentId?: string | null };

/** Roda a consulta escolhida. Nunca lança por causa de uma tabela ausente: devolve "indisponível". */
export async function runIntent(db: Db, coachId: string, intent: Intent | 'NENHUMA', rawParams: any, o: RunOpts = {}): Promise<Answer> {
  const now = o.now || new Date();
  const todayKey = dateKeyBrt(now);
  if (intent === 'NENHUMA' || !isIntent(intent)) return NOT_UNDERSTOOD;
  const p = cleanParams(intent, rawParams);
  if (isMasterIntent(intent) && !isMasterCoachId(coachId)) {
    return answer(intent, 'Só para o time master', 'Essas consultas sobre os coaches da plataforma ficam disponíveis só para o time master.', [], 0, { restricted: true });
  }
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
      case 'RESUMO_HOJE': return await resumoHoje(db, coachId, now, !!o.noFinance);
      case 'NOVOS_ALUNOS': return withParams(await novosAlunos(db, coachId, p, now));
      case 'ANIVERSARIANTES': return withParams(await aniversariantes(db, coachId, p, todayKey));
      case 'SEM_TREINO_MONTADO': return await semTreinoMontado(db, coachId);
      case 'DELOAD_CHOQUE': return await deloadChoque(db, coachId, now);
      case 'PAGAMENTOS_AGUARDANDO': return await pagamentosAguardando(db, coachId, now);
      case 'APARELHOS': return await aparelhos(db, coachId, now);
      case 'VIDEOS_AGUARDANDO': return await videosAguardando(db, coachId, now);
      case 'COMENTARIOS_EXERCICIO': return await comentariosExercicio(db, coachId, now);
      case 'CORRIDA_ATIVOS': return await corridaAtivos(db, coachId);
      case 'SEM_DIETA': return await semDieta(db, coachId);
      case 'DIETA_FEEDBACKS': return await dietaFeedbacks(db, coachId, now);
      case 'CHECKINS_AGUARDANDO': return await checkinsAguardando(db, coachId, now);
      case 'CHECKIN_ATRASADO': return await checkinAtrasado(db, coachId, todayKey);
      case 'TESTE_GRATIS': return await testeGratis(db, coachId, now);
      case 'COACHES_RESUMO': return await coachesResumo(db);
      case 'COACHES_PENDENTES': return await coachesPendentes(db, now);
      case 'COACHES_COBRANCA': return withParams(await coachesCobranca(db, p, now, todayKey));
      case 'COACHES_ALUNOS': return await coachesAlunos(db);
      case 'COACHES_NOVOS': return withParams(await coachesNovos(db, p, now));
      case 'COACHES_FUNDADORES': return await coachesFundadores(db, now);
      case 'RESUMO_COACH': return await resumoCoach(db, p, { todayKey, noFinance: !!o.noFinance, targetId: o.studentId });
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
  spoken: 'Ainda não sei responder essa pergunta. Toque numa categoria para ver o que eu consigo consultar sobre os seus alunos, ou abra Como fazer para dúvidas de uso do app.',
  items: [], total: 0,
};

// ─────────────────────────── roteador: pergunta -> consulta ───────────────────────────
export type Route = { intent: Intent | 'NENHUMA'; params: Params };

/** Sem IA: palavras-chave. Serve de rede de segurança (IA fora do ar) e deixa as perguntas mais comuns funcionarem sempre. */
export function ruleRoute(text: string, o: { master?: boolean } = {}): Route {
  const t = norm(text);
  const has = (re: RegExp) => re.test(t);
  const num = (() => { const m = t.match(/\b(\d{1,2})\s*(dias?|semanas?)\b/); if (!m) return undefined; const n = parseInt(m[1], 10); return /semana/.test(m[2]) ? n * 7 : n; })();
  const dias = num ?? (has(/\bsemana\b/) ? 7 : has(/\bmes\b/) ? 30 : undefined);
  // ── sobre os COACHES da plataforma (só o time master) ──
  if (o.master) {
    const aboutCoach = has(/\b(coach|coachs|coaches|treinador|treinadores|parceiros?)\b/);
    if (has(/\b(fundador|fundadores)\b/) || (aboutCoach && has(/\bvagas?\b/))) return { intent: 'COACHES_FUNDADORES', params: {} };
    const whoCoach = t.match(/(?:resumo|situacao|como (?:esta|anda|vai)|me (?:fala|conta|diz) (?:do|da|sobre))\s+(?:o |a |do |da |sobre o |sobre a )?(?:coach|treinador|treinadora)\s+([a-z]+(?:\s+[a-z]+)?)/);
    if (whoCoach && whoCoach[1]) return { intent: 'RESUMO_COACH', params: { aluno_falado: whoCoach[1].replace(/\b[a-z]/g, (c) => c.toUpperCase()) } };
    if (aboutCoach) {
      if (has(/aprovar|aprovacao|pendente|pendentes|cadastros?|solicitac/)) return { intent: 'COACHES_PENDENTES', params: {} };
      if (has(/atrasad|vencend|vencid|vence|inadimpl|devendo|cobranca|mensalidade|pagamento|teste gratis|cancelad/)) return { intent: 'COACHES_COBRANCA', params: { dias } };
      if (has(/\b(novos?|novas?|recentes?|entraram|cadastrou|cadastraram)\b/)) return { intent: 'COACHES_NOVOS', params: { dias } };
      if (has(/alunos|ranking|mais alunos|sem aluno/)) return { intent: 'COACHES_ALUNOS', params: {} };
      if (has(/quantos|visao geral|resumo|total|situacao/)) return { intent: 'COACHES_RESUMO', params: {} };
    }
  }
  // ── pagamentos que o aluno avisou ──
  if (has(/\b(disseram|informaram|avisaram|falaram) que pagaram\b|\bja paguei\b|\bconfirmar pagamentos?\b|\bpagamentos? (para|pra) confirmar\b/)) return { intent: 'PAGAMENTOS_AGUARDANDO', params: {} };
  // ── o dia de hoje ──
  if (has(/\bresumo do dia\b|\bo que (eu )?(tenho|preciso|falta) (para|pra)? ?(fazer )?hoje\b/) || (has(/\bhoje\b/) && has(/\bpendenc|\bo que tenho\b|\bo que preciso\b|\bo que falta\b/) && !has(/agenda|compromiss/))) return { intent: 'RESUMO_HOJE', params: {} };
  if (has(/\b(cobranca|cobrancas|mensalidade|mensalidades|pagamento|pagamentos|financeiro|plano|planos|vencimento|inadimpl|devendo|pagou|pagar|receber)\b/) && !has(/\btreino\b/)) {
    const situacao: Situacao = has(/atrasad|vencid|devendo|inadimpl|em atraso/) ? 'atrasada' : has(/\b(todas|todos)\b/) ? 'todas' : 'vencendo';
    return { intent: 'COBRANCA', params: { situacao, dias } };
  }
  if (has(/\baniversari/)) return { intent: 'ANIVERSARIANTES', params: { dias } };
  if (has(/\b(alunos? novos?|novos alunos|alunas? novas?|novas alunas|entraram|chegaram|se cadastraram)\b/)) return { intent: 'NOVOS_ALUNOS', params: { dias } };
  if (has(/\bsem (treino|ficha|planilha)\b|\bnao (tem|tm) (treino|ficha)\b|\btreino montado\b/)) return { intent: 'SEM_TREINO_MONTADO', params: {} };
  if (has(/\bdeload\b|\bchoque\b|\bmenstru/)) return { intent: 'DELOAD_CHOQUE', params: {} };
  if (has(/\baparelhos?\b|\bmaquinas? que (nao|n)\b/)) return { intent: 'APARELHOS', params: {} };
  if (has(/\bvideos?\b/)) return { intent: 'VIDEOS_AGUARDANDO', params: {} };
  if (has(/\bobservac(ao|oes)\b|\bcomentarios?\b/)) return { intent: 'COMENTARIOS_EXERCICIO', params: {} };
  if (has(/\bcorrida\b|\bcorredor|\bcorrendo\b/)) return { intent: 'CORRIDA_ATIVOS', params: {} };
  if (has(/\bfeedbacks? (de|da) dieta\b/)) return { intent: 'DIETA_FEEDBACKS', params: {} };
  if (has(/\bsem dieta\b|\bnao (tem|tm) dieta\b|\bdieta ativa\b/)) return { intent: 'SEM_DIETA', params: {} };
  if (has(/\bavaliac(ao|oes)\b|\bcheck ?in\b|\bfotos\b/)) return { intent: has(/atrasad|passou|vencid/) ? 'CHECKIN_ATRASADO' : 'CHECKINS_AGUARDANDO', params: {} };
  if (has(/\btestes? gratis\b|\blinks? de teste\b/)) return { intent: 'TESTE_GRATIS', params: {} };
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

const ROUTER_COACH_LINES = `- COACHES_RESUMO: visão geral dos coaches da plataforma (quantos, planos, alunos no total).
- COACHES_PENDENTES: cadastros de coach aguardando aprovação.
- COACHES_COBRANCA: coaches em atraso, cancelados ou com plano/teste grátis vencendo. dias = janela (padrão 7).
- COACHES_ALUNOS: quantos alunos cada coach tem; coaches sem aluno.
- COACHES_NOVOS: coaches que entraram há pouco. dias = janela (padrão 7).
- COACHES_FUNDADORES: vagas da promoção de Fundador (usadas, reservadas, livres).
- RESUMO_COACH: situação de UM coach (conta, plano, mensalidade, alunos, recursos). aluno_falado = o nome do coach como foi dito.`;

export const routerPrompt = (todayKey: string, master = false) => `Você ajuda um coach (personal trainer ou nutricionista) a CONSULTAR os dados do app dele por voz, em português do Brasil. O texto é a pergunta falada, transcrita. Chame a ferramenta ${ROUTER_TOOL} escolhendo UMA consulta pronta. Você não responde a pergunta: só escolhe a consulta e os parâmetros.

CONSULTAS
- RESUMO_HOJE: "o que tenho hoje", resumo do dia: agenda + todas as pendências da central HOJE.
- COBRANCA: mensalidade, plano financeiro, pagamento, cobrança, quem está devendo. situacao = "vencendo" (a vencer, padrão), "atrasada" (já venceu, devendo) ou "todas". dias = janela de "vencendo" (padrão 7; "esta semana" = 7; "este mês" = 30).
- PAGAMENTOS_AGUARDANDO: alunos que avisaram "já paguei" e esperam o coach confirmar.
- SEM_TREINAR: alunos que não treinam há um tempo ("sumidos", "parados", "faltando"). dias = quantos dias sem treinar (padrão 7).
- TREINO_VENCENDO: fichas/treinos que estão vencendo ou venceram (precisam renovar). dias = janela (padrão 7).
- SEM_TREINO_MONTADO: alunos que não têm nenhum treino ativo.
- FEEDBACKS: feedbacks da semana dos alunos aguardando resposta.
- TAREFAS: tarefas e pendências anotadas pelo próprio coach.
- AGENDA_HOJE: compromissos e atendimentos de hoje.
- TOTAL_ALUNOS: quantos alunos ativos o coach tem.
- NOVOS_ALUNOS: alunos que entraram há pouco. dias = janela (padrão 7).
- ANIVERSARIANTES: aniversários dos alunos. dias = janela (padrão 7).
- DELOAD_CHOQUE: alunos em deload, semana de choque ou deload menstrual.
- APARELHOS: alunos que avisaram que NÃO TÊM um aparelho/exercício.
- VIDEOS_AGUARDANDO: vídeos de execução enviados pelos alunos esperando o coach.
- COMENTARIOS_EXERCICIO: observações/comentários de exercício dos alunos sem resposta.
- CORRIDA_ATIVOS: alunos com protocolo de corrida ativo.
- SEM_DIETA: alunos com módulo de dieta e sem dieta ativa.
- DIETA_FEEDBACKS: feedbacks de dieta dos alunos ainda não lidos.
- CHECKINS_AGUARDANDO: avaliações/check-ins (fotos) enviados que esperam o retorno do coach.
- CHECKIN_ATRASADO: alunos com a avaliação/check-in atrasada.
- TESTE_GRATIS: links de teste grátis (abriram, concluíram).
- RESUMO_ALUNO: situação de UM aluno (último treino, treino, cobrança, anotações). aluno_falado = o nome como foi dito.
${master ? ROUTER_COACH_LINES + '\n' : ''}- NENHUMA: a pergunta não cabe em nenhuma consulta acima, ou não é uma pergunta sobre os dados (ex.: "como faço X no app" não é consulta).
Hoje é ${todayKey}. Ignore hesitações ("é", "né", "tipo"). Nunca invente consulta nova.`;

/** A ferramenta que a IA usa: só lista as consultas de coaches quando quem pergunta é do time master. */
export const routerToolDef = (master = false): any => ({
  name: ROUTER_TOOL,
  description: 'Escolhe a consulta pronta que responde à pergunta do coach.',
  input_schema: {
    type: 'object',
    properties: {
      consulta: { type: 'string', enum: [...INTENTS.filter((i) => master || !isMasterIntent(i)), 'NENHUMA'] },
      situacao: { type: ['string', 'null'], enum: ['vencendo', 'atrasada', 'todas', null], description: 'Só para COBRANCA.' },
      dias: { type: ['integer', 'null'], description: 'Janela em dias (1 a 90), quando a pergunta cita um período.' },
      aluno_falado: { type: ['string', 'null'], description: 'Só para RESUMO_ALUNO / RESUMO_COACH: o nome como foi dito.' },
    },
    required: ['consulta'],
  },
});
export const ROUTER_TOOL_DEF: any = routerToolDef(true);

export type RouterUsage = { model: string; inputTokens: number; outputTokens: number; ms: number };

/** Uma chamada. Lança erro se a IA não estiver configurada/recusar: quem chama cai no `ruleRoute`. */
export async function aiRoute(text: string, todayKey: string, o: { client?: any; master?: boolean } = {}): Promise<{ route: Route; usage: RouterUsage }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!o.client && !apiKey) throw new Error('ANTHROPIC_API_KEY não configurada no servidor.');
  const client = o.client || new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  const t0 = Date.now();
  const resp: any = await client.messages.create({
    model: ROUTER_MODEL, max_tokens: 300, system: routerPrompt(todayKey, !!o.master), tools: [routerToolDef(!!o.master)], tool_choice: { type: 'tool', name: ROUTER_TOOL },
    output_config: { effort: 'low' }, messages: [{ role: 'user', content: text }],
  });
  if (resp?.stop_reason === 'refusal') throw new Error('A IA recusou interpretar esse texto.');
  const block = (resp?.content || []).find((b: any) => b.type === 'tool_use' && b.name === ROUTER_TOOL);
  if (!block?.input) throw new Error('A IA não devolveu a consulta.');
  const i = block.input;
  const intent = isIntent(i.consulta) && (o.master || !isMasterIntent(i.consulta)) ? i.consulta : 'NENHUMA';
  return { route: { intent, params: { situacao: i.situacao, dias: i.dias, aluno_falado: i.aluno_falado } as any }, usage: { model: ROUTER_MODEL, inputTokens: resp?.usage?.input_tokens ?? 0, outputTokens: resp?.usage?.output_tokens ?? 0, ms: Date.now() - t0 } };
}

