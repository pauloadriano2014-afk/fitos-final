import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as dataGET } from '/home/user/fitos-final/app/api/admin/data/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const get = async (qs: string, as: string | null) => { const h: any = {}; if (as) h.authorization = 'Bearer ' + as; const r = await dataGET(new Request('http://x/api/admin/data?' + qs, { headers: h })); return { status: r.status, json: await r.json().catch(() => null) }; };
const COACH = 'coach-1';
const ex = (id: string, coachId: string | null) => ({ id, name: id, category: 'Cardio', coachId, hiddenFromCoaches: false });
const seed = () => {
  P.__reset();
  S.user.push({ id: PAULO_ID, role: 'ADMIN', email: 'paulo@x.com', accountStatus: 'ACTIVE' }, { id: COACH, role: 'COACH', email: 'c1@x.com', accountStatus: 'ACTIVE' },
    { id: 's1', role: 'USER', name: 'Ana', email: 'a@x.com', coachId: COACH, active: true }, { id: 's2', role: 'USER', name: 'Bia', email: 'b@x.com', coachId: COACH, active: false }, { id: 's3', role: 'USER', name: 'Cris', email: 'c@x.com', coachId: 'outro', active: true });
  S.exercise.push(ex('p1', PAULO_ID), ex('c1-own', COACH), ex('x', 'outro'));
};
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { seed(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('padrão (sem o pedido): continua trazendo alunos, inativos, feed e a biblioteca (a do coach + a herdada do Paulo)', async () => {
    const r = await get('adminId=' + COACH, tok(COACH)); assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.json.activeUsers.map((u: any) => u.id), ['s1']); assert.deepStrictEqual(r.json.users.map((u: any) => u.id), ['s1'], '`users` continua igual a `activeUsers` (app antigo lê os dois)');
    assert.deepStrictEqual(r.json.inactiveUsers.map((u: any) => u.id), ['s2']);
    assert.deepStrictEqual(r.json.exercises.map((e: any) => e.id).sort(), ['c1-own', 'p1']);
    assert.ok(Array.isArray(r.json.recentLogs) && Array.isArray(r.json.recentNotes) && Array.isArray(r.json.recentWeekly)); assert.strictEqual(r.json.requesterRole, 'COACH');
  });
  await block('skipExercises=1: o resto da resposta é idêntico, `exercises` vem nulo e a biblioteca nem é consultada', async () => {
    const full = await get('adminId=' + COACH, tok(COACH)); S.calls = {};
    const r = await get('adminId=' + COACH + '&skipExercises=1', tok(COACH)); assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.exercises, null); assert.strictEqual(S.calls['exercise.findMany'], undefined, 'não consultou exercícios'); assert.strictEqual(S.calls['user.findFirst'], undefined, 'nem procurou o Paulo');
    const { exercises: _a, ...a } = full.json; const { exercises: _b, ...b } = r.json; assert.deepStrictEqual(b, a);
  });
  await block('só o valor 1 liga o atalho (outros valores ou ausente = comportamento de sempre)', async () => {
    for (const v of ['0', 'true', '', 'sim']) { S.calls = {}; const r = await get('adminId=' + COACH + '&skipExercises=' + v, tok(COACH)); assert.ok(Array.isArray(r.json.exercises), 'valor ' + v); }
  });
  await block('master (Paulo): vê os próprios alunos/biblioteca; com o atalho também funciona', async () => {
    S.user.push({ id: 'sp', role: 'USER', name: 'Paulo Aluno', email: 'p@x.com', coachId: PAULO_ID, active: true });
    const r = await get('adminId=' + PAULO_ID + '&skipExercises=1', tok(PAULO_ID, 'ADMIN')); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.activeUsers.map((u: any) => u.id), ['sp']); assert.strictEqual(r.json.exercises, null);
  });
  await block('segurança igual: sem login 401, outro coach 403, sem adminId 400, coach pendente 403', async () => {
    assert.strictEqual((await get('adminId=' + COACH, null)).status, 401); assert.strictEqual((await get('adminId=' + COACH + '&skipExercises=1', tok('coach-2'))).status, 403); assert.strictEqual((await get('', tok(COACH))).status, 400);
    S.user.find((u: any) => u.id === COACH).accountStatus = 'PENDING'; assert.strictEqual((await get('adminId=' + COACH, tok(COACH))).status, 403);
  });
  console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
