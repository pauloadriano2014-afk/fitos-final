import assert from 'assert';
import { normalizeGenerated, normalizeSaved, diffPlans, summarizeEdits } from '/home/user/fitos-final/lib/ai/genLearning';

// APRENDER COM AS EDIÇÕES (23 out 2026): comparar o treino que a IA gerou com o que o coach deixou. Funções puras.
let ok = 0, bad = 0;
const t = (name: string, fn: () => any) => { try { fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };
const ex = (id: string, title: string, sub: string, blocks: any[] = [{ sets: '3', reps: '12', technique: '' }]) => ({ exerciseId: id, title, subCategory: sub, category: 'Musculação', blocks });
const gen = normalizeGenerated({
  A: [ex('p1', 'Supino reto', 'PEITO', [{ sets: '4', reps: '15' }, { sets: '4', reps: '12' }]), ex('p2', 'Crucifixo', 'PEITO'), ex('b1', 'Rosca direta', 'BICEPS'), ex('b2', 'Rosca martelo', 'BICEPS')],
  B: [ex('c1', 'Puxada', 'COSTAS'), ex('c2', 'Remada', 'COSTAS')],
}, ['A', 'B']);
const row = (id: string, day: string, order: number, o: any = {}) => ({ exerciseId: id, day, order, sets: o.sets ?? 3, reps: o.reps ?? '12', technique: o.technique ?? '' });
const names = { p1: { n: 'Supino reto', g: 'PEITO' }, p2: { n: 'Crucifixo', g: 'PEITO' }, p3: { n: 'Supino inclinado', g: 'PEITO' }, b1: { n: 'Rosca direta', g: 'BICEPS' }, b2: { n: 'Rosca martelo', g: 'BICEPS' }, c1: { n: 'Puxada', g: 'COSTAS' }, c2: { n: 'Remada', g: 'COSTAS' }, t1: { n: 'Tríceps corda', g: 'TRICEPS' } };
const same = () => [row('p1', 'A', 0, { sets: 8, reps: '15/12', technique: JSON.stringify({ t: '', b: [{ sets: '4', reps: '15', technique: '' }, { sets: '4', reps: '12', technique: '' }] }) }), row('p2', 'A', 1), row('b1', 'A', 2), row('b2', 'A', 3), row('c1', 'B', 4), row('c2', 'B', 5)];

t('formato enxuto: séries somadas, repetições por bloco, técnica; salvo igual ao gerado = nenhuma diferença', () => {
  assert.deepEqual(gen.A[0], { id: 'p1', n: 'Supino reto', g: 'PEITO', s: 8, r: '15/12', t: '' }); assert.deepEqual(Object.keys(gen), ['A', 'B']);
  const saved = normalizeSaved(same(), names); assert.deepEqual(saved.A.map((x) => x.id), ['p1', 'p2', 'b1', 'b2']); assert.equal(saved.A[0].s, 8); assert.equal(saved.A[0].r, '15/12');
  assert.deepEqual(diffPlans(gen, saved), []); assert.deepEqual(summarizeEdits([]), { removed: 0, added: 0, swapped: 0, moved: 0, changed: 0, total: 0 });
});
t('troca: tirou um exercício e pôs outro do mesmo grupo no mesmo dia = "trocado"; de outro grupo = tirou + acrescentou', () => {
  const rows = same().map((r) => (r.exerciseId === 'p2' ? { ...r, exerciseId: 'p3' } : r)); let e = diffPlans(gen, normalizeSaved(rows, names));
  assert.deepEqual(e.map((x) => [x.type, x.fromId, x.toId, x.from, x.to, x.g]), [['swapped', 'p2', 'p3', 'Crucifixo', 'Supino inclinado', 'PEITO']]);
  e = diffPlans(gen, normalizeSaved(same().map((r) => (r.exerciseId === 'p2' ? { ...r, exerciseId: 't1' } : r)), names)); assert.deepEqual(e.map((x) => x.type).sort(), ['added', 'removed']);
  e = diffPlans(gen, normalizeSaved(same().filter((r) => r.exerciseId !== 'b2'), names)); assert.deepEqual(e.map((x) => [x.type, x.id]), [['removed', 'b2']]);
  e = diffPlans(gen, normalizeSaved([...same(), row('t1', 'A', 9)], names)); assert.deepEqual(e.map((x) => [x.type, x.id, x.n, x.g]), [['added', 't1', 'Tríceps corda', 'TRICEPS']]);
});
t('ordem: só o menor conjunto que andou conta (bíceps passando à frente do peito = o peito "andou"); trocar dois lado a lado marca um só', () => {
  const rows = [row('b1', 'A', 0), row('b2', 'A', 1), row('p1', 'A', 2, { sets: 8, reps: '15/12', technique: JSON.stringify({ t: '', b: [{ sets: '4', reps: '15' }, { sets: '4', reps: '12' }] }) }), row('p2', 'A', 3), row('c1', 'B', 4), row('c2', 'B', 5)];
  const e = diffPlans(gen, normalizeSaved(rows, names)); const mv = e.filter((x) => x.type === 'moved'); assert.equal(e.length, mv.length); assert.deepEqual(mv.map((x) => x.id).sort(), ['p1', 'p2'], 'o par do peito andou para trás dos bíceps');
  const swap2 = [row('p2', 'A', 0), row('p1', 'A', 1, { sets: 8, reps: '15/12', technique: JSON.stringify({ t: '', b: [{ sets: '4', reps: '15' }, { sets: '4', reps: '12' }] }) }), ...same().slice(2)]; const e2 = diffPlans(gen, normalizeSaved(swap2, names)); assert.equal(e2.length, 1); assert.equal(e2[0].type, 'moved');
});
t('séries, repetições e técnica: cada uma vira uma linha com de → para', () => {
  const rows = same().map((r) => (r.exerciseId === 'b1' ? { ...r, sets: 4, reps: '10', technique: JSON.stringify({ t: 'DROPSET', b: [{ sets: '4', reps: '10', technique: 'dropset' }] }) } : r));
  const e = diffPlans(gen, normalizeSaved(rows, names)); assert.deepEqual(e.map((x) => [x.type, x.from, x.to]).sort(), [['reps', '12', '10'], ['sets', 3, 4], ['technique', '', 'DROPSET']]);
  assert.ok(e.every((x) => x.id === 'b1' && x.n === 'Rosca direta' && x.g === 'BICEPS'));
});
t('dia inteiro tirado, dia novo, exercício repetido no mesmo dia, linhas fora de ordem e lixo não quebram nada', () => {
  const e = diffPlans(gen, normalizeSaved(same().filter((r) => r.day === 'A'), names)); assert.equal(e.filter((x) => x.type === 'removed' && x.day === 'B').length, 2);
  const e2 = diffPlans(gen, normalizeSaved([...same(), row('t1', 'C', 10)], names)); assert.deepEqual(e2.map((x) => [x.type, x.day]), [['added', 'C']]);
  const dup = normalizeSaved([row('p1', 'A', 0), row('p1', 'A', 1)], names); assert.doesNotThrow(() => diffPlans(gen, dup));
  const shuffled = normalizeSaved(same().reverse(), names); assert.deepEqual(diffPlans(gen, shuffled), [], 'a ordem vem do campo order, não da posição na lista');
  assert.doesNotThrow(() => normalizeSaved([null, {}, { exerciseId: 'x', technique: '{quebrado' }] as any, {})); assert.deepEqual(normalizeGenerated({} as any), {}); assert.doesNotThrow(() => diffPlans({} as any, null as any));
});
t('resumo conta cada tipo e limita a lista a 80', () => {
  const big = normalizeGenerated({ A: Array.from({ length: 100 }, (_, i) => ex('e' + i, 'E' + i, 'G' + i)) }); const e = diffPlans(big, {}); assert.equal(e.length, 80);
  const s = summarizeEdits([{ type: 'swapped', day: 'A' }, { type: 'moved', day: 'A' }, { type: 'sets', day: 'A' }, { type: 'reps', day: 'A' }, { type: 'removed', day: 'A' }, { type: 'added', day: 'A' }] as any); assert.deepEqual(s, { removed: 1, added: 1, swapped: 1, moved: 1, changed: 2, total: 6 });
});
console.log(`\n${bad ? 'FALHOU' : 'OK'}: ${ok} ok, ${bad} falharam`); process.exit(bad ? 1 : 0);
