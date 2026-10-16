import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as A from '/home/user/fitos-final/lib/coachAssistant';
import { CATALOG, catalogFor } from '/home/user/fitos-final/lib/assistantCatalog';
import { dateKeyBrt, addDaysKey } from '/home/user/fitos-final/lib/agenda';
import { POST as RAPIDA } from '/home/user/fitos-final/app/api/coach-assistant/rapida/route';
import { POST as PERGUNTAR } from '/home/user/fitos-final/app/api/coach-assistant/perguntar/route';
import { GET as CATALOGO } from '/home/user/fitos-final/app/api/coach-assistant/catalogo/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state; const G: any = globalThis;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const post = async (fn: any, url: string, as: string | null, body: any) => { const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as; const r = await fn(new Request('http://x' + url, { method: 'POST', body: JSON.stringify(body), headers }), {}); return { status: r.status, json: await r.json().catch(() => null) }; };
const get = async (fn: any, url: string, as: string | null) => { const headers: any = {}; if (as) headers.authorization = 'Bearer ' + as; const r = await fn(new Request('http://x' + url, { headers }), {}); return { status: r.status, json: await r.json().catch(() => null) }; };
process.env.ANTHROPIC_API_KEY = 'k';
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); G.__LLM = undefined; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n        ') : e)); } };

const NOW = new Date('2026-10-13T15:00:00Z');   // terça, 12:00 em Brasília
const TODAY = dateKeyBrt(NOW);
const at = (key: string) => new Date(key + 'T12:00:00-03:00');
const rel = (n: number) => at(addDaysKey(TODAY, n));
const ago = (n: number) => new Date(NOW.getTime() - n * 86400000);
const names = (r: A.Answer) => r.items.map((i) => i.name);

