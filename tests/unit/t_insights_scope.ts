import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as scopeGET, PUT as scopePUT } from '/home/user/fitos-final/app/api/insights/scope/route';
import { GET as levelGET } from '/home/user/fitos-final/app/api/student-level/route';
import { computeLevel, parseLevel, levelMessage, loadStudentLevels, LEVEL_RULES } from '/home/user/fitos-final/lib/studentLevel';
import { evaluateStudent, looksLikeTestAccount, parseGender, parseInsightsMode, loadInsightsPool, MIN_SESSIONS, INACTIVE_MIN_SESSIONS } from '/home/user/fitos-final/lib/insightsScope';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const req = (method: string, url: string, as: string | null, body?: any) => { const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as; return new Request('http://x' + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); };
const NOW = new Date('2026-10-18T15:00:00Z');
const monthsAgo = (m: number) => new Date(NOW.getTime() - m * 30.4375 * 86400000 + 3600000);   // um pouco DEPOIS de completar m meses (evita o limite exato)
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 5).join('\n')); process.exitCode = 1; } };
const hist = (userId: string, n: number, lastISO = '2026-10-10T12:00:00Z') => { for (let i = 0; i < n; i++) S.workoutHistory.push({ id: `h-${userId}-${i}`, userId, name: 'A', date: new Date(new Date(lastISO).getTime() - i * 86400000) }); };
const U = (o: any) => S.user.push({ role: 'USER', coachId: 'cA', active: true, accountStatus: 'ACTIVE', isTestAccount: false, gender: 'Feminino', insightsMode: null, createdAt: monthsAgo(6), startDate: null, ...o });
/** Troca funções de `prisma.user` só durante o teste (o simulador devolve um objeto novo a cada acesso, então o ajuste vai em `__state.override`). */
const withUser = async (over: Record<string, any>, fn: () => Promise<void>) => { S.override.user = over; try { await fn(); } finally { delete S.override.user; } };
const seed = () => { P.__reset(); S.user.push({ id: 'cA', role: 'COACH', coachId: null, insightsIncludeInactive: false }, { id: 'cB', role: 'COACH', coachId: null, insightsIncludeInactive: false }); };

