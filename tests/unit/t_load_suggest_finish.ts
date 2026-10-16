import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as finishPOST } from '/home/user/fitos-final/app/api/workout/finish/route';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const reset = () => { P.__reset(); P.__addUser({ id: 'c1', role: 'COACH', pushToken: 'tok' }); P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1', pushToken: 'ExponentPushToken[s1]' }); };
const callRoute = async (b: any) => { const r = await finishPOST(new Request('http://x/api/workout/finish', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok('s1') }, body: JSON.stringify(b) })); return { status: r.status, json: await r.json().catch(() => null) }; };
const fin = (exercisesData: any[], o: any = {}) => callRoute({ userId: 's1', workoutName: 'PEITO', day: 'A', workoutId: 'w1', exercisesData, duration: 52, rpe: 8, feedback: '', ...o });
const sets = (w: string[]) => w.map((x, i) => ({ index: i + 1, weight: x, reps: '10' }));
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 8).join('\n        ')); } };
const rows = () => S.histories[0].details as any[];
(async () => {
  await block('finalizar: o "como foi?" de cada exercício vai em todas as séries dele (e só nele)', async () => {
    const r = await fin([{ exerciseId: 'e1', name: 'Supino', effort: 'FACIL', sets: sets(['40', '40', '40']) }, { exerciseId: 'e2', name: 'Remada', effort: 'pesado', sets: sets(['30', '30']) }, { exerciseId: 'e3', name: 'Rosca', sets: sets(['10']) }]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(rows().map((d) => [d.exerciseId, d.effort]), [['e1', 'FACIL'], ['e1', 'FACIL'], ['e1', 'FACIL'], ['e2', 'PESADO'], ['e2', 'PESADO'], ['e3', null]]);
  });
  await block('finalizar: valor inválido ou vazio vira "sem resposta"; app antigo (sem o campo) segue funcionando', async () => {
    const r = await fin([{ exerciseId: 'e1', name: 'A', effort: 'qualquer', sets: sets(['10']) }, { exerciseId: 'e2', name: 'B', effort: '', sets: sets(['10']) }, { exerciseId: 'e3', name: 'C', effort: 5, sets: sets(['10']) }, { exerciseId: 'e4', name: 'D', effort: ' ok ', sets: sets(['10']) }, { exerciseId: 'e5', name: 'E', effort: null, sets: sets(['10']) }]);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(rows().map((d) => d.effort), [null, null, null, 'OK', null]);
    assert.deepStrictEqual(rows().map((d) => d.weight), [10, 10, 10, 10, 10], 'a carga não é afetada');
  });
  await block('finalizar: reenvio com a mesma chave não duplica e mantém o "como foi?"', async () => {
    const body = { clientKey: 'k1' };
    const a = await fin([{ exerciseId: 'e1', name: 'Supino', effort: 'FACIL', sets: sets(['40']) }], body);
    const b = await fin([{ exerciseId: 'e1', name: 'Supino', effort: 'FACIL', sets: sets(['40']) }], body);
    assert.deepStrictEqual([a.status, b.status, S.histories.length, rows()[0].effort], [200, 200, 1, 'FACIL']);
  });
  console.log(`\nTOTAL ${passed} ok, ${fails} falhas`); process.exit(fails ? 1 : 0);
})();
