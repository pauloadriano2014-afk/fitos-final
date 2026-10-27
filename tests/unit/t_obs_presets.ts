import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as CAT from '/home/user/fitos-final/app/api/admin/observation-categories/route';
import * as PRE from '/home/user/fitos-final/app/api/admin/observation-presets/route';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (mod: any, method: string, url: string, body?: any, as: string | null = PAULO_ID, role = 'COACH') => { const h: any = { 'content-type': 'application/json' }; if (as) h.authorization = 'Bearer ' + tok(as, role); const init: any = { method, headers: h }; if (body !== undefined && method !== 'GET' && method !== 'DELETE') init.body = typeof body === 'string' ? body : JSON.stringify(body); const r = await mod[method](new Request('http://x' + url, init)); return { status: r.status, json: await r.json().catch(() => null) }; };
const R = (m: string, body?: any, as: string | null = PAULO_ID, q = '', role = 'COACH') => call(PRE, m, '/api/admin/observation-presets' + q, body, as, role);
const C = (m: string, body?: any, as: string | null = PAULO_ID, q = '') => call(CAT, m, '/api/admin/observation-categories' + q, body, as);
const A = 'coach-a', B = 'coach-b';
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('time master: salvar frase com categoria fixa, sem categoria, em minúsculas e com texto vazio; a frase fica na lista compartilhada (sem dono)', async () => {
    const a = await R('POST', { text: '  Cuidado com o ombro  ', category: 'CUIDADOS' });
    assert.deepStrictEqual([a.status, a.json.text, a.json.category, a.json.coachId], [200, 'Cuidado com o ombro', 'CUIDADOS', null]);
    const b = await R('POST', { text: '10 cada lado' }); assert.deepStrictEqual([b.status, b.json.category], [200, null], 'sem categoria continua valendo (o app classifica sozinho)');
    assert.strictEqual((await R('POST', { text: 'Pausa de 2s', category: 'tecnica' })).json.category, 'TECNICA');
    assert.strictEqual((await R('POST', { text: '   ' })).status, 400); assert.strictEqual(S.rows.length, 3);
    assert.strictEqual((await R('POST', { text: 'x'.repeat(900) })).json.text.length, 500, 'texto limitado a 500');
  });
  await block('categoria que não existe é recusada, para o time master e para o parceiro; parceiro não usa as 6 fixas (ele tem as dele)', async () => {
    for (const category of ['PERNAS', 'x', 'TECNICA ', 5, {}]) assert.strictEqual((await R('POST', { text: 'abc', category })).status, 400, JSON.stringify(category));
    assert.strictEqual((await R('POST', { text: 'abc', category: 'TECNICA' }, A)).status, 400, 'parceiro: "TECNICA" não é categoria dele');
    const mine = (await C('POST', { name: 'Pernas' }, A)).json; const his = (await C('POST', { name: 'Pernas' }, B)).json;
    assert.strictEqual((await R('POST', { text: 'ok', category: mine.id }, A)).status, 200);
    assert.strictEqual((await R('POST', { text: 'ok', category: his.id }, A)).status, 400, 'categoria de outro coach não vale');
    assert.strictEqual((await R('POST', { text: 'ok', category: mine.id })).status, 400, 'nem na lista do time master');
    assert.deepStrictEqual(S.rows.filter((x: any) => x.text === 'ok').map((x: any) => x.coachId), [A]);
  });
  await block('frase de parceiro nasce com o dono dele; cada um vê só as suas (o time master, a lista compartilhada)', async () => {
    await R('POST', { text: 'do Paulo' }); await R('POST', { text: 'da Adri' }, ADRI_ID); await R('POST', { text: 'do coach A' }, A); await R('POST', { text: 'do coach B' }, B);
    assert.deepStrictEqual(S.rows.filter((x: any) => /^d[oa] /.test(x.text) && x.text.length < 12).map((x: any) => x.coachId), [null, null, A, B]);
    const names = async (as: string) => (await R('GET', undefined, as)).json.presets.map((p: any) => p.text).sort();
    assert.deepStrictEqual(await names(PAULO_ID), ['da Adri', 'do Paulo'], 'Paulo e Adri compartilham a lista');
    assert.deepStrictEqual(await names(ADRI_ID), ['da Adri', 'do Paulo']);
    assert.ok((await names(A)).includes('do coach A') && !(await names(A)).includes('do coach B') && !(await names(A)).includes('do Paulo'), 'o parceiro só vê as dele');
  });
  await block('mudar texto e/ou categoria: troca o que foi pedido; texto vazio, nada a mudar, id sem dono e frase de outro dono são recusados', async () => {
    const p = (await R('POST', { text: 'Aquecimento.', category: 'OUTRAS' })).json;
    assert.deepStrictEqual((await R('PATCH', { id: p.id, category: 'CARGA' })).json.category, 'CARGA');
    const t = await R('PATCH', { id: p.id, text: '  Aquecimento leve ' }); assert.deepStrictEqual([t.status, t.json.text, t.json.category], [200, 'Aquecimento leve', 'CARGA'], 'só o texto muda, a categoria fica');
    assert.strictEqual((await R('PATCH', { id: p.id, category: '' })).json.category, null, 'vazio volta a "sem categoria"');
    assert.strictEqual((await R('PATCH', { id: p.id, category: 'PERNAS' })).status, 400); assert.strictEqual((await R('PATCH', { id: p.id })).status, 400, 'sem nada para mudar');
    assert.strictEqual((await R('PATCH', { id: p.id, text: '   ' })).status, 400); assert.strictEqual((await R('PATCH', { text: 'x' })).status, 400); assert.strictEqual((await R('PATCH', { id: 'nao-existe', text: 'x' })).status, 404);
    assert.strictEqual((await R('PATCH', { id: p.id, text: 'invadindo' }, A)).status, 404, 'o parceiro não mexe na frase do time master');
    const q = (await R('POST', { text: 'do A' }, A)).json; assert.strictEqual((await R('PATCH', { id: q.id, text: 'invadindo' }, B)).status, 404, 'nem na de outro parceiro'); assert.strictEqual((await R('PATCH', { id: q.id, text: 'invadindo' })).status, 404, 'nem o time master mexe na de um parceiro por aqui');
    assert.deepStrictEqual(S.rows.filter((x: any) => x.coachId === null).map((x: any) => x.text), ['Aquecimento leve']); assert.ok(S.rows.some((x: any) => x.text === 'do A'), 'a do A continua');
  });
  await block('apagar: só a frase de quem chama; frase de outro dono responde "não encontrada" e continua lá', async () => {
    const m = (await R('POST', { text: 'do master' })).json; const a = (await R('POST', { text: 'do A' }, A)).json;
    const has = (t: string) => S.rows.filter((x: any) => x.text === t).length;
    assert.strictEqual((await R('DELETE', undefined, B, '?id=' + a.id)).status, 404); assert.strictEqual((await R('DELETE', undefined, A, '?id=' + m.id)).status, 404); assert.deepStrictEqual([has('do master'), has('do A')], [1, 1]);
    assert.strictEqual((await R('DELETE', undefined, A, '?id=' + a.id)).status, 200); assert.strictEqual((await R('DELETE', undefined, PAULO_ID, '?id=' + m.id)).status, 200); assert.deepStrictEqual([has('do master'), has('do A')], [0, 0]);
    assert.strictEqual((await R('DELETE')).status, 400);
  });
  await block('aluno não tem lista: lê vazio (sem criar nada) e não grava; sem login nada funciona', async () => {
    assert.deepStrictEqual((await R('GET', undefined, 'aluno-1', '', 'USER')).json, { presets: [] }); assert.strictEqual(S.seeds.length, 0, 'aluno não recebe o padrão');
    for (const role of ['USER', 'STUDENT']) { assert.strictEqual((await R('POST', { text: 'x' }, 'aluno-1', '', role)).status, 403); assert.strictEqual((await R('PATCH', { id: 'a', text: 'x' }, 'aluno-1', '', role)).status, 403); assert.strictEqual((await R('DELETE', undefined, 'aluno-1', '?id=a', role)).status, 403); }
    for (const [m, b, q] of [['GET', undefined, ''], ['POST', { text: 'x' }, ''], ['PATCH', { id: 'a', text: 'x' }, ''], ['DELETE', undefined, '?id=a']] as any) assert.strictEqual((await R(m, b, null, q)).status, 401, m);
    assert.strictEqual(S.rows.length, 0);
  });
  await block('erro do banco vira mensagem simples (sem detalhe interno)', async () => {
    S.fail = 'boom: segredo interno'; const r = await R('GET'); assert.strictEqual(r.status, 500); assert.ok(!JSON.stringify(r.json).includes('segredo'));
  });
  console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
