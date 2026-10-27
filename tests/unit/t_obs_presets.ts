import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET, POST, PATCH, DELETE } from '/home/user/fitos-final/app/api/admin/observation-presets/route';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, body?: any, as: string | null = 'c1') => { const h: any = { 'content-type': 'application/json' }; if (as) h.authorization = 'Bearer ' + tok(as); const init: any = { method: fn === GET ? 'GET' : fn === DELETE ? 'DELETE' : fn === PATCH ? 'PATCH' : 'POST', headers: h }; if (body !== undefined && fn !== GET && fn !== DELETE) init.body = typeof body === 'string' ? body : JSON.stringify(body); const r = await fn(new Request('http://x' + url, init)); return { status: r.status, json: await r.json().catch(() => null) }; };
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('salvar frase: com categoria, sem categoria, categoria em minúsculas e texto vazio', async () => {
    const a = await call(POST, '/api/admin/observation-presets', { text: '  Cuidado com o ombro  ', category: 'CUIDADOS' });
    assert.deepStrictEqual([a.status, a.json.text, a.json.category], [200, 'Cuidado com o ombro', 'CUIDADOS']);
    const b = await call(POST, '/api/admin/observation-presets', { text: '10 cada lado' });
    assert.deepStrictEqual([b.status, b.json.category], [200, null], 'sem categoria continua valendo (o app classifica sozinho)');
    const c = await call(POST, '/api/admin/observation-presets', { text: 'Pausa de 2s', category: 'tecnica' });
    assert.strictEqual(c.json.category, 'TECNICA', 'a letra minúscula é aceita e guardada em maiúscula');
    assert.strictEqual((await call(POST, '/api/admin/observation-presets', { text: '   ' })).status, 400);
    assert.strictEqual(S.rows.length, 3);
  });
  await block('categoria que não existe é recusada (nada é gravado)', async () => {
    for (const category of ['PERNAS', 'x', 'TECNICA ', 5, {}]) { const r = await call(POST, '/api/admin/observation-presets', { text: 'abc', category }); assert.strictEqual(r.status, 400, JSON.stringify(category)); }
    assert.strictEqual(S.rows.length, 0);
  });
  await block('mudar a categoria: troca, limpa com vazio e recusa categoria ruim ou sem id', async () => {
    const a = (await call(POST, '/api/admin/observation-presets', { text: 'Aquecimento.', category: 'OUTRAS' })).json;
    const r1 = await call(PATCH, '/api/admin/observation-presets', { id: a.id, category: 'CARGA' });
    assert.deepStrictEqual([r1.status, r1.json.category, r1.json.text], [200, 'CARGA', 'Aquecimento.'], 'só a categoria muda, o texto fica');
    const r2 = await call(PATCH, '/api/admin/observation-presets', { id: a.id, category: '' });
    assert.deepStrictEqual([r2.status, r2.json.category], [200, null], 'vazio volta a "sem categoria"');
    assert.strictEqual((await call(PATCH, '/api/admin/observation-presets', { id: a.id, category: 'PERNAS' })).status, 400);
    assert.strictEqual((await call(PATCH, '/api/admin/observation-presets', { id: a.id })).status, 400, 'sem categoria no pedido não vira "limpar" sem querer');
    assert.strictEqual((await call(PATCH, '/api/admin/observation-presets', { category: 'CARGA' })).status, 400);
    assert.strictEqual(S.rows[0].category, null);
  });
  await block('listar traz a categoria; apagar continua funcionando', async () => {
    const a = (await call(POST, '/api/admin/observation-presets', { text: 'um', category: 'CONTAGEM' })).json; await call(POST, '/api/admin/observation-presets', { text: 'dois' });
    const l = await call(GET, '/api/admin/observation-presets');
    assert.deepStrictEqual(l.json.presets.map((p: any) => [p.text, p.category]), [['dois', null], ['um', 'CONTAGEM']]);
    assert.strictEqual((await call(DELETE, '/api/admin/observation-presets?id=' + a.id)).status, 200);
    assert.strictEqual(S.rows.length, 1);
    assert.strictEqual((await call(DELETE, '/api/admin/observation-presets')).status, 400);
  });
  await block('sem login nada funciona', async () => {
    for (const [fn, body] of [[GET, undefined], [POST, { text: 'x' }], [PATCH, { id: 'a', category: 'CARGA' }], [DELETE, undefined]] as any) assert.strictEqual((await call(fn, '/api/admin/observation-presets?id=a', body, null)).status, 401);
    assert.strictEqual(S.rows.length, 0);
  });
  console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
