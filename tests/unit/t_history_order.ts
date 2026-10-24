// Ordem do histórico de treinos (25 out 2026): exercícios na ordem da ficha do coach, séries por número, principal do drop-set antes da redução.
import assert from 'assert';
import { planPositions, orderHistoryDetails } from '/home/user/fitos-final/lib/historyOrder';
let ok = 0; const t = (name: string, fn: () => void) => { try { fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; } };
const row = (exerciseId: string, setNumber: number, weight: number, extra: any = {}) => ({ exerciseId, setNumber, weight, ...extra });
const plan = [{ exerciseId: 'C', day: 'B', order: 0 }, { exerciseId: 'A', day: 'A', order: 1 }, { exerciseId: 'B', day: 'A', order: 0 }, { exerciseId: 'D', day: 'A', order: 2 }];

t('posições da ficha: só o dia pedido, na ordem do coach', () => {
  assert.deepStrictEqual([...planPositions(plan, 'A').entries()], [['B', 0], ['A', 1], ['D', 2]]);
  assert.deepStrictEqual([...planPositions(plan, 'b').entries()], [['C', 0]]);
});
t('séries fora de ordem (3, 1, 2) voltam para 1, 2, 3', () => {
  const out = orderHistoryDetails([row('A', 3, 80), row('A', 1, 60), row('A', 2, 70)]);
  assert.deepStrictEqual(out.map((r) => r.setNumber), [1, 2, 3]);
});
t('exercícios seguem a ficha, não a ordem em que o aluno marcou', () => {
  const out = orderHistoryDetails([row('D', 1, 10), row('A', 1, 20), row('B', 1, 30)], planPositions(plan, 'A'));
  assert.deepStrictEqual(out.map((r) => r.exerciseId), ['B', 'A', 'D']);
});
t('séries de um mesmo exercício não se misturam com outro', () => {
  const out = orderHistoryDetails([row('A', 1, 20), row('B', 2, 31), row('A', 2, 22), row('B', 1, 30)], planPositions(plan, 'A'));
  assert.deepStrictEqual(out.map((r) => r.exerciseId + r.setNumber), ['B1', 'B2', 'A1', 'A2']);
});
t('drop-set: a principal (carga maior) vem antes da redução do mesmo número', () => {
  const out = orderHistoryDetails([row('A', 4, 60), row('A', 3, 80), row('A', 4, 100)]);
  assert.deepStrictEqual(out.map((r) => r.weight), [80, 100, 60]);
});
t('exercício fora da ficha vai depois, na ordem em que apareceu', () => {
  const out = orderHistoryDetails([row('Z', 1, 5), row('Y', 1, 5), row('B', 1, 5)], planPositions(plan, 'A'));
  assert.deepStrictEqual(out.map((r) => r.exerciseId), ['B', 'Z', 'Y']);
});
t('sem ficha: mantém a 1ª aparição e ordena as séries; não muda a lista original', () => {
  const src = [row('Q', 2, 1), row('P', 1, 1), row('Q', 1, 1)]; const out = orderHistoryDetails(src, null);
  assert.deepStrictEqual(out.map((r) => r.exerciseId + r.setNumber), ['Q1', 'Q2', 'P1']);
  assert.strictEqual(src[0].setNumber, 2);
});
t('entradas estranhas não quebram', () => {
  assert.deepStrictEqual(orderHistoryDetails(null), []); assert.deepStrictEqual(orderHistoryDetails(undefined), []);
  assert.strictEqual(planPositions(null, 'A').size, 0);
});
console.log(`${ok} testes ok`);
