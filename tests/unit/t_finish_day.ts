import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as finishPOST } from '/home/user/fitos-final/app/api/workout/finish/route';
const P = prisma as any;
const tok = (id: string) => jwt.sign({ id, role: 'ALUNO', coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
P.__reset(); P.__addUser({ id: 's1', name: 'Aluno' });
const post = async (body: any) => { const r = await finishPOST(new Request('http://x/api/workout/finish', { method: 'POST', headers: { authorization: 'Bearer ' + tok('s1'), 'content-type': 'application/json' }, body: JSON.stringify({ userId: 's1', workoutName: 'FICHA', exercisesData: [], ...body }) })); return r.status; };
(async () => {
  const created = P.__state.histories;
  assert.equal(await post({ day: ' b ', workoutId: 'w-123', clientKey: 'k1' }), 200); assert.equal(created[0].day, 'B', 'a letra do dia fica gravada (maiúscula, sem espaços)'); assert.equal(created[0].workoutId, 'w-123');
  assert.equal(await post({ clientKey: 'k2' }), 200); assert.equal(created[1].day, null); assert.equal(created[1].workoutId, null, 'app antigo (sem day/workoutId) continua funcionando');
  assert.equal(await post({ day: 'x'.repeat(100), clientKey: 'k3' }), 200); assert.equal(created[2].day.length, 40);
  console.log('OK  finalizar treino grava o dia (A, B...) e a ficha, e continua aceitando o app antigo');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); });
