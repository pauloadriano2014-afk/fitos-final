import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as G from '/home/user/fitos-final/lib/assistantGuides';
import { GET as GUIAS } from '/home/user/fitos-final/app/api/coach-assistant/guias/route';
import { POST as ELITE } from '/home/user/fitos-final/app/api/ai/elite-assistant/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state; const GL: any = globalThis;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const get = async (url: string, as: string | null) => { const headers: any = {}; if (as) headers.authorization = 'Bearer ' + as; const r = await GUIAS(new Request('http://x' + url, { headers }), {} as any); return { status: r.status, json: await r.json().catch(() => null) }; };
const ask = async (as: string | null, body: any) => { const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as; const r = await ELITE(new Request('http://x/api/ai/elite-assistant', { method: 'POST', body: JSON.stringify(body), headers })); return { status: r.status, json: await r.json().catch(() => null) }; };
process.env.ANTHROPIC_API_KEY = 'k';
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); GL.__LLM = undefined; try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n        ') : e)); } };
const seed = () => { S.user.push({ id: 'cP', role: 'COACH', accountStatus: 'ACTIVE', active: true, coachPlan: 'PERSONAL' }, { id: 'cN', role: 'COACH', accountStatus: 'ACTIVE', active: true, coachPlan: 'NUTRICIONISTA' }, { id: 'cE', role: 'COACH', accountStatus: 'ACTIVE', active: true, coachPlan: 'ELITE' }, { id: 'cX', role: 'COACH', accountStatus: 'PENDING_APPROVAL', active: true, coachPlan: 'ELITE' }, { id: 'a1', role: 'USER', accountStatus: 'ACTIVE', active: true }); };
const V = (master: boolean, plan: string | null) => ({ master, plan });

