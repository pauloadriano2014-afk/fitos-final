import assert from 'assert';
import { parseExerciseRow, buildPublicWorkout } from '/home/user/fitos-final/lib/workoutShare';

let passed = 0, fails = 0;
const t = (name: string, fn: () => void) => { try { fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + (e && e.message)); } };
const row = (o: any) => ({ restTime: 60, sets: 3, reps: '10', technique: null, observation: null, substitutes: [], customTechniqueId: null, day: 'A', exercise: { name: 'x', category: 'Pernas', videoUrl: null }, ...o });
const js = (blocks: any[]) => JSON.stringify({ t: blocks[0].technique || '', b: blocks });
const build = (rows: any[], custom: any[] = []) => buildPublicWorkout({ workoutName: 'T', rows, customTechniques: custom, share: { code: 'AbCdEfGhIj12', showName: false, days: [], expiresAt: null } } as any).days[0].sections.flatMap((x: any) => x.items);

t('parseExerciseRow: Bi-set com técnica própria — técnica = própria, groupKey = BISET', () => {
  const { blocks } = parseExerciseRow(row({ technique: js([{ sets: '3', reps: '10', restTime: '60', technique: 'BISET', ownTech: '1_5_REPS' }]) }));
  assert.strictEqual(blocks[0].techKey, '1_5_REPS'); assert.strictEqual(blocks[0].groupKey, 'BISET'); assert.strictEqual(blocks[0].customId, null);
});
t('parseExerciseRow: Bi-set sem técnica própria continua igual (techKey BISET); sem grupo, groupKey nulo e ownTech ignorado', () => {
  const a = parseExerciseRow(row({ technique: js([{ sets: '3', reps: '10', technique: 'BISET' }]) })).blocks[0]; assert.strictEqual(a.techKey, 'BISET'); assert.strictEqual(a.groupKey, 'BISET');
  const b = parseExerciseRow(row({ technique: js([{ sets: '3', reps: '10', technique: 'DROPSET', ownTech: '1_5_REPS' }]) })).blocks[0]; assert.strictEqual(b.techKey, 'DROPSET'); assert.ok(!b.groupKey);
  const c = parseExerciseRow(row({ technique: js([{ sets: '3', reps: '10', technique: '' }]) })).blocks[0]; assert.ok(!c.groupKey); assert.strictEqual(c.techKey, null);
});
t('técnica personalizada própria dentro do grupo', () => {
  const b = parseExerciseRow(row({ technique: js([{ sets: '3', reps: '10', technique: 'TRISET', ownCustomId: 'abc' }]) })).blocks[0];
  assert.strictEqual(b.customId, 'abc'); assert.strictEqual(b.techKey, null); assert.strictEqual(b.groupKey, 'TRISET');
});
t('texto livre como técnica própria vira rótulo', () => {
  const b = parseExerciseRow(row({ technique: js([{ sets: '3', reps: '10', technique: 'BISET', ownTech: 'Minha técnica' }]) })).blocks[0];
  assert.strictEqual(b.techKey, null); assert.strictEqual(b.techLabel, 'Minha técnica'); assert.strictEqual(b.groupKey, 'BISET');
});
t('página pública: o par se forma pelo grupo e cada exercício mostra a sua técnica', () => {
  const items = build([
    row({ id: '1', order: 1, exerciseId: 'a', exercise: { name: 'Cadeira Extensora', category: 'Pernas' }, technique: js([{ sets: '3', reps: '10', restTime: '60', technique: 'BISET', ownTech: '1_5_REPS' }]) }),
    row({ id: '2', order: 2, exerciseId: 'b', exercise: { name: 'RDL', category: 'Pernas' }, technique: js([{ sets: '3', reps: '8-10', restTime: '60', technique: 'BISET' }]) }),
    row({ id: '3', order: 3, exerciseId: 'c', exercise: { name: 'Leg', category: 'Pernas' } }),
  ]);
  const by = (n: string) => items.find((i: any) => i.name === n);
  assert.deepStrictEqual(by('Cadeira Extensora').group, { tech: 'BISET', label: 'BI-SET', pos: 0, size: 2 }); assert.deepStrictEqual(by('RDL').group, { tech: 'BISET', label: 'BI-SET', pos: 1, size: 2 }); assert.strictEqual(by('Leg').group, null);
  assert.ok(by('Cadeira Extensora').techAlerts.some((a: any) => a.key === '1_5_REPS' && /em todas as séries/.test(a.text)), 'técnica própria aparece como aviso');
  assert.ok(by('Cadeira Extensora').setPlan.every((p: any) => p.tech && /1/.test(p.tech)), 'plano de cargas usa a técnica própria');
  assert.ok(items.every((i: any) => !('_gt' in i)));
});
t('par incompleto continua sem virar grupo, mesmo com técnica própria', () => {
  const items = build([row({ id: '1', order: 1, exerciseId: 'a', exercise: { name: 'A', category: 'Pernas' }, technique: js([{ sets: '3', reps: '10', technique: 'BISET', ownTech: 'DROPSET' }]) }), row({ id: '2', order: 2, exerciseId: 'b', exercise: { name: 'B', category: 'Pernas' } })]);
  assert.ok(items.every((i: any) => i.group === null));
});
console.log(`\n${passed} ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
