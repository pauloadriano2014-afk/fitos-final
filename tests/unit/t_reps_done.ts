import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as finishPOST } from '/home/user/fitos-final/app/api/workout/finish/route';
import * as RD from '/home/user/fitos-final/lib/repsDone';
import * as LS from '/home/user/fitos-final/lib/loadSuggest';
import { buildLastLoads } from '/home/user/fitos-final/lib/exerciseLoad';
import { buildStudentLoads } from '/home/user/fitos-final/lib/studentLoads';
import * as RF from '/home/user/fitos-final/lib/repsFeitas';
import { FEATURE_KEYS, FEATURE_LABELS, FOUNDER_KEYS } from '/home/user/fitos-final/lib/coachFeatures';
import { PAULO_ID, ADRI_ID } from '/home/user/fitos-final/lib/masterIds';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const reset = () => { P.__reset(); P.__addUser({ id: 'c1', role: 'COACH', pushToken: 'tok' }); P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1', pushToken: 'ExponentPushToken[s1]' }); S.coachFeature.push({ coachId: 'c1', feature: 'repsFeitas', revokedAt: null }); };   // o coach c1 tem a chave das repetições feitas
const callRoute = async (b: any) => { const r = await finishPOST(new Request('http://x/api/workout/finish', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok('s1') }, body: JSON.stringify(b) })); return { status: r.status, json: await r.json() }; };
const fin = (exercisesData: any[], o: any = {}) => callRoute({ userId: 's1', workoutName: 'PERNAS', day: 'A', workoutId: 'w1', exercisesData, duration: 40, rpe: 8, feedback: '', ...o });
const NOW = new Date('2026-10-29T12:00:00Z'); const DAY = 86400000; const day = (n: number) => new Date(NOW.getTime() - n * DAY);
// um treino do exercício e1: 4 séries de `load` kg, meta `target`, `done` = repsDone de cada série (undefined = não informou)
const hist = (daysAgo: number, load: number, target: string, done: (number | undefined)[], extra: any = {}) => ({ id: 'h' + daysAgo, date: day(daysAgo), details: done.map((d, i) => ({ exerciseId: 'e1', setNumber: i + 1, weight: load, perSide: false, effort: null, cardioSeconds: null, cardioKcal: null, reps: target, repsDone: d ?? null, ...extra })) });
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 4).join('\n        ')); } };
const sug = (h: any[]) => LS.suggestLoad(LS.sessionsOf(h, 'e1'), { now: NOW });
(async () => {
  await block('texto puro: repsDone só aceita inteiro de 1 a 300; vazio, zero, texto e absurdo viram "não informou"', () => {
    assert.deepStrictEqual(['12', 12, ' 8 ', 12.4, '10 reps', 0, '', null, undefined, 'abc', -3, 301, true, '1000'].map(RD.cleanRepsDone), [12, 12, 8, 12, 10, null, null, null, null, null, null, null, null, null]);
  });
  await block('texto puro: a meta do coach vira faixa ("8-10" = 8 a 10; "12" = 12; "10 a 12"; sem número = null)', () => {
    assert.deepStrictEqual(['12', '8-10', '10 a 12', '12 cada lado', '4+4+4', 'falha', '', null].map((x) => RD.targetRange(x)), [{ min: 12, max: 12 }, { min: 8, max: 10 }, { min: 10, max: 12 }, { min: 12, max: 12 }, { min: 4, max: 4 }, null, null, null]);
  });
  await block('veredito: bateu o topo em todas, ficou abaixo na metade ou mais, e sem número = sem opinião', () => {
    const rows = (t: string, d: (number | null)[]) => d.map((x, i) => ({ setNumber: i + 1, weight: 40, reps: t, repsDone: x }));
    assert.deepStrictEqual(RD.repsVerdict(rows('8-10', [10, 10, 11, 10])), { known: 4, hitAll: true, missed: false });
    assert.deepStrictEqual(RD.repsVerdict(rows('8-10', [10, 9, 10, 10])), { known: 4, hitAll: false, missed: false });
    assert.deepStrictEqual(RD.repsVerdict(rows('12', [12, 11, 9, 8])), { known: 4, hitAll: false, missed: true }, 'metade abaixo do mínimo');
    assert.deepStrictEqual(RD.repsVerdict(rows('12', [null, null, null, null])), { known: 0, hitAll: false, missed: false });
    assert.deepStrictEqual(RD.repsVerdict(rows('12', [12, null, null, null])), { known: 1, hitAll: true, missed: false });
    // técnica: duas linhas na mesma série (principal + drop); vale a de maior carga
    const drop = [{ setNumber: 1, weight: 40, reps: '10', repsDone: 10 }, { setNumber: 1, weight: 28, reps: '10', repsDone: 4 }];
    assert.deepStrictEqual(RD.repsVerdict(drop), { known: 1, hitAll: true, missed: false });
  });

  await block('finalizar: grava as repetições feitas por série e mantém a meta em `reps`; sem o campo (app antigo) fica nulo', async () => {
    const r = await fin([{ exerciseId: 'e1', name: 'Extensora', sets: [{ index: 1, weight: '40', reps: '12', repsDone: 12 }, { index: 2, weight: '40', reps: '12', repsDone: '11' }, { index: 3, weight: '40', reps: '12' }, { index: 4, weight: '40', reps: '12', repsDone: 'abc' }] }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const d = S.histories[0].details as any[];
    assert.deepStrictEqual(d.map((x) => x.repsDone), [12, 11, null, null]);
    assert.deepStrictEqual(d.map((x) => x.reps), ['12', '12', '12', '12'], 'a meta não muda');
    assert.deepStrictEqual(d.map((x) => x.weight), [40, 40, 40, 40], 'a carga não é afetada');
  });
  await block('finalizar: técnica com várias cargas na mesma série guarda as reps de cada parte', async () => {
    await fin([{ exerciseId: 'e2', name: 'Leg', sets: [{ index: 1, weight: '40', reps: '10', repsDone: 8 }, { index: 1, weight: '40', reps: '10', repsDone: 5 }, { index: 1, weight: '32', reps: '10', repsDone: 10 }] }]);
    assert.deepStrictEqual((S.histories[0].details as any[]).map((x) => [x.weight, x.repsDone]), [[40, 8], [40, 5], [32, 10]]);
  });

  await block('sugestão: mesma carga nos 2 treinos e bateu o topo da meta nos dois -> sobe com motivo REPS_HIT', () => {
    const s = sug([hist(3, 40, '12', [12, 12, 12, 12]), hist(10, 40, '12', [12, 12, 12, 12])]);
    assert.deepStrictEqual([s?.action, s?.reason], ['UP', 'REPS_HIT']);
  });
  await block('sugestão: mesma carga mas ficou abaixo da meta no último treino -> mantém (BELOW), não sobe', () => {
    const s = sug([hist(3, 40, '12', [10, 9, 9, 8]), hist(10, 40, '12', [12, 12, 12, 12])]);
    assert.deepStrictEqual([s?.action, s?.reason, s?.to], ['HOLD', 'BELOW', 40]);
  });
  await block('sugestão: sem nenhuma repetição informada, tudo igual a antes (REPEATED)', () => {
    const s = sug([hist(3, 40, '12', [undefined, undefined, undefined, undefined]), hist(10, 40, '12', [undefined, undefined, undefined, undefined])]);
    assert.deepStrictEqual([s?.action, s?.reason], ['UP', 'REPEATED']);
  });
  await block('sugestão: bateu o topo só no último treino (o anterior sem número) -> segue REPEATED, não REPS_HIT', () => {
    const s = sug([hist(3, 40, '12', [12, 12, 12, 12]), hist(10, 40, '12', [undefined, undefined, undefined, undefined])]);
    assert.strictEqual(s?.reason, 'REPEATED');
  });
  await block('sugestão: "fácil" continua subindo e "pesado" continua mantendo, mesmo com reps abaixo da meta', () => {
    const f = sug([hist(3, 40, '12', [8, 8, 8, 8], { effort: 'FACIL' })]);
    assert.deepStrictEqual([f?.action, f?.reason], ['UP', 'EASY']);
    const h = sug([hist(3, 40, '12', [12, 12, 12, 12], { effort: 'PESADO' })]);
    assert.deepStrictEqual([h?.action, h?.reason], ['HOLD', 'HEAVY']);
  });

  await block('última vez: buildLastLoads devolve as reps da mesma linha da carga; série sem número não aparece', () => {
    const r = buildLastLoads([hist(3, 40, '12', [12, 11, undefined, 10]) as any, hist(10, 38, '12', [12, 12, 12, 12]) as any]);
    assert.deepStrictEqual(r.reps, { e1: { 1: 12, 2: 11, 4: 10 } }, 'a série 3 do treino novo não tem número: não herda o do antigo');
    assert.deepStrictEqual(r.weights.e1, { 1: 40, 2: 40, 3: 40, 4: 40 });
  });
  await block('Montar treino: as referências por fase levam as repetições feitas junto da meta', () => {
    const r = buildStudentLoads([hist(3, 40, '12', [12, undefined, 10, 9]) as any], { now: NOW });
    assert.deepStrictEqual(r.e1.refs.NORMAL!.sets.map((x: any) => [x.reps, x.repsDone]), [['12', 12], ['12', undefined], ['12', 10], ['12', 9]]);
  });

  // ───── a CHAVE (29 out 2026): aluno > coach / geral; tudo nasce desligado ─────
  const fakeDb = (o: { global?: Record<string, boolean>; grants?: any[]; coach?: any; fail?: boolean } = {}) => ({
    featureGlobal: { findMany: async () => { if (o.fail) throw new Error('banco fora do ar'); return Object.entries(o.global || {}).map(([feature, enabled]) => ({ feature, enabled })); } },
    coachFeature: { findMany: async () => (o.grants || []).map((g) => ({ revokedAt: null, ...g })), updateMany: async () => ({ count: 0 }) },
    user: { findUnique: async () => o.coach || { accountStatus: 'APPROVED', coachBillingStatus: 'ACTIVE' } },
  });
  await block('chave: repsFeitas é um recurso novo (não é de Fundador) e o texto limpo de repsMode só aceita ON / OFF', () => {
    assert.ok((FEATURE_KEYS as readonly string[]).includes('repsFeitas') && FEATURE_LABELS.repsFeitas); assert.ok(!(FOUNDER_KEYS as readonly string[]).includes('repsFeitas'));
    assert.deepStrictEqual(['on', ' OFF ', 'ON', 'talvez', '', null, undefined, true].map(RF.cleanRepsMode), ['ON', 'OFF', 'ON', null, null, null, null, null]);
  });
  await block('chave: a do ALUNO manda (ON liga só ele, OFF desliga só ele), mesmo contra a chave do coach / geral', async () => {
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), { id: 's', coachId: 'parceiro', repsMode: 'ON' }), { on: true, source: 'STUDENT' });
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb({ global: { repsFeitas: true } }), { id: 's', coachId: 'parceiro', repsMode: 'OFF' }), { on: false, source: 'STUDENT' }, 'chave geral ligada, mas o aluno está OFF');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), { id: 's', coachId: PAULO_ID, repsMode: 'OFF' }), { on: false, source: 'STUDENT' }, 'aluno do Paulo desligado');
  });
  await block('chave: nasce DESLIGADA (inclusive Paulo/Adri e aluno sem coach); liga com a chave do aluno, a GERAL ou a concessão a um coach', async () => {
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), { id: 's', coachId: PAULO_ID }), { on: false, source: null }, 'aluno do Paulo nasce desligado');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), { id: 's', coachId: ADRI_ID }), { on: false, source: null }, 'aluna da Adri nasce desligada');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), { id: 's', coachId: null }), { on: false, source: null }, 'aluno sem coach nasce desligado');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), { id: PAULO_ID, coachId: 'x' }), { on: false, source: null }, 'o próprio Paulo treinando também');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), { id: PAULO_ID, coachId: null, repsMode: 'ON' }), { on: true, source: 'STUDENT' }, 'Paulo liga a própria chave');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb({ global: { repsFeitas: true } }), { id: 's', coachId: PAULO_ID }), { on: true, source: 'GLOBAL' }, 'geral liga até para alunos do Paulo');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb({ grants: [{ coachId: PAULO_ID, feature: 'repsFeitas' }] }), { id: 's', coachId: PAULO_ID }), { on: true, source: 'GRANT' }, 'concessão ao Paulo liga os alunos dele');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), { id: 's', coachId: 'parceiro' }), { on: false, source: null });
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb({ global: { repsFeitas: true } }), { id: 's', coachId: 'parceiro' }), { on: true, source: 'GLOBAL' });
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb({ global: { execVideo: true } }), { id: 's', coachId: 'parceiro' }), { on: false, source: null }, 'outra chave geral não vale');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb({ grants: [{ coachId: 'parceiro', feature: 'repsFeitas' }] }), { id: 's', coachId: 'parceiro' }), { on: true, source: 'GRANT' });
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb({ grants: [{ coachId: 'parceiro', feature: 'repsFeitas' }], coach: { accountStatus: 'APPROVED', coachBillingStatus: 'OVERDUE' } }), { id: 's', coachId: 'parceiro' }), { on: false, source: null }, 'coach em atraso perde a concessão');
    assert.deepStrictEqual(await RF.repsAccessFor(fakeDb(), null), { on: false, source: null });
  });
  await block('chave: se a consulta falha responde desligado e avisa que foi erro (quem grava dados não descarta por isso)', async () => {
    const r = await RF.repsAccessFor(fakeDb({ fail: true }), { id: 's', coachId: 'parceiro' }); assert.deepStrictEqual([r.on, r.error], [false, true]);
  });

  const setsR = (o: any) => [{ exerciseId: 'e1', name: 'Extensora', sets: [{ index: 1, weight: '40', reps: '12', repsDone: 11, ...o }] }];
  await block('finalizar com a chave: coach com a concessão -> grava as reps feitas', async () => {
    assert.strictEqual((await fin(setsR({}))).status, 200); assert.strictEqual((S.histories[0].details as any[])[0].repsDone, 11);
  });
  await block('finalizar sem a chave (coach sem concessão): o treino salva normal, mas as reps feitas são ignoradas', async () => {
    S.coachFeature.length = 0;
    assert.strictEqual((await fin(setsR({}))).status, 200); const d = (S.histories[0].details as any[])[0]; assert.deepStrictEqual([d.weight, d.reps, d.repsDone], [40, '12', null]);
  });
  await block('finalizar: chave GERAL liga para todos; chave do aluno OFF desliga só ele; ON liga só ele', async () => {
    S.coachFeature.length = 0; S.featureGlobal.push({ feature: 'repsFeitas', enabled: true });
    await fin(setsR({})); assert.strictEqual((S.histories[0].details as any[])[0].repsDone, 11, 'geral ligada');
    P.__reset(); P.__addUser({ id: 'c1', role: 'COACH' }); P.__addUser({ id: 's1', name: 'Ana', coachId: 'c1', repsMode: 'OFF' }); S.featureGlobal.push({ feature: 'repsFeitas', enabled: true });
    await fin(setsR({})); assert.strictEqual((S.histories[0].details as any[])[0].repsDone, null, 'aluno OFF');
    P.__reset(); P.__addUser({ id: 'c1', role: 'COACH' }); P.__addUser({ id: 's1', name: 'Ana', coachId: 'c1', repsMode: 'ON' });
    await fin(setsR({})); assert.strictEqual((S.histories[0].details as any[])[0].repsDone, 11, 'aluno ON, sem concessão');
  });
  await block('finalizar: aluno do Paulo / da Adri / sem coach NÃO grava reps sem a chave; sem nenhuma reps no corpo nem consulta a chave', async () => {
    for (const coachId of [PAULO_ID, ADRI_ID, null]) { P.__reset(); P.__addUser({ id: 's1', name: 'Ana', coachId }); await fin(setsR({})); assert.strictEqual((S.histories[0].details as any[])[0].repsDone, null, String(coachId)); }
    P.__reset(); P.__addUser({ id: 's1', name: 'Ana', coachId: PAULO_ID, repsMode: 'ON' }); await fin(setsR({})); assert.strictEqual((S.histories[0].details as any[])[0].repsDone, 11, 'Paulo liga a chave do aluno');
    P.__reset(); P.__addUser({ id: 'c1', role: 'COACH' }); P.__addUser({ id: 's1', name: 'Ana', coachId: 'c1' });
    const r = await fin([{ exerciseId: 'e1', name: 'Extensora', sets: [{ index: 1, weight: '40', reps: '12' }] }]); assert.strictEqual(r.status, 200); assert.strictEqual((S.histories[0].details as any[])[0].repsDone, null);
  });

  console.log(`\nTOTAL ${passed} ok, ${fails} falhas`); process.exit(fails ? 1 : 0);
})();
