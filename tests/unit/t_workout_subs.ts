import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as workoutGET } from '/home/user/fitos-final/app/api/workout/route';

const P = prisma as any; const S = P.__state;
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const get = async (qs: string, as = 'c1', role = 'COACH') => { const r = await workoutGET(new Request('http://x/api/workout?' + qs, { headers: { authorization: 'Bearer ' + tok(as, role) } })); return { status: r.status, json: await r.json() }; };
const lib = [
  { id: 'e1', name: 'Supino reto', videoUrl: 'v1', coachId: 'c1' }, { id: 'e2', name: 'Supino inclinado', videoUrl: 'v2', coachId: 'c1' },
  { id: 'e3', name: 'Crucifixo', videoUrl: 'v3', coachId: 'c9' }, { id: 'e4', name: 'Agachamento', videoUrl: null, coachId: 'c9' }, { id: 'e5', name: 'Remada', videoUrl: 'v5', coachId: 'c9' },
];
const ex = (id: string, order: number, substitutes: string[]) => ({ id: 'we' + id, order, exerciseId: id, exercise: { id }, substitute: null, substitutes });
const seed = () => {
  P.__reset();
  S.users.push({ id: 'c1', role: 'COACH' }, { id: 's1', role: 'USER', coachId: 'c1', loadSuggestOff: true, loadStep: null });
  S.exercises.push(...lib);
  S.workouts.push({ id: 'w1', userId: 's1', archived: false, createdAt: new Date('2026-10-20'), exercises: [ex('e1', 1, ['e2', 'e3', 'fantasma']), ex('e4', 2, []), ex('e5', 3, ['e3', 'e2'])] });
  S.workouts.push({ id: 'w0', userId: 's1', archived: true, createdAt: new Date('2026-09-01'), exercises: [ex('e1', 1, ['e4'])] });
};
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { seed(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('lista de treinos: cada troca vira {id, nome, vídeo} na mesma ordem; troca que não existe mais some; treino arquivado também vem', async () => {
    const r = await get('userId=s1');
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.map((w: any) => w.id), ['w1', 'w0']);
    const subs = (w: number, e: number) => r.json[w].exercises[e].substitutes;
    assert.deepStrictEqual(subs(0, 0), [{ id: 'e2', name: 'Supino inclinado', videoUrl: 'v2' }, { id: 'e3', name: 'Crucifixo', videoUrl: 'v3' }]);
    assert.deepStrictEqual(subs(0, 1), []); assert.deepStrictEqual(subs(0, 2).map((s: any) => s.id), ['e3', 'e2'], 'a ordem das trocas é a do treino');
    assert.deepStrictEqual(subs(1, 0), [{ id: 'e4', name: 'Agachamento', videoUrl: null }]);
    assert.strictEqual(r.json[0].exercises[0].exerciseId, 'e1', 'o resto do exercício não muda');
  });
  await block('a biblioteca NÃO é baixada inteira: uma única consulta, só com os ids das trocas citadas (sem repetir), só id/nome/vídeo', async () => {
    await get('userId=s1');
    assert.strictEqual(S.calls.exercise.length, 1);
    const a = S.calls.exercise[0]; assert.deepStrictEqual([...a.where.id.in].sort(), ['e2', 'e3', 'e4', 'fantasma']); assert.deepStrictEqual(a.select, { id: true, name: true, videoUrl: true });
  });
  await block('treino sem nenhuma troca: nem consulta a biblioteca', async () => {
    S.workouts.length = 0; S.workouts.push({ id: 'w2', userId: 's1', archived: false, createdAt: new Date(), exercises: [ex('e1', 1, []), ex('e4', 2, [])] });
    const r = await get('userId=s1'); assert.strictEqual(r.status, 200); assert.strictEqual(S.calls.exercise.length, 0);
    assert.deepStrictEqual(r.json[0].exercises.map((e: any) => e.substitutes), [[], []]);
    S.workouts.length = 0; assert.deepStrictEqual((await get('userId=s1')).json, [], 'aluno sem treino: lista vazia');
  });
  await block('detalhe de um treino (workoutId): mesmas trocas, também só as citadas, e o resto da resposta segue (última carga, sugestão ligada/desligada)', async () => {
    S.histories.push({ id: 'h1', userId: 's1', date: new Date(), name: 'TREINO A', workoutName: 'TREINO A', details: [{ exerciseId: 'e1', setNumber: 1, weight: 50, reps: 10 }] });
    const r = await get('userId=s1&workoutId=w1'); assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json.exercises[0].substitutes.map((s: any) => s.id), ['e2', 'e3']);
    assert.strictEqual(S.calls.exercise.length, 1); assert.deepStrictEqual([...S.calls.exercise[0].where.id.in].sort(), ['e2', 'e3', 'fantasma']);
    assert.strictEqual(r.json.lastLog.day, 'A'); assert.deepStrictEqual(r.json.lastWeights, { e1: { 1: 50 } }); assert.strictEqual(r.json.loadSuggestEnabled, false);
    assert.strictEqual((await get('userId=s1&workoutId=nao-existe')).status, 404);
  });
  await block('quem não é dono do aluno continua barrado; sem userId continua 400', async () => {
    S.users.push({ id: 'c2', role: 'COACH' });
    assert.strictEqual((await get('userId=s1', 'c2')).status, 403); assert.strictEqual((await get('')).status, 400);
    assert.strictEqual(S.calls.exercise.length, 0, 'barrado antes de tocar na biblioteca');
  });
  console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
