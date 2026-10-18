import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as analyzePOST } from '/home/user/fitos-final/app/api/insights/analyze/route';
import { POST as groupPOST } from '/home/user/fitos-final/app/api/insights/group/route';
import { callTool, RETRY_ONLY_IF_UNDER_MS } from '@/lib/aiTool';
import { analyzeStudent, SYSTEM_PROMPT, ANALYSIS_MODEL, MAX_SOURCES } from '/home/user/fitos-final/lib/insightAnalysis';
import { groupInsights, aggregateGroups, loadGroupEntries, sanitizeInsight, GROUP_MODEL, ROUTINES_PER_STUDENT } from '/home/user/fitos-final/lib/insightGroup';
import { stable, hashOf, digestRoutine, diffSources, sanitizeAnalysis, spokenAnalysis, MAX_DIGEST_CHARS } from '/home/user/fitos-final/lib/insightDigest';
import { readMemory, saveMemory, dropMemory } from '/home/user/fitos-final/lib/insightMemory';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
import { anonymizeUserAccount } from '/home/user/fitos-final/lib/accountDeletion';

const P = prisma as any; const S = P.__state; const G: any = globalThis;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const CA = PAULO_ID;   // o master sempre tem a chave `perguntasVoz`; os alunos são dele
const NOW = new Date('2026-10-18T15:00:00Z'); const DAY = 86400000; const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; } };

// ── cenário ──
const U = (id: string, o: any = {}) => S.user.push({ id, name: id, role: 'USER', coachId: CA, active: true, accountStatus: 'ACTIVE', isTestAccount: false, gender: 'Feminino', level: 'Intermediário', insightsMode: null, createdAt: ago(300), startDate: ago(300), email: id + '@secreto.com', phone: '11999990000', ...o });
const A = (userId: string, o: any = {}) => S.anamnese.push({ id: 'an-' + userId, userId, createdAt: ago(100), objetivo: 'Emagrecimento', nivel: 'Intermediário', frequencia: 4, tempoDisponivel: 60, limitacoes: [], cirurgias: [], equipamentos: ['Academia Completa'], ...o });
const R = (userId: string, wid: string, createdDaysAgo: number, n: number) => { S.workout.push({ id: wid, userId, name: 'Ficha ' + wid, createdAt: ago(createdDaysAgo), endDate: null, archived: true }); for (let i = 0; i < n; i++) S.workoutHistory.push({ id: `h-${wid}-${i}`, userId, name: 'A', date: ago(createdDaysAgo - 1 - i), workoutId: wid }); };
const EX = (id: string, o: any = {}) => S.exercise.push({ id, name: 'Ex ' + id, category: 'PEITO', tags: {}, environments: ['UNIVERSAL'], ...o });
const WE = (wid: string, exerciseId: string, day: string, order: number, o: any = {}) => S.workoutExercise.push({ id: `we-${wid}-${day}-${order}`, workoutId: wid, exerciseId, day, order, sets: 3, reps: '12', restTime: 60, technique: null, notes: null, substitutes: [], substituteId: null, ...o });
const REF = (id: string, o: any = {}, an: any = {}) => { U(id, { name: 'Maria ' + id, ...o }); A(id, { limitacoes: ['Joelho'], ...an }); for (let k = 1; k <= 3; k++) R(id, `${id}-w${k}`, (4 - k) * 30, 3); WE(`${id}-w1`, 'e1', 'A', 0, { technique: 'DROPSET', sets: 4 }); WE(`${id}-w1`, 'e2', 'A', 1); WE(`${id}-w1`, 'e3', 'B', 0); };
const seed = () => {
  P.__reset(); G.__LLM = null; process.env.ANTHROPIC_API_KEY = 'k';
  S.user.push({ id: CA, role: 'COACH', name: 'Paulo', accountStatus: 'ACTIVE', active: true, coachId: null, insightsIncludeInactive: false }, { id: 'cB', role: 'COACH', name: 'Outro', accountStatus: 'ACTIVE', active: true, coachId: null });
  EX('e1', { name: 'Supino reto' }); EX('e2', { name: 'Leg Press', category: 'PERNA', tags: { jointRisk: ['JOELHO'] } }); EX('e3', { name: 'Voador', environments: ['ACADEMIA_PADRAO'] }); EX('e4', { name: 'Remada', category: 'COSTAS' });
  U('t', { name: 'Tatiana Souza', createdAt: ago(20), startDate: ago(20) }); A('t', { limitacoes: ['Joelho'] });
  S.equipmentReport.push({ id: 'er1', userId: 't', exerciseId: 'e3', exerciseName: 'Voador', status: 'OPEN' });
  REF('r1'); REF('r2', {}, { frequencia: 5 });
};
const ANSWER = (o: any = {}) => ({ resumo: 'As referências treinam 2 dias com foco em pernas. Troque o que pesa no joelho.', estrutura: ['2 dias: A (pernas) e B (costas).'], aproveitar: ['Supino reto 4x10 com dropset da Referência 1.'], mudar: ['Trocar o Leg Press: pesa no joelho (Referência 1).', 'Voador: ela não tem o aparelho.'], metodologia: { nome: 'ABC com progressão de carga', porque: 'Nível intermediário.', como_aplicar: 'Aumente 2 kg quando fechar as séries.' }, proxima_rotina: 'Rotina de 3 dias, foco em glúteos, 16 séries por dia.', alertas: ['Evitar impacto no joelho.'], ...o });
const mk = (answer: any = ANSWER(), o: any = {}) => { const c: any = { calls: [], fail: null, messages: { create: async (args: any) => { c.calls.push(args); if (c.fail) throw c.fail; if (o.raw) return o.raw; return { content: [{ type: 'tool_use', name: args.tools[0].name, input: typeof answer === 'function' ? answer(args) : answer }], usage: { input_tokens: 1800, output_tokens: 600 } }; } } }; return c; };
const user = (c: any, i = 0) => String(c.calls[i].messages[0].content);
const post = async (fn: any, body: any, as: string | null) => { const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as; const r = await fn(new Request('http://x/api/insights', { method: 'POST', headers, body: JSON.stringify(body) })); return { status: r.status, json: (await r.json().catch(() => null)) as any }; };
const withModel = async (model: string, over: Record<string, any>, fn: () => Promise<void>) => { S.override[model] = over; try { await fn(); } finally { delete S.override[model]; } };

