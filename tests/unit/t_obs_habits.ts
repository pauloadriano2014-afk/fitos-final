import assert from 'assert';
import jwt from 'jsonwebtoken';
import * as OH from '/home/user/fitos-final/lib/observationHabits';
import { GET } from '/home/user/fitos-final/app/api/admin/observation-habits/route';
// 📝 30 out 2026: o sistema aprende os recados que o coach mais repete em cada exercício (contagem por ALUNO) e a rota entrega só os dos alunos de quem chamou.
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const SERROTE = 'Execute com os 2 braços e depois descanse';
// um treino do aluno `u` com os exercícios [exerciseId, recado]
const W = (u: string, ...ex: [string, string | null, string?][]) => ({ userId: u, exercises: ex.map(([exerciseId, observation, technique]) => ({ exerciseId, observation, technique: technique ?? null })) });
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };

(async () => {
  await t('texto puro: o recado vem da coluna; treino antigo só tem dentro do JSON da técnica (o); sem nada = vazio; apara espaços', () => {
    assert.strictEqual(OH.obsOf({ observation: '  Segure 1s  ' }), 'Segure 1s');
    assert.strictEqual(OH.obsOf({ observation: '', technique: JSON.stringify({ t: '', b: [], o: ' Do JSON ' }) }), 'Do JSON');
    assert.strictEqual(OH.obsOf({ observation: 'Coluna', technique: JSON.stringify({ o: 'JSON' }) }), 'Coluna', 'a coluna manda');
    assert.strictEqual(OH.obsOf({ observation: null, technique: 'DROPSET' }), ''); assert.strictEqual(OH.obsOf({ technique: '{quebrado' }), ''); assert.strictEqual(OH.obsOf(null), '');
    assert.strictEqual(OH.obsOf({ observation: 'x'.repeat(900) }).length, 500);
  });
  await t('texto puro: "iguais" ignoram maiúscula, acento, espaço sobrando e pontuação no fim', () => {
    const k = OH.normObs; assert.strictEqual(k('  Execute  com os 2 BRAÇOS. '), k('execute com os 2 braços')); assert.strictEqual(k('Pico de contração!'), k('pico de contracao')); assert.notStrictEqual(k('Carga progressiva'), k('Carga fixa'));
  });
  await t('hábito: mesmo recado em 3 alunos diferentes (escrito de jeitos parecidos) = hábito forte (auto), mostra a grafia mais recente', () => {
    const h = OH.buildObservationHabits([W('a', ['serr', SERROTE + '.']), W('b', ['serr', SERROTE.toLowerCase()]), W('c', ['serr', SERROTE])]);
    assert.deepStrictEqual(h.serr, { total: 3, auto: true, top: [{ text: SERROTE + '.', count: 3 }] }, JSON.stringify(h));
  });
  await t('hábito: o MESMO aluno repetindo o recado em vários treinos conta uma vez (é anotação dele, não hábito) — não vira sugestão', () => {
    const h = OH.buildObservationHabits([W('a', ['ombro', 'Cuidado com o ombro direito']), W('a', ['ombro', 'Cuidado com o ombro direito']), W('a', ['ombro', 'Cuidado com o ombro direito']), W('a', ['ombro', 'Cuidado com o ombro direito'])]);
    assert.deepStrictEqual(h, {});
  });
  await t('hábito: com 2 alunos sugere mas não preenche sozinho; fração baixa (3 de 6 alunos) também só sugere; 3 de 4 preenche', () => {
    assert.deepStrictEqual(OH.buildObservationHabits([W('a', ['x', 'Amplitude máxima']), W('b', ['x', 'Amplitude máxima'])]).x, { total: 2, auto: false, top: [{ text: 'Amplitude máxima', count: 2 }] }, '2 alunos: sugere (2 < 3 para auto)');
    const six = ['a', 'b', 'c'].map((u) => W(u, ['x', 'Amplitude máxima'])).concat(['d', 'e', 'f'].map((u) => W(u, ['x', '']))); assert.deepStrictEqual(OH.buildObservationHabits(six).x, { total: 6, auto: false, top: [{ text: 'Amplitude máxima', count: 3 }] }, '3 de 6 = 50% < 60%');
    const four = ['a', 'b', 'c'].map((u) => W(u, ['x', 'Amplitude máxima'])).concat([W('d', ['x', ''])]); assert.strictEqual(OH.buildObservationHabits(four).x.auto, true, '3 de 4 = 75%');
  });
  await t('hábito: vários recados do mesmo exercício vêm do mais usado para o menos (empate: o mais recente), no máximo 3, e recado vazio/curto é ignorado', () => {
    const w = [W('a', ['e', 'Pico de contração']), W('b', ['e', 'Pico de contração']), W('c', ['e', 'Carga progressiva']), W('d', ['e', 'Carga progressiva']), W('e', ['e', 'Carga progressiva']), W('f', ['e', 'Cadência lenta']), W('g', ['e', 'Cadência lenta']), W('h', ['e', 'Amplitude total']), W('i', ['e', 'Amplitude total']), W('j', ['e', '']), W('k', ['e', 'ok']), W('l', ['e', null])];
    const e = OH.buildObservationHabits(w).e;
    assert.deepStrictEqual(e.top, [{ text: 'Carga progressiva', count: 3 }, { text: 'Pico de contração', count: 2 }, { text: 'Cadência lenta', count: 2 }], 'empate de 2: o que apareceu primeiro na lista (mais novo) vence; só 3'); assert.strictEqual(e.total, 12);
  });
  await t('hábito: treino antigo com o recado só no JSON da técnica também conta; exercício sem hábito não aparece; entrada ruim não quebra', () => {
    const tj = JSON.stringify({ t: '', b: [], o: 'Amplitude máxima' });
    const h = OH.buildObservationHabits([W('a', ['x', '', tj]), W('b', ['x', 'Amplitude máxima']), W('c', ['y', 'Só um aluno'])]);
    assert.deepStrictEqual(Object.keys(h), ['x']); assert.strictEqual(h.x.top[0].count, 2);
    assert.deepStrictEqual(OH.buildObservationHabits(null), {}); assert.deepStrictEqual(OH.buildObservationHabits([{}, { userId: 'a' }, { userId: 'a', exercises: [{}] }, { exercises: [{ exerciseId: 'x', observation: 'abc def' }] }] as any), {});
  });
  await t('leitura do banco: só os treinos dos alunos DO COACH, mais novos primeiro; guarda 5 min; ?fresh e o tempo vencido releem', async () => {
    let calls = 0; const seen: any[] = []; const rows = [W('a', ['x', 'Amplitude máxima']), W('b', ['x', 'Amplitude máxima'])];
    const db = { workout: { findMany: async (q: any) => { calls++; seen.push(q); return rows; } } };
    OH.clearObservationHabitsCache(); let now = 1_000_000; const clock = () => now;
    const a = await OH.loadObservationHabits('c1', { db, now: clock }); assert.strictEqual(a.x.top[0].count, 2);
    assert.deepStrictEqual(seen[0].where, { user: { coachId: 'c1' } }); assert.deepStrictEqual(seen[0].orderBy, { createdAt: 'desc' }); assert.strictEqual(seen[0].take, OH.OBS_HABIT_MAX_WORKOUTS);
    await OH.loadObservationHabits('c1', { db, now: clock }); assert.strictEqual(calls, 1, 'segunda leitura vem da memória');
    await OH.loadObservationHabits('c1', { db, now: clock, fresh: true }); assert.strictEqual(calls, 2, 'fresh relê');
    await OH.loadObservationHabits('c2', { db, now: clock }); assert.strictEqual(calls, 3, 'outro coach, outra memória');
    now += OH.OBS_HABIT_CACHE_MS + 1; await OH.loadObservationHabits('c1', { db, now: clock }); assert.strictEqual(calls, 4, 'venceu os 5 min');
  });
  const call = (token?: string, q = '') => GET(new Request('http://x/api/admin/observation-habits' + q, { headers: token ? { authorization: 'Bearer ' + token } : {} }));
  await t('rota: sem login 401; aluno 403; cada coach recebe só os hábitos dos alunos dele', async () => {
    OH.clearObservationHabitsCache();
    OH.primeObservationHabits('c1', { serr: { total: 3, auto: true, top: [{ text: SERROTE, count: 3 }] } }); OH.primeObservationHabits('c2', { afund: { total: 2, auto: false, top: [{ text: 'Passada longa', count: 2 }] } });
    assert.strictEqual((await call()).status, 401);
    assert.strictEqual((await call(tok('s1', 'USER'))).status, 403, 'aluno não vê');
    const a = await (await call(tok('c1'))).json(); assert.deepStrictEqual(Object.keys(a.habits), ['serr']); assert.ok(a.builtAt);
    const b = await (await call(tok('c2'))).json(); assert.deepStrictEqual(Object.keys(b.habits), ['afund'], 'o coach 2 não vê o hábito do coach 1');
  });
  await t('rota: banco fora do ar vira erro genérico (500) sem detalhe interno', async () => {
    OH.clearObservationHabitsCache(); const r = await call(tok('c9'), '?fresh=1'); const j = await r.json();
    assert.strictEqual(r.status, 500); assert.ok(typeof j.error === 'string' && !/prisma|undefined|TypeError/i.test(j.error), j.error);
  });
  console.log(`\nTOTAL ${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