(async () => {
  await t('guias: ids únicos, categorias existem, todo guia tem passos, nada de texto vazio; só o time master tem categoria master', () => {
    const ids = G.GUIDES.map((g) => g.id); assert.strictEqual(new Set(ids).size, ids.length, 'ids únicos');
    const cats = new Set(G.GUIDE_CATEGORIES.map((c) => c.id)); G.GUIDES.forEach((g) => { assert.ok(cats.has(g.cat), g.id + ' categoria'); assert.ok(g.steps.length >= 1 && g.steps.every((s) => s.trim().length > 10), g.id + ' passos'); assert.ok(g.title.length > 5 && g.kw.length > 10, g.id); if (g.cat === 'master') assert.ok(g.master, g.id + ' (categoria master => guia master)'); });
    G.GUIDE_CATEGORIES.filter((c) => c.master).forEach((c) => assert.ok(G.GUIDES.filter((g) => g.cat === c.id).every((g) => g.master)));
    assert.ok(G.GUIDES.length >= 30);
  });
  await t('quem vê o quê: Personal sem dieta; Nutricionista sem treino; Elite vê tudo menos o master; master vê tudo; plano ausente = Elite', () => {
    const idsOf = (v: any) => G.guidesFor(v).map((g) => g.id);
    const p = idsOf(V(false, 'PERSONAL')), n = idsOf(V(false, 'NUTRICIONISTA')), e = idsOf(V(false, 'ELITE')), m = idsOf(V(true, null)), none = idsOf(V(false, null));
    assert.ok(p.includes('montar-treino') && !p.includes('montar-dieta') && !p.includes('feedback-dieta')); assert.ok(n.includes('montar-dieta') && !n.includes('montar-treino') && !n.includes('corrida') && !n.includes('xp'));
    assert.ok(e.includes('montar-treino') && e.includes('montar-dieta')); for (const x of [p, n, e, none]) assert.ok(!x.includes('teste-gratis') && !x.includes('recursos-por-coach') && !x.includes('perguntas-coaches'), 'guias do master escondidos');
    assert.strictEqual(m.length, G.GUIDES.length); assert.deepStrictEqual(none, e);
    assert.ok(G.categoriesFor(V(false, 'PERSONAL')).every((c) => c.id !== 'master' && c.id !== 'dieta')); assert.ok(G.categoriesFor(V(true, null)).some((c) => c.id === 'master'));
    assert.ok(p.includes('checkin') && n.includes('checkin'), 'o que vale para todos continua');
  });
  await t('busca por palavras: acha o guia certo sem IA (sem acento, plural, frase solta); nada em comum = vazio; plano e master respeitados', () => {
    const top = (q: string, v: any = V(false, 'ELITE')) => (G.searchGuides(q, v)[0] || { id: null }).id;
    const cases: [string, string][] = [['como crio um template de treino', 'templates'], ['como o aluno envia as fotos de check-in', 'checkin'], ['como personalizar a avaliação da IA', 'minha-ia'], ['como enviar um aviso para todos os alunos', 'avisos'], ['como funciona o deload menstrual', 'deload-menstrual'],
      ['como criar minha página de vendas', 'pagina-vendas'], ['código de convite', 'convite'], ['como visualizar o app como aluno', 'ver-como-aluno'], ['agendar videochamada no meet', 'agenda'], ['o aluno disse que não tem o aparelho', 'aparelho'], ['como faço bi-set com técnica', 'tecnicas'],
      ['como marcar horário toda semana', 'agenda'], ['gerar link do treino para o whatsapp', 'link-treino'], ['gravar nota por voz', 'notas-voz'], ['meus alunos que pagaram', 'paguei'], ['onde fica a central hoje', 'central-hoje'], ['protocolo de corrida 10k', 'corrida']];
    for (const [q, id] of cases) assert.strictEqual(top(q), id, q);
    assert.deepStrictEqual(G.searchGuides('qual a capital da França', V(true, null)), []); assert.deepStrictEqual(G.searchGuides('', V(true, null)), []); assert.deepStrictEqual(G.searchGuides('como o que para', V(true, null)), [], 'só palavras de ligação');
    assert.notStrictEqual(top('como montar a dieta de um aluno', V(false, 'PERSONAL')), 'montar-dieta', 'Personal não recebe guia de dieta'); assert.strictEqual(top('como montar a dieta de um aluno'), 'montar-dieta');
    assert.notStrictEqual(top('liberar recursos por coach'), 'recursos-por-coach', 'coach comum não acha guia do master'); assert.strictEqual(top('liberar recursos por coach', V(true, null)), 'recursos-por-coach');
    assert.ok(G.searchGuides('treino', V(true, null), 3).length <= 3);
    assert.deepStrictEqual(G.searchGuides('videochamad', V(true, null)), [], 'só parecido com uma palavra (1 ponto) não basta'); assert.deepStrictEqual(G.searchGuides('aluno alunos aluna', V(true, null)), [], '"aluno" está em tudo: não conta como pista');
  });
  await t('prompt da IA de suporte: regras + guias só do que o coach pode ver (Personal não recebe dieta; comum não recebe o master)', () => {
    const p = G.supportSystemPrompt(V(false, 'PERSONAL')), m = G.supportSystemPrompt(V(true, null));
    assert.ok(/SOMENTE com o que está nos GUIAS/.test(p) && /Nunca invente/.test(p) && /perguntas rápidas/.test(p)); assert.ok(/Montar o treino de um aluno/.test(p) && !/Montar a dieta de um aluno/.test(p) && !/Liberar recursos especiais por coach/.test(p) && !/Teste grátis pelo Treino avulso/.test(p));
    assert.ok(/Liberar recursos especiais por coach/.test(m) && /Montar a dieta de um aluno/.test(m)); assert.ok(/1\. /.test(p));
  });
  await t('rota /guias: qualquer coach ativo, filtrado pelo plano do BANCO; busca ?q; master vê a categoria master; aluno/sem login barrados', async () => {
    seed();
    const per = await get('/api/coach-assistant/guias', tok('cP')); assert.strictEqual(per.status, 200); assert.ok(!per.json.master && per.json.categories.every((c: any) => c.id !== 'dieta' && c.id !== 'master')); assert.ok(per.json.categories.find((c: any) => c.id === 'treinos').guides.some((g: any) => g.id === 'montar-treino' && g.steps.length > 1));
    const nut = await get('/api/coach-assistant/guias', tok('cN')); assert.ok(nut.json.categories.some((c: any) => c.id === 'dieta') && !nut.json.categories.some((c: any) => c.id === 'treinos'));
    const el = await get('/api/coach-assistant/guias', tok('cE')); assert.ok(el.json.categories.some((c: any) => c.id === 'dieta') && el.json.categories.some((c: any) => c.id === 'treinos') && !el.json.categories.some((c: any) => c.id === 'master'));
    const ms = await get('/api/coach-assistant/guias', tok(PAULO_ID)); assert.strictEqual(ms.json.master, true); assert.ok(ms.json.categories.some((c: any) => c.id === 'master'));
    const q = await get('/api/coach-assistant/guias?q=' + encodeURIComponent('como crio um template'), tok('cP')); assert.strictEqual(q.json.results[0].id, 'templates'); assert.ok(q.json.results[0].steps.length >= 2);
    const q2 = await get('/api/coach-assistant/guias?q=' + encodeURIComponent('liberar recursos por coach'), tok('cE')); assert.ok(!q2.json.results.some((r: any) => r.id === 'recursos-por-coach'));
    assert.deepStrictEqual((await get('/api/coach-assistant/guias?q=zzzzzzzz', tok('cE'))).json.results, []);
    assert.strictEqual((await get('/api/coach-assistant/guias', null)).status, 401); assert.strictEqual((await get('/api/coach-assistant/guias', tok('a1', 'USER'))).status, 403); assert.strictEqual((await get('/api/coach-assistant/guias', tok('cX'))).status, 403, 'coach sem conta ativa');
  });
  await t('IA de suporte (elite-assistant): só coach ativo, plano do banco, limite por hora, entrada validada e conversa que a API aceita', async () => {
    seed(); let last: any = null; GL.__LLM = async ({ args }: any) => { last = args; return { content: [{ type: 'text', text: 'Abra Meus Templates.' }] }; };
    assert.strictEqual((await ask(null, { message: 'oi' })).status, 401); assert.strictEqual((await ask(tok('a1', 'USER'), { message: 'como faço' })).status, 403, 'aluno não gasta IA aqui'); assert.strictEqual((await ask(tok('cX'), { message: 'como faço' })).status, 403);
    assert.strictEqual((await ask(tok('cP'), { message: '   ' })).status, 400); assert.strictEqual((await ask(tok('cP'), { message: 'x'.repeat(601) })).status, 400);
    const r = await ask(tok('cP'), { message: 'Como criar um template?', coachPlan: 'ELITE', history: [{ role: 'assistant', content: 'oi' }, { role: 'user', content: 'z'.repeat(5000) }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }, { role: 'x', content: 'lixo' }, { role: 'user', content: 5 }] });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.reply, 'Abra Meus Templates.'); assert.strictEqual(last.model, 'claude-haiku-5-5');
    assert.ok(!/Montar a dieta de um aluno/.test(last.system), 'o plano vem do banco (PERSONAL), não do que o app disse (ELITE)'); assert.ok(/Montar o treino de um aluno/.test(last.system));
    assert.ok(last.messages.every((m: any) => m.content.length <= 2000), 'fala antiga muito longa é cortada'); assert.strictEqual(last.messages[0].role, 'user', 'começa por uma fala do usuário'); assert.ok(last.messages.every((m: any, i: number, a: any[]) => i === 0 || m.role !== a[i - 1].role), 'alterna papéis'); assert.deepStrictEqual(last.messages[last.messages.length - 1], { role: 'user', content: 'Como criar um template?' });
    await ask(tok('cN'), { message: 'e a dieta?' }); assert.ok(/Montar a dieta de um aluno/.test(last.system) && !/Montar o treino de um aluno/.test(last.system));
    await ask(tok(PAULO_ID), { message: 'recursos' }); assert.ok(/Liberar recursos especiais por coach/.test(last.system), 'master recebe também o guia do master');
    await ask(tok('cE'), { message: 'recursos' }); assert.ok(!/Liberar recursos especiais por coach/.test(last.system));
    GL.__LLM = async () => new Error('fora do ar'); const down = await ask(tok('cE'), { message: 'oi' }); assert.strictEqual(down.status, 500); assert.ok(/indisponível/.test(down.json.error));
  });
  await t('IA de suporte: limite de 60 perguntas por hora por coach', async () => {
    seed(); GL.__LLM = async () => ({ content: [{ type: 'text', text: 'ok' }] }); let last: any = null;
    for (let i = 0; i < 61; i++) last = await ask(tok('cE'), { message: 'oi' }); assert.strictEqual(last.status, 429); assert.strictEqual((await ask(tok('cP'), { message: 'oi' })).status, 200, 'outro coach não é afetado');
  });
  console.log(`\n${ok} ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