(async () => {
  await t('resumos: hash estável (ordem das chaves não importa), texto compacto com avisos, teto de tamanho, e o que mudou entre fontes', () => {
    assert.strictEqual(stable({ b: 1, a: [2, { d: 1, c: 2 }] }), stable({ a: [2, { c: 2, d: 1 }], b: 1 })); assert.strictEqual(hashOf({ a: 1 }), hashOf({ a: 1 })); assert.notStrictEqual(hashOf({ a: 1 }), hashOf({ a: 2 })); assert.strictEqual(hashOf(undefined), hashOf(null)); assert.strictEqual(hashOf({ a: 1 }).length, 16);
    const days: any = [{ day: 'A', byCategory: [{ category: 'peito', count: 2 }], exercises: [{ name: 'Supino', sets: 4, reps: '10', technique: 'DROPSET', flags: [] }, { name: 'Crucifixo', sets: 3, reps: '12', technique: null, flags: ['SEM_APARELHO', 'LIMITACAO'] }] }, { day: 'B', byCategory: [], exercises: [{ name: 'Remada', sets: 3, reps: '12', technique: null, flags: ['AMBIENTE'] }] }];
    const days2: any = [{ day: 'A', byCategory: [], exercises: [{ name: 'Remada', sets: 5, reps: '15', technique: 'DROPSET', series: 'S1 15 · S2 8 DROPSET', flags: [] }, { name: 'Rosca', sets: 3, reps: '10', technique: 'BISET', series: 'S1–3 10', flags: [] }, { name: 'Esteira', sets: 1, reps: '400', technique: 'Moderada', series: '', flags: [] }] }];
    assert.strictEqual(digestRoutine(days2).text, 'Dia A: Remada S1 15 · S2 8 DROPSET; Rosca S1–3 10 BISET; Esteira 1x400 Moderada', 'linha por série, bi-set à parte, sem JSON'); assert.deepStrictEqual(digestRoutine(days2).stats.techniques, ['BISET', 'DROPSET', 'Moderada']);
    const d = digestRoutine(days, { withFlags: true }); assert.strictEqual(d.text, 'Dia A (PEITO 2): Supino 4x10 DROPSET; Crucifixo 3x12 [SEM APARELHO+LIMITAÇÃO]\nDia B: Remada 3x12 [OUTRO LOCAL]');
    assert.deepStrictEqual(d.stats, { days: 2, exercises: 3, avgSets: 3.3, techniques: ['DROPSET'], flagged: 2 }); assert.ok(!digestRoutine(days).text.includes('['), 'sem marcação quando não é pedido'); assert.strictEqual(digestRoutine(days).hash === d.hash, false);
    const big = digestRoutine([{ day: 'A', byCategory: [], exercises: Array.from({ length: 200 }, (_, i) => ({ name: 'Exercício muito longo número ' + i, sets: 3, reps: '12', technique: null, flags: [] })) }] as any); assert.strictEqual(MAX_DIGEST_CHARS, 1800); assert.strictEqual(big.text.length, 1800); assert.ok(big.text.endsWith('…')); assert.deepStrictEqual(digestRoutine([]).stats, { days: 0, exercises: 0, avgSets: 0, techniques: [], flagged: 0 });
    assert.deepStrictEqual(diffSources({ __target: 'x', a: '1', b: '2', c: '3' }, { __target: 'y', a: '1', b: '9', d: '4' }), { added: ['d'], removed: ['c'], changed: ['b'], same: ['a'] }); assert.deepStrictEqual(diffSources(null, { __target: 'x', a: '1' }), { added: ['a'], removed: [], changed: [], same: [] });
  });
  await t('limpeza do que a IA devolve: tamanhos máximos, tipos errados, "Referência N" vira o nome; texto falado junta o essencial', () => {
    const a = sanitizeAnalysis({ resumo: 'x'.repeat(900), estrutura: ['a', '', null, 'b', 'c', 'd', 'e'], aproveitar: 'não é lista', mudar: [1, 2], metodologia: { nome: 'N', porque: 'P', como_aplicar: 'C' }, proxima_rotina: 5, alertas: ['1', '2', '3', '4'] }, {});
    assert.strictEqual(a.resumo.length, 480); assert.deepStrictEqual(a.estrutura, ['a', 'b', 'c', 'd']); assert.deepStrictEqual(a.aproveitar, []); assert.deepStrictEqual(a.mudar, ['1', '2']); assert.strictEqual(a.proxima_rotina, '5'); assert.strictEqual(a.alertas.length, 3);
    const b = sanitizeAnalysis({ resumo: 'Como a Referência 1 e a referência 2.', mudar: ['Referencia 3 usa isso'], metodologia: null }, { 1: 'Ana (rotina 1)', 2: 'Bia (rotina 2)', 3: 'Cris (rotina 1)' }); assert.strictEqual(b.resumo, 'Como a Ana (rotina 1) e a Bia (rotina 2).'); assert.deepStrictEqual(b.mudar, ['Cris (rotina 1) usa isso']); assert.deepStrictEqual(b.metodologia, { nome: '', porque: '', como_aplicar: '' });
    assert.strictEqual(sanitizeAnalysis(null).resumo, ''); const sp = spokenAnalysis(sanitizeAnalysis(ANSWER())); assert.match(sp, /^As referências treinam 2 dias/); assert.match(sp, /Metodologia sugerida: ABC com progressão de carga\. Nível intermediário\./); assert.match(sp, /Dá para aproveitar: Supino reto/); assert.match(sp, /Mudar: Trocar o Leg Press.*Voador/); assert.strictEqual(spokenAnalysis(sanitizeAnalysis({ resumo: 'só isso' })), 'só isso');
  });

  await t('análise nova: UMA chamada de IA com o perfil sem nome/contato, as referências com os avisos para ELE, e o resultado vai para a memória', async () => {
    seed(); const c = mk(); const r = await analyzeStudent(P, CA, 't', { client: c, now: NOW });
    assert.strictEqual(c.calls.length, 1); const a = c.calls[0]; assert.strictEqual(a.model, ANALYSIS_MODEL); assert.deepStrictEqual(a.tool_choice, { type: 'auto' }, 'o claude-sonnet-5-5 NÃO aceita forçar a ferramenta (erro 400 em produção)'); assert.ok(a.system.startsWith(SYSTEM_PROMPT) && a.system.endsWith('Responda chamando a ferramenta registrar_analise.')); assert.ok(a.max_tokens >= 4000, 'espaço para o modelo pensar e ainda escrever a análise'); assert.deepStrictEqual(a.output_config, { effort: 'medium' }); assert.ok(!('temperature' in a));
    const u = user(c); assert.match(u, /Gênero: Feminino. Nível: Intermediário. Objetivo: Emagrecimento. Frequência: 4x por semana. Local de treino: ACADEMIA/); assert.match(u, /Limitações: Joelho/); assert.match(u, /entrando na rotina nº 1 \(compara com as rotinas 1 a 3/); assert.match(u, /### Referência 1 \(parecido \d+%, rotina nº 1, 3 treinos feitos\)/); assert.match(u, /### Referência 2/);
    assert.match(u, /Leg Press 3x12 \[LIMITAÇÃO\]/); assert.match(u, /Voador 3x12 \[SEM APARELHO\]/); assert.match(u, /Supino reto 4x12 DROPSET/);
    for (const secret of ['Tatiana', 'Souza', 'Maria', 'secreto.com', '11999990000', 'r1', 'r2']) assert.ok(!u.includes(secret), 'não pode mandar: ' + secret);
    assert.strictEqual(r.ok, true); assert.deepStrictEqual([r.cached, r.incremental, r.stale, r.memory], [false, false, false, true]); assert.match(r.analysis!.aproveitar[0], /Supino reto 4x10 com dropset da Maria r1 \(rotina 1\)/, 'o nome volta no servidor'); assert.deepStrictEqual(r.usage!.inputTokens, 1800); assert.strictEqual(r.sources.length, 2); assert.deepStrictEqual(r.sources.map((s) => s.studentId).sort(), ['r1', 'r2']);
    const row = S.insightMemory[0]; assert.deepStrictEqual([row.coachId, row.kind, row.key, row.runs, row.hits, row.model, row.inputTokens, row.outputTokens], [CA, 'ANALYSIS', 't', 1, 0, ANALYSIS_MODEL, 1800, 600]); assert.ok(row.fingerprint && row.sources.__target && row.sources['r1-w1'] && row.sources['r2-w1']);
    assert.strictEqual(S.aiLog.length, 1); assert.match(S.aiLog[0].question, /^insight-analysis:t:full$/); assert.ok(MAX_SOURCES === 3);
  });
  await t('memória: o MESMO pedido não chama a IA (custo zero), conta o uso da memória e devolve a mesma análise', async () => {
    seed(); const c = mk(); const first = await analyzeStudent(P, CA, 't', { client: c, now: NOW }); const again = await analyzeStudent(P, CA, 't', { client: c, now: NOW }); const third = await analyzeStudent(P, CA, 't', { client: c, now: NOW });
    assert.strictEqual(c.calls.length, 1, 'a IA só foi chamada na 1ª vez'); assert.deepStrictEqual([again.cached, again.incremental, again.stale], [true, false, false]); assert.deepStrictEqual(again.analysis, first.analysis); assert.deepStrictEqual(again.stats, { runs: 1, hits: 1 }); assert.deepStrictEqual(third.stats, { runs: 1, hits: 2 }); assert.strictEqual(S.insightMemory[0].hits, 2); assert.strictEqual(S.aiLog.length, 1, 'cache não gera registro de gasto'); assert.strictEqual(again.usage, undefined);
    assert.strictEqual(S.insightMemory.length, 1, 'uma linha só por aluno');
  });
  await t('memória incremental: referência NOVA → manda a análise anterior + só a rotina nova (bem menos texto) e pede para atualizar', async () => {
    seed(); const c = mk(); await analyzeStudent(P, CA, 't', { client: c, now: NOW }); const fullLen = user(c).length;
    REF('r3', {}, { frequencia: 3 }); WE('r3-w1', 'e4', 'A', 3);
    const r = await analyzeStudent(P, CA, 't', { client: c, now: NOW }); assert.strictEqual(c.calls.length, 2); const u = user(c, 1);
    assert.deepStrictEqual([r.cached, r.incremental], [false, true]); assert.match(u, /^ATUALIZE a análise anterior/); assert.match(u, /ANÁLISE ANTERIOR \(JSON\)\n\{"resumo"/); assert.match(u, /REFERÊNCIAS NOVAS OU ALTERADAS\n### Referência \d/); assert.match(u, /REFERÊNCIAS QUE CONTINUAM IGUAIS \(já consideradas\): Referência \d(, Referência \d)?/);
    assert.strictEqual((u.match(/### Referência/g) || []).length, 1, 'só 1 rotina nova no texto'); assert.ok(u.includes('Remada'), 'a rotina nova está lá'); assert.strictEqual((u.match(/Leg Press 3x12/g) || []).length, 1, 'só a rotina nova entra (se as 2 antigas fossem reenviadas seriam 3)');
    assert.strictEqual(S.insightMemory.length, 1); assert.deepStrictEqual([S.insightMemory[0].runs, S.insightMemory[0].hits], [2, 0]); assert.strictEqual(r.sources.length, 3); assert.match(S.aiLog[1].question, /:inc$/); assert.ok(fullLen > 0);
    const again = await analyzeStudent(P, CA, 't', { client: c, now: NOW }); assert.strictEqual(again.cached, true); assert.strictEqual(c.calls.length, 2, 'e agora está em dia de novo');
    WE('r1-w1', 'e4', 'B', 5, { sets: 5 });   // o coach MUDOU uma rotina de referência que a análise já tinha visto
    const ch = await analyzeStudent(P, CA, 't', { client: c, now: NOW }); assert.strictEqual(c.calls.length, 3, 'rotina alterada: não pode vir da memória'); assert.strictEqual(ch.incremental, true); const cu = user(c, 2);
    assert.strictEqual((cu.match(/### Referência/g) || []).length, 1, 'só a rotina alterada é reenviada'); assert.match(cu, /Remada 5x12/, 'com a mudança');
  });
  await t('mudou o ALUNO (aparelho novo que faltou, anamnese) → análise completa de novo, sem "atualize"; refresh também força completa', async () => {
    seed(); const c = mk(); await analyzeStudent(P, CA, 't', { client: c, now: NOW });
    S.equipmentReport.push({ id: 'er2', userId: 't', exerciseId: 'e1', exerciseName: 'Supino reto', status: 'OPEN' }); const r = await analyzeStudent(P, CA, 't', { client: c, now: NOW });
    assert.strictEqual(c.calls.length, 2); assert.strictEqual(r.incremental, false); assert.ok(!user(c, 1).startsWith('ATUALIZE')); assert.match(user(c, 1), /Supino reto 4x12 DROPSET \[SEM APARELHO\]/, 'agora o supino também está marcado');
    S.anamnese.find((a: any) => a.userId === 't').frequencia = 6; await analyzeStudent(P, CA, 't', { client: c, now: NOW }); assert.strictEqual(c.calls.length, 3, 'frequência mudou: perfil mudou'); assert.match(user(c, 2), /Frequência: 6x/);
    const f = await analyzeStudent(P, CA, 't', { client: c, now: NOW, refresh: true }); assert.strictEqual(c.calls.length, 4); assert.strictEqual(f.incremental, false); assert.strictEqual(S.insightMemory[0].runs, 4);
  });
  await t('só ver a última (onlyCached): nunca chama a IA; sem memória avisa; desatualizada vem marcada; em dia vem como "da memória"', async () => {
    seed(); const c = mk(); let r = await analyzeStudent(P, CA, 't', { client: c, now: NOW, onlyCached: true }); assert.strictEqual(c.calls.length, 0); assert.deepStrictEqual([r.ok, r.reason, r.analysis], [true, 'SEM_MEMORIA', null]); assert.strictEqual(r.sources.length, 2);
    await analyzeStudent(P, CA, 't', { client: c, now: NOW }); r = await analyzeStudent(P, CA, 't', { client: c, now: NOW, onlyCached: true }); assert.deepStrictEqual([r.cached, r.stale, c.calls.length], [true, false, 1]); assert.ok(r.analysis);
    REF('r3'); r = await analyzeStudent(P, CA, 't', { client: c, now: NOW, onlyCached: true }); assert.deepStrictEqual([r.cached, r.stale, c.calls.length], [true, true, 1], 'mostra a antiga, avisando que há novidade, sem gastar IA');
  });
  await t('casos sem análise: aluno de outro coach, sem gênero, sem parecidos (sem chamar a IA)', async () => {
    seed(); const c = mk(); assert.strictEqual((await analyzeStudent(P, 'cB', 't', { client: c })).reason, 'NAO_ENCONTRADO'); assert.strictEqual((await analyzeStudent(P, CA, 'nada', { client: c })).reason, 'NAO_ENCONTRADO');
    S.user.find((u: any) => u.id === 't').gender = null; assert.strictEqual((await analyzeStudent(P, CA, 't', { client: c })).reason, 'SEM_GENERO'); S.user.find((u: any) => u.id === 't').gender = 'Feminino';
    P.__reset(); S.user.push({ id: CA, role: 'COACH', coachId: null }); U('t'); A('t'); const none = await analyzeStudent(P, CA, 't', { client: c }); assert.deepStrictEqual([none.ok, none.reason, none.analysis], [false, 'SEM_PARECIDOS', null]); assert.strictEqual(c.calls.length, 0);
    seed(); await analyzeStudent(P, CA, 't', { client: c, now: NOW }); for (const id of ['r1', 'r2']) S.user.find((u: any) => u.id === id).gender = 'Masculino'; const gone = await analyzeStudent(P, CA, 't', { client: c, now: NOW }); assert.deepStrictEqual([gone.ok, gone.reason, !!gone.analysis], [false, 'SEM_PARECIDOS', true], 'ninguém parecido agora, mas a última análise continua visível');
    seed(); S.workoutExercise.length = 0; const empty = await analyzeStudent(P, CA, 't', { client: c, now: NOW }); assert.strictEqual(empty.ok, true, 'referências sem exercício ainda geram resumo vazio, sem quebrar');
  });
  await t('sem a tabela da memória (antes do db push): funciona, só que cada pedido gasta IA; erro da IA não grava nada e não esconde o problema', async () => {
    seed(); const c = mk(); const boom = () => { throw Object.assign(new Error('The table `public.InsightMemory` does not exist'), { code: 'P2021' }); };
    await withModel('insightMemory', { findFirst: boom, create: boom, update: boom }, async () => {
      const a = await analyzeStudent(P, CA, 't', { client: c, now: NOW }); const b = await analyzeStudent(P, CA, 't', { client: c, now: NOW });
      assert.strictEqual(c.calls.length, 2); assert.deepStrictEqual([a.ok, a.memory, a.cached, b.cached], [true, false, false, false]); assert.ok(a.analysis);
    });
    seed(); const bad = mk(); bad.fail = new Error('IA fora do ar'); await assert.rejects(() => analyzeStudent(P, CA, 't', { client: bad, now: NOW }), /IA fora do ar/); assert.strictEqual(S.insightMemory.length, 0, 'falhou: nada guardado');
    const ref = mk(null, { raw: { stop_reason: 'refusal', content: [] } }); await assert.rejects(() => analyzeStudent(P, CA, 't', { client: ref, now: NOW }), /recusou/); const noTool = mk(null, { raw: { content: [{ type: 'text', text: 'oi' }] } }); await assert.rejects(() => analyzeStudent(P, CA, 't', { client: noTool, now: NOW }), /não devolveu/);
    S.failOn.workout = { message: 'banco caiu' }; await assert.rejects(() => analyzeStudent(P, CA, 't', { client: c, now: NOW }), /banco caiu/); delete S.failOn.workout;
    delete process.env.ANTHROPIC_API_KEY; await assert.rejects(() => analyzeStudent(P, CA, 't', {}), /ANTHROPIC_API_KEY/);
  });
  await t('só a carteira e o próprio coach: a memória de um coach não aparece para outro; excluir aluno/coach apaga a memória', async () => {
    seed(); const c = mk(); await analyzeStudent(P, CA, 't', { client: c, now: NOW }); assert.strictEqual((await readMemory(P, 'cB', 'ANALYSIS', 't')).row, null); assert.ok((await readMemory(P, CA, 'ANALYSIS', 't')).row);
    await saveMemory(P, 'cB', 'GROUP', 'all', { fingerprint: 'x', result: {} }, null); await saveMemory(P, CA, 'ANALYSIS', 'outro', { fingerprint: 'y', result: {} }, null); await saveMemory(P, CA, 'GROUP', 't', { fingerprint: 'z', result: {} }, null); assert.strictEqual(S.insightMemory.length, 4);
    await dropMemory(P, { studentId: 't' }); assert.deepStrictEqual(S.insightMemory.map((m: any) => m.key).sort(), ['all', 'outro', 't'], 'some só a ANÁLISE daquele aluno (a visão geral, mesmo com chave igual, fica)'); await dropMemory(P, { coachId: CA }); assert.deepStrictEqual(S.insightMemory.map((m: any) => m.coachId), ['cB']);
    await saveMemory(P, CA, 'ANALYSIS', 't', { fingerprint: 'q', result: {} }, null); await saveMemory(P, CA, 'GROUP', 'all', { fingerprint: 'q', result: {} }, null); await anonymizeUserAccount('t'); assert.deepStrictEqual(S.insightMemory.filter((m: any) => m.coachId === CA).map((m: any) => m.kind), ['GROUP'], 'conta do aluno excluída: some a análise dele');
    await anonymizeUserAccount('cB'); assert.strictEqual(S.insightMemory.length, 1, 'coach excluído: some tudo dele (resta só a do Paulo)');
    await dropMemory({}, { coachId: CA });   // sem a tabela / sem o modelo: não quebra
  });

  // ── visão geral do grupo ──
  const GR = (id: string, gender: string, level: string, wexs: [string, string, any?][][]) => { U(id, { gender, level, name: 'Nome ' + id }); A(id); wexs.forEach((exs, k) => { R(id, `${id}-g${k}`, (wexs.length - k) * 30, 6); exs.forEach(([ex, day, o], i) => WE(`${id}-g${k}`, ex, day, i, o || {})); }); };
  await t('contas do grupo: por gênero e nível (nunca misturados), médias e porcentagens certas; técnica JSON/normal não conta; grupo vazio some', () => {
    const e = (gender: any, level: any, routines: any[]) => ({ gender, level, routines });
    const x = (name: string, category: string, sets: number, technique: string | null = null) => ({ name, category, sets, technique });
    const g = aggregateGroups([e('Feminino', 'INTERMEDIARIO', [{ days: 2, exercises: [x('Supino', 'peito', 4, 'DROPSET'), x('Leg', 'perna', 3), x('Supino', 'peito', 3), x('Remada', 'costas', 4)] }]), e('Feminino', 'INTERMEDIARIO', [{ days: 3, exercises: [x('Supino', 'PEITO', 2), x('Leg', 'PERNA', 2)] }]), e('Masculino', 'AVANCADO', [{ days: 1, exercises: [x('Supino', 'PEITO', 5)] }]), e('Masculino', 'INICIANTE', [])]);
    assert.deepStrictEqual(g.map((x) => x.key), ['Feminino|INTERMEDIARIO', 'Masculino|AVANCADO'], 'sem grupo vazio; mulheres e homens separados'); const f = g[0];
    assert.deepStrictEqual([f.label, f.students, f.routines, f.avgDays, f.avgExercisesPerDay, f.avgSets], ['Mulheres · Intermediário', 2, 2, 2.5, 1.2, 3], 'dias: 5/2; exercícios por dia: 6/5; séries: 18/6');
    assert.deepStrictEqual(f.techniques, [{ name: 'DROPSET', pct: 17 }]); const two = aggregateGroups([{ gender: 'Feminino', level: 'INICIANTE', routines: [{ days: 1, exercises: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => x(n, 'X', 3, 'T' + i)) }] } as any])[0]; assert.strictEqual(two.techniques.length, 5, 'até 5 técnicas'); assert.strictEqual(two.topExercises.length, 7); assert.deepStrictEqual(f.topExercises[0], { name: 'Supino', count: 3 }); assert.deepStrictEqual(f.categories[0], { category: 'PEITO', pct: 50 }); assert.strictEqual(g[1].label, 'Homens · Avançado');
    assert.deepStrictEqual(aggregateGroups([]), []);
  });
  await t('visão geral: lê só quem entra nas análises e as ÚLTIMAS rotinas treinadas; IA recebe números e exercícios (sem nomes); resultado fica na memória', async () => {
    seed(); P.__reset(); S.user.push({ id: CA, role: 'COACH', coachId: null, insightsIncludeInactive: false }); EX('e1', { name: 'Supino reto' }); EX('e2', { name: 'Leg Press', category: 'PERNA' }); EX('e3', { name: 'Voador' });
    GR('f1', 'Feminino', 'Intermediário', [[['e1', 'A']], [['e1', 'A'], ['e2', 'B', { technique: 'BISET' }]], [['e2', 'A'], ['e3', 'A']], [['e3', 'A'], ['e3', 'B'], ['e1', 'C']]]);   // 4 rotinas: só as 3 últimas valem
    GR('f2', 'Feminino', 'Intermediário', [[['e1', 'A', { technique: '{"b":[]}' }], ['e2', 'A']]]); GR('m1', 'Masculino', 'Intermediário', [[['e1', 'A']]]);
    S.workout.push({ id: 'f2-nunca', userId: 'f2', name: 'montada e nunca treinada', createdAt: ago(1), archived: false }); WE('f2-nunca', 'e3', 'A', 0); WE('f2-nunca', 'e3', 'B', 1);
    U('x1', { isTestAccount: true }); A('x1'); R('x1', 'x1-w', 30, 5); WE('x1-w', 'e1', 'A', 0);
    const ent = await loadGroupEntries(P, CA, NOW); assert.strictEqual(ent.students, 3, 'o aluno de teste fica fora'); assert.strictEqual(ent.entries.reduce((n, e) => n + e.routines.length, 0), 5, '3 + 1 + 1: a ficha montada e nunca treinada não conta'); const f1 = ent.entries.find((e) => e.routines.length === ROUTINES_PER_STUDENT)!; assert.strictEqual(f1.routines.length, 3); assert.strictEqual(f1.routines[0].exercises.some((x) => x.technique === 'BISET'), true, 'a 1ª rotina (sem técnica) saiu; a 2ª, com BISET, é a mais antiga das 3');
    const c = mk({ resumo: 'Mulheres treinam 2 dias.', grupos: [{ grupo: 'Mulheres · Intermediário', leitura: 'Volume baixo.', metodologia: 'ABC' }], oportunidades: ['Variar mais'], alertas: [] });
    const r = await groupInsights(P, CA, { client: c, now: NOW }); assert.strictEqual(c.calls.length, 1); assert.strictEqual(c.calls[0].model, GROUP_MODEL); assert.deepStrictEqual(c.calls[0].tool_choice, { type: 'auto' }, 'visão geral também não força a ferramenta'); assert.ok(c.calls[0].system.endsWith('Responda chamando a ferramenta ' + c.calls[0].tools[0].name + '.')); assert.ok(c.calls[0].max_tokens >= 4000); assert.deepStrictEqual([r.usage.inputTokens, r.usage.outputTokens], [1800, 600], 'o custo registrado vem da resposta da IA'); const u = user(c);
    assert.match(u, /### Mulheres · Intermediário — 2 aluno\(s\)/); assert.match(u, /### Homens · Intermediário — 1 aluno\(s\)/); assert.match(u, /Exercícios mais repetidos: .*Supino reto/); for (const secret of ['Nome f1', 'f1', '@secreto', '11999990000']) assert.ok(!u.includes(secret), secret);
    assert.deepStrictEqual([r.ok, r.cached, r.stale, r.students, r.groups.length], [true, false, false, 3, 2]); assert.strictEqual(r.insight!.grupos[0].metodologia, 'ABC'); assert.strictEqual(S.insightMemory[0].kind, 'GROUP'); assert.strictEqual(S.insightMemory[0].key, 'all'); assert.strictEqual(S.aiLog.length, 1);
    const again = await groupInsights(P, CA, { client: c, now: NOW }); assert.strictEqual(c.calls.length, 1, 'nada mudou: sem IA'); assert.deepStrictEqual([again.cached, again.stale, again.stats], [true, false, { runs: 1, hits: 1 }]); assert.deepStrictEqual(again.insight, r.insight);
    GR('f3', 'Feminino', 'Intermediário', [[['e3', 'A']]]); const stale = await groupInsights(P, CA, { client: c, now: NOW, onlyCached: true }); assert.deepStrictEqual([stale.cached, stale.stale, c.calls.length], [true, true, 1], 'aluno novo: só mostra a antiga, avisando'); const upd = await groupInsights(P, CA, { client: c, now: NOW }); assert.deepStrictEqual([upd.cached, c.calls.length, S.insightMemory[0].runs], [false, 2, 2]);
    const f = await groupInsights(P, CA, { client: c, now: NOW, refresh: true }); assert.strictEqual(c.calls.length, 3);
  });
  await t('visão geral: sem nenhum aluno com treino feito não chama a IA; só mostrar a última sem memória; sem tabela segue funcionando; limpeza do texto da IA', async () => {
    seed(); P.__reset(); S.user.push({ id: CA, role: 'COACH', coachId: null }); const c = mk({}); const r = await groupInsights(P, CA, { client: c, now: NOW }); assert.deepStrictEqual([r.ok, r.groups, r.insight, c.calls.length], [true, [], null, 0]);
    seed(); P.__reset(); S.user.push({ id: CA, role: 'COACH', coachId: null }); EX('e1'); GR('f1', 'Feminino', 'Intermediário', [[['e1', 'A']]]); const o = await groupInsights(P, CA, { client: c, now: NOW, onlyCached: true }); assert.deepStrictEqual([o.groups.length, o.insight, o.cached, c.calls.length], [1, null, false, 0], 'números vêm mesmo sem IA e sem memória');
    const boom = () => { throw Object.assign(new Error('relation does not exist'), { code: 'P2021' }); }; await withModel('insightMemory', { findFirst: boom, create: boom, update: boom }, async () => { const x = mk({ resumo: 'ok', grupos: [], oportunidades: [], alertas: [] }); const a = await groupInsights(P, CA, { client: x, now: NOW }); const b = await groupInsights(P, CA, { client: x, now: NOW }); assert.deepStrictEqual([a.memory, a.cached, b.cached, x.calls.length], [false, false, false, 2]); });
    const s = sanitizeInsight({ resumo: 'r'.repeat(900), grupos: [{ grupo: 'G', leitura: 'L', metodologia: 'M' }, { grupo: '', leitura: 'sem nome' }, ...Array.from({ length: 12 }, (_, i) => ({ grupo: 'g' + i }))], oportunidades: 'x', alertas: ['a', 'b', 'c', 'd'] }); assert.strictEqual(s.resumo.length, 480); assert.strictEqual(s.grupos.length, 8); assert.deepStrictEqual(s.oportunidades, []); assert.strictEqual(s.alertas.length, 3);
  });

  // ── rotas ──
  await t('rota analyze: sem login 401, aluno 403, coach sem a chave 403 (sem gastar IA), pedido sem aluno 400, master faz e a 2ª vem da memória', async () => {
    seed(); const c = mk(); G.__LLM = async ({ args }: any) => ({ content: [{ type: 'tool_use', name: 'registrar_analise', input: ANSWER() }] }); let calls = 0; const orig = G.__LLM; G.__LLM = async (x: any) => { calls++; return orig(x); };
    assert.strictEqual((await post(analyzePOST, { studentId: 't' }, null)).status, 401); assert.strictEqual((await post(analyzePOST, { studentId: 't' }, tok('t', 'USER'))).status, 403); const locked = await post(analyzePOST, { studentId: 't' }, tok('cB')); assert.deepStrictEqual([locked.status, locked.json.locked], [403, true]); assert.strictEqual(calls, 0);
    assert.strictEqual((await post(analyzePOST, {}, tok(CA))).status, 400);
    const a = await post(analyzePOST, { studentId: 't' }, tok(CA)); assert.strictEqual(a.status, 200); assert.deepStrictEqual([a.json.ok, a.json.cached, calls], [true, false, 1]); assert.match(a.json.spoken, /^As referências treinam/); assert.strictEqual(a.json.analysis.metodologia.nome, 'ABC com progressão de carga');
    const b = await post(analyzePOST, { studentId: 't' }, tok(CA)); assert.deepStrictEqual([b.json.cached, calls], [true, 1]); const d = await post(analyzePOST, { studentId: 't', refresh: true }, tok(CA)); assert.deepStrictEqual([d.json.cached, calls], [false, 2]);
    const o = await post(analyzePOST, { studentId: 't', onlyCached: true }, tok(CA)); assert.deepStrictEqual([o.status, o.json.cached, calls], [200, true, 2]); void c;
  });
  await t('rota analyze: aluno de outro coach 404, sem gênero 422, IA fora do ar 502 (sem vazar o erro), limite por hora (só quando gasta IA)', async () => {
    seed(); let fail = false; G.__LLM = async () => (fail ? new Error('segredo-interno') : { content: [{ type: 'tool_use', name: 'registrar_analise', input: ANSWER() }] });
    U('z', { coachId: 'cB' }); A('z'); assert.strictEqual((await post(analyzePOST, { studentId: 'z' }, tok(CA))).status, 404);
    S.user.find((u: any) => u.id === 't').gender = null; const g = await post(analyzePOST, { studentId: 't' }, tok(CA)); assert.deepStrictEqual([g.status, g.json.reason], [422, 'SEM_GENERO']); S.user.find((u: any) => u.id === 't').gender = 'Feminino';
    fail = true; const e = await post(analyzePOST, { studentId: 't', refresh: true }, tok(CA)); assert.strictEqual(e.status, 502); assert.ok(!JSON.stringify(e.json).includes('segredo-interno')); fail = false;
    let last: any = null; for (let i = 0; i < 31; i++) last = await post(analyzePOST, { studentId: 't', refresh: true }, tok(PAULO_ID === CA ? CA : CA)); assert.strictEqual(last.status, 429, 'passou de 30 por hora');
    const cached = await post(analyzePOST, { studentId: 't', onlyCached: true }, tok(CA)); assert.strictEqual(cached.status, 200, 'ver a última nunca é barrado pelo limite');
  });
  await t('rota group: mesma trava; devolve contas + leitura; 2ª vez da memória; erro da IA = 502', async () => {
    seed(); P.__reset(); S.user.push({ id: CA, role: 'COACH', coachId: null, name: 'Paulo', accountStatus: 'ACTIVE', active: true }, { id: 'cB', role: 'COACH', accountStatus: 'ACTIVE', active: true, coachId: null }); EX('e1'); GR('f1', 'Feminino', 'Intermediário', [[['e1', 'A']]]);
    let calls = 0; let fail = false; G.__LLM = async () => { calls++; return fail ? new Error('x') : { content: [{ type: 'tool_use', name: 'registrar_visao', input: { resumo: 'ok', grupos: [], oportunidades: [], alertas: [] } }] }; };
    assert.strictEqual((await post(groupPOST, {}, null)).status, 401); assert.strictEqual((await post(groupPOST, {}, tok('cB'))).status, 403); assert.strictEqual(calls, 0);
    const a = await post(groupPOST, {}, tok(CA)); assert.deepStrictEqual([a.status, a.json.groups.length, a.json.cached, calls], [200, 1, false, 1]); const b = await post(groupPOST, {}, tok(CA)); assert.deepStrictEqual([b.json.cached, calls], [true, 1]);
    fail = true; assert.strictEqual((await post(groupPOST, { refresh: true }, tok(CA))).status, 502);
    fail = false; let last: any = null; for (let i = 0; i < 11; i++) last = await post(groupPOST, { refresh: true }, tok(CA)); assert.strictEqual(last.status, 429); assert.strictEqual((await post(groupPOST, { onlyCached: true }, tok(CA))).status, 200);
  });
  await t('chamada da IA sem forçar a ferramenta: 1ª resposta só com texto -> pede de novo UMA vez; soma o custo; recusa não repete; sem ferramenta nas 2 -> erro claro', async () => {
    const TOOLDEF = { name: 'registrar_x', description: 'x', input_schema: { type: 'object', properties: {} } };
    const mkc = (replies: any[]) => { const c: any = { calls: [], messages: { create: async (args: any) => { c.calls.push(JSON.parse(JSON.stringify(args))); return replies[Math.min(c.calls.length - 1, replies.length - 1)]; } } }; return c; };
    const text = { content: [{ type: 'text', text: 'Aqui vai a análise...' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 40 } };
    const tool = { content: [{ type: 'tool_use', name: 'registrar_x', input: { ok: 1 } }], stop_reason: 'tool_use', usage: { input_tokens: 130, output_tokens: 60 } };
    const o = { model: 'claude-sonnet-5-5', system: 'SYS', tool: TOOLDEF, user: 'U', refusalMsg: 'RECUSOU', missingMsg: 'SEM FERRAMENTA' };
    let c = mkc([tool]); let r = await callTool(c, o); assert.deepStrictEqual(r.input, { ok: 1 }); assert.strictEqual(c.calls.length, 1); assert.deepStrictEqual(c.calls[0].tool_choice, { type: 'auto' }); assert.strictEqual(c.calls[0].system, 'SYS\n\nResponda chamando a ferramenta registrar_x.'); assert.deepStrictEqual(r.usage, { inputTokens: 130, outputTokens: 60 });
    c = mkc([text, tool]); r = await callTool(c, o); assert.deepStrictEqual(r.input, { ok: 1 }); assert.strictEqual(c.calls.length, 2, 'tenta de novo uma vez'); const m2 = c.calls[1].messages; assert.deepStrictEqual(m2.map((x: any) => x.role), ['user', 'assistant', 'user']); assert.strictEqual(m2[0].content, 'U'); assert.deepStrictEqual(m2[1].content, text.content); assert.ok(String(m2[2].content).includes('registrar_x') && /sem escrever texto/.test(m2[2].content)); assert.deepStrictEqual(r.usage, { inputTokens: 230, outputTokens: 100 }, 'o custo das duas chamadas é somado');
    c = mkc([text, text]); await assert.rejects(() => callTool(c, o), /SEM FERRAMENTA/); assert.strictEqual(c.calls.length, 2, 'no máximo 2 chamadas');
    c = mkc([{ content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 1 } }, tool]); await assert.rejects(() => callTool(c, o), /RECUSOU/); assert.strictEqual(c.calls.length, 1, 'recusa não repete');
    c = mkc([text, { content: [], stop_reason: 'refusal', usage: {} }]); await assert.rejects(() => callTool(c, o), /RECUSOU/); assert.strictEqual(c.calls.length, 2);
    c = mkc([{ content: [{ type: 'text', text: 'cortado' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 6000 } }, tool]); await assert.rejects(() => callTool(c, o), /SEM FERRAMENTA/); assert.strictEqual(c.calls.length, 1, 'cortou por tamanho: repetir não adianta');
    c = mkc([{ content: [{ type: 'tool_use', name: 'outra_ferramenta', input: { a: 1 } }], stop_reason: 'tool_use', usage: {} }, tool]); r = await callTool(c, o); assert.strictEqual(c.calls.length, 2, 'ferramenta com outro nome não vale'); assert.deepStrictEqual(r.input, { ok: 1 });
    c = mkc([{ content: [{ type: 'tool_use', name: 'registrar_x', input: null }], stop_reason: 'tool_use', usage: {} }, tool]); r = await callTool(c, o); assert.strictEqual(c.calls.length, 2, 'ferramenta sem conteúdo também refaz');
    c = mkc([text, tool]); await assert.rejects(() => callTool(c, { ...o, now: () => (c.calls.length === 0 ? 0 : RETRY_ONLY_IF_UNDER_MS) }), /SEM FERRAMENTA/); assert.strictEqual(c.calls.length, 1, 'se a 1ª já demorou demais, não repete (o Render corta em ~100 s)');
    c = mkc([tool]); await callTool(c, { ...o, maxTokens: 1234, effort: 'low' }); assert.strictEqual(c.calls[0].max_tokens, 1234); assert.deepStrictEqual(c.calls[0].output_config, { effort: 'low' }); c = mkc([tool]); await callTool(c, o); assert.strictEqual(c.calls[0].max_tokens, 6000); assert.deepStrictEqual(c.calls[0].output_config, { effort: 'medium' });
    assert.ok(!('thinking' in c.calls[0]) && !('temperature' in c.calls[0]), 'nada que o modelo recuse (thinking desligado, temperatura)');
  });
  console.log(ok + ' blocos ok');
})();