const seed = () => {
  const u = (o: any) => S.user.push({ role: 'USER', active: true, isTestAccount: false, coachId: null, nutritionistId: null, accountStatus: 'ACTIVE', isFinanceActive: true, contractValue: 0, paymentDueDate: null, createdAt: ago(100), dietModule: false, studentModules: 'TREINO', ...o });
  u({ id: 'cA', role: 'COACH', name: 'Coach A', coachPlan: 'PERSONAL', coachBillingStatus: 'ACTIVE' });
  u({ id: 'cB', role: 'COACH', name: 'Coach B', coachPlan: 'ELITE', coachBillingStatus: 'ACTIVE', createdAt: ago(60) });
  u({ id: 'cC', role: 'COACH', name: 'Camila Pendente', accountStatus: 'PENDING_APPROVAL', coachPlan: 'NUTRICIONISTA', createdAt: ago(3) });
  u({ id: 'cD', role: 'COACH', name: 'Diego Atrasado', coachPlan: 'PERSONAL', coachBillingStatus: 'OVERDUE', createdAt: ago(50) });
  u({ id: 'cE', role: 'COACH', name: 'Eva Teste', coachPlan: 'PERSONAL', coachBillingStatus: 'TRIAL', trialEndsAt: rel(2), createdAt: ago(5) });
  u({ id: 'cF', role: 'COACH', name: 'Fabio Novo', coachPlan: 'ELITE', coachBillingStatus: 'ACTIVE', coachBillingEnd: rel(5), isLaunchPromo: true, createdAt: ago(2) });
  u({ id: 'cG', role: 'COACH', name: 'Coach Fantasma', isTestAccount: true });
  u({ id: PAULO_ID, role: 'COACH', name: 'Paulo', coachPlan: 'ELITE', coachBillingStatus: 'OVERDUE' });   // (o time master não entra nas listas de cobrança)
  u({ id: 'a1', name: 'Ana Souza', coachId: 'cA', createdAt: ago(2), birthDate: '15/10/1990', plan: 'PERFORMANCE', dietModule: true, nextCheckInDate: rel(-3), paymentClaimStatus: 'PENDING', paymentClaimedAt: ago(1), contractValue: 200, isMenstruating: true });
  u({ id: 'a2', name: 'Bruno Lima', coachId: 'cA', birthDate: '1985-10-20', dietModule: true });
  u({ id: 'a3', name: 'Carla Dias', coachId: 'cA', createdAt: ago(3), birthDate: '13/10/1995' });
  u({ id: 'a4', name: 'Daniel Rocha', coachId: 'cA', birthDate: 'lixo' });
  u({ id: 'b1', name: 'Aluno do B', coachId: 'cB', createdAt: ago(1), birthDate: '14/10/1990' });
  u({ id: 'f1', name: 'Aluno do F', coachId: 'cF' });
  u({ id: 'aT', name: 'Conta Teste', coachId: 'cA', isTestAccount: true, createdAt: ago(1) });
  S.workout.push({ id: 'w1', userId: 'a1', archived: false, intensityMultiplier: 1.3, intensityEndDate: rel(3), endDate: rel(30), createdAt: ago(5) }, { id: 'w2', userId: 'a2', archived: false, intensityMultiplier: 1, intensityEndDate: null, endDate: rel(30), createdAt: ago(5) }, { id: 'w4', userId: 'a4', archived: false, intensityMultiplier: 0.8, intensityEndDate: ago(2), endDate: rel(30), createdAt: ago(5) }, { id: 'wb', userId: 'b1', archived: false, intensityMultiplier: 1.3, intensityEndDate: rel(3), createdAt: ago(5) });
  S.equipmentReport.push({ id: 'e1', userId: 'a1', exerciseName: 'Leg press 45', exerciseId: 'x1', status: 'OPEN', count: 2, lastReportedAt: ago(4) }, { id: 'e2', userId: 'b1', exerciseName: 'Hack', exerciseId: 'x2', status: 'OPEN', count: 1, lastReportedAt: ago(1) }, { id: 'e3', userId: 'a2', exerciseName: 'Remo', exerciseId: 'x3', status: 'RESOLVED', count: 1, lastReportedAt: ago(1) });
  S.executionVideo.push({ id: 'v1', userId: 'a1', exerciseName: 'Agachamento', status: 'READY', coachViewedAt: null, priority: true, createdAt: ago(1), cfUid: 'c1' }, { id: 'v2', userId: 'a2', exerciseName: 'Supino', status: 'READY', coachViewedAt: ago(1), createdAt: ago(1), cfUid: 'c2' }, { id: 'v3', userId: 'b1', exerciseName: 'Remada', status: 'READY', coachViewedAt: null, createdAt: ago(1), cfUid: 'c3' }, { id: 'v4', userId: 'a1', exerciseName: 'Velho', status: 'READY', coachViewedAt: null, createdAt: ago(45), cfUid: 'c4' });
  S.studentAlert.push({ id: 's1', userId: 'a2', type: 'EXERCISE_NOTE', isRead: false, exerciseName: 'Rosca', message: 'Senti o cotovelo', createdAt: ago(3) }, { id: 's2', userId: 'a2', type: 'EXERCISE_NOTE', isRead: true, message: 'ok', createdAt: ago(3) }, { id: 's3', userId: 'b1', type: 'EXERCISE_NOTE', isRead: false, message: 'outro coach', createdAt: ago(3) });
  S.runningProtocol.push({ id: 'r1', userId: 'a4', isActive: true, completedAt: null, protocolType: '10K', currentWeek: 3, startWeek: 1, startDate: ago(20) }, { id: 'r2', userId: 'a2', isActive: false, completedAt: null, protocolType: '5K', startWeek: 1, startDate: ago(20) });
  S.diet.push({ id: 'd1', userId: 'a1', isActive: true, isStrategy: false });
  S.dietFeedback.push({ id: 'df1', userId: 'a1', read: false, requestedChanges: 'menos arroz', createdAt: ago(1) }, { id: 'df2', userId: 'a1', read: true, createdAt: ago(1) }, { id: 'df3', userId: 'b1', read: false, createdAt: ago(1) });
  S.checkIn.push({ id: 'ck1', userId: 'a1', coachFeedback: null, createdAt: ago(3) }, { id: 'ck2', userId: 'a2', coachFeedback: 'ok', createdAt: ago(3) }, { id: 'ck3', userId: 'b1', coachFeedback: null, createdAt: ago(3) }, { id: 'ck4', userId: 'a1', coachFeedback: null, createdAt: ago(40) });
  S.workoutShare.push({ id: 'sh1', code: 'x1', createdById: 'cA', trial: true, displayName: 'Maria Teste', viewCount: 2, doneCount: 1, createdAt: ago(2) }, { id: 'sh2', code: 'x2', createdById: 'cA', trial: true, displayName: 'João', viewCount: 0, doneCount: 0, createdAt: ago(1) }, { id: 'sh3', code: 'x3', createdById: 'cA', trial: false, displayName: 'Normal', viewCount: 1, doneCount: 0, createdAt: ago(1) }, { id: 'sh4', code: 'x4', createdById: 'cB', trial: true, displayName: 'Do B', viewCount: 1, doneCount: 0, createdAt: ago(1) });
};
const run = (coach: string, intent: any, params: any = {}, o: any = {}) => A.runIntent(P, coach, intent, params, { now: NOW, ...o });

