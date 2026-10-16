import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { PATCH as resolvePATCH } from '/home/user/fitos-final/app/api/admin/workout-history/[id]/resolve/route';
import { registerCoachContact } from '/home/user/fitos-final/lib/coachReplies';
import { loadWeeklyBoard } from '/home/user/fitos-final/lib/weeklyBoard';
const P = prisma as any; const db = P.__db;
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const patch = async (as: string, id: string, body: any) => { const r = await resolvePATCH(new Request('http://x/api/admin/workout-history/' + id + '/resolve', { method: 'PATCH', headers: { authorization: 'Bearer ' + tok(as), 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: { id } }); return { status: r.status, json: await r.json() }; };
db.users.push({ id: 'coach-a', role: 'COACH', accountStatus: 'ACTIVE', name: 'Coach A', coachId: null }, { id: 's1', role: 'USER', name: 'Bruno', coachId: 'coach-a', pushToken: 'tok' });
// o mock não tem o histórico/observação: monta só o que a rota usa
const hist: any = { id: 'h1', userId: 's1', name: 'Treino', feedback: 'senti o ombro', user: { id: 's1', name: 'Bruno', coachId: 'coach-a', pushToken: 'tok', webPushSubscription: null } };
const ex: any = { id: 'x1', workoutHistoryId: 'h1', exerciseName: 'Supino' };
P.workoutHistory = { ...(P.workoutHistory || {}), findUnique: async ({ where }: any) => (where.id === 'h1' ? hist : null), update: async ({ data }: any) => Object.assign(hist, data) };
P.exerciseHistory = { findFirst: async ({ where }: any) => (where.id === 'x1' && where.workoutHistoryId === 'h1' ? ex : null), update: async ({ data }: any) => Object.assign(ex, data) };
const s1 = () => db.users.find((x: any) => x.id === 's1');
const fresh = (u: any) => !!u.lastContactDate && Date.now() - new Date(u.lastContactDate).getTime() < 60000;

(async () => {
  // responder o feedback do treino conta como contato; só "resolver" (sem texto) não
  assert.equal((await patch('coach-a', 'h1', {})).status, 200); assert.equal(s1().lastContactDate, undefined, 'marcar como resolvido, sem resposta: não é contato');
  assert.equal((await patch('coach-a', 'h1', { reply: '   ' })).status, 200); assert.equal(s1().lastContactDate, undefined, 'resposta em branco: não é contato');
  assert.equal((await patch('coach-a', 'h1', { reply: 'Boa! Vamos reduzir a carga.' })).status, 200); assert.ok(fresh(s1()), 'responder o feedback do treino = falou com o aluno');
  delete s1().lastContactDate;
  assert.equal((await patch('coach-a', 'h1', { exerciseHistoryId: 'x1' })).status, 200); assert.equal(s1().lastContactDate, undefined, 'observação de exercício só resolvida: não é contato');
  assert.equal((await patch('coach-a', 'h1', { exerciseHistoryId: 'x1', reply: 'Troca por halteres.' })).status, 200); assert.ok(fresh(s1()), 'responder a observação do exercício = falou com o aluno');
  delete s1().lastContactDate;
  assert.equal((await patch('coach-b', 'h1', { reply: 'oi' })).status, 403); assert.equal(s1().lastContactDate, undefined, 'coach de fora não mexe no contato');
  // o registro de contato nunca derruba a resposta (que já foi gravada e enviada)
  const realUpdate = P.user.update; P.user.update = async () => { throw new Error('banco fora'); };
  await registerCoachContact(P, 's1'); P.user.update = realUpdate;
  console.log('OK  responder (feedback do treino, observação de exercício) conta como falar com o aluno; só resolver/visto/em branco/coach de fora não; falha ao registrar não derruba');

  // painel: o mesmo treino finalizado várias vezes no mesmo dia conta UMA vez (duplicatas antigas dos toques repetidos)
  const D = (h: number) => new Date(Date.UTC(2026, 8, 22, h, 0));   // terça 22/09 (semana 21/09 a 27/09)
  const rows: any[] = [
    { id: 'a1', userId: 's1', day: 'A', date: D(15) }, { id: 'a2', userId: 's1', day: 'A', date: D(15) }, { id: 'a3', userId: 's1', day: 'A', date: D(15) },   // A 3 vezes, mesmo dia = 1
    { id: 'b1', userId: 's1', day: 'B', date: D(15) },                                                                                                      // B no mesmo dia = outro treino
    { id: 'a4', userId: 's1', day: 'A', date: new Date(Date.UTC(2026, 8, 24, 15, 0)) },                                                                     // A em outro dia = outro treino
    { id: 'n1', userId: 's1', day: null, date: D(16) }, { id: 'n2', userId: 's1', day: null, date: D(16) },                                                  // registros antigos sem dia: cada um conta
  ];
  const fake: any = {
    user: { findMany: async () => [{ id: 's1', name: 'Bruno', photoUrl: null, coachId: 'coach-a', createdAt: new Date('2026-01-01'), active: true, accountStatus: 'ACTIVE', lastContactDate: null }] },
    weeklyFeedback: { findMany: async () => [] }, workoutHistory: { findMany: async () => rows }, anamnese: { findMany: async () => [] },
    studentAlert: { findMany: async () => [] }, weeklyQuestionSet: { findMany: async () => [] },
  };
  const board: any = await loadWeeklyBoard(fake, { adminId: 'coach-a', weekStart: '2026-09-21', now: new Date(Date.UTC(2026, 8, 29, 12, 0)) });
  assert.equal(board.rows[0].workoutsDone, 5, 'A(1) + B(1) + A em outro dia(1) + 2 sem dia = 5, não 8');
  console.log('OK  painel do feedback: treino repetido no mesmo dia conta uma vez (duplicatas antigas não inflam "treinou X/Y")');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); });
