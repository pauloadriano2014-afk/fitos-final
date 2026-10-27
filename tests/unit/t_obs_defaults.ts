import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as CAT from '/home/user/fitos-final/app/api/admin/observation-categories/route';
import * as PRE from '/home/user/fitos-final/app/api/admin/observation-presets/route';
import * as DEF from '/home/user/fitos-final/app/api/admin/observation-defaults/route';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';
import { OBS_DEFAULTS } from '/home/user/fitos-final/lib/obsDefaults';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (mod: any, method: string, url: string, body?: any, as: string | null = PAULO_ID, role = 'COACH') => { const h: any = { 'content-type': 'application/json' }; if (as) h.authorization = 'Bearer ' + tok(as, role); const init: any = { method, headers: h }; if (body !== undefined && method !== 'GET' && method !== 'DELETE') init.body = typeof body === 'string' ? body : JSON.stringify(body); const r = await mod[method](new Request('http://x' + url, init)); return { status: r.status, json: await r.json().catch(() => null) }; };
const C = (m: string, body?: any, as: string | null = PAULO_ID, q = '', role = 'COACH') => call(CAT, m, '/api/admin/observation-categories' + q, body, as, role);
const R = (m: string, body?: any, as: string | null = PAULO_ID, q = '') => call(PRE, m, '/api/admin/observation-presets' + q, body, as);
const D = (as: string | null = PAULO_ID, role = 'COACH') => call(DEF, 'POST', '/api/admin/observation-defaults', {}, as, role);
const A = 'coach-a', B = 'coach-b';
const TOTAL = OBS_DEFAULTS.reduce((n, c) => n + c.phrases.length, 0);
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('o padrão: 8 categorias, 39 frases, nomes e textos sem repetir, cores válidas, tudo dentro dos limites do servidor', () => {
    assert.deepStrictEqual(OBS_DEFAULTS.map((c) => c.name), ['Técnica', 'Postura', 'Respiração', 'Contagem', 'Como fazer', 'Carga e intensidade', 'Aquecimento e descanso', 'Cuidados']); assert.strictEqual(TOTAL, 39);
    assert.strictEqual(new Set(OBS_DEFAULTS.map((c) => c.name.toLowerCase())).size, 8); const texts = OBS_DEFAULTS.flatMap((c) => c.phrases); assert.strictEqual(new Set(texts.map((t) => t.toLowerCase())).size, 39, 'nenhuma frase repetida');
    for (const c of OBS_DEFAULTS) { assert.ok(/^#[0-9A-F]{6}$/i.test(c.color) && c.name.length <= 30 && c.phrases.length >= 3, c.name); for (const t of c.phrases) assert.ok(t.trim() === t && t.length > 5 && t.length <= 500, t); }
    assert.strictEqual(new Set(OBS_DEFAULTS.map((c) => c.color)).size, 8, 'cada categoria com uma cor');
  });
  await block('primeiro acesso do parceiro: recebe as 8 categorias e as 39 frases, cada frase na categoria certa, na ordem do padrão (a 1ª frase no topo)', async () => {
    const cats = (await C('GET', undefined, A)).json; assert.deepStrictEqual(cats.categories.map((c: any) => c.name), OBS_DEFAULTS.map((c) => c.name)); assert.ok(cats.categories.every((c: any) => c.coachId === A));
    const pre = (await R('GET', undefined, A)).json.presets; assert.strictEqual(pre.length, TOTAL); assert.ok(pre.every((p: any) => p.coachId === A));
    const byId = new Map(cats.categories.map((c: any) => [c.id, c.name])); const tec = pre.filter((p: any) => byId.get(p.category) === 'Técnica').map((p: any) => p.text); assert.deepStrictEqual(tec, OBS_DEFAULTS[0].phrases, 'mesma ordem do padrão');
    assert.strictEqual(pre[0].text, OBS_DEFAULTS[0].phrases[0], 'a lista (do mais novo para o mais velho) começa pela 1ª frase do padrão');
    const stamps = S.rows.map((r: any) => new Date(r.createdAt).getTime()); assert.strictEqual(new Set(stamps).size, TOTAL, 'cada frase com um instante diferente (a ordem não depende de desempate do banco)'); assert.deepStrictEqual([...stamps].sort((x, y) => y - x), stamps, 'do padrão: a 1ª é a mais nova');
    for (const d of OBS_DEFAULTS) assert.deepStrictEqual(pre.filter((p: any) => byId.get(p.category) === d.name).map((p: any) => p.text), d.phrases, d.name);
  });
  await block('o padrão é entregue UMA vez: abrir de novo, ler pelas duas rotas ao mesmo tempo e até apagar tudo não duplica nem faz voltar sozinho', async () => {
    await Promise.all([C('GET', undefined, A), R('GET', undefined, A), C('GET', undefined, A), R('GET', undefined, A)]);
    assert.deepStrictEqual([S.cats.length, S.rows.length, S.seeds.length], [8, TOTAL, 1], 'chamadas juntas não duplicam');
    await C('GET', undefined, A); await R('GET', undefined, A); assert.deepStrictEqual([S.cats.length, S.rows.length], [8, TOTAL]);
    for (const c of [...S.cats]) await C('DELETE', undefined, A, '?id=' + c.id); for (const p of [...S.rows]) await R('DELETE', undefined, A, '?id=' + p.id);
    assert.deepStrictEqual([S.cats.length, S.rows.length], [0, 0]); assert.deepStrictEqual([(await C('GET', undefined, A)).json.categories.length, (await R('GET', undefined, A)).json.presets.length], [0, 0], 'apagou tudo: continua vazio');
  });
  await block('quem cria algo ANTES de abrir a lista também recebe o padrão primeiro (um nome novo não fica repetido com ele)', async () => {
    assert.strictEqual((await C('POST', { name: 'Pernas' }, A)).status, 200); assert.strictEqual(S.cats.length, 9); assert.strictEqual((await C('POST', { name: 'Postura' }, A)).status, 409, 'o padrão já estava lá');
    assert.strictEqual((await R('POST', { text: 'Minha frase' }, B)).status, 200); assert.strictEqual(S.rows.filter((r: any) => r.coachId === B).length, TOTAL + 1);
  });
  await block('cada parceiro recebe a SUA cópia: o que um muda não aparece para o outro nem para o time master', async () => {
    const a = (await C('GET', undefined, A)).json.categories; await C('GET', undefined, B);
    assert.notStrictEqual(a[0].id, S.cats.find((c: any) => c.coachId === B).id, 'cópias independentes'); await C('PATCH', { id: a[0].id, name: 'Meu nome', color: '#112233' }, A); await C('DELETE', undefined, A, '?id=' + a[1].id);
    const b = (await C('GET', undefined, B)).json.categories; assert.deepStrictEqual(b.map((c: any) => c.name), OBS_DEFAULTS.map((c) => c.name), 'o B não mudou');
    assert.deepStrictEqual((await C('GET', undefined, PAULO_ID)).json.categories, [], 'o master não ganhou nada'); assert.deepStrictEqual((await R('GET', undefined, ADRI_ID)).json.presets, []);
  });
  await block('time master e aluno nunca recebem o padrão; a lista compartilhada do master continua como estava (frases antigas sem dono seguem sendo do master)', async () => {
    S.rows.push({ id: 'velha', text: 'Frase antiga do Paulo', category: null, createdAt: new Date() }); S.rows[0].coachId = null;
    await C('GET'); await R('GET'); await C('GET', undefined, ADRI_ID); await C('GET', undefined, 'aluno', '', 'USER');
    assert.strictEqual(S.seeds.length, 0); assert.deepStrictEqual((await R('GET')).json.presets.map((p: any) => p.text), ['Frase antiga do Paulo']);
    assert.deepStrictEqual((await R('GET', undefined, ADRI_ID)).json.presets.map((p: any) => p.text), ['Frase antiga do Paulo'], 'Adri vê a mesma');
    assert.ok(!(await R('GET', undefined, A)).json.presets.some((p: any) => p.text === 'Frase antiga do Paulo'), 'o parceiro não vê a do master');
  });
  await block('restaurar padrão: devolve só o que o coach apagou (categoria e frases), mantém o que ele criou e mudou, e responde com as listas novas', async () => {
    const cats = (await C('GET', undefined, A)).json.categories; const pre = (await R('GET', undefined, A)).json.presets;
    const resp = cats.find((c: any) => c.name === 'Respiração'); await C('DELETE', undefined, A, '?id=' + resp.id);                                        // apagou a categoria (as 3 frases ficam sem categoria)
    for (const p of pre.filter((x: any) => x.category === resp.id)) await R('DELETE', undefined, A, '?id=' + p.id);                                         // e as frases dela
    const post = cats.find((c: any) => c.name === 'Postura'); const um = pre.find((p: any) => p.category === post.id); await R('DELETE', undefined, A, '?id=' + um.id);   // apagou 1 frase de outra categoria
    const tec = pre.find((p: any) => p.text === OBS_DEFAULTS[0].phrases[0]); await R('PATCH', { id: tec.id, text: 'Meu texto na técnica' }, A);          // mudou o texto de uma
    await R('POST', { text: 'Frase minha', category: post.id }, A); await C('PATCH', { id: post.id, name: 'Minha postura' }, A);                              // criou uma e renomeou uma categoria
    const r = await D(A); assert.strictEqual(r.status, 200); assert.deepStrictEqual([r.json.addedCategories, r.json.addedPhrases], [2, 3 + 1 + 1], 'Respiração (3 frases) + a de "Postura" apagada (volta numa "Postura" nova, porque a dele foi renomeada) + a de Técnica que foi reescrita');
    assert.ok(r.json.categories.some((c: any) => c.name === 'Respiração') && r.json.categories.some((c: any) => c.name === 'Minha postura'));
    const texts = r.json.presets.map((p: any) => p.text); assert.ok(texts.includes('Frase minha') && texts.includes('Meu texto na técnica') && texts.includes(OBS_DEFAULTS[0].phrases[0]) && texts.includes(um.text));
    assert.ok(r.json.presets.every((p: any) => p.coachId === A)); assert.strictEqual(S.cats.filter((c: any) => c.name === 'Minha postura').length, 1, 'a renomeada continua'); const novaPostura = S.cats.find((c: any) => c.name === 'Postura'); assert.deepStrictEqual(r.json.presets.filter((p: any) => p.category === novaPostura.id).map((p: any) => p.text), [um.text], 'a "Postura" nova só tem a frase que faltava');
    const again = await D(A); assert.deepStrictEqual([again.json.addedCategories, again.json.addedPhrases], [0, 0], 'rodar de novo não duplica');
  });
  await block('restaurar padrão: se o coach apagou só a categoria e manteve as frases, não cria categoria vazia', async () => {
    const cats = (await C('GET', undefined, A)).json.categories; await R('GET', undefined, A); const resp = cats.find((c: any) => c.name === 'Respiração');
    assert.strictEqual((await C('DELETE', undefined, A, '?id=' + resp.id)).json.moved, 3); const r = await D(A); assert.deepStrictEqual([r.json.addedCategories, r.json.addedPhrases], [0, 0]); assert.ok(!S.cats.some((c: any) => c.name === 'Respiração'));
    assert.strictEqual(S.rows.filter((x: any) => x.coachId === A && x.category === null).length, 3, 'as 3 frases continuam, sem categoria');
  });
  await block('restaurar padrão só existe para parceiro: time master, aluno e quem não está logado são recusados; não mexe na lista dos outros', async () => {
    assert.strictEqual((await D(PAULO_ID)).status, 400); assert.strictEqual((await D(ADRI_ID)).status, 400); assert.strictEqual((await D(null)).status, 401); assert.strictEqual((await D('aluno', 'USER')).status, 400);
    await C('GET', undefined, B); await D(A); assert.strictEqual(S.rows.filter((r: any) => r.coachId === B).length, TOTAL); assert.strictEqual(S.rows.filter((r: any) => r.coachId === null).length, 0);
  });
  await block('restaurar com o limite de 20 categorias cheio: não passa do limite', async () => {
    await C('GET', undefined, A); const resp = S.cats.find((c: any) => c.name === 'Cuidados'); await C('DELETE', undefined, A, '?id=' + resp.id);
    for (let i = 0; S.cats.filter((c: any) => c.coachId === A).length < 20; i++) await C('POST', { name: 'Extra ' + i }, A);
    const r = await D(A); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.addedCategories, 0); assert.strictEqual(S.cats.filter((c: any) => c.coachId === A).length, 20);
  });
  console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
