import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as finishPOST } from '/home/user/fitos-final/app/api/workout/finish/route';
import * as RD from '/home/user/fitos-final/lib/repsDone';
import * as LS from '/home/user/fitos-final/lib/loadSuggest';
import { buildLastLoads } from '/home/user/fitos-final/lib/exerciseLoad';
import { buildStudentLoads } from '/home/user/fitos-final/lib/studentLoads';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const reset = () => { P.__reset(); P.__addUser({ id: 'c1', role: 'COACH', pushToken: 'tok' }); P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1', pushToken: 'ExponentPushToken[s1]' }); };
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
  console.log(`\nTOTAL ${passed} ok, ${fails} falhas`); process.exit(fails ? 1 : 0);
})();
