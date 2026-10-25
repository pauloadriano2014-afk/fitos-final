import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as bulkPOST } from '/home/user/wt-back/app/api/exercise/bulk-update/route';
import { PAULO_ID, ADRI_ID } from '/home/user/wt-back/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (as: string | null, o: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await bulkPOST(new Request('http://x/api/exercise/bulk-update', { method: 'POST', headers, body: JSON.stringify(o) }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const COACH = 'coach-1', OTHER = 'coach-2';
const ex = (id: string, name: string, coachId: string | null, o: any = {}) => ({ id, name, category: 'Pernas', subCategory: 'Geral', coachId, hiddenFromCoaches: false, videoUrl: 'v', defaultSubstitutes: [], tags: { target: 'PERNAS' }, environments: ['UNIVERSAL'], ...o });
const seed = () => {
  P.__reset();
  S.user.push({ id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', accountStatus: 'ACTIVE' }, { id: ADRI_ID, role: 'ADMIN', email: 'adri.personal@hotmail.com', accountStatus: 'ACTIVE' }, { id: COACH, role: 'COACH', email: 'c1@x.com', accountStatus: 'ACTIVE' }, { id: OTHER, role: 'COACH', email: 'c2@x.com', accountStatus: 'ACTIVE' });
  S.exercise.push(
    ex('a', 'Leg press 45', PAULO_ID, { environments: ['SMARTFIT'] }), ex('b', 'Sumô com anilha', PAULO_ID, { environments: ['ACADEMIA'] }), ex('c', 'Passada sem peso', PAULO_ID, { environments: [] }),
    ex('g', 'Global', null, { environments: ['UNIVERSAL', 'GETGYM'] }), ex('adri', 'Da Adri', ADRI_ID), ex('o', 'Do outro', OTHER),
  );
};
const row = (id: string) => S.exercise.find((e: any) => e.id === id);
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { seed(); await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };

(async () => {
  await t('só o time master: parceiro e sem login são barrados, e nada muda', async () => {
    assert.equal((await call(null, { ids: ['a'], environments: { mode: 'ADD', values: ['UNIVERSAL'] } })).status, 401);
    const r = await call(tok(COACH), { ids: ['a'], environments: { mode: 'ADD', values: ['UNIVERSAL'] } }); assert.ok(r.status === 403 || r.status === 401, 'status ' + r.status);
    assert.deepEqual(row('a').environments, ['SMARTFIT']);
  });
  await t('ADD: acrescenta o ambiente (sem repetir), converte nomes antigos e dá Academia Padrão a quem estava sem ambiente', async () => {
    const r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['a', 'b', 'c', 'g'], environments: { mode: 'ADD', values: ['ACADEMIA_PADRAO', 'UNIVERSAL'] } });
    assert.equal(r.status, 200); assert.equal(r.json.count, 4, JSON.stringify(r.json));
    assert.deepEqual(row('a').environments.sort(), ['ACADEMIA_PADRAO', 'SMARTFIT', 'UNIVERSAL']);
    assert.deepEqual(row('b').environments.sort(), ['ACADEMIA_PADRAO', 'UNIVERSAL'], 'ACADEMIA antigo virou ACADEMIA_PADRAO, sem duplicar');
    assert.deepEqual(row('c').environments.sort(), ['ACADEMIA_PADRAO', 'UNIVERSAL']);
    assert.deepEqual(row('g').environments.sort(), ['ACADEMIA_PADRAO', 'GETGYM', 'UNIVERSAL']);
  });
  await t('ADD de um ambiente que já tem não mexe e conta como "sem mudança"', async () => {
    const r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['a'], environments: { mode: 'ADD', values: ['SMARTFIT'] } }); assert.equal(r.json.count, 0); assert.equal(r.json.unchanged, 1);
  });
  await t('REMOVE tira só o pedido; se ficaria sem ambiente, o exercício é pulado e avisado', async () => {
    const r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['a', 'g'], environments: { mode: 'REMOVE', values: ['SMARTFIT', 'GETGYM'] } });
    assert.equal(r.json.count, 1); assert.deepEqual(row('g').environments, ['UNIVERSAL']); assert.deepEqual(row('a').environments, ['SMARTFIT'], 'ficaria vazio: intocado');
    assert.deepEqual(r.json.skipped.map((s: any) => [s.id, s.reason]), [['a', 'ficaria sem nenhum ambiente']]);
  });
  await t('SET troca tudo pelos ambientes escolhidos', async () => {
    const r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['a', 'g'], environments: { mode: 'SET', values: ['ACADEMIA_PADRAO'] } });
    assert.equal(r.json.count, 2); assert.deepEqual(row('a').environments, ['ACADEMIA_PADRAO']); assert.deepEqual(row('g').environments, ['ACADEMIA_PADRAO']);
  });
  await t('grupo/subgrupo: muda os dois; só a categoria zera o subgrupo para Geral; só o subgrupo mantém a categoria', async () => {
    let r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['a', 'b'], category: 'Pernas', subCategory: 'Multiarticular' }); assert.equal(r.json.count, 2); assert.equal(row('a').subCategory, 'Multiarticular'); assert.equal(row('a').category, 'Pernas');
    r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['a'], category: 'Costas' }); assert.equal(row('a').category, 'Costas'); assert.equal(row('a').subCategory, 'Geral');
    r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['a'], subCategory: 'Lombar' }); assert.equal(row('a').category, 'Costas'); assert.equal(row('a').subCategory, 'Lombar');
  });
  await t('ambiente e grupo na mesma chamada', async () => {
    const r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['c'], environments: { mode: 'SET', values: ['UNIVERSAL'] }, category: 'Pernas', subCategory: 'Multiarticular' });
    assert.equal(r.json.count, 1); assert.deepEqual(row('c').environments, ['UNIVERSAL']); assert.equal(row('c').subCategory, 'Multiarticular');
  });
  await t('escopo: nunca mexe em exercício de outro coach (nem da Adri, quando é o Paulo); aparece como "não encontrado ou não é seu"', async () => {
    const r = await call(tok(PAULO_ID, 'ADMIN'), { ids: ['o', 'adri', 'a'], environments: { mode: 'SET', values: ['EM_CASA'] } });
    assert.equal(r.json.count, 1); assert.deepEqual(row('o').environments, ['UNIVERSAL']); assert.deepEqual(row('adri').environments, ['UNIVERSAL']);
    assert.deepEqual(r.json.skipped.map((s: any) => s.id).sort(), ['adri', 'o']);
  });
  await t('pedidos inválidos viram 400 e não mexem em nada', async () => {
    const bad = async (o: any) => { const r = await call(tok(PAULO_ID, 'ADMIN'), o); assert.equal(r.status, 400, JSON.stringify(o) + ' → ' + r.status); };
    await bad({}); await bad({ ids: [] , category: 'Pernas' }); await bad({ ids: ['a'] }); await bad({ ids: ['a'], environments: { mode: 'DELETE', values: ['UNIVERSAL'] } });
    await bad({ ids: ['a'], environments: { mode: 'ADD', values: [] } }); await bad({ ids: ['a'], environments: { mode: 'ADD', values: ['PLANETA'] } });
    await bad({ ids: ['a'], category: 'Pescoço' }); await bad({ ids: ['a'], subCategory: '   ' }); await bad({ ids: Array.from({ length: 501 }, (_, i) => 'x' + i), category: 'Pernas' });
    assert.deepEqual(row('a').environments, ['SMARTFIT']); assert.equal(row('a').category, 'Pernas');
  });
  await t('treino montado e vínculos não são tocados: só os campos pedidos mudam', async () => {
    S.exercise.find((e: any) => e.id === 'a').name = 'Leg press 45'; await call(tok(PAULO_ID, 'ADMIN'), { ids: ['a'], environments: { mode: 'ADD', values: ['UNIVERSAL'] } });
    const a = row('a'); assert.equal(a.name, 'Leg press 45'); assert.equal(a.videoUrl, 'v'); assert.deepEqual(a.tags, { target: 'PERNAS' }); assert.equal(a.hiddenFromCoaches, false);
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
