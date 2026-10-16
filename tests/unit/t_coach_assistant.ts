import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as A from '/home/user/fitos-final/lib/coachAssistant';
import { dateKeyBrt, addDaysKey } from '/home/user/fitos-final/lib/agenda';
import { POST as PERGUNTAR } from '/home/user/fitos-final/app/api/coach-assistant/perguntar/route';
import { POST as RAPIDA } from '/home/user/fitos-final/app/api/coach-assistant/rapida/route';
import { POST as TRANSCREVER } from '/home/user/fitos-final/app/api/coach-notes/transcrever/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state; const G: any = globalThis;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, body: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { method: 'POST', body: JSON.stringify(body), headers }), {});
  return { status: r.status, json: await r.json().catch(() => null) };
};
process.env.ANTHROPIC_API_KEY = 'k';
const cA = tok('cA'), cB = tok('cB');
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); G.__LLM = undefined; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n        ') : e)); } };

const NOW = new Date('2026-10-13T15:00:00Z');           // terça, 12:00 em Brasília
const TODAY = dateKeyBrt(NOW);                           // 2026-10-13
const at = (key: string) => new Date(key + 'T12:00:00-03:00');
const rel = (n: number) => at(addDaysKey(TODAY, n));
const seed = () => {
  const u = (o: any) => S.user.push({ role: 'USER', active: true, isTestAccount: false, coachId: null, nutritionistId: null, accountStatus: 'ACTIVE', isFinanceActive: true, contractValue: 0, paymentDueDate: null, ...o });
  u({ id: 'cA', role: 'COACH', name: 'Coach A' }); u({ id: 'cB', role: 'COACH', name: 'Coach B' });
  u({ id: 'a1', name: 'Ana Souza', coachId: 'cA', contractValue: 200, paymentDueDate: rel(1) });
  u({ id: 'a2', name: 'Bruno Lima', coachId: 'cA', contractValue: 150, paymentDueDate: rel(7) });
  u({ id: 'a3', name: 'Carla Dias', coachId: 'cA', contractValue: 150, paymentDueDate: rel(8) });
  u({ id: 'a4', name: 'Daniel Rocha', coachId: 'cA', contractValue: 300, paymentDueDate: rel(-3) });
  u({ id: 'a5', name: 'Eduardo Melo', coachId: 'cA', contractValue: 100, paymentDueDate: rel(2), isFinanceActive: false });
  u({ id: 'a6', name: 'Fabiana Reis', coachId: 'cA', contractValue: 0, paymentDueDate: rel(2) });
  u({ id: 'a7', name: 'Samuel Silva', coachId: 'cA' }); u({ id: 'a8', name: 'Samuel Costa', coachId: 'cA' });
  u({ id: 'aT', name: 'Teste Conta', coachId: 'cA', isTestAccount: true, contractValue: 100, paymentDueDate: rel(1) });
  u({ id: 'b1', name: 'Aluno do B', coachId: 'cB', contractValue: 100, paymentDueDate: rel(1) });
  S.offlineClient.push({ id: 'o1', name: 'Gil Cliente', coachId: 'cA', isFinanceActive: true, contractValue: 120, paymentDueDate: rel(2) });
  for (const c of ['cA', 'cB']) S.coachFeature.push({ id: 'cf' + c, coachId: c, feature: 'perguntasVoz', reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null });
};
const students = (r: A.Answer) => r.items.map((i) => i.name);