(async () => {
  await t('nível: iniciante até 3 meses, intermediário a partir do 4º, avançado a partir do 8º (com treinos suficientes)', () => {
    assert.deepStrictEqual(LEVEL_RULES.months, [0, 3, 7]);
    const at = (m: number, s: number, entry: any = 'INICIANTE') => computeLevel({ entry, startDate: monthsAgo(m), sessions: s, now: NOW }).level;
    assert.strictEqual(at(0, 0), 'INICIANTE'); assert.strictEqual(at(2.9, 200), 'INICIANTE', 'treina muito mas só tem 2,9 meses: ainda iniciante');
    assert.strictEqual(at(3.05, 24), 'INTERMEDIARIO'); assert.strictEqual(at(6.9, 59), 'INTERMEDIARIO'); assert.strictEqual(at(7.05, 60), 'AVANCADO'); assert.strictEqual(at(24, 500), 'AVANCADO');
    assert.strictEqual(at(10, 23), 'INICIANTE', 'passou o tempo mas fez poucos treinos: não sobe'); assert.strictEqual(at(10, 59), 'INTERMEDIARIO', 'tempo de avançado mas treinos de intermediário');
  });
  await t('nível: quem entra intermediário/avançado começa adiantado e nunca cai abaixo do que entrou', () => {
    const i = computeLevel({ entry: 'INTERMEDIARIO', startDate: NOW, sessions: 0, now: NOW }); assert.strictEqual(i.level, 'INTERMEDIARIO'); assert.strictEqual(i.months, 3); assert.strictEqual(i.sessions, 24);
    const a = computeLevel({ entry: 'AVANCADO', startDate: NOW, sessions: 0, now: NOW }); assert.strictEqual(a.level, 'AVANCADO'); assert.strictEqual(a.next, null); assert.strictEqual(a.progressPct, null); assert.strictEqual(a.missing, null);
    assert.strictEqual(computeLevel({ entry: 'INTERMEDIARIO', startDate: monthsAgo(5), sessions: 20, now: NOW }).level, 'INTERMEDIARIO');
    assert.strictEqual(computeLevel({ entry: 'INTERMEDIARIO', startDate: monthsAgo(4.1), sessions: 36, now: NOW }).level, 'AVANCADO', '3 + 4,1 meses e 24 + 36 treinos');
  });
  await t('nível: dados estragados não quebram (data futura, texto, treinos negativos/NaN, entrada desconhecida)', () => {
    for (const bad of [{ startDate: new Date('2030-01-01') }, { startDate: 'lixo' }, { startDate: null }, { sessions: -5 }, { sessions: NaN }, { sessions: '7' as any }, { entry: 'XYZ' as any }]) {
      const r = computeLevel({ now: NOW, ...bad }); assert.strictEqual(r.level, 'INICIANTE', JSON.stringify(bad)); assert.ok(Number.isFinite(r.months) && r.sessions >= 0 && r.progressPct! >= 0);
    }
  });
  await t('nível: porcentagem é o menor entre tempo e treinos, nunca chega a 100 antes de subir, e o que falta bate', () => {
    const r = computeLevel({ startDate: monthsAgo(1.5), sessions: 6, now: NOW }); assert.strictEqual(r.progressPct, 25, 'tempo 50%, treinos 25% -> 25');
    assert.strictEqual(r.missing!.sessions, 18); assert.ok(Math.abs(r.missing!.days - 1.5 * 30.4375) < 2);
    const full = computeLevel({ startDate: monthsAgo(2.99), sessions: 24, now: NOW }); assert.ok(full.progressPct! <= 99); assert.strictEqual(full.level, 'INICIANTE');
    assert.strictEqual(computeLevel({ startDate: monthsAgo(3.05), sessions: 100, now: NOW }).progressPct, 1, 'recém-intermediário: ~1% do tempo até o avançado (treinos já prontos, o tempo manda)');
  });
  await t('nível: textos e leitura do texto de nível', () => {
    for (const [raw, k] of [['Iniciante', 'INICIANTE'], ['INTERMEDIARIO', 'INTERMEDIARIO'], ['Intermediário', 'INTERMEDIARIO'], ['avançado', 'AVANCADO'], ['Avançado (2+ anos)', 'AVANCADO'], ['', null], [null, null], ['sei lá', null]] as const) assert.strictEqual(parseLevel(raw), k, String(raw));
    assert.match(levelMessage(computeLevel({ startDate: monthsAgo(1), sessions: 5, now: NOW })), /Iniciante.*Intermediário.*19 treinos/);
    assert.match(levelMessage(computeLevel({ entry: 'AVANCADO', now: NOW })), /mais alto/);
    assert.match(levelMessage(computeLevel({ startDate: monthsAgo(3.05), sessions: 100, now: NOW })), /Avançado, faltam \d+ (meses|semanas)/);
  });

  await t('quem entra: regra automática (teste, sem gênero, inativo, poucos treinos) e as escolhas do coach', () => {
    const base = { active: true, accountStatus: 'ACTIVE', isTestAccount: false, gender: 'Feminino', insightsMode: null, sessions: MIN_SESSIONS };
    const ev = (o: any, opts: any = {}) => evaluateStudent({ ...base, ...o }, opts);
    assert.deepStrictEqual([ev({}).included, ev({}).reason], [true, 'OK']);
    assert.strictEqual(MIN_SESSIONS, 6); assert.strictEqual(INACTIVE_MIN_SESSIONS, 20); assert.strictEqual(ev({ sessions: 5 }).included, false); assert.strictEqual(ev({ sessions: 6 }).included, true);
    assert.strictEqual(ev({ active: false, sessions: 19 }, { includeInactive: true }).included, false); assert.strictEqual(ev({ active: false, sessions: 20 }, { includeInactive: true }).included, true);
    assert.strictEqual(ev({ sessions: MIN_SESSIONS - 1 }).reason, 'POUCOS_TREINOS'); assert.strictEqual(ev({ isTestAccount: true }).reason, 'TESTE'); assert.strictEqual(ev({ gender: null }).reason, 'SEM_GENERO'); assert.strictEqual(ev({ gender: 'outro' }).included, false);
    assert.strictEqual(ev({ active: false }).reason, 'INATIVO'); assert.strictEqual(ev({ accountStatus: 'BLOCKED' }).reason, 'INATIVO');
    assert.strictEqual(ev({ active: false, sessions: 500 }).included, false, 'chave de inativos desligada: nem com 500 treinos');
    assert.strictEqual(ev({ active: false, sessions: INACTIVE_MIN_SESSIONS }, { includeInactive: true }).included, true); assert.strictEqual(ev({ active: false, sessions: INACTIVE_MIN_SESSIONS - 1 }, { includeInactive: true }).reason, 'INATIVO_POUCOS_TREINOS');
    assert.strictEqual(ev({ isTestAccount: true, sessions: 99 }, { includeInactive: true }).included, false, 'a chave de inativos não libera teste');
    assert.strictEqual(ev({ insightsMode: 'EXCLUDE', sessions: 99 }).reason, 'MANUAL_FORA'); assert.strictEqual(ev({ insightsMode: 'INCLUDE', sessions: 0, isTestAccount: true, active: false }).reason, 'MANUAL_DENTRO');
    assert.strictEqual(ev({ insightsMode: 'INCLUDE', gender: '' }).included, false, 'sem gênero não dá para comparar nem com escolha manual');
    assert.strictEqual(ev({ insightsMode: 'EXCLUDE', gender: '' }).reason, 'MANUAL_FORA'); assert.strictEqual(ev({ insightsMode: 'banana' }).reason, 'OK');
    assert.strictEqual(parseGender('feminino'), 'Feminino'); assert.strictEqual(parseGender(' MASCULINO '), 'Masculino'); assert.strictEqual(parseGender('F'), 'Feminino'); assert.strictEqual(parseGender('Outro'), null); assert.strictEqual(parseInsightsMode('INCLUDE'), 'INCLUDE'); assert.strictEqual(parseInsightsMode('x'), null);
  });
  await t('sugestão de conta de teste: palavras inteiras no nome e no e-mail, sem pegar nome normal', () => {
    for (const n of ['ELITE', 'Aluno Demonstração', 'Aluno Teste', 'teste 2', 'Fulano de Tal', 'Apple Review', 'Aluno', 'Usuário']) assert.strictEqual(looksLikeTestAccount(n), true, n);
    for (const n of ['Maria Contestado', 'Atestado Silva', 'João Pedro', 'Eliete Souza', 'Aluno Paulo', '', null, 'Marcelo Elitista']) assert.strictEqual(looksLikeTestAccount(n), false, String(n));
    assert.strictEqual(looksLikeTestAccount('Maria', 'teste123@x.com'), true); assert.strictEqual(looksLikeTestAccount('Maria', 'demo@x.com'), true); assert.strictEqual(looksLikeTestAccount('Maria', 'maria.contestada@x.com'), false);
  });

  await t('pool: lê só a carteira do coach, conta só treinos executados, separa por motivo e marca suspeitos sem tirar', async () => {
    seed();
    U({ id: 'a1', name: 'Ana', gender: 'Feminino' }); hist('a1', 8);
    U({ id: 'a2', name: 'Bia', gender: 'Feminino' }); hist('a2', 3);                       // poucos treinos
    U({ id: 'a3', name: 'Carla', gender: null }); hist('a3', 30);                           // sem gênero
    U({ id: 'a4', name: 'ELITE', gender: 'Masculino' }); hist('a4', 40);                    // suspeito, mas não marcado como teste: continua dentro
    U({ id: 'a5', name: 'Teste Dani', isTestAccount: true }); hist('a5', 40);
    U({ id: 'a6', name: 'Edu', gender: 'Masculino', active: false }); hist('a6', 30);       // inativo
    U({ id: 'b1', name: 'De outro coach', coachId: 'cB' }); hist('b1', 50);
    const pool = await loadInsightsPool(P, 'cA', NOW);
    const by = (id: string) => pool.students.find((s) => s.id === id)!;
    assert.strictEqual(by('b1'), undefined, 'aluno de outro coach nunca aparece');
    assert.deepStrictEqual(pool.included.map((s) => s.id).sort(), ['a1', 'a4']);
    assert.strictEqual(by('a2').verdict.reason, 'POUCOS_TREINOS'); assert.strictEqual(by('a3').verdict.reason, 'SEM_GENERO'); assert.strictEqual(by('a5').verdict.reason, 'TESTE'); assert.strictEqual(by('a6').verdict.reason, 'INATIVO');
    assert.strictEqual(by('a4').suspectTest, true); assert.strictEqual(by('a4').verdict.included, true, 'sugestão não tira ninguém sozinha'); assert.strictEqual(by('a1').suspectTest, false); assert.strictEqual(by('a5').suspectTest, false, 'já marcada como teste: não precisa sugerir de novo');
    assert.strictEqual(by('a1').sessions, 8); assert.strictEqual(by('a1').level!.level, 'INICIANTE', '6 meses mas só 8 treinos: ainda iniciante');
    S.user.find((u: any) => u.id === 'cA').insightsIncludeInactive = true;
    assert.deepStrictEqual((await loadInsightsPool(P, 'cA', NOW)).included.map((s) => s.id).sort(), ['a1', 'a4', 'a6'], 'chave de inativos liga o Edu (30 treinos)');
  });
  await t('pool: antes das colunas novas (db push) cai na regra automática em vez de quebrar', async () => {
    seed(); U({ id: 'a1', name: 'Ana' }); hist('a1', 8);
    const orig = P.user.findMany;
    await withUser({ findMany: async (args: any) => { if (args?.select?.insightsMode) throw Object.assign(new Error('The column `User.insightsMode` does not exist'), { code: 'P2022' }); return orig(args); } }, async () => {
      const pool = await loadInsightsPool(P, 'cA', NOW); assert.deepStrictEqual(pool.included.map((s) => s.id), ['a1']); assert.strictEqual(pool.includeInactive, false);
    });
  });
  await t('pool: erro de verdade (não é coluna faltando) NÃO é engolido', async () => {
    seed(); U({ id: 'a1' }); const real = P.user.findMany; await withUser({ findMany: async (args: any) => { if (args?.select?.insightsMode) throw new Error('conexão caiu'); return real(args); } }, async () => { await assert.rejects(() => loadInsightsPool(P, 'cA', NOW), /conexão caiu/); });
  });

  await t('rota scope GET: só coach logado; aluno comum recebe 403; sem login 401; devolve motivo e contagens', async () => {
    seed(); U({ id: 'a1', name: 'Ana' }); hist('a1', 8); U({ id: 'a4', name: 'Teste Silva' }); hist('a4', 9); U({ id: 'a5', name: 'Zé', insightsMode: 'EXCLUDE' }); hist('a5', 9);
    assert.strictEqual((await scopeGET(req('GET', '/api/insights/scope', null))).status, 401);
    assert.strictEqual((await scopeGET(req('GET', '/api/insights/scope', tok('a1', 'USER')))).status, 403);
    const r = await scopeGET(req('GET', '/api/insights/scope', tok('cA'))); assert.strictEqual(r.status, 200); const j: any = await r.json();
    assert.deepStrictEqual(j.counts, { total: 3, included: 2, suspectTest: 1 }); assert.strictEqual(j.students.find((s: any) => s.id === 'a5').reason, 'MANUAL_FORA'); assert.strictEqual(j.students.find((s: any) => s.id === 'a4').suspectTest, true);
    assert.strictEqual(JSON.stringify(j).includes('email'), false, 'não vaza e-mail');
  });
  await t('rota scope PUT: marca/solta aluno, em massa, só da própria carteira; valida entrada; chave de inativos', async () => {
    seed(); U({ id: 'a1' }); U({ id: 'a2' }); U({ id: 'b1', coachId: 'cB' });
    const put = async (body: any, as: string | null = tok('cA')) => { const r = await scopePUT(req('PUT', '/api/insights/scope', as, body)); return { status: r.status, json: await r.json() as any }; };
    const mode = (id: string) => S.user.find((u: any) => u.id === id).insightsMode;
    assert.strictEqual((await put({ studentId: 'a1', mode: 'EXCLUDE' }, null)).status, 401); assert.strictEqual((await put({ studentId: 'a1', mode: 'EXCLUDE' }, tok('a1', 'USER'))).status, 403);
    let r = await put({ studentId: 'a1', mode: 'EXCLUDE' }); assert.strictEqual(r.status, 200); assert.strictEqual(mode('a1'), 'EXCLUDE');
    r = await put({ studentIds: ['a1', 'a2', 'b1', 'a1'], mode: 'INCLUDE' }); assert.deepStrictEqual(r.json.updated.sort(), ['a1', 'a2']); assert.deepStrictEqual(r.json.skipped, ['b1']); assert.strictEqual(mode('b1'), null, 'aluno de outro coach não é alterado'); assert.strictEqual(mode('a2'), 'INCLUDE');
    assert.strictEqual((await put({ studentId: 'b1', mode: 'EXCLUDE' })).status, 404);
    r = await put({ studentId: 'a1', mode: null }); assert.strictEqual(mode('a1'), null, 'null volta para a regra automática');
    assert.strictEqual((await put({ studentId: 'a1', mode: 'TALVEZ' })).status, 400); assert.strictEqual((await put({ studentId: 'a1' })).status, 400); assert.strictEqual((await put({ studentIds: [], mode: 'INCLUDE' })).status, 400); assert.strictEqual((await put({ studentIds: Array.from({ length: 61 }, (_, i) => 'x' + i), mode: 'INCLUDE' })).status, 400);
    assert.strictEqual((await put({ studentId: 'cA', mode: 'EXCLUDE' })).status, 404, 'coach não se marca como aluno');
    r = await put({ includeInactive: true }); assert.strictEqual(r.status, 200); assert.strictEqual(S.user.find((u: any) => u.id === 'cA').insightsIncludeInactive, true); assert.strictEqual(S.user.find((u: any) => u.id === 'cB').insightsIncludeInactive, false);
  });
  await t('rota scope PUT: coluna ainda não criada responde 503 claro, erro comum 500', async () => {
    seed(); U({ id: 'a1' });
    await withUser({ updateMany: async () => { throw Object.assign(new Error('column does not exist'), { code: 'P2022' }); } }, async () => {
      const r = await scopePUT(req('PUT', '/api/insights/scope', tok('cA'), { studentId: 'a1', mode: 'EXCLUDE' })); assert.strictEqual(r.status, 503); assert.strictEqual(((await r.json()) as any).code, 'NOT_READY');
    });
    await withUser({ updateMany: async () => { throw new Error('caiu'); } }, async () => { const r2 = await scopePUT(req('PUT', '/api/insights/scope', tok('cA'), { studentId: 'a1', mode: 'EXCLUDE' })); assert.strictEqual(r2.status, 500); });
  });

  await t('rota student-level: o aluno vê o dele, o coach vê o do aluno dele, outro coach/aluno não; usa o nível de entrada e os treinos feitos', async () => {
    seed(); U({ id: 's1', name: 'Sol', level: 'Iniciante', startDate: monthsAgo(3.05), createdAt: monthsAgo(1) }); hist('s1', 30);   /* a data que vale é a de início, não a do cadastro */ U({ id: 's2', coachId: 'cB', level: null });
    S.anamnese.push({ id: 'an1', userId: 's2', nivel: 'Avançado', createdAt: NOW });
    const get = async (q: string, as: string | null) => { const r = await levelGET(req('GET', '/api/student-level' + q, as)); return { status: r.status, json: await r.json() as any }; };
    assert.strictEqual((await get('', null)).status, 401);
    let r = await get('', tok('s1', 'USER')); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.level, 'INTERMEDIARIO'); assert.strictEqual(r.json.sessions, 30); assert.match(r.json.message, /Intermediário/);
    assert.strictEqual((await get('?userId=s1', tok('cA'))).status, 200); assert.strictEqual((await get('?userId=s1', tok('cB'))).status, 403); assert.strictEqual((await get('?userId=s1', tok('s2', 'USER'))).status, 403); assert.strictEqual((await get('?userId=nada', tok('cA'))).status, 404);
    assert.strictEqual((await get('', tok('s2', 'USER'))).json.level, 'AVANCADO', 'sem nível no cadastro, vale o da anamnese');
    const m = await loadStudentLevels(P, ['s1', 's2', 'nada'], NOW); assert.strictEqual(m.size, 2);
  });

  console.log(ok + ' blocos ok');
})();
