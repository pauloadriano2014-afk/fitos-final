import assert from 'assert';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as libGET, POST as libPOST, PUT as libPUT } from '/home/user/wt-back/app/api/exercise/route';
import { POST as visPOST } from '/home/user/wt-back/app/api/exercise/visibility/route';
import { GET as subsGET } from '/home/user/wt-back/app/api/exercise/substitutes/route';
import { GET as dataGET } from '/home/user/wt-back/app/api/admin/data/route';
import { visibleLibraryWhere, notHiddenForCoach, hiddenFlagFromBody } from '/home/user/wt-back/lib/exerciseVisibility';
import { PAULO_ID, ADRI_ID } from '/home/user/wt-back/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const post = (o: any) => ({ method: 'POST', body: JSON.stringify(o) });
const put = (o: any) => ({ method: 'PUT', body: JSON.stringify(o) });
const COACH = 'coach-1', OTHER = 'coach-2';
const ex = (id: string, name: string, coachId: string | null, o: any = {}) => ({ id, name, category: 'Cardio', subCategory: 'Geral', coachId, hiddenFromCoaches: false, videoUrl: 'https://x/' + id + '.mp4', defaultSubstitutes: [], environments: ['ACADEMIA'], ...o });
const seed = () => {
  P.__reset();
  S.user.push({ id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', accountStatus: 'ACTIVE' }, { id: ADRI_ID, role: 'ADMIN', email: 'adri.personal@hotmail.com', accountStatus: 'ACTIVE' }, { id: COACH, role: 'COACH', email: 'c1@x.com', accountStatus: 'ACTIVE' }, { id: OTHER, role: 'COACH', email: 'c2@x.com', accountStatus: 'ACTIVE' });
  S.exercise.push(
    ex('p-novo', 'Bike', PAULO_ID), ex('p-velho', 'Bicicleta ergométrica', PAULO_ID, { hiddenFromCoaches: true, videoUrl: 'https://d1.cloudfront.net/velho.mp4' }), ex('p-ok', 'Supino reto', PAULO_ID),
    ex('g-ok', 'Global aberto', null), ex('g-hid', 'Global escondido', null, { hiddenFromCoaches: true }),
    ex('c1-own', 'Do coach 1', COACH), ex('c2-own', 'Do coach 2', OTHER), ex('a-own', 'Da Adri', ADRI_ID),
  );
};
const names = (r: any) => (r.json as any[]).map((e) => e.id).sort();
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { seed(); await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };

(async () => {
  await t('parceiro: a lista traz os próprios + os do Paulo + os globais, MENOS os marcados "só o Paulo vê"', async () => {
    const r = await call(libGET, `/api/exercise?adminId=${COACH}`, tok(COACH));
    assert.equal(r.status, 200); assert.deepEqual(names(r), ['c1-own', 'g-ok', 'p-novo', 'p-ok'], 'o velho do Paulo e o global escondido não aparecem; exercício de outro coach nunca aparece');
  });
  await t('Paulo e Adri: continuam vendo tudo o que é deles (escondido ou não) + globais, sem misturar um com o outro', async () => {
    let r = await call(libGET, `/api/exercise?adminId=${PAULO_ID}`, tok(PAULO_ID, 'ADMIN')); assert.deepEqual(names(r), ['g-hid', 'g-ok', 'p-novo', 'p-ok', 'p-velho']);
    r = await call(libGET, `/api/exercise?adminId=${ADRI_ID}`, tok(ADRI_ID, 'ADMIN')); assert.deepEqual(names(r), ['a-own', 'g-hid', 'g-ok']);
  });
  await t('o marcador vem no cadastro devolvido ao Paulo (a tela precisa dele para mostrar a etiqueta)', async () => {
    const r = await call(libGET, `/api/exercise?adminId=${PAULO_ID}`, tok(PAULO_ID, 'ADMIN')); assert.equal(r.json.find((e: any) => e.id === 'p-velho').hiddenFromCoaches, true); assert.equal(r.json.find((e: any) => e.id === 'p-ok').hiddenFromCoaches, false);
  });
  await t('painel (admin/data): parceiro herda do Paulo sem os escondidos; a Adri, que é master, continua vendo tudo do Paulo', async () => {
    let r = await call(dataGET, `/api/admin/data?adminId=${COACH}`, tok(COACH)); assert.equal(r.status, 200); const ids = (r.json.exercises as any[]).map((e) => e.id).sort();
    assert.ok(ids.includes('p-novo') && ids.includes('p-ok') && ids.includes('c1-own')); assert.ok(!ids.includes('p-velho'), 'escondido não herda'); assert.ok(!ids.includes('c2-own'));
    r = await call(dataGET, `/api/admin/data?adminId=${ADRI_ID}`, tok(ADRI_ID, 'ADMIN')); assert.equal(r.status, 200); const adri = (r.json.exercises as any[]).map((e) => e.id);
    assert.ok(adri.includes('p-velho'), 'Adri (master) continua vendo');
  });
  await t('substitutos: sugestão automática e lista preferida não mostram escondidos ao parceiro; ao Paulo mostram', async () => {
    S.exercise.find((e: any) => e.id === 'p-ok').defaultSubstitutes = ['p-novo', 'p-velho'];
    let r = await call(subsGET, `/api/exercise/substitutes?exerciseId=p-ok&category=Cardio&adminId=${COACH}`, tok(COACH)); assert.deepEqual(r.json.map((e: any) => e.id), ['p-novo'], 'preferido escondido some');
    r = await call(subsGET, `/api/exercise/substitutes?exerciseId=p-ok&category=Cardio&adminId=${PAULO_ID}`, tok(PAULO_ID, 'ADMIN')); assert.deepEqual(r.json.map((e: any) => e.id), ['p-novo', 'p-velho'], 'Paulo vê os dois, na ordem');
    r = await call(subsGET, `/api/exercise/substitutes?category=Cardio&adminId=${COACH}`, tok(COACH)); assert.ok(!r.json.some((e: any) => e.hiddenFromCoaches), 'busca automática também filtra');
    r = await call(subsGET, `/api/exercise/substitutes?category=Cardio&adminId=${PAULO_ID}`, tok(PAULO_ID, 'ADMIN')); assert.ok(r.json.some((e: any) => e.id === 'p-velho'));
  });
  await t('marcar em massa: só o time master; liga e desliga; conta quantos mudaram; ignora ids repetidos', async () => {
    for (const as of [null, tok(COACH)]) { const r = await call(visPOST, '/api/exercise/visibility', as, post({ ids: ['p-ok'], hidden: true })); assert.ok([401, 403].includes(r.status)); }
    assert.equal(S.exercise.find((e: any) => e.id === 'p-ok').hiddenFromCoaches, false, 'parceiro não consegue esconder');
    let r = await call(visPOST, '/api/exercise/visibility', tok(PAULO_ID, 'ADMIN'), post({ ids: ['p-ok', 'p-novo', 'p-ok'], hidden: true })); assert.equal(r.status, 200); assert.equal(r.json.count, 2);
    assert.equal(S.exercise.find((e: any) => e.id === 'p-ok').hiddenFromCoaches, true); assert.equal(S.exercise.find((e: any) => e.id === 'p-novo').hiddenFromCoaches, true);
    const lib = await call(libGET, `/api/exercise?adminId=${COACH}`, tok(COACH)); assert.deepEqual(names(lib), ['c1-own', 'g-ok'], 'agora o parceiro só vê o dele e o global aberto');
    r = await call(visPOST, '/api/exercise/visibility', tok(PAULO_ID, 'ADMIN'), post({ ids: ['p-ok', 'p-velho'], hidden: false })); assert.equal(r.json.count, 2);
    assert.equal(S.exercise.find((e: any) => e.id === 'p-velho').hiddenFromCoaches, false);
  });
  await t('marcar em massa: não mexe em exercício de outro dono (nem da Adri, nem de parceiro); global pode', async () => {
    const r = await call(visPOST, '/api/exercise/visibility', tok(PAULO_ID, 'ADMIN'), post({ ids: ['a-own', 'c1-own', 'c2-own', 'g-ok'], hidden: true })); assert.equal(r.status, 200); assert.equal(r.json.count, 1, 'só o global');
    for (const id of ['a-own', 'c1-own', 'c2-own']) assert.equal(S.exercise.find((e: any) => e.id === id).hiddenFromCoaches, false, id);
    assert.equal(S.exercise.find((e: any) => e.id === 'g-ok').hiddenFromCoaches, true);
  });
  await t('marcar em massa: pedidos inválidos são recusados e nada muda', async () => {
    const before = JSON.stringify(S.exercise);
    for (const b of [{ ids: ['p-ok'] }, { ids: ['p-ok'], hidden: 'true' }, { hidden: true }, { ids: [], hidden: true }, { ids: 'p-ok', hidden: true }, { ids: [1], hidden: true }, { ids: [''], hidden: true }, { ids: Array.from({ length: 501 }, (_, i) => 'x' + i), hidden: true }]) {
      const r = await call(visPOST, '/api/exercise/visibility', tok(PAULO_ID, 'ADMIN'), post(b)); assert.equal(r.status, 400, JSON.stringify(b).slice(0, 60));
    }
    const bad = await visPOST(new Request('http://x/api/exercise/visibility', { method: 'POST', headers: { authorization: 'Bearer ' + tok(PAULO_ID, 'ADMIN') }, body: 'quebrado' })); assert.equal(bad.status, 400);
    assert.equal(JSON.stringify(S.exercise), before);
  });
  await t('cadastro/edição: só o master grava o marcador; de parceiro é ignorado; sem o campo na edição, o valor atual fica', async () => {
    let r = await call(libPOST, '/api/exercise', tok(PAULO_ID, 'ADMIN'), post({ adminId: PAULO_ID, name: 'Novo escondido', category: 'Cardio', hiddenFromCoaches: true })); assert.equal(r.status, 200); assert.equal(r.json.hiddenFromCoaches, true);
    r = await call(libPOST, '/api/exercise', tok(COACH), post({ adminId: COACH, name: 'Tentativa', category: 'Cardio', hiddenFromCoaches: true })); assert.equal(r.status, 200); assert.ok(!r.json.hiddenFromCoaches, 'parceiro não esconde o próprio');
    const mine = S.exercise.find((e: any) => e.name === 'Tentativa'); assert.ok(!mine.hiddenFromCoaches);
    r = await call(libPUT, '/api/exercise', tok(PAULO_ID, 'ADMIN'), put({ id: 'p-ok', adminId: PAULO_ID, name: 'Supino reto', category: 'Peito', hiddenFromCoaches: true })); assert.equal(r.status, 200); assert.equal(S.exercise.find((e: any) => e.id === 'p-ok').hiddenFromCoaches, true);
    r = await call(libPUT, '/api/exercise', tok(PAULO_ID, 'ADMIN'), put({ id: 'p-velho', adminId: PAULO_ID, name: 'Bicicleta ergométrica', category: 'Cardio' })); assert.equal(r.status, 200); assert.equal(S.exercise.find((e: any) => e.id === 'p-velho').hiddenFromCoaches, true, 'edição sem o campo não desmarca');
    r = await call(libPUT, '/api/exercise', tok(PAULO_ID, 'ADMIN'), put({ id: 'p-velho', adminId: PAULO_ID, name: 'Bicicleta ergométrica', category: 'Cardio', hiddenFromCoaches: 'sim' })); assert.equal(S.exercise.find((e: any) => e.id === 'p-velho').hiddenFromCoaches, true, 'valor que não é true/false é ignorado');
    r = await call(libPUT, '/api/exercise', tok(COACH), put({ id: 'c1-own', adminId: COACH, name: 'Do coach 1', category: 'Cardio', hiddenFromCoaches: true })); assert.equal(r.status, 200); assert.ok(!S.exercise.find((e: any) => e.id === 'c1-own').hiddenFromCoaches);
  });
  await t('o espelho da Adri (cópia de exercício novo do Paulo) não herda o marcador: ela é master e vê tudo', async () => {
    await call(libPOST, '/api/exercise', tok(PAULO_ID, 'ADMIN'), post({ adminId: PAULO_ID, name: 'Espelho', category: 'Cardio', hiddenFromCoaches: true }));
    const copy = S.exercise.find((e: any) => e.name === 'Espelho' && e.coachId === ADRI_ID); assert.ok(copy); assert.ok(!copy.hiddenFromCoaches);
  });
  await t('funções da regra: filtros e leitura do campo', () => {
    assert.deepEqual(visibleLibraryWhere(PAULO_ID), { OR: [{ coachId: PAULO_ID }, { coachId: null }] });
    assert.deepEqual(visibleLibraryWhere('x'), { OR: [{ coachId: 'x' }, { coachId: PAULO_ID, hiddenFromCoaches: false }, { coachId: null, hiddenFromCoaches: false }] });
    assert.deepEqual(notHiddenForCoach(ADRI_ID), {}); assert.deepEqual(notHiddenForCoach('x'), { hiddenFromCoaches: false }); assert.deepEqual(notHiddenForCoach(null), { hiddenFromCoaches: false });
    assert.equal(hiddenFlagFromBody({ hiddenFromCoaches: true }, 'x'), undefined); assert.equal(hiddenFlagFromBody({ hiddenFromCoaches: true }, PAULO_ID), true); assert.equal(hiddenFlagFromBody({ hiddenFromCoaches: false }, ADRI_ID), false);
    assert.equal(hiddenFlagFromBody({}, PAULO_ID), undefined); assert.equal(hiddenFlagFromBody({ hiddenFromCoaches: 1 }, PAULO_ID), undefined); assert.equal(hiddenFlagFromBody(null, PAULO_ID), undefined);
  });
  await t('o servidor tem a coluna nova (opcional, padrão false) e treino montado/validação não filtram', () => {
    const s = fs.readFileSync('/home/user/wt-back/prisma/schema/workout.prisma', 'utf8'); assert.ok(/hiddenFromCoaches\s+Boolean\s+@default\(false\)/.test(s));
    for (const f of ['app/api/workout/route.ts', 'app/api/workout/[id]/route.ts']) assert.ok(!fs.readFileSync('/home/user/wt-back/' + f, 'utf8').includes('hiddenFromCoaches'), f + ': treino já montado não pode ser filtrado');
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
