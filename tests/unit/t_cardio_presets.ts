import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET, POST, DELETE } from '/home/user/fitos-final/app/api/admin/cardio-presets/route';
import * as CP from '/home/user/fitos-final/lib/cardioPresets';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, body: any, as: string | null = 'c1') => { const h: any = { 'content-type': 'application/json' }; if (as) h.authorization = 'Bearer ' + tok(as); const init: any = { method: fn === GET ? 'GET' : fn === DELETE ? 'DELETE' : 'POST', headers: h }; if (body !== undefined && fn === POST) init.body = typeof body === 'string' ? body : JSON.stringify(body); const r = await fn(new Request('http://x' + url, init)); return { status: r.status, json: await r.json().catch(() => null) }; };
const cardio = { v: 1, mode: 'INTERVALADO', equip: 'ESCADA', warmupMin: 3, cooldownMin: 3, rounds: 10, work: { sec: 30, kcal: 8, params: { level: 12 } }, rest: { sec: 30, params: { level: 5 } }, kcal: 150 };
const ex = (id: string, o: any = {}) => ({ exerciseId: id, title: 'Escada ergométrica', observation: 'Sem soltar o corrimão', substitutes: [{ id: 'e9', name: 'Correr na esteira' }], blocks: [{ sets: '16', reps: '150', restTime: '0', technique: 'HIIT', cardio }], ...o });
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('validação: objetivo, nome, quantidade e formato dos exercícios', () => {
    assert.deepStrictEqual(['hipertrofia', ' Definicao ', 'EMAGRECIMENTO', 'outro', 'xx', '', null, 5].map(CP.cleanGoal), ['HIPERTROFIA', 'DEFINICAO', 'EMAGRECIMENTO', 'OUTRO', null, null, null, null]);
    const ok = CP.parseCardioPresetInput({ name: '  Cardio hipertrofia  ', goal: 'hipertrofia', exercises: [ex('e1')] }) as any; assert.deepStrictEqual([ok.ok, ok.name, ok.goal, ok.exercises.length], [true, 'Cardio hipertrofia', 'HIPERTROFIA', 1]);
    for (const bad of [{ exercises: [ex('e1')] }, { name: '   ', exercises: [ex('e1')] }, { name: 'x' }, { name: 'x', exercises: [] }, { name: 'x', exercises: 'a' }, { name: 'x', exercises: Array.from({ length: 7 }, (_, i) => ex('e' + i)) }, { name: 'x', exercises: [ex('e1'), ex('e1')] }, { name: 'x', exercises: [ex('custom_1')] }, { name: 'x', exercises: [ex('')] }, { name: 'x', exercises: [ex('e1', { blocks: [] })] }, { name: 'x', exercises: [ex('e1', { blocks: 'a' })] }, { name: 'x', exercises: [ex('e1', { blocks: [{ sets: '1', cardio: 'texto' }] })] }, { name: 'x', exercises: [ex('e1', { blocks: [{ sets: '1', cardio: { lixo: 'x'.repeat(7000) } }] })] }, null, undefined, 'a']) assert.strictEqual((CP.parseCardioPresetInput(bad as any) as any).ok, false, String(JSON.stringify(bad)).slice(0, 80));
    assert.strictEqual((CP.parseCardioPresetInput({ name: 'x'.repeat(100), exercises: [ex('e1')] }) as any).name.length, 60, 'nome limitado a 60');
    const arr = (o: any) => CP.sanitizeCardioExercises([ex('e1', o)]);
    assert.strictEqual(arr({ blocks: [{ sets: '1', cardio: [1, 2] }] }), null, 'cardio tem de ser um objeto, não uma lista'); assert.ok(!('subBlocks' in (arr({ subBlocks: [1] }) as any)[0]), 'subBlocks como lista é ignorado'); assert.strictEqual(arr({ subBlocks: { e9: [1] } }), null, 'o que o aluno faz na opção tem de ser um objeto');
    const longEx = (CP.sanitizeCardioExercises([ex('e1', { observation: 'o'.repeat(900), title: 't'.repeat(300), substitutes: [{ id: 'e9', name: 'n'.repeat(300) }] })]) as any)[0]; assert.deepStrictEqual([longEx.observation.length, longEx.title.length, longEx.substitutes[0].name.length], [500, 120, 120], 'textos limitados');
    assert.strictEqual((CP.parseCardioPresetInput({ name: 'x', goal: 'zzz', exercises: [ex('e1')] }) as any).goal, null, 'objetivo desconhecido = sem objetivo');
    const six = CP.parseCardioPresetInput({ name: 'x', exercises: Array.from({ length: 6 }, (_, i) => ex('e' + i)) }) as any; assert.strictEqual(six.ok, true);
  });
  await block('validação: opções de troca e o que o aluno faz em cada uma', () => {
    const sb = { cardio: { v: 1, mode: 'CONTINUO', minutes: 20, kcal: 200, params: { speed: 9 } }, sets: '20', reps: '200', restTime: '0', technique: 'Zona 2' };
    const r = (CP.sanitizeCardioExercises([ex('e1', { substitutes: [{ id: 'e9', name: 'Esteira' }, { id: 'e8', title: 'Elíptico' }, { id: 'e9', name: 'repetida' }, { id: 'e1', name: 'a própria' }, { id: '', name: 'sem id' }, { id: 'e7', name: 'A' }, { id: 'e6', name: 'passou de 3' }], subBlocks: { e9: sb, e5: sb, e8: undefined } })]) as any)[0];
    assert.deepStrictEqual(r.substitutes, [{ id: 'e9', name: 'Esteira' }, { id: 'e8', name: 'Elíptico' }, { id: 'e7', name: 'A' }], 'até 3, sem repetir nem a própria nem vazia'); assert.deepStrictEqual(Object.keys(r.subBlocks), ['e9'], 'só de opção que existe; sem definição não grava'); assert.deepStrictEqual(r.subBlocks.e9.cardio.params, { speed: 9 });
    assert.ok(!('subBlocks' in (CP.sanitizeCardioExercises([ex('e1')]) as any)[0]), 'sem definição: nada guardado');
    assert.strictEqual(CP.sanitizeCardioExercises([ex('e1', { subBlocks: { e9: { sets: '5' } } })]), null, 'definição de opção sem cardio é inválida');
    assert.deepStrictEqual((CP.sanitizeCardioExercises([ex('e1', { substitutes: undefined })]) as any)[0].substitutes, []);
    assert.deepStrictEqual((CP.sanitizeCardioExercises([ex('e1', { substitutes: [{ exerciseId: 'e4', title: 'Bike' }] })]) as any)[0].substitutes, [{ id: 'e4', name: 'Bike' }], 'aceita exerciseId/title (formato do editor)');
    const b = (CP.sanitizeCardioExercises([ex('e1', { blocks: [{ sets: '123456', reps: '123456', restTime: '123456', technique: 'x'.repeat(60) }, { sets: 'outro bloco' }] })]) as any)[0].blocks; assert.strictEqual(b.length, 1, 'cardio tem um bloco só'); assert.deepStrictEqual([b[0].sets, b[0].reps, b[0].restTime, b[0].technique.length, 'cardio' in b[0]], ['1234', '12345', '1234', 40, false]);
    assert.deepStrictEqual((CP.sanitizeCardioExercises([ex('e1', { blocks: [{}] })]) as any)[0].blocks[0], { sets: '20', reps: '', restTime: '0', technique: '' }, 'padrões');
  });
  await block('rota: cria, lista só os do próprio coach (mais novos primeiro), apaga só os próprios; exige login', async () => {
    assert.strictEqual((await call(GET, '/api/admin/cardio-presets', undefined, null)).status, 401); assert.strictEqual((await call(POST, '/x', { name: 'a', exercises: [ex('e1')] }, null)).status, 401); assert.strictEqual((await call(DELETE, '/x?id=cp1', undefined, null)).status, 401);
    const a = await call(POST, '/x', { name: 'Cardio hipertrofia', goal: 'hipertrofia', exercises: [ex('e1')], coachId: 'outro', id: 'hack' }); assert.strictEqual(a.status, 200, JSON.stringify(a.json)); assert.deepStrictEqual([a.json.coachId, a.json.name, a.json.goal, a.json.id], ['c1', 'Cardio hipertrofia', 'HIPERTROFIA', 'cp1'], 'o dono vem do token, nunca do corpo');
    const b = await call(POST, '/x', { name: 'Cardio emagrecimento', goal: 'emagrecimento', exercises: [ex('e1'), ex('e2', { title: 'Elíptico', substitutes: [] })] }); assert.strictEqual(b.status, 200);
    const other = await call(POST, '/x', { name: 'Do outro coach', exercises: [ex('e1')] }, 'c2'); assert.strictEqual(other.status, 200);
    const list = await call(GET, '/x', undefined); assert.deepStrictEqual(list.json.presets.map((p: any) => p.name), ['Cardio emagrecimento', 'Cardio hipertrofia']); assert.deepStrictEqual((await call(GET, '/x', undefined, 'c2')).json.presets.map((p: any) => p.name), ['Do outro coach']);
    assert.deepStrictEqual(list.json.presets[0].exercises[0].blocks[0].cardio.work.params, { level: 12 }, 'a estrutura volta intacta');
    const del = await call(DELETE, '/x?id=cp3', undefined); assert.strictEqual(del.status, 404, 'combo de outro coach: não encontrado'); assert.strictEqual(S.rows.length, 3);
    assert.strictEqual((await call(DELETE, '/x?id=cp1', undefined)).status, 200); assert.deepStrictEqual(S.rows.map((r: any) => r.id), ['cp2', 'cp3']); assert.strictEqual((await call(DELETE, '/x', undefined)).status, 400, 'sem id'); assert.strictEqual((await call(DELETE, '/x?id=cp1', undefined)).status, 404, 'já apagado');
  });
  await block('rota: entradas inválidas viram 400 sem gravar; limite de 100 por coach; falha do banco vira 500', async () => {
    for (const bad of [{ exercises: [ex('e1')] }, { name: 'a', exercises: [] }, { name: 'a', exercises: [ex('custom_9')] }, '{lixo', 'null']) assert.strictEqual((await call(POST, '/x', bad as any)).status, 400, JSON.stringify(bad).slice(0, 60)); assert.strictEqual(S.rows.length, 0);
    for (let i = 0; i < 100; i++) S.rows.push({ id: 'z' + i, coachId: 'c1', name: 'n', exercises: [], createdAt: new Date() });
    const full = await call(POST, '/x', { name: 'a', exercises: [ex('e1')] }); assert.strictEqual(full.status, 400); assert.ok(/Limite/.test(full.json.error)); assert.strictEqual((await call(POST, '/x', { name: 'a', exercises: [ex('e1')] }, 'c2')).status, 200, 'o limite é por coach');
    S.fail = 'banco fora'; assert.strictEqual((await call(GET, '/x', undefined)).status, 500); assert.strictEqual((await call(POST, '/x', { name: 'a', exercises: [ex('e1')] }, 'c3')).status, 500);
  });
  console.log(`\n${fails ? 'FALHOU' : 'OK'}: ${passed} blocos ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