(async () => {
  await t('cobrança vencendo (7 dias): só do coach, só ativos com valor e vencimento, em ordem; atrasadas viram aviso; clientes do financeiro entram', async () => {
    seed(); const r = await A.runIntent(P, 'cA', 'COBRANCA', { situacao: 'vencendo', dias: 7 }, { now: NOW });
    assert.deepStrictEqual(students(r), ['Ana Souza', 'Gil Cliente', 'Bruno Lima'], 'sem conta de teste, sem outro coach, sem cobrança desligada ou sem valor, sem o dia 8');
    assert.strictEqual(r.total, 3); assert.deepStrictEqual(r.items.map((i) => i.kind), ['student', 'offline', 'student']);
    assert.ok(/3 pessoas com cobrança vencendo nos próximos 7 dias/.test(r.spoken) && /Ana, vence amanhã/.test(r.spoken) && /Gil, vence em 2 dias/.test(r.spoken) && /Bruno, vence em 7 dias/.test(r.spoken), r.spoken);
    assert.ok(/1 está atrasada/.test(r.spoken)); assert.strictEqual(r.items[0].tone, 'soon'); assert.ok(/vence amanhã \(14\/10\) · R\$ 200/.test(r.items[0].detail!), r.items[0].detail || '');
    assert.strictEqual(r.items[0].amount, 200); assert.strictEqual(r.intent, 'COBRANCA'); assert.ok(!r.restricted);
  });
  await t('cobrança: janela menor, atrasadas, "todas" e ninguém vencendo (avisa dos atrasados)', async () => {
    seed(); const run = (p: any) => A.runIntent(P, 'cA', 'COBRANCA', p, { now: NOW });
    assert.deepStrictEqual(students(await run({ situacao: 'vencendo', dias: 1 })), ['Ana Souza']);
    const late = await run({ situacao: 'atrasada' }); assert.deepStrictEqual(students(late), ['Daniel Rocha']); assert.strictEqual(late.items[0].tone, 'late'); assert.ok(/venceu há 3 dias/.test(late.items[0].detail!) && /Daniel, venceu há 3 dias/.test(late.spoken));
    const all = await run({ situacao: 'todas', dias: 3 }); assert.deepStrictEqual(students(all), ['Daniel Rocha', 'Ana Souza', 'Gil Cliente']); assert.ok(/1 atrasada e 2 vencendo/.test(all.spoken), all.spoken);
    S.user.push({ id: 'h0', role: 'USER', active: true, isTestAccount: false, coachId: 'cA', name: 'Helena Hoje', isFinanceActive: true, contractValue: 90, paymentDueDate: rel(0) });
    assert.deepStrictEqual(students(await run({ situacao: 'atrasada' })), ['Daniel Rocha'], 'vence HOJE não é atrasada'); const hoje = await run({ situacao: 'vencendo', dias: 1 }); assert.deepStrictEqual(students(hoje), ['Helena Hoje', 'Ana Souza']); assert.ok(/Helena, vence hoje/.test(hoje.spoken) && hoje.items[0].tone === 'today', hoje.spoken); S.user.splice(S.user.findIndex((u: any) => u.id === 'h0'), 1);
    S.user.forEach((u: any) => { if (u.coachId === 'cA') u.paymentDueDate = rel(30); }); S.user.find((u: any) => u.id === 'a4').paymentDueDate = rel(-1); S.offlineClient.length = 0;
    const none = await run({ situacao: 'vencendo', dias: 7 }); assert.strictEqual(none.total, 1); assert.strictEqual(none.title, 'Cobranças atrasadas'); assert.ok(/Ninguém tem cobrança vencendo/.test(none.spoken) && /1 pessoa está com cobrança atrasada/.test(none.spoken), none.spoken); assert.deepStrictEqual(students(none), ['Daniel Rocha']);
    S.user.find((u: any) => u.id === 'a4').paymentDueDate = rel(30); const zero = await run({ situacao: 'atrasada' }); assert.strictEqual(zero.spoken, 'Ninguém está com cobrança atrasada.');
  });
  await t('no iPhone (noFinance) a cobrança NÃO é consultada: resposta de restrição sem tocar no banco; o resumo do aluno também some a cobrança', async () => {
    seed(); S.calls = {}; const r = await A.runIntent(P, 'cA', 'COBRANCA', { situacao: 'vencendo' }, { now: NOW, noFinance: true });
    assert.strictEqual(r.restricted, true); assert.strictEqual(r.total, 0); assert.ok(/versão web e no Android/.test(r.spoken)); assert.deepStrictEqual(S.calls, {}, 'nenhuma consulta ao banco');
    const resumo = await A.runIntent(P, 'cA', 'RESUMO_ALUNO', { aluno_falado: 'Ana' }, { now: NOW, noFinance: true }); assert.ok(!/cobrança/i.test(resumo.spoken + resumo.items.map((i) => i.detail).join(' ')), resumo.spoken);
    const com = await A.runIntent(P, 'cA', 'RESUMO_ALUNO', { aluno_falado: 'Ana' }, { now: NOW }); assert.ok(/A cobrança vence amanhã/.test(com.spoken), com.spoken);
  });
  await t('sem treinar: só alunos COM treino ativo; usa o último treino finalizado; "nunca treinou"; ordem do mais sumido', async () => {
    seed(); const w = (uid: string, o: any = {}) => S.workout.push({ id: 'w' + uid, userId: uid, archived: false, endDate: null, createdAt: rel(-60), ...o });
    ['a1', 'a2', 'a3', 'a4', 'a7'].forEach((id) => w(id)); w('a8', { archived: true });
    const h = (uid: string, n: number) => S.workoutHistory.push({ id: 'h' + uid + n, userId: uid, date: rel(-n), name: 'A' });
    h('a1', 2); h('a2', 10); h('a2', 30); h('a3', 20); h('a4', 7);
    const r = await A.runIntent(P, 'cA', 'SEM_TREINAR', { dias: 7 }, { now: NOW });
    assert.deepStrictEqual(students(r), ['Samuel Silva', 'Carla Dias', 'Bruno Lima', 'Daniel Rocha'], 'nunca treinou primeiro, depois 20, 10 e 7 dias; Ana (2 dias) e Samuel Costa (treino arquivado) fora');
    assert.deepStrictEqual(r.items.map((i) => i.detail), ['ainda não finalizou nenhum treino', 'último treino há 20 dias', 'último treino há 10 dias', 'último treino há 7 dias']);
    assert.ok(/4 alunos sem treinar há 7 dias ou mais: Samuel, nunca treinou, Carla, 20 dias/.test(r.spoken), r.spoken);
    assert.strictEqual((await A.runIntent(P, 'cA', 'SEM_TREINAR', { dias: 15 }, { now: NOW })).total, 2); assert.strictEqual((await A.runIntent(P, 'cA', 'SEM_TREINAR', { dias: 1 }, { now: NOW })).items.length >= 4, true, 'mínimo de 2 dias (1 vira 2)');
    S.workoutHistory.length = 0; ['a1', 'a2', 'a3', 'a4', 'a7'].forEach((id) => h(id, 1)); assert.ok(/Todo mundo com treino ativo treinou/.test((await A.runIntent(P, 'cA', 'SEM_TREINAR', { dias: 7 }, { now: NOW })).spoken));
  });
  await t('treino vencendo: o treino mais novo de cada aluno; vencidos entram; fora da janela não', async () => {
    seed(); S.workout.push({ id: 'w1', userId: 'a1', archived: false, endDate: rel(2), createdAt: rel(-10) }, { id: 'w1b', userId: 'a1', archived: false, endDate: rel(-30), createdAt: rel(-90) }, { id: 'w2', userId: 'a2', archived: false, endDate: rel(-5), createdAt: rel(-40) }, { id: 'w3', userId: 'a3', archived: false, endDate: rel(20), createdAt: rel(-5) }, { id: 'w4', userId: 'a4', archived: false, endDate: null, createdAt: rel(-5) }, { id: 'w9', userId: 'b1', archived: false, endDate: rel(1), createdAt: rel(-5) });
    const r = await A.runIntent(P, 'cA', 'TREINO_VENCENDO', { dias: 7 }, { now: NOW });
    assert.deepStrictEqual(students(r), ['Bruno Lima', 'Ana Souza'], 'vencido há 5 dias primeiro; Ana vence em 2 (o treino antigo vencido dela não conta); Carla (20 dias), Daniel (sem data) e o aluno do outro coach fora');
    assert.deepStrictEqual(r.items.map((i) => i.tone), ['late', 'soon']); assert.ok(/2 treinos vencendo ou vencidos, 1 já vencido: Bruno, venceu há 5 dias e Ana, vence em 2 dias/.test(r.spoken), r.spoken);
  });
  await t('feedbacks aguardando, tarefas abertas, agenda de hoje e total de alunos', async () => {
    seed(); S.weeklyFeedback.push({ id: 'f1', userId: 'a1', createdAt: rel(-3), coachSeenAt: null, coachReplyAt: null }, { id: 'f2', userId: 'a2', createdAt: NOW, coachSeenAt: null, coachReplyAt: null }, { id: 'f3', userId: 'a3', createdAt: rel(-1), coachSeenAt: new Date(), coachReplyAt: null }, { id: 'f4', userId: 'b1', createdAt: rel(-1), coachSeenAt: null, coachReplyAt: null });
    const f = await A.runIntent(P, 'cA', 'FEEDBACKS', {}, { now: NOW }); assert.deepStrictEqual(students(f), ['Ana Souza', 'Bruno Lima']); assert.ok(/2 feedbacks da semana aguardando você: Ana e Bruno/.test(f.spoken), f.spoken); assert.strictEqual(f.items[0].tone, 'late');
    S.coachNote.push({ id: 'n1', coachId: 'cA', studentId: 'a7', studentName: 'Samuel Silva', kind: 'TAREFA', tag: 'DOR', body: 'Dor no joelho no leg press', status: 'OPEN', dueDate: TODAY, createdAt: rel(-1) }, { id: 'n2', coachId: 'cA', studentId: null, studentName: null, kind: 'TAREFA', tag: 'OUTRO', body: 'Comprar fita métrica', status: 'OPEN', dueDate: addDaysKey(TODAY, 5), createdAt: rel(-1) }, { id: 'n3', coachId: 'cA', studentId: 'a7', studentName: 'Samuel Silva', kind: 'NOTA', tag: 'TREINO', body: 'só registro', status: 'INFO', dueDate: null, createdAt: rel(-1) }, { id: 'n4', coachId: 'cB', studentId: null, studentName: null, kind: 'TAREFA', tag: 'OUTRO', body: 'do outro coach', status: 'OPEN', dueDate: null, createdAt: rel(-1) }, { id: 'n5', coachId: 'cA', studentId: 'a7', studentName: 'Samuel Silva', kind: 'TAREFA', tag: 'OUTRO', body: 'já feita', status: 'DONE', dueDate: null, createdAt: rel(-1) });
    const tf = await A.runIntent(P, 'cA', 'TAREFAS', {}, { now: NOW }); assert.strictEqual(tf.total, 2); assert.ok(/2 tarefas abertas, 1 para hoje ou atrasada/.test(tf.spoken) && /Samuel: Dor no joelho/.test(tf.spoken), tf.spoken); assert.strictEqual(tf.items[0].name, 'Samuel Silva'); assert.strictEqual(tf.items[1].name, 'Sem aluno');
    S.agendaEvent.push({ id: 'e1', coachId: 'cA', kind: 'PRESENCIAL', status: 'SCHEDULED', studentId: 'a1', offlineClientId: null, title: null, startsAt: new Date(TODAY + 'T09:30:00-03:00'), endsAt: new Date(TODAY + 'T10:30:00-03:00') }, { id: 'e2', coachId: 'cA', kind: 'VIDEO', status: 'SCHEDULED', studentId: 'a2', offlineClientId: null, title: null, startsAt: new Date(TODAY + 'T14:00:00-03:00'), endsAt: new Date(TODAY + 'T15:00:00-03:00') }, { id: 'e3', coachId: 'cA', kind: 'VIDEO', status: 'CANCELLED', studentId: 'a3', offlineClientId: null, title: null, startsAt: new Date(TODAY + 'T16:00:00-03:00'), endsAt: new Date(TODAY + 'T17:00:00-03:00') }, { id: 'e4', coachId: 'cA', kind: 'VIDEO', status: 'SCHEDULED', studentId: 'a3', offlineClientId: null, title: null, startsAt: new Date(addDaysKey(TODAY, 1) + 'T10:00:00-03:00'), endsAt: new Date(addDaysKey(TODAY, 1) + 'T11:00:00-03:00') });
    const ag = await A.runIntent(P, 'cA', 'AGENDA_HOJE', {}, { now: NOW }); assert.deepStrictEqual(students(ag), ['Ana Souza', 'Bruno Lima']); assert.ok(/2 compromissos hoje: Ana Souza às 9h30 e Bruno Lima às 14h/.test(ag.spoken), ag.spoken); assert.ok(/^09:30 · /.test(ag.items[0].detail!));
    const tot = await A.runIntent(P, 'cA', 'TOTAL_ALUNOS', {}, { now: NOW }); assert.ok(/Você tem 8 alunos ativos/.test(tot.spoken), tot.spoken);
  });
  await t('resumo de um aluno: um só, ambíguo (dois Samuel), inexistente, sem nome e seguimento por id (só da carteira)', async () => {
    seed(); S.workout.push({ id: 'w7', userId: 'a7', archived: false, endDate: rel(3), createdAt: rel(-9) }); S.workoutHistory.push({ id: 'h7', userId: 'a7', date: rel(-4), name: 'A' });
    S.coachNote.push({ id: 'n1', coachId: 'cA', studentId: 'a7', studentName: 'Samuel Silva', kind: 'TAREFA', tag: 'DOR', body: 'Dor no joelho', status: 'OPEN', dueDate: null, createdAt: rel(-1) }, { id: 'n2', coachId: 'cA', studentId: 'a7', studentName: 'Samuel Silva', kind: 'NOTA', tag: 'TREINO', body: 'Pediu mais braço', status: 'INFO', dueDate: null, createdAt: rel(-3) });
    const one = await A.runIntent(P, 'cA', 'RESUMO_ALUNO', { aluno_falado: 'Samuel Silva' }, { now: NOW }); assert.strictEqual(one.title, 'Resumo: Samuel Silva');
    assert.ok(/Último treino finalizado há 4 dias/.test(one.spoken) && /O treino vence em 3 dias/.test(one.spoken) && /1 tarefa aberta sobre ele/.test(one.spoken) && /Última anotação: Dor no joelho/.test(one.spoken), one.spoken);
    assert.ok(one.items.some((i) => i.kind === 'note' && /Pediu mais braço/.test(i.detail!)));
    const amb = await A.runIntent(P, 'cA', 'RESUMO_ALUNO', { aluno_falado: 'Samuel' }, { now: NOW }); assert.ok(amb.ambiguous && amb.ambiguous.length === 2 && /mais de um aluno/.test(amb.spoken), amb.spoken); assert.deepStrictEqual(amb.items.map((i) => i.id).sort(), ['a7', 'a8']);
    const none = await A.runIntent(P, 'cA', 'RESUMO_ALUNO', { aluno_falado: 'Zuleica' }, { now: NOW }); assert.ok(/Não encontrei nenhum aluno chamado Zuleica/.test(none.spoken));
    const noname = await A.runIntent(P, 'cA', 'RESUMO_ALUNO', {}, { now: NOW }); assert.ok(/De qual aluno/.test(noname.spoken));
    const byId = await A.runIntent(P, 'cA', 'RESUMO_ALUNO', {}, { now: NOW, studentId: 'a8' }); assert.strictEqual(byId.title, 'Resumo: Samuel Costa'); assert.ok(/Ainda não finalizou nenhum treino/.test(byId.spoken) && /Não tem treino ativo/.test(byId.spoken));
    const other = await A.runIntent(P, 'cA', 'RESUMO_ALUNO', {}, { now: NOW, studentId: 'b1' }); assert.ok(/Não encontrei esse aluno entre os seus/.test(other.spoken), 'aluno de outro coach não vaza por id');
  });
  await t('roteador por palavras-chave: as perguntas mais comuns, sem IA', () => {
    const r = (s: string) => A.ruleRoute(s);
    assert.deepStrictEqual(r('Quais alunos estão com o plano financeiro vencendo?'), { intent: 'COBRANCA', params: { situacao: 'vencendo', dias: undefined } });
    assert.strictEqual(r('quem está devendo mensalidade').params.situacao, 'atrasada'); assert.strictEqual(r('cobranças atrasadas').params.situacao, 'atrasada'); assert.strictEqual(r('todas as cobranças em aberto').params.situacao, 'todas'); assert.strictEqual(r('quem vai pagar essa semana?').params.dias, 7); assert.strictEqual(r('pagamentos dos próximos 15 dias').params.dias, 15);
    assert.deepStrictEqual(r('quem não treina há 10 dias?'), { intent: 'SEM_TREINAR', params: { dias: 10 } }); assert.strictEqual(r('quais alunos sumiram').intent, 'SEM_TREINAR'); assert.strictEqual(r('quem não treinou essa semana').params.dias, 7);
    assert.strictEqual(r('quais treinos estão vencendo?').intent, 'TREINO_VENCENDO', '"treino vencendo" não é cobrança'); assert.strictEqual(r('o plano de treino do pessoal vence quando').intent, 'TREINO_VENCENDO');
    assert.strictEqual(r('tenho algum feedback pendente?').intent, 'FEEDBACKS'); assert.strictEqual(r('o que tem na minha agenda hoje').intent, 'AGENDA_HOJE'); assert.strictEqual(r('quais são minhas tarefas').intent, 'TAREFAS'); assert.strictEqual(r('quantos alunos eu tenho').intent, 'TOTAL_ALUNOS');
    assert.deepStrictEqual(r('resumo do Samuel'), { intent: 'RESUMO_ALUNO', params: { aluno_falado: 'Samuel' } }); assert.strictEqual(r('como está a Ana Paula').params.aluno_falado, 'Ana Paula'); assert.strictEqual(r('o que eu anotei sobre o Bruno').params.aluno_falado, 'Bruno');
    assert.strictEqual(r('qual a capital da França').intent, 'NENHUMA'); assert.strictEqual(r('').intent, 'NENHUMA');
  });
  await t('parece pergunta? (o app sugere o modo Perguntar; o coach sempre pode trocar)', () => {
    for (const s of ['Quais alunos estão com o plano vencendo?', 'quem não treinou essa semana', 'me diz quantos alunos eu tenho', 'Quantos alunos ativos', 'mostra as cobranças', 'resumo do Samuel', 'alguém sem treinar?', 'tem algum feedback']) assert.strictEqual(A.looksLikeQuestion(s), true, s);
    for (const s of ['o Samuel sentiu as costas no agachamento Smith', 'a Mariana pediu para mudar o treino', 'lembrar de ligar para a Ana amanhã', '', '   ']) assert.strictEqual(A.looksLikeQuestion(s), false, s);
  });
  await t('parâmetros limpos: dias entre 1 e 90 (sem treinar: mínimo 2), situação válida, nome curto; lixo cai no padrão', () => {
    const c = (i: A.Intent, p: any) => A.cleanParams(i, p);
    assert.deepStrictEqual(c('COBRANCA', {}), { dias: 7, situacao: 'vencendo', aluno_falado: null }); assert.strictEqual(c('COBRANCA', { dias: 500 }).dias, 90); assert.strictEqual(c('COBRANCA', { dias: -3 }).dias, 1); assert.strictEqual(c('COBRANCA', { dias: 'abc' }).dias, 7); assert.strictEqual(c('SEM_TREINAR', { dias: 1 }).dias, 2);
    assert.strictEqual(c('COBRANCA', { situacao: 'xyz' }).situacao, 'vencendo'); assert.strictEqual(c('COBRANCA', { situacao: 'atrasada' }).situacao, 'atrasada'); assert.strictEqual(c('RESUMO_ALUNO', { aluno_falado: '  Ana  ' }).aluno_falado, 'Ana'); assert.strictEqual(c('RESUMO_ALUNO', { aluno_falado: 'x'.repeat(300) }).aluno_falado!.length, 80); assert.strictEqual(c('RESUMO_ALUNO', { aluno_falado: 5 }).aluno_falado, null);
  });
  await t('texto falável: lista de nomes, plural, "quando"', () => {
    assert.strictEqual(A.joinNames(['Ana']), 'Ana'); assert.strictEqual(A.joinNames(['Ana', 'Bruno']), 'Ana e Bruno'); assert.strictEqual(A.joinNames(['A', 'B', 'C']), 'A, B e C'); assert.strictEqual(A.joinNames(['A', 'B', 'C', 'D', 'E', 'F', 'G']), 'A, B, C, D, E e mais 2');
    assert.deepStrictEqual([0, 1, -1, 3, -4].map(A.whenWord), ['hoje', 'amanhã', 'ontem', 'em 3 dias', 'há 4 dias']); assert.deepStrictEqual([A.hourWord('09:30'), A.hourWord('14:00'), A.hourWord('00:05')], ['9h30', '14h', '0h05']); assert.strictEqual(A.plural(1, 'aluno', 'alunos'), '1 aluno');
  });
  await t('IA roteadora: escolhe a consulta (ferramenta forçada); consulta inválida vira NENHUMA; recusa/falha lança para cair nas palavras-chave', async () => {
    let seen: any = null; const client = (resp: any) => ({ messages: { create: async (a: any) => { seen = a; if (resp instanceof Error) throw resp; return resp; } } });
    const ok1 = await A.aiRoute('quais alunos estão com o plano vencendo', TODAY, { client: client({ content: [{ type: 'tool_use', name: 'escolher_consulta', input: { consulta: 'COBRANCA', situacao: 'vencendo', dias: 7 } }], usage: { input_tokens: 400, output_tokens: 30 } }) });
    assert.deepStrictEqual(ok1.route, { intent: 'COBRANCA', params: { situacao: 'vencendo', dias: 7, aluno_falado: undefined } }); assert.strictEqual(ok1.usage.inputTokens, 400);
    assert.strictEqual(seen.model, 'claude-haiku-5-5'); assert.deepStrictEqual(seen.tool_choice, { type: 'tool', name: 'escolher_consulta' }); assert.ok(seen.tools[0].input_schema.properties.consulta.enum.includes('RESUMO_ALUNO') && seen.tools[0].input_schema.properties.consulta.enum.includes('NENHUMA')); assert.ok(!('temperature' in seen) && seen.output_config.effort === 'low'); assert.ok(seen.system.includes(TODAY), 'a IA sabe a data de hoje'); assert.strictEqual(seen.messages[0].content, 'quais alunos estão com o plano vencendo');
    assert.strictEqual((await A.aiRoute('x', TODAY, { client: client({ content: [{ type: 'tool_use', name: 'escolher_consulta', input: { consulta: 'APAGAR_TUDO' } }] }) })).route.intent, 'NENHUMA');
    await assert.rejects(A.aiRoute('x', TODAY, { client: client({ stop_reason: 'refusal', content: [] }) }), /recusou/); await assert.rejects(A.aiRoute('x', TODAY, { client: client({ content: [{ type: 'text', text: 'oi' }] }) }), /não devolveu/); await assert.rejects(A.aiRoute('x', TODAY, { client: client(new Error('timeout')) }), /timeout/);
    const k = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; await assert.rejects(A.aiRoute('x', TODAY), /ANTHROPIC_API_KEY/); process.env.ANTHROPIC_API_KEY = k;
  });
  await t('rota: pergunta falada -> consulta pela IA -> resposta; segurança (sem login, aluno, coach sem a chave); pergunta curta/longa', async () => {
    seed(); const url = '/api/coach-assistant/perguntar';
    G.__LLM = async () => ({ content: [{ type: 'tool_use', name: 'escolher_consulta', input: { consulta: 'COBRANCA', situacao: 'vencendo', dias: 7 } }] });
    const r = await call(PERGUNTAR, url, cA, { text: 'Quais alunos estão com o plano financeiro vencendo?' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.ai, true); assert.strictEqual(r.json.answer.intent, 'COBRANCA'); assert.ok(r.json.answer.total >= 1 && /vencendo/.test(r.json.answer.title) || r.json.answer.intent === 'COBRANCA');
    assert.ok(r.json.answer.items.every((i: any) => ['Ana Souza', 'Gil Cliente', 'Bruno Lima'].includes(i.name)), 'só da carteira do cA');
    assert.strictEqual((await call(PERGUNTAR, url, null, { text: 'quais alunos' })).status, 401); assert.strictEqual((await call(PERGUNTAR, url, tok('a1', 'USER'), { text: 'quais alunos' })).status, 403);
    S.coachFeature.length = 0; assert.strictEqual((await call(PERGUNTAR, url, cA, { text: 'quais alunos estão devendo' })).status, 403, 'sem a chave do recurso');
    seed(); assert.strictEqual((await call(PERGUNTAR, url, tok('cC'), { text: 'quais alunos estão devendo' })).status >= 400, true);
    assert.strictEqual((await call(PERGUNTAR, url, cA, { text: 'a' })).status, 400); assert.strictEqual((await call(PERGUNTAR, url, cA, { text: 'x'.repeat(401) })).status, 400); assert.strictEqual((await call(PERGUNTAR, url, cA, {})).status, 400);
  });
  await t('chave perguntasVoz: só quem tem a chave (ou o master) faz pergunta LIVRE; só ter notasVoz não basta; fundador não ganha sozinho', async () => {
    seed(); const url = '/api/coach-assistant/perguntar'; G.__LLM = async () => ({ content: [{ type: 'tool_use', name: 'escolher_consulta', input: { consulta: 'TOTAL_ALUNOS' } }] });
    S.coachFeature.length = 0; S.coachFeature.push({ id: 'n1', coachId: 'cA', feature: 'notasVoz', reason: 'FUNDADOR', grantedAt: new Date(), revokedAt: null, revokedReason: null });
    const r1 = await call(PERGUNTAR, url, cA, { text: 'quantos alunos eu tenho' }); assert.strictEqual(r1.status, 403); assert.strictEqual(r1.json.locked, true, 'só notasVoz não libera a pergunta livre');
    S.coachFeature.push({ id: 'p1', coachId: 'cA', feature: 'perguntasVoz', reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null });
    assert.strictEqual((await call(PERGUNTAR, url, cA, { text: 'quantos alunos eu tenho' })).status, 200, 'com a chave libera');
    S.coachFeature.find((f: any) => f.id === 'p1').revokedAt = new Date(); assert.strictEqual((await call(PERGUNTAR, url, cA, { text: 'quantos alunos eu tenho' })).status, 403, 'revogada');
    S.coachFeature.length = 0; S.user.push({ id: PAULO_ID, role: 'COACH', name: 'Paulo', accountStatus: 'ACTIVE', active: true, coachId: null });
    assert.strictEqual((await call(PERGUNTAR, url, tok(PAULO_ID), { text: 'quantos alunos eu tenho' })).status, 200, 'master sempre pode');
    const F = await import('/home/user/fitos-final/lib/coachFeatures'); S.coachFeature.length = 0;
    assert.deepStrictEqual(await F.grantFounderFeatures(P, 'cA'), ['execVideo', 'notasVoz'], 'fundador recebe as outras chaves, nunca a de perguntas livres'); assert.ok(!S.coachFeature.some((f: any) => f.feature === 'perguntasVoz'));
    const m = await F.resolveCoachFeatures(P, 'cA', { isMaster: true }); assert.strictEqual(m.perguntasVoz.on, true);
    const g = await F.resolveCoachFeatures(P, 'cB'); assert.strictEqual(g.perguntasVoz.on, false);
  });
  await t('perguntas rápidas (sem IA): qualquer coach ativo, mesmo sem chave nenhuma; só da carteira; sem chamar a IA; entradas inválidas; ios bloqueia cobrança', async () => {
    seed(); const url = '/api/coach-assistant/rapida'; S.coachFeature.length = 0; let aiCalls = 0; G.__LLM = async () => { aiCalls++; return new Error('não deveria chamar IA'); };
    const r = await call(RAPIDA, url, cA, { intent: 'COBRANCA', situacao: 'vencendo', dias: 7 });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ai, false); assert.deepStrictEqual(r.json.answer.items.map((i: any) => i.name), ['Ana Souza', 'Gil Cliente', 'Bruno Lima']); assert.deepStrictEqual(r.json.answer.params, { dias: 7, situacao: 'vencendo' });
    const r15 = await call(RAPIDA, url, cA, { intent: 'COBRANCA', situacao: 'vencendo', dias: 15 }); assert.deepStrictEqual(r15.json.answer.params, { dias: 15, situacao: 'vencendo' }); assert.ok(/15 dias/.test(r15.json.answer.title) && r15.json.answer.items.length === 4, r15.json.answer.title + r15.json.answer.items.length);
    assert.strictEqual((await call(RAPIDA, url, cB, { intent: 'TOTAL_ALUNOS' })).json.answer.total, 1, 'cada coach vê a sua carteira');
    for (const it of ['SEM_TREINAR', 'TREINO_VENCENDO', 'FEEDBACKS', 'TAREFAS', 'AGENDA_HOJE', 'TOTAL_ALUNOS']) { const x = await call(RAPIDA, url, cA, { intent: it }); assert.strictEqual(x.status, 200, it); assert.strictEqual(x.json.answer.intent, it); }
    assert.strictEqual((await call(RAPIDA, url, cA, { intent: 'RESUMO_ALUNO', studentId: 'a1' })).status, 400, 'resumo de aluno é da pergunta livre'); assert.strictEqual((await call(RAPIDA, url, cA, { intent: 'NENHUMA' })).status, 400); assert.strictEqual((await call(RAPIDA, url, cA, {})).status, 400); assert.strictEqual((await call(RAPIDA, url, cA, { intent: 'DROP TABLE' })).status, 400);
    const ios = await call(RAPIDA, url, cA, { intent: 'COBRANCA', ios: true }); assert.strictEqual(ios.json.answer.restricted, true); assert.deepStrictEqual(ios.json.answer.items, []);
    assert.strictEqual((await call(RAPIDA, url, null, { intent: 'TOTAL_ALUNOS' })).status, 401); assert.strictEqual((await call(RAPIDA, url, tok('a1', 'USER'), { intent: 'TOTAL_ALUNOS' })).status, 403);
    S.user.find((u: any) => u.id === 'cB').accountStatus = 'PENDING_APPROVAL'; assert.strictEqual((await call(RAPIDA, url, cB, { intent: 'TOTAL_ALUNOS' })).status, 403, 'coach sem conta ativa não consulta');
    assert.strictEqual(aiCalls, 0, 'perguntas rápidas nunca usam IA');
  });
  await t('perguntas rápidas: limite por hora (240)', async () => {
    seed(); const url = '/api/coach-assistant/rapida'; let last: any = null;
    for (let i = 0; i < 241; i++) last = await call(RAPIDA, url, tok('cB'), { intent: 'TOTAL_ALUNOS' });
    assert.strictEqual(last.status, 429); assert.notStrictEqual((await call(RAPIDA, url, cA, { intent: 'TOTAL_ALUNOS' })).status, 429);
  });
  await t('transcrição de áudio: aceita quem tem notasVoz OU perguntasVoz; sem nenhuma chave, 403', async () => {
    seed(); const url = '/api/coach-notes/transcrever'; S.coachFeature.length = 0; delete process.env.OPENAI_API_KEY;
    const st = async (id: string) => (await call(TRANSCREVER, url, tok(id), {})).status;
    assert.strictEqual(await st('cA'), 403, 'sem chave');
    S.coachFeature.push({ id: 'x1', coachId: 'cA', feature: 'perguntasVoz', reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null }); assert.strictEqual(await st('cA'), 503, 'passou pela trava (sem OPENAI_API_KEY no teste)');
    S.coachFeature.push({ id: 'x2', coachId: 'cB', feature: 'notasVoz', reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null }); assert.strictEqual(await st('cB'), 503, 'notasVoz continua valendo');
  });
  await t('rota: IA fora do ar cai nas palavras-chave; IA diz NENHUMA mas as palavras-chave entendem; fora do assunto não inventa; ios:true bloqueia cobrança', async () => {
    seed(); const url = '/api/coach-assistant/perguntar';
    G.__LLM = async () => new Error('IA fora do ar'); const a = await call(PERGUNTAR, url, cA, { text: 'quais cobranças estão atrasadas' }); assert.strictEqual(a.status, 200); assert.strictEqual(a.json.ai, false); assert.strictEqual(a.json.answer.intent, 'COBRANCA'); assert.deepStrictEqual(a.json.answer.items.map((i: any) => i.name), ['Daniel Rocha']);
    G.__LLM = async () => ({ content: [{ type: 'tool_use', name: 'escolher_consulta', input: { consulta: 'NENHUMA' } }] }); const b = await call(PERGUNTAR, url, cA, { text: 'quantos alunos eu tenho' }); assert.strictEqual(b.json.answer.intent, 'TOTAL_ALUNOS');
    const c = await call(PERGUNTAR, url, cA, { text: 'qual a capital da França' }); assert.strictEqual(c.status, 200); assert.strictEqual(c.json.answer.intent, 'NENHUMA'); assert.ok(/Ainda não sei responder/.test(c.json.answer.spoken)); assert.deepStrictEqual(c.json.answer.items, []);
    G.__LLM = async () => ({ content: [{ type: 'tool_use', name: 'escolher_consulta', input: { consulta: 'COBRANCA' } }] }); const d = await call(PERGUNTAR, url, cA, { text: 'quais alunos estão com o plano vencendo', ios: true }); assert.strictEqual(d.json.answer.restricted, true); assert.deepStrictEqual(d.json.answer.items, []);
    const e = await call(PERGUNTAR, url, cA, { text: 'quais alunos estão com o plano vencendo', ios: false }); assert.ok(!e.json.answer.restricted && e.json.answer.items.length > 0);
  });
  await t('rota: seguimento "qual aluno?" por id: só da carteira do coach', async () => {
    seed(); const url = '/api/coach-assistant/perguntar';
    const ok2 = await call(PERGUNTAR, url, cA, { intent: 'RESUMO_ALUNO', studentId: 'a8' }); assert.strictEqual(ok2.status, 200); assert.strictEqual(ok2.json.answer.title, 'Resumo: Samuel Costa');
    const no = await call(PERGUNTAR, url, cA, { intent: 'RESUMO_ALUNO', studentId: 'b1' }); assert.ok(/Não encontrei esse aluno/.test(no.json.answer.spoken)); assert.deepStrictEqual(no.json.answer.items, []);
    const cross = await call(PERGUNTAR, url, cB, { intent: 'RESUMO_ALUNO', studentId: 'a8' }); assert.ok(/Não encontrei esse aluno/.test(cross.json.answer.spoken));
  });
  await t('rota: limite de perguntas por hora (120) protege o servidor e a conta de IA', async () => {
    seed(); const url = '/api/coach-assistant/perguntar'; let last: any = null;
    for (let i = 0; i < 121; i++) last = await call(PERGUNTAR, url, tok('cB'), {});
    assert.strictEqual(last.status, 429); assert.ok(/Muitas perguntas/.test(last.json.error));
    assert.notStrictEqual((await call(PERGUNTAR, url, cA, {})).status, 429, 'outro coach não é afetado');
  });
  console.log(`\n${ok} ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
