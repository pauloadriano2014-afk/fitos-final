import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as CAT from '/home/user/fitos-final/app/api/admin/observation-categories/route';
import * as PRE from '/home/user/fitos-final/app/api/admin/observation-presets/route';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (mod: any, method: string, url: string, body?: any, as: string | null = 'c1') => { const h: any = { 'content-type': 'application/json' }; if (as) h.authorization = 'Bearer ' + tok(as); const init: any = { method, headers: h }; if (body !== undefined && method !== 'GET' && method !== 'DELETE') init.body = typeof body === 'string' ? body : JSON.stringify(body); const r = await mod[method](new Request('http://x' + url, init)); return { status: r.status, json: await r.json().catch(() => null) }; };
const C = (m: string, body?: any, as: string | null = 'c1', q = '') => call(CAT, m, '/api/admin/observation-categories' + q, body, as);
const R = (m: string, body?: any, q = '') => call(PRE, m, '/api/admin/observation-presets' + q, body);
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('criar categoria: nome limpo, cor válida em maiúscula, cor ruim vira vazia, aparece na lista na ordem em que foi criada', async () => {
    const a = await C('POST', { name: '  Pernas   e glúteos ', color: '#00c7be' });
    assert.deepStrictEqual([a.status, a.json.name, a.json.color], [200, 'Pernas e glúteos', '#00C7BE']);
    const b = await C('POST', { name: 'Postura', color: 'vermelho' }); assert.deepStrictEqual([b.status, b.json.color], [200, null]);
    const c = await C('POST', { name: 'x'.repeat(80) }); assert.strictEqual(c.json.name.length, 30, 'nome limitado a 30');
    const l = await C('GET'); assert.deepStrictEqual(l.json.categories.map((x: any) => x.name), ['Pernas e glúteos', 'Postura', 'x'.repeat(30)]);
  });
  await block('criar categoria: sem nome, nome repetido (sem ligar para acento/maiúscula) e nome de categoria fixa são recusados', async () => {
    assert.strictEqual((await C('POST', { name: '   ' })).status, 400); assert.strictEqual((await C('POST', {})).status, 400);
    await C('POST', { name: 'Postura' });
    for (const n of ['postura', 'POSTURA ', 'Pôstura']) assert.strictEqual((await C('POST', { name: n })).status, 409, n);
    for (const n of ['Técnica', 'tecnica', 'CUIDADOS', 'Como  fazer', 'outras', 'Carga', 'Contagem']) assert.strictEqual((await C('POST', { name: n })).status, 409, 'fixa: ' + n);
    assert.strictEqual(S.cats.length, 1);
  });
  await block('limite de 20 categorias', async () => {
    for (let i = 0; i < 20; i++) assert.strictEqual((await C('POST', { name: 'Cat ' + i })).status, 200);
    const r = await C('POST', { name: 'Uma a mais' }); assert.strictEqual(r.status, 400); assert.strictEqual(S.cats.length, 20);
  });
  await block('renomear: troca o nome, aceita manter o mesmo, recusa nome repetido, vazio, id que não existe e sem id', async () => {
    const a = (await C('POST', { name: 'Pernas' })).json; const b = (await C('POST', { name: 'Postura' })).json;
    assert.deepStrictEqual((await C('PATCH', { id: a.id, name: 'Membros inferiores' })).json.name, 'Membros inferiores');
    assert.strictEqual((await C('PATCH', { id: b.id, name: 'postura' })).status, 200, 'o mesmo nome (só a letra muda) não conta como repetido');
    assert.strictEqual((await C('PATCH', { id: b.id, name: 'membros inferiores' })).status, 409);
    assert.strictEqual((await C('PATCH', { id: b.id, name: 'Técnica' })).status, 409, 'nome de categoria fixa');
    assert.strictEqual((await C('PATCH', { id: b.id, name: '  ' })).status, 400); assert.strictEqual((await C('PATCH', { id: 'nao-existe', name: 'X' })).status, 404); assert.strictEqual((await C('PATCH', { name: 'X' })).status, 400);
    assert.deepStrictEqual(S.cats.map((x: any) => x.name), ['Membros inferiores', 'postura']);
  });
  await block('apagar categoria: as frases dela ficam sem categoria (nenhuma é apagada) e as de outras categorias não mudam', async () => {
    const a = (await C('POST', { name: 'Pernas' })).json; const b = (await C('POST', { name: 'Postura' })).json;
    await R('POST', { text: 'Joelho para fora', category: a.id }); await R('POST', { text: 'Ombros baixos', category: b.id }); await R('POST', { text: 'Segure 2s', category: 'TECNICA' }); await R('POST', { text: 'Outra do Pernas', category: a.id });
    const r = await C('DELETE', undefined, 'c1', '?id=' + a.id); assert.deepStrictEqual([r.status, r.json.moved], [200, 2]);
    assert.deepStrictEqual(S.cats.map((x: any) => x.name), ['Postura']); assert.strictEqual(S.rows.length, 4, 'nenhuma frase foi apagada');
    assert.deepStrictEqual(S.rows.map((x: any) => [x.text, x.category]), [['Joelho para fora', null], ['Ombros baixos', b.id], ['Segure 2s', 'TECNICA'], ['Outra do Pernas', null]]);
    assert.strictEqual((await C('DELETE')).status, 400);
  });
  await block('frase pode ir para uma categoria criada pelo coach; categoria apagada ou inventada é recusada', async () => {
    const a = (await C('POST', { name: 'Pernas' })).json;
    const ok = await R('POST', { text: 'Joelho para fora', category: a.id }); assert.deepStrictEqual([ok.status, ok.json.category], [200, a.id]);
    assert.strictEqual((await R('POST', { text: 'x', category: 'id-inventado' })).status, 400); assert.strictEqual((await R('POST', { text: 'y', category: a.id + 'x' })).status, 400);
    const p = (await R('POST', { text: 'Sem categoria' })).json;
    assert.strictEqual((await R('PATCH', { id: p.id, category: a.id })).json.category, a.id); assert.strictEqual((await R('PATCH', { id: p.id, category: 'TECNICA' })).json.category, 'TECNICA'); assert.strictEqual((await R('PATCH', { id: p.id, category: 'id-inventado' })).status, 400);
    await C('DELETE', undefined, 'c1', '?id=' + a.id); assert.strictEqual((await R('POST', { text: 'z', category: a.id })).status, 400, 'categoria que já foi apagada');
  });
  await block('sem login nada funciona', async () => {
    for (const [m, b, q] of [['GET', undefined, ''], ['POST', { name: 'X' }, ''], ['PATCH', { id: 'a', name: 'X' }, ''], ['DELETE', undefined, '?id=a']] as any) assert.strictEqual((await C(m, b, null, q)).status, 401, m);
    assert.strictEqual(S.cats.length, 0);
  });
  await block('erro do banco vira mensagem simples (sem detalhe interno)', async () => {
    S.fail = 'boom: segredo interno'; const r = await C('GET'); assert.strictEqual(r.status, 500); assert.ok(!JSON.stringify(r.json).includes('segredo'));
  });
  console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
