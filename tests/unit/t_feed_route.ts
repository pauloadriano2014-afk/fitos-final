import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as dataGET } from '/home/user/fitos-final/app/api/admin/data/route';
import { uniqueExerciseNotes } from '/home/user/fitos-final/lib/dashboardFeed';
const db = (prisma as any).__db;
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const GET = async (adminId: string) => { const r = await dataGET(new Request('http://x/api/admin/data?adminId=' + adminId, { headers: { authorization: 'Bearer ' + tok(adminId) } })); return { status: r.status, json: await r.json() }; };
const T = (m: number) => new Date(Date.UTC(2026, 9, 1, 12, m)).toISOString();

(async () => {
  // ── peça pura: uma observação por exercício ──
  assert.deepEqual(uniqueExerciseNotes([
    { id: 'd1', exerciseName: 'Supino reto', note: ' dor no ombro ' }, { id: 'd2', exerciseName: 'supino reto', note: 'dor no ombro' },
    { id: 'd3', exerciseName: 'Remada', note: null }, { id: 'd4', exerciseName: 'Agachamento', note: '   ' }, { id: 'd5', exerciseName: 'Leg press', note: 'joelho' },
  ]), [{ id: 'd1', exerciseName: 'Supino reto', note: 'dor no ombro' }, { id: 'd5', exerciseName: 'Leg press', note: 'joelho' }]);
  assert.equal(uniqueExerciseNotes(undefined).length, 0); assert.equal(uniqueExerciseNotes(Array.from({ length: 9 }, (_, i) => ({ id: 'x' + i, exerciseName: 'E' + i, note: 'n' })), 5).length, 5);
  assert.equal(uniqueExerciseNotes([{ id: 'l', exerciseName: 'A', note: 'x'.repeat(900) }])[0].note.length, 300);
  console.log('OK  feed: uma observação por exercício (repetida em cada série), sem vazias, limite e corte de tamanho');

  // ── rota /api/admin/data ──
  db.users.push(
    { id: 'coach-a', role: 'COACH', accountStatus: 'ACTIVE', email: 'a@x.com', name: 'Coach A', coachId: null },
    { id: 'coach-b', role: 'COACH', accountStatus: 'ACTIVE', email: 'b@x.com', name: 'Coach B', coachId: null },
    { id: 's1', role: 'ALUNO', name: 'Bruno', email: 'bruno@x.com', coachId: 'coach-a', nutritionistId: null, active: true, photoUrl: null },
    { id: 's2', role: 'ALUNO', name: 'Outro', email: 'o@x.com', coachId: 'coach-b', nutritionistId: null, active: true, photoUrl: null },
  );
  db.histories.push(
    { id: 'h1', userId: 's1', name: 'Setembro/Outubro', workoutName: 'Ombros', date: T(30), feedback: 'Treino bom, senti bastante ombros', feedbackResolvedAt: null, coachReply: null, rpe: 10,
      details: [
        { id: 'd1', exerciseName: 'Desenvolvimento', setNumber: 1, note: 'ombro estalando' }, { id: 'd2', exerciseName: 'Desenvolvimento', setNumber: 2, note: 'ombro estalando' },
        { id: 'd3', exerciseName: 'Elevação lateral', setNumber: 1, note: null },
      ] },
    { id: 'h0', userId: 's1', name: 'Setembro/Outubro', workoutName: 'Pernas', date: T(10), feedback: null, details: [{ id: 'd9', exerciseName: 'Leg', setNumber: 1, note: null }] },
    { id: 'h2', userId: 's2', name: 'Do outro coach', workoutName: 'Peito', date: T(40), feedback: 'segredo do outro coach', details: [{ id: 'd8', exerciseName: 'Supino', setNumber: 1, note: 'nota do outro' }] },
  );
  db.alerts.push(
    { id: 'a1', userId: 's1', type: 'EXERCISE_NOTE', title: '📝 Observação em "Correr na esteira"', message: 'Não consegui fazer esteira hoje', exerciseName: 'Correr na esteira', workoutId: 'w1', day: 'Seg', workoutExerciseId: 'we1', isRead: false, createdAt: T(45) },
    { id: 'a2', userId: 's1', type: 'EXERCISE_NOTE', title: 'já resolvida', message: 'resolvida', isRead: true, createdAt: T(46) },
    { id: 'a3', userId: 's2', type: 'EXERCISE_NOTE', title: 'de outro coach', message: 'outro', isRead: false, createdAt: T(47) },
    { id: 'a4', userId: 's1', type: 'STAGNATION', title: 'estagnação', message: 'carga parada', isRead: false, createdAt: T(48) },
    { id: 'a5', userId: 's1', type: 'EXERCISE_NOTE', title: 'mais antiga', message: 'antiga', isRead: false, createdAt: T(5) },
  );
  let r = await GET('coach-a'); assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.recentLogs.map((l: any) => l.id), ['h1', 'h0'], 'só os treinos dos alunos deste coach, do mais novo pro mais antigo');
  const h1 = r.json.recentLogs[0]; assert.equal(h1.feedback, 'Treino bom, senti bastante ombros'); assert.equal(h1.user.name, 'Bruno'); assert.ok(!('details' in h1), 'sem as séries (payload leve)');
  assert.deepEqual(h1.exerciseNotes, [{ id: 'd1', exerciseName: 'Desenvolvimento', note: 'ombro estalando' }]);
  assert.deepEqual(r.json.recentLogs[1].exerciseNotes, []); assert.ok(!JSON.stringify(r.json).includes('segredo do outro coach') && !JSON.stringify(r.json).includes('nota do outro'), 'nada do outro coach');
  assert.deepEqual(r.json.recentNotes.map((a: any) => a.id), ['a1', 'a5'], 'só observação de exercício NÃO resolvida, dos alunos do coach (sem estagnação, sem resolvida, sem outro coach)');
  const n = r.json.recentNotes[0]; assert.equal(n.message, 'Não consegui fazer esteira hoje'); assert.equal(n.exerciseName, 'Correr na esteira'); assert.equal(n.workoutExerciseId, 'we1'); assert.equal(n.user.id, 's1'); assert.equal(n.user.name, 'Bruno'); assert.equal(n.user.coachId, 'coach-a'); assert.equal(n.userId, 's1');
  r = await GET('coach-b'); assert.deepEqual(r.json.recentLogs.map((l: any) => l.id), ['h2']); assert.deepEqual(r.json.recentNotes.map((a: any) => a.id), ['a3']);
  console.log('OK  /api/admin/data: logs com feedback + observações por exercício (sem as séries) e observações não resolvidas; cada coach só vê as dos seus alunos');

  // ── se a consulta das observações falhar, o painel continua carregando ──
  db.alertsDown = true; const origErr = console.error; console.error = () => {}; r = await GET('coach-a'); console.error = origErr; db.alertsDown = false;
  assert.equal(r.status, 200); assert.deepEqual(r.json.recentNotes, []); assert.equal(r.json.recentLogs.length, 2);
  console.log('OK  falha ao ler as observações não derruba o painel (volta lista vazia)\n\nTODOS OS TESTES DO FEED (BACKEND) PASSARAM');
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
