import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { phaseOf, cleanPhase, isNormalPhase } from '@/lib/loadPhase';
import { sessionsOf, suggestLoad } from '@/lib/loadSuggest';
import { POST as finishPOST } from '/home/user/fitos-final/app/api/workout/finish/route';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const reset = () => { P.__reset(); P.__addUser({ id: 'c1', role: 'COACH', pushToken: 'tok' }); P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1', pushToken: 'ExponentPushToken[s1]' }); };
const fin = async (o: any = {}) => { const r = await finishPOST(new Request('http://x/api/workout/finish', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok('s1') }, body: JSON.stringify({ userId: 's1', workoutName: 'PEITO', day: 'A', workoutId: 'w1', exercisesData: [{ exerciseId: 'e1', name: 'Supino', sets: [{ index: 1, weight: '40', reps: '10' }] }], duration: 50, ...o }) })); return { status: r.status, json: await r.json().catch(() => null) }; };
const NOW = new Date('2026-10-18T12:00:00Z');
const addWorkout = (o: any) => P.__addWorkout({ id: 'w1', userId: 's1', ...o });
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 3).join(' // ')); } };
const day = (n: number) => new Date(NOW.getTime() + n * 86400000);
const hist = (n: number, weights: number[], phase?: string | null) => ({ date: day(n), loadPhase: phase, details: weights.map((w, i) => ({ exerciseId: 'e1', setNumber: i + 1, weight: w, perSide: false, effort: null })) });
(async () => {
  await block('regra da fase: igual à do app do aluno (multiplicador ≠ 1 + data de fim + ainda não passou)', () => {
    assert.deepStrictEqual(phaseOf(0.8, day(3), NOW), { phase: 'DELOAD', multiplier: 0.8 });
    assert.deepStrictEqual(phaseOf(1.1, day(3), NOW), { phase: 'CHOQUE', multiplier: 1.1 });
    assert.deepStrictEqual(phaseOf('0.8', day(3).toISOString(), NOW), { phase: 'DELOAD', multiplier: 0.8 }, 'texto também vale');
    assert.strictEqual(phaseOf(0.8, day(-1), NOW).phase, 'NORMAL', 'passou da data de fim: volta ao normal');
    assert.strictEqual(phaseOf(0.8, NOW, NOW).phase, 'DELOAD', 'no próprio instante do fim ainda vale (o app usa <=)');
    assert.strictEqual(phaseOf(0.8, null, NOW).phase, 'NORMAL', 'sem data de fim o app não aplica máscara');
    assert.strictEqual(phaseOf(1, day(3), NOW).phase, 'NORMAL'); assert.strictEqual(phaseOf(0, day(3), NOW).phase, 'NORMAL'); assert.strictEqual(phaseOf(-2, day(3), NOW).phase, 'NORMAL');
    assert.strictEqual(phaseOf(undefined, day(3), NOW).phase, 'NORMAL'); assert.strictEqual(phaseOf('abc', day(3), NOW).phase, 'NORMAL'); assert.strictEqual(phaseOf(0.8, 'lixo', NOW).phase, 'NORMAL');
    assert.strictEqual(phaseOf(0.8, day(3), NOW).multiplier, 0.8); assert.strictEqual(phaseOf(1, day(3), NOW).multiplier, 1);
    assert.deepStrictEqual(['normal', ' DELOAD ', 'Choque', 'x', null, 5].map(cleanPhase), ['NORMAL', 'DELOAD', 'CHOQUE', null, null, null]);
    assert.deepStrictEqual([null, undefined, 'NORMAL', 'DELOAD', 'CHOQUE', 'x'].map(isNormalPhase), [true, true, true, false, false, true]);
  });
  await block('finalizar: grava a fase e o multiplicador (deload, choque e normal)', async () => {
    addWorkout({ intensityMultiplier: 0.8, intensityEndDate: new Date(Date.now() + 3 * 86400000) });
    assert.strictEqual((await fin({ clientKey: 'k1' })).status, 200); assert.deepStrictEqual([S.histories[0].loadPhase, S.histories[0].intensityApplied], ['DELOAD', 0.8]);
    reset(); addWorkout({ intensityMultiplier: 1.1, intensityEndDate: new Date(Date.now() + 3 * 86400000) });
    await fin({ clientKey: 'k2' }); assert.deepStrictEqual([S.histories[0].loadPhase, S.histories[0].intensityApplied], ['CHOQUE', 1.1]);
    reset(); addWorkout({ intensityMultiplier: 0.8, intensityEndDate: new Date(Date.now() - 86400000) });
    await fin({ clientKey: 'k3' }); assert.deepStrictEqual([S.histories[0].loadPhase, S.histories[0].intensityApplied], ['NORMAL', 1], 'deload vencido grava normal');
    reset(); addWorkout({});
    await fin({ clientKey: 'k4' }); assert.strictEqual(S.histories[0].loadPhase, 'NORMAL');
  });
  await block('finalizar: sem ficha, ficha inexistente ou leitura falhando = sem fase, e o treino é salvo do mesmo jeito', async () => {
    assert.strictEqual((await fin({ clientKey: 'a', workoutId: null })).status, 200); assert.ok(!('loadPhase' in S.histories[0]) || S.histories[0].loadPhase == null);
    reset(); assert.strictEqual((await fin({ clientKey: 'b', workoutId: 'nao-existe' })).status, 200); assert.ok(S.histories[0].loadPhase == null, 'ficha não achada: sem fase');
    reset(); S.workoutFail = true;
    const r = await fin({ clientKey: 'c' }); assert.strictEqual(r.status, 200, 'falha na leitura da fase nunca derruba o finalizar'); assert.strictEqual(S.histories.length, 1); assert.ok(S.histories[0].loadPhase == null);
    assert.strictEqual(S.histories[0].details[0].weight, 40, 'a carga continua igual');
  });
  await block('sugestão de carga: ignora deload e choque (só treinos normais); depois do deload volta à carga normal', () => {
    // do mais novo para o mais velho: deload (32), normal (40), normal (40) -> repetiu 40 nos 2 normais -> sobe; o deload não atrapalha
    const h = [hist(-1, [32, 32], 'DELOAD'), hist(-8, [40, 40], 'NORMAL'), hist(-15, [40, 40], null)];
    const s = sessionsOf(h as any, 'e1'); assert.deepStrictEqual(s.map((x) => x.sets[0].weight), [40, 40], 'o deload sai da lista');
    const sug = suggestLoad(s, { now: NOW })!; assert.strictEqual(sug.action, 'UP'); assert.strictEqual(sug.from, 40);
    // choque no meio: não vira "carga repetida" nem "reduziu"
    const h2 = [hist(-1, [44, 44], 'CHOQUE'), hist(-8, [40, 40], 'NORMAL')]; assert.deepStrictEqual(sessionsOf(h2 as any, 'e1').map((x) => x.sets[0].weight), [40]);
    assert.strictEqual(suggestLoad(sessionsOf(h2 as any, 'e1'), { now: NOW }), null, 'um treino normal só: sem dado suficiente (não sugere pelo choque)');
    // só treinos de deload/choque: nada a sugerir
    assert.deepStrictEqual(sessionsOf([hist(-1, [32], 'DELOAD'), hist(-8, [44], 'CHOQUE')] as any, 'e1'), []);
    // histórico sem a coluna (app/servidor antigo) = tudo normal, como sempre
    assert.strictEqual(sessionsOf([hist(-1, [40]), hist(-8, [40])].map((x: any) => { delete x.loadPhase; return x; }) as any, 'e1').length, 2);
  });
  console.log(`\n${fails ? 'FALHOU' : 'OK'}: ${passed} blocos ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