(async () => {
  await t('catálogo: categorias, botões, finanças somem no iPhone, "Coaches" só para o master; todo botão aponta para uma consulta que existe', () => {
    const ids = (c: any[]) => c.map((x) => x.id);
    assert.deepStrictEqual(ids(catalogFor({ master: false, ios: false })), ['hoje', 'alunos', 'financas', 'treinos', 'dieta', 'avaliacoes', 'crescimento']);
    assert.deepStrictEqual(ids(catalogFor({ master: true, ios: false })), ['hoje', 'alunos', 'financas', 'treinos', 'dieta', 'avaliacoes', 'crescimento', 'coaches']);
    const ios = catalogFor({ master: true, ios: true }); assert.ok(!ids(ios).includes('financas'), 'categoria só de finanças some'); const all = ios.flatMap((c) => c.buttons); assert.ok(all.every((b) => !b.finance) && !all.some((b) => ['COBRANCA', 'PAGAMENTOS_AGUARDANDO', 'COACHES_COBRANCA', 'COACHES_FUNDADORES'].includes(b.intent)));
    CATALOG.forEach((c) => c.buttons.forEach((b) => { assert.ok(A.isIntent(b.intent), b.intent); assert.ok(A.QUICK_INTENTS.includes(b.intent)); if (c.master) assert.ok(A.isMasterIntent(b.intent), b.intent); else assert.ok(!A.isMasterIntent(b.intent), b.intent); if (b.params && b.params.dias) assert.ok(A.TAKES_DIAS.includes(b.intent as any), b.intent + ' tem período'); }));
    const keys = CATALOG.flatMap((c) => c.buttons.map((b) => b.key)); assert.strictEqual(new Set(keys).size, keys.length, 'chaves únicas');
    A.FINANCE_INTENTS.forEach((f) => assert.ok(CATALOG.some((c) => c.buttons.some((b) => b.intent === f && b.finance)), f + ' marcado como finanças no catálogo'));
  });
  await t('alunos novos / aniversariantes / sem treino montado / deload e choque: só da carteira, sem conta de teste', async () => {
    seed();
    const n = await run('cA', 'NOVOS_ALUNOS', { dias: 7 }); assert.deepStrictEqual(names(n), ['Ana Souza', 'Carla Dias'], 'mais novo primeiro, sem teste e sem outro coach'); assert.deepStrictEqual(n.params, { dias: 7, situacao: 'vencendo' }); assert.ok(/2 alunos novos nos últimos 7 dias/.test(n.spoken), n.spoken);
    assert.strictEqual((await run('cA', 'NOVOS_ALUNOS', { dias: 1 })).total, 0);
    const b = await run('cA', 'ANIVERSARIANTES', { dias: 7 }); assert.deepStrictEqual(names(b), ['Carla Dias', 'Ana Souza', 'Bruno Lima'], 'hoje, em 2 dias, em 7 dias; data inválida ignorada'); assert.strictEqual(b.items[0].tone, 'today'); assert.ok(/faz aniversário hoje/.test(b.items[0].detail!) && /Carla, hoje/.test(b.spoken), b.spoken);
    assert.deepStrictEqual(names(await run('cA', 'ANIVERSARIANTES', { dias: 3 })), ['Carla Dias', 'Ana Souza']);
    assert.deepStrictEqual(A.parseBirth('15/10/1990'), { d: 15, m: 10 }); assert.deepStrictEqual(A.parseBirth('1985-10-20T00:00:00.000Z'), { d: 20, m: 10 }); assert.deepStrictEqual(A.parseBirth('27051987'), { d: 27, m: 5 }); assert.strictEqual(A.parseBirth('32/13/2000'), null); assert.strictEqual(A.parseBirth(null), null);
    S.user.find((u: any) => u.id === 'a2').birthDate = '05/01/1980'; const wrap = await run('cA', 'ANIVERSARIANTES', { dias: 90 }); assert.ok(wrap.items.some((i) => i.name === 'Bruno Lima' && /em 84 dias \(05\/01\)/.test(i.detail!)), 'aniversário que já passou este ano vira o do ano que vem: ' + JSON.stringify(wrap.items.map((i) => i.detail)));
    const sem = await run('cA', 'SEM_TREINO_MONTADO'); assert.deepStrictEqual(names(sem), ['Carla Dias'], 'a1, a2, a4 têm treino; a3 não'); S.user.find((u: any) => u.id === 'a3').studentModules = 'DIETA'; assert.strictEqual((await run('cA', 'SEM_TREINO_MONTADO')).total, 0, 'quem não tem o módulo de treino não conta');
    const d = await run('cA', 'DELOAD_CHOQUE'); assert.deepStrictEqual(names(d), ['Ana Souza'], 'Ana: choque ativo (e menstrual não duplica); Daniel: deload já acabou; B fora'); assert.ok(/semana de choque até 16\/10/.test(d.items[0].detail!), d.items[0].detail || '');
    S.workout.find((w: any) => w.id === 'w1').intensityMultiplier = 1; const d2 = await run('cA', 'DELOAD_CHOQUE'); assert.ok(/deload menstrual/.test(d2.items[0].detail!), 'sem choque, aparece o deload menstrual');
  });
  await t('treinos: aparelho, vídeos, observações, corrida — só da carteira, só o que está aberto', async () => {
    seed();
    const ap = await run('cA', 'APARELHOS'); assert.deepStrictEqual(names(ap), ['Ana Souza']); assert.ok(/não tem: Leg press 45 \(avisou 2 vezes\)/.test(ap.items[0].detail!) && ap.items[0].tone === 'late', ap.items[0].detail || '');
    const v = await run('cA', 'VIDEOS_AGUARDANDO'); assert.deepStrictEqual(names(v), ['Ana Souza'], 'visto, de outro coach e velho (45 dias) ficam de fora'); assert.ok(/Agachamento/.test(v.items[0].detail!) && /prioridade/.test(v.items[0].detail!));
    const c = await run('cA', 'COMENTARIOS_EXERCICIO'); assert.deepStrictEqual(names(c), ['Bruno Lima']); assert.ok(/Rosca: Senti o cotovelo/.test(c.items[0].detail!));
    const r = await run('cA', 'CORRIDA_ATIVOS'); assert.deepStrictEqual(names(r), ['Daniel Rocha']); assert.ok(/10K · semana 3/.test(r.items[0].detail!));
    for (const x of ['APARELHOS', 'VIDEOS_AGUARDANDO', 'COMENTARIOS_EXERCICIO', 'CORRIDA_ATIVOS']) assert.strictEqual((await run('cC', x as any)).total, 0, x + ': coach sem alunos');
  });
  await t('dieta e avaliações: sem dieta, feedback de dieta, avaliações sem retorno (30 dias) e atrasadas', async () => {
    seed();
    assert.deepStrictEqual(names(await run('cA', 'SEM_DIETA')), ['Bruno Lima'], 'só quem tem módulo de dieta e nenhuma dieta ativa');
    S.diet.push({ id: 'd2', userId: 'a2', isActive: true, isStrategy: true }); assert.deepStrictEqual(names(await run('cA', 'SEM_DIETA')), ['Bruno Lima'], 'estratégia não conta como dieta ativa');
    const f = await run('cA', 'DIETA_FEEDBACKS'); assert.deepStrictEqual(names(f), ['Ana Souza']); assert.ok(/menos arroz/.test(f.items[0].detail!));
    const ck = await run('cA', 'CHECKINS_AGUARDANDO'); assert.deepStrictEqual(names(ck), ['Ana Souza'], 'com retorno, de outro coach e com 40 dias ficam de fora'); assert.strictEqual(ck.total, 1);
    const at2 = await run('cA', 'CHECKIN_ATRASADO'); assert.deepStrictEqual(names(at2), ['Ana Souza']); assert.ok(/era para há 3 dias/.test(at2.items[0].detail!), at2.items[0].detail || ''); S.user.find((u: any) => u.id === 'a1').disableCheckIn = true; assert.strictEqual((await run('cA', 'CHECKIN_ATRASADO')).total, 0, 'avaliação desligada não atrasa');
  });
  await t('teste grátis e pagamentos: links de teste do coach (30 dias); "já paguei" aguardando some no iPhone', async () => {
    seed();
    const tg = await run('cA', 'TESTE_GRATIS'); assert.strictEqual(tg.total, 2, 'só os de teste e só dele'); assert.ok(/2 links de teste nos últimos 30 dias: 1 aberto e 1 concluído/.test(tg.spoken), tg.spoken); assert.ok(/abriu 2x · concluiu 1/.test(tg.items.find((i) => i.name === 'Maria Teste')!.detail!)); assert.ok(/ainda não abriu/.test(tg.items.find((i) => i.name === 'João')!.detail!));
    const pg = await run('cA', 'PAGAMENTOS_AGUARDANDO'); assert.deepStrictEqual(names(pg), ['Ana Souza']); assert.ok(/R\$ 200/.test(pg.items[0].detail!));
    const ios = await run('cA', 'PAGAMENTOS_AGUARDANDO', {}, { noFinance: true }); assert.strictEqual(ios.restricted, true); assert.deepStrictEqual(ios.items, []);
  });
  await t('"O que tenho hoje?": resume agenda + pendências da central HOJE; no iPhone tira cobrança e "já paguei"', async () => {
    seed(); S.agendaEvent.push({ id: 'ev1', coachId: 'cA', startsAt: at(TODAY), endsAt: new Date(at(TODAY).getTime() + 3600000), status: 'SCHEDULED', kind: 'PRESENCIAL', studentId: 'a1' });
    const h = await run('cA', 'RESUMO_HOJE'); assert.ok(/1 compromisso na agenda hoje/.test(h.spoken), h.spoken); assert.ok(h.total >= 3, 'tem pendências: ' + h.total); assert.ok(h.items.length > 0 && h.items.length <= A.MAX_ITEMS);
    assert.ok(/pagamento para confirmar|avaliação|aparelho|vídeo/.test(h.spoken), h.spoken);
    const ios = await run('cA', 'RESUMO_HOJE', {}, { noFinance: true }); assert.ok(!/pagamento|cobrança/.test(ios.spoken), 'iPhone: sem dinheiro: ' + ios.spoken); assert.ok(!ios.items.some((i) => /informou que pagou|Cobrança/.test(i.name)));
    P.__reset(); S.user.push({ id: 'cZ', role: 'COACH', name: 'Z', accountStatus: 'ACTIVE' }); const vazio = await run('cZ', 'RESUMO_HOJE'); assert.ok(/Dia livre/.test(vazio.spoken), vazio.spoken);
  });
  await t('COACHES (só master): visão geral, cadastros, atraso/vencendo, alunos por coach, novos, fundadores; coach comum é barrado em TODAS; teste e masters não contam', async () => {
    seed();
    const m = PAULO_ID;
    const r = await run(m, 'COACHES_RESUMO'); assert.ok(/5 coaches ativos com 6 alunos no total, e 1 cadastro aguardando aprovação/.test(r.spoken), r.spoken); assert.ok(/Planos: /.test(r.spoken));
    const pend = await run(m, 'COACHES_PENDENTES'); assert.deepStrictEqual(names(pend), ['Camila Pendente']); assert.ok(/plano Nutricionista · pediu há 3 dias/.test(pend.items[0].detail!), pend.items[0].detail || '');
    const cob = await run(m, 'COACHES_COBRANCA', { dias: 7 }); assert.deepStrictEqual(names(cob), ['Diego Atrasado', 'Eva Teste', 'Fabio Novo'], 'atraso primeiro; teste em 2 dias; plano em 5 dias'); assert.deepStrictEqual(cob.params!.dias, 7); assert.ok(/em atraso/.test(cob.items[0].detail!) && /teste grátis termina em 2 dias/.test(cob.items[1].detail!) && /plano vence em 5 dias/.test(cob.items[2].detail!), JSON.stringify(cob.items.map((i) => i.detail)));
    assert.deepStrictEqual(names(await run(m, 'COACHES_COBRANCA', { dias: 3 })), ['Diego Atrasado', 'Eva Teste']);
    const al = await run(m, 'COACHES_ALUNOS'); assert.deepStrictEqual(names(al).slice(0, 3), ['Coach A', 'Coach B', 'Fabio Novo'].filter(Boolean).slice(0, 3)); assert.ok(/4 alunos ativos/.test(al.items[0].detail!), al.items[0].detail || ''); assert.ok(/ainda sem nenhum aluno/.test(al.spoken) && al.items.some((i) => i.name === 'Diego Atrasado' && i.tone === 'late'), al.spoken); assert.ok(!names(al).includes('Coach Fantasma') && !names(al).includes('Paulo'), 'conta de teste e master fora');
    const nv = await run(m, 'COACHES_NOVOS', { dias: 7 }); assert.deepStrictEqual(names(nv), ['Fabio Novo', 'Camila Pendente', 'Eva Teste'].filter((n) => true)); assert.ok(/aguardando aprovação/.test(nv.items.find((i) => i.name === 'Camila Pendente')!.detail!));
    const fu = await run(m, 'COACHES_FUNDADORES'); assert.ok(/1 de \d+ vagas de Fundador usadas/.test(fu.spoken), fu.spoken); assert.deepStrictEqual(names(fu), ['Fabio Novo']);
    for (const x of A.MASTER_INTENTS) { const no = await run('cA', x as any, { aluno_falado: 'Camila' }); assert.strictEqual(no.restricted, true, x); assert.deepStrictEqual(no.items, [], x + ' não vaza dados'); assert.ok(/só para o time master/.test(no.spoken)); }
    for (const x of A.FINANCE_INTENTS.filter((f) => A.isMasterIntent(f))) { const ios = await run(m, x, {}, { noFinance: true }); assert.strictEqual(ios.restricted, true, x + ' no iPhone'); assert.deepStrictEqual(ios.items, []); }
    assert.strictEqual((await run(m, 'COACHES_RESUMO', {}, { noFinance: true })).restricted, undefined, 'a visão geral não é financeira: continua no iPhone');
  });
  await t('resumo de UM coach (master): por nome, ambíguo, inexistente, por id; iPhone sem mensalidade; coach comum barrado; recursos liberados', async () => {
    seed(); const m = PAULO_ID;
    S.coachFeature.push({ id: 'cf1', coachId: 'cF', feature: 'notasVoz', revokedAt: null }, { id: 'cf2', coachId: 'cF', feature: 'execVideo', revokedAt: ago(1) });
    const r = await run(m, 'RESUMO_COACH', { aluno_falado: 'Fabio' }); assert.strictEqual(r.title, 'Resumo: Fabio Novo'); assert.ok(/Conta ativa, plano Elite, Fundador/.test(r.spoken) && /1 aluno ativo/.test(r.spoken) && /Mensalidade em dia, vai até 18\/10/.test(r.spoken) && /Recursos liberados: notasVoz\./.test(r.spoken), r.spoken);
    const ios = await run(m, 'RESUMO_COACH', { aluno_falado: 'Fabio' }, { noFinance: true }); assert.ok(!/Mensalidade/.test(ios.spoken), ios.spoken);
    S.user.push({ id: 'cH', role: 'COACH', name: 'Carlos Alberto', accountStatus: 'ACTIVE' }, { id: 'cI', role: 'COACH', name: 'Carlos Eduardo', accountStatus: 'ACTIVE' }); const amb = await run(m, 'RESUMO_COACH', { aluno_falado: 'Carlos' }); assert.ok(amb.ambiguous && amb.ambiguous.length === 2, 'mais de um Carlos'); assert.strictEqual(amb.items[0].kind, 'student', 'a lista tocável usa o mesmo formato da lista de alunos'); const byId = await run(m, 'RESUMO_COACH', {}, { studentId: 'cB' }); assert.strictEqual(byId.title, 'Resumo: Coach B');
    assert.ok(/Não encontrei nenhum coach/.test((await run(m, 'RESUMO_COACH', { aluno_falado: 'Zzzz' })).spoken)); assert.ok(/De qual coach/.test((await run(m, 'RESUMO_COACH', {})).spoken));
    assert.ok(/Não encontrei esse coach/.test((await run(m, 'RESUMO_COACH', {}, { studentId: 'a1' })).spoken), 'id de aluno não abre resumo de coach');
  });
  await t('roteador por palavras: perguntas novas do coach; perguntas sobre coaches só para o master; o que já funcionava continua', () => {
    const R = (x: string, master = false) => A.ruleRoute(x, { master });
    const cases: [string, string][] = [['o que eu tenho para fazer hoje', 'RESUMO_HOJE'], ['me dá o resumo do dia', 'RESUMO_HOJE'], ['quais pendências de hoje', 'RESUMO_HOJE'], ['quem faz aniversário essa semana', 'ANIVERSARIANTES'], ['quais alunos novos entraram', 'NOVOS_ALUNOS'], ['quais alunos estão sem treino', 'SEM_TREINO_MONTADO'],
      ['alguém em deload?', 'DELOAD_CHOQUE'], ['quais alunos disseram que pagaram', 'PAGAMENTOS_AGUARDANDO'], ['quem não tem aparelho', 'APARELHOS'], ['tem vídeo para eu ver', 'VIDEOS_AGUARDANDO'], ['observações de exercício', 'COMENTARIOS_EXERCICIO'], ['quem está na corrida', 'CORRIDA_ATIVOS'],
      ['alunos sem dieta', 'SEM_DIETA'], ['feedbacks da dieta', 'DIETA_FEEDBACKS'], ['avaliações atrasadas', 'CHECKIN_ATRASADO'], ['quais avaliações estão esperando retorno', 'CHECKINS_AGUARDANDO'], ['como estão meus testes grátis', 'TESTE_GRATIS'],
      ['quais cobranças estão atrasadas', 'COBRANCA'], ['quem não treina há 10 dias', 'SEM_TREINAR'], ['quais treinos estão vencendo', 'TREINO_VENCENDO'], ['feedbacks da semana', 'FEEDBACKS'], ['agenda de hoje', 'AGENDA_HOJE'], ['quantos alunos eu tenho', 'TOTAL_ALUNOS'], ['resumo do Samuel', 'RESUMO_ALUNO'], ['qual a capital da França', 'NENHUMA']];
    for (const [q, intent] of cases) assert.strictEqual(R(q).intent, intent, q);
    assert.strictEqual(R('quem não treina há 10 dias').params.dias, 10);
    const mc: [string, string][] = [['quantos coaches eu tenho', 'COACHES_RESUMO'], ['quais cadastros de coach para aprovar', 'COACHES_PENDENTES'], ['quais coaches estão atrasados', 'COACHES_COBRANCA'], ['coaches com plano vencendo', 'COACHES_COBRANCA'], ['quantos alunos cada coach tem', 'COACHES_ALUNOS'], ['coaches novos desta semana', 'COACHES_NOVOS'], ['quantas vagas de fundador ainda tem', 'COACHES_FUNDADORES'], ['resumo da coach Camila', 'RESUMO_COACH']];
    for (const [q, intent] of mc) { assert.strictEqual(R(q, true).intent, intent, q); assert.notStrictEqual(R(q, false).intent, intent, q + ' (coach comum não cai em consulta de coaches)'); }
    assert.strictEqual(R('resumo da coach Camila', true).params.aluno_falado, 'Camila');
    assert.strictEqual(R('quais cobranças estão atrasadas', true).intent, 'COBRANCA', 'master pergunta de aluno sem a palavra coach: continua nos alunos');
  });
  await t('IA roteadora: coach comum não recebe nem aceita consulta de coaches; master recebe; prompt só descreve o que pode', async () => {
    const mk = (consulta: string, extra: any = {}) => ({ messages: { create: async (req: any) => { (mk as any).last = req; return { content: [{ type: 'tool_use', name: 'escolher_consulta', input: { consulta, ...extra } }], usage: {} }; } } });
    const m1 = await A.aiRoute('quantos coaches', TODAY, { client: mk('COACHES_RESUMO'), master: true }); assert.strictEqual(m1.route.intent, 'COACHES_RESUMO'); assert.ok((mk as any).last.tools[0].input_schema.properties.consulta.enum.includes('COACHES_RESUMO') && /COACHES_RESUMO/.test((mk as any).last.system));
    const m2 = await A.aiRoute('quantos coaches', TODAY, { client: mk('COACHES_RESUMO'), master: false }); assert.strictEqual(m2.route.intent, 'NENHUMA', 'resposta da IA descartada para quem não é master'); assert.ok(!(mk as any).last.tools[0].input_schema.properties.consulta.enum.includes('COACHES_RESUMO') && !/COACHES_/.test((mk as any).last.system), 'nem aparece no prompt');
    const m3 = await A.aiRoute('o que tenho hoje', TODAY, { client: mk('RESUMO_HOJE'), master: false }); assert.strictEqual(m3.route.intent, 'RESUMO_HOJE');
    const m4 = await A.aiRoute('resumo da coach Camila', TODAY, { client: mk('RESUMO_COACH', { aluno_falado: 'Camila' }), master: true }); assert.strictEqual(m4.route.params.aluno_falado, 'Camila');
  });
  await t('rotas: catálogo por usuário; rápida roda as consultas novas (só carteira), barra coach comum nas de coaches e aceita o seguimento por id de RESUMO_COACH só do master', async () => {
    seed(); S.coachFeature.push({ id: 'p1', coachId: 'cA', feature: 'perguntasVoz', revokedAt: null });
    const cat = await get(CATALOGO, '/api/coach-assistant/catalogo', tok('cA')); assert.strictEqual(cat.status, 200); assert.strictEqual(cat.json.master, false); assert.ok(!cat.json.categories.some((c: any) => c.id === 'coaches') && cat.json.categories.some((c: any) => c.id === 'financas'));
    const catIos = await get(CATALOGO, '/api/coach-assistant/catalogo?ios=1', tok('cA')); assert.ok(!catIos.json.categories.some((c: any) => c.id === 'financas'));
    const catM = await get(CATALOGO, '/api/coach-assistant/catalogo', tok(PAULO_ID)); assert.strictEqual(catM.json.master, true); assert.ok(catM.json.categories.some((c: any) => c.id === 'coaches'));
    assert.strictEqual((await get(CATALOGO, '/api/coach-assistant/catalogo', null)).status, 401); assert.strictEqual((await get(CATALOGO, '/api/coach-assistant/catalogo', tok('a1', 'USER'))).status, 403);
    const q = await post(RAPIDA, '/api/coach-assistant/rapida', tok('cA'), { intent: 'APARELHOS' }); assert.strictEqual(q.status, 200); assert.deepStrictEqual(q.json.answer.items.map((i: any) => i.name), ['Ana Souza']);
    const p15 = await post(RAPIDA, '/api/coach-assistant/rapida', tok('cA'), { intent: 'NOVOS_ALUNOS', dias: 15 }); assert.deepStrictEqual(p15.json.answer.params, { dias: 15, situacao: 'vencendo' });
    const bad = await post(RAPIDA, '/api/coach-assistant/rapida', tok('cA'), { intent: 'COACHES_RESUMO' }); assert.strictEqual(bad.json.answer.restricted, true); assert.deepStrictEqual(bad.json.answer.items, []);
    const okm = await post(RAPIDA, '/api/coach-assistant/rapida', tok(PAULO_ID), { intent: 'COACHES_PENDENTES' }); assert.deepStrictEqual(okm.json.answer.items.map((i: any) => i.name), ['Camila Pendente']);
    const iosM = await post(RAPIDA, '/api/coach-assistant/rapida', tok(PAULO_ID), { intent: 'COACHES_COBRANCA', ios: true }); assert.strictEqual(iosM.json.answer.restricted, true);
    const fu = await post(PERGUNTAR, '/api/coach-assistant/perguntar', tok('cA'), { intent: 'RESUMO_COACH', studentId: 'cB' }); assert.strictEqual(fu.json.answer.restricted, true, 'coach comum não abre resumo de coach nem com id');
    S.coachFeature.push({ id: 'p2', coachId: PAULO_ID, feature: 'perguntasVoz', revokedAt: null });
    const fm = await post(PERGUNTAR, '/api/coach-assistant/perguntar', tok(PAULO_ID), { intent: 'RESUMO_COACH', studentId: 'cB' }); assert.strictEqual(fm.json.answer.title, 'Resumo: Coach B');
    G.__LLM = async () => new Error('IA fora do ar'); const voz = await post(PERGUNTAR, '/api/coach-assistant/perguntar', tok(PAULO_ID), { text: 'quais cadastros de coach estão para aprovar' }); assert.strictEqual(voz.json.answer.intent, 'COACHES_PENDENTES', 'pergunta livre do master sobre coaches (palavras-chave)');
    G.__LLM = async () => ({ content: [{ type: 'tool_use', name: 'escolher_consulta', input: { consulta: 'COACHES_PENDENTES' } }] }); const vozIA = await post(PERGUNTAR, '/api/coach-assistant/perguntar', tok('cA'), { text: 'me fala dos coaches que estão pendentes' }); assert.ok(!A.isMasterIntent(vozIA.json.answer.intent) && !vozIA.json.answer.restricted, 'a IA nem pode escolher consulta de coaches para quem não é master (cai nas palavras-chave: ' + vozIA.json.answer.intent + ')');
    G.__LLM = async () => new Error('IA fora do ar');
    const vozA = await post(PERGUNTAR, '/api/coach-assistant/perguntar', tok('cA'), { text: 'quais cadastros de coach estão para aprovar' }); assert.notStrictEqual(vozA.json.answer.intent, 'COACHES_PENDENTES');
    assert.ok(/Toque numa categoria/.test(A.NOT_UNDERSTOOD.spoken));
  });
  console.log(`\n${ok} ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
