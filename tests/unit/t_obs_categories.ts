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
const C = (m: string, body?: any, as: string | null = PAULO_ID, q = '', role = 'COACH') => call(CAT, m, '/api/admin/observation-categories' + q, body, as, role);
const R = (m: string, body?: any, as: string | null = PAULO_ID, q = '') => call(PRE, m, '/api/admin/observation-presets' + q, body, as);
const A = 'coach-a', B = 'coach-b';
const mine = (owner: string | null) => S.cats.filter((c: any) => c.coachId === owner);
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('time master: criar categoria (nome limpo, cor válida em maiúscula, cor ruim vira vazia, limite de 30 letras); aparece na ordem em que foi criada; modo MASTER', async () => {
    const a = await C('POST', { name: '  Pernas   e glúteos ', color: '#00c7be' }); assert.deepStrictEqual([a.status, a.json.name, a.json.color, a.json.coachId], [200, 'Pernas e glúteos', '#00C7BE', null]);
    assert.deepStrictEqual([(await C('POST', { name: 'Postura', color: 'vermelho' })).json.color], [null]); assert.strictEqual((await C('POST', { name: 'x'.repeat(80) })).json.name.length, 30);
    const l = await C('GET'); assert.deepStrictEqual([l.json.mode, l.json.categories.map((x: any) => x.name)], ['MASTER', ['Pernas e glúteos', 'Postura', 'x'.repeat(30)]]); assert.strictEqual(S.seeds.length, 0, 'o time master nunca recebe o padrão');
    assert.deepStrictEqual((await C('GET', undefined, ADRI_ID)).json.categories.length, 3, 'Adri vê as mesmas (lista compartilhada)');
  });
  await block('time master: nome vazio, repetido (sem ligar para acento/maiúscula) e igual ao de uma categoria FIXA são recusados; limite de 20', async () => {
    assert.strictEqual((await C('POST', { name: '   ' })).status, 400); assert.strictEqual((await C('POST', {})).status, 400); await C('POST', { name: 'Postura' });
    for (const n of ['postura', 'POSTURA ', 'Pôstura']) assert.strictEqual((await C('POST', { name: n })).status, 409, n);
    for (const n of ['Técnica', 'tecnica', 'CUIDADOS', 'Como  fazer', 'outras', 'Carga', 'Contagem']) assert.strictEqual((await C('POST', { name: n })).status, 409, 'fixa: ' + n);
    for (let i = 0; i < 19; i++) assert.strictEqual((await C('POST', { name: 'Cat ' + i })).status, 200);
    assert.strictEqual((await C('POST', { name: 'Uma a mais' })).status, 400); assert.strictEqual(mine(null).length, 20);
  });
  await block('coach parceiro: GET devolve o padrão dele (modo PARTNER); criar não bate com o padrão; o nome de uma categoria dele pode repetir o das fixas do time master', async () => {
    const g = await C('GET', undefined, A); assert.strictEqual(g.json.mode, 'PARTNER'); assert.ok(g.json.categories.some((c: any) => c.name === 'Técnica'));
    assert.strictEqual((await C('POST', { name: 'técnica' }, A)).status, 409, 'já tem "Técnica" no padrão dele');
    const t = g.json.categories.find((c: any) => c.name === 'Técnica'); await C('DELETE', undefined, A, '?id=' + t.id);
    assert.strictEqual((await C('POST', { name: 'Técnica', color: '#112233' }, A)).status, 200, 'apagou a do padrão, pode criar outra com esse nome (para ele não existem as "fixas")');
    assert.strictEqual((await C('POST', { name: 'Técnica' }, B)).status, 409, 'o B tem a dele do padrão');
  });
  await block('cada coach só vê, muda e apaga as SUAS categorias; o que é de outro responde "não encontrada"', async () => {
    const a = (await C('POST', { name: 'Só do A' }, A)).json; const m = (await C('POST', { name: 'Só do master' })).json;
    assert.ok(!(await C('GET', undefined, B)).json.categories.some((c: any) => c.name === 'Só do A'), 'B não vê as do A');
    assert.ok(!(await C('GET', undefined, PAULO_ID)).json.categories.some((c: any) => c.name === 'Só do A') && !(await C('GET', undefined, A)).json.categories.some((c: any) => c.id === m.id), 'master e parceiro não se veem');
    for (const [who, id] of [[B, a.id], [A, m.id], [PAULO_ID, a.id]] as any) { assert.strictEqual((await C('PATCH', { id, name: 'Invadido' }, who)).status, 404); assert.strictEqual((await C('DELETE', undefined, who, '?id=' + id)).status, 404); }
    assert.deepStrictEqual(S.cats.filter((c: any) => [a.id, m.id].includes(c.id)).map((c: any) => c.name), ['Só do A', 'Só do master']);
  });
  await block('mudar categoria: nome e/ou cor; vazio, repetido, cor inválida, nada para mudar, id sem dono e sem id são recusados; o mesmo nome (só a letra muda) vale', async () => {
    const a = (await C('POST', { name: 'Pernas' })).json; const b = (await C('POST', { name: 'Postura' })).json;
    assert.strictEqual((await C('PATCH', { id: a.id, name: 'Membros inferiores' })).json.name, 'Membros inferiores');
    const c = await C('PATCH', { id: a.id, color: '#abcdef' }); assert.deepStrictEqual([c.json.color, c.json.name], ['#ABCDEF', 'Membros inferiores'], 'só a cor muda');
    assert.strictEqual((await C('PATCH', { id: a.id, color: null })).json.color, null, 'null tira a cor');
    assert.strictEqual((await C('PATCH', { id: b.id, name: 'postura' })).status, 200); assert.strictEqual((await C('PATCH', { id: b.id, name: 'membros inferiores' })).status, 409); assert.strictEqual((await C('PATCH', { id: b.id, name: 'Técnica' })).status, 409, 'master: fixa');
    assert.strictEqual((await C('PATCH', { id: b.id, name: '  ' })).status, 400); assert.strictEqual((await C('PATCH', { id: b.id, color: 'azul' })).status, 400); assert.strictEqual((await C('PATCH', { id: b.id })).status, 400);
    assert.strictEqual((await C('PATCH', { id: 'nao-existe', name: 'X' })).status, 404); assert.strictEqual((await C('PATCH', { name: 'X' })).status, 400);
  });
  await block('apagar categoria: as frases DELA ficam sem categoria (nenhuma é apagada), as de outras categorias e de outros donos não mudam', async () => {
    const a = (await C('POST', { name: 'Pernas' })).json; const b = (await C('POST', { name: 'Postura' })).json; const ca = (await C('POST', { name: 'Pernas' }, A)).json;
    await R('POST', { text: 'Joelho para fora', category: a.id }); await R('POST', { text: 'Ombros baixos', category: b.id }); await R('POST', { text: 'Segure 2s', category: 'TECNICA' }); await R('POST', { text: 'Outra do Pernas', category: a.id }); await R('POST', { text: 'Do A', category: ca.id }, A);
    const r = await C('DELETE', undefined, PAULO_ID, '?id=' + a.id); assert.deepStrictEqual([r.status, r.json.moved], [200, 2]);
    assert.deepStrictEqual(S.rows.filter((x: any) => x.coachId === null).map((x: any) => [x.text, x.category]), [['Joelho para fora', null], ['Ombros baixos', b.id], ['Segure 2s', 'TECNICA'], ['Outra do Pernas', null]]); assert.strictEqual(S.rows.find((x: any) => x.text === 'Do A').category, ca.id, 'a do A não mudou');
    assert.strictEqual((await C('DELETE')).status, 400);
  });
  await block('sem login nada funciona; aluno não tem categorias (lê vazio, não grava, não recebe o padrão)', async () => {
    for (const [m, b, q] of [['GET', undefined, ''], ['POST', { name: 'X' }, ''], ['PATCH', { id: 'a', name: 'X' }, ''], ['DELETE', undefined, '?id=a']] as any) assert.strictEqual((await C(m, b, null, q)).status, 401, m);
    assert.deepStrictEqual((await C('GET', undefined, 'aluno-1', '', 'USER')).json, { categories: [], mode: 'NONE' }); assert.strictEqual(S.seeds.length, 0);
    for (const role of ['USER', 'STUDENT']) for (const [m, b, q] of [['POST', { name: 'X' }, ''], ['PATCH', { id: 'a', name: 'X' }, ''], ['DELETE', undefined, '?id=a']] as any) assert.strictEqual((await C(m, b, 'aluno-1', q, role)).status, 403, role + m);
    assert.strictEqual(S.cats.length, 0);
  });
  await block('erro do banco vira mensagem simples (sem detalhe interno)', async () => {
    S.fail = 'boom: segredo interno'; const r = await C('GET'); assert.strictEqual(r.status, 500); assert.ok(!JSON.stringify(r.json).includes('segredo'));
  });
  console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
