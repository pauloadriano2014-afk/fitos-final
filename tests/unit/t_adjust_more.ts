import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as hojeGET } from '/home/user/fitos-final/app/api/agenda/hoje/route';
import { GET as resGET, POST as resPOST } from '/home/user/fitos-final/app/api/agenda/hoje/resolvidas/route';
import { GET as msgGET, POST as msgPOST } from '/home/user/fitos-final/app/api/student-messages/route';
import { PATCH as msgPATCH } from '/home/user/fitos-final/app/api/student-messages/[id]/route';
import { GET as eqGET, POST as eqPOST } from '/home/user/fitos-final/app/api/equipment-report/route';
import { PATCH as eqPATCH } from '/home/user/fitos-final/app/api/equipment-report/[id]/route';
import { POST as gymPOST } from '/home/user/fitos-final/app/api/equipment-report/gym-change/route';
import { GET as rankGET } from '/home/user/fitos-final/app/api/equipment-report/ranking/route';
import { PUT as workoutPUT } from '/home/user/fitos-final/app/api/workout/[id]/route';
import * as D from '/home/user/fitos-final/lib/workoutDiff';
import * as M from '/home/user/fitos-final/lib/studentMessages';
import * as EQ from '/home/user/fitos-final/lib/equipment';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}, ctx?: any) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers: { ...headers, ...(init.headers || {}) } }), ctx);
  return { status: r.status, json: await r.json().catch(() => null) };
};
const post = (o: any) => ({ method: 'POST', body: JSON.stringify(o) });
const patch = (o: any) => ({ method: 'PATCH', body: JSON.stringify(o) });
const pushes = () => (globalThis as any).__pushes || [];
const clearPushes = () => { (globalThis as any).__pushes = []; };
const DAY = 86400000;
const cA = tok('cA'), cB = tok('cB'), s1 = tok('s1', 'USER'), s2 = tok('s2', 'USER'), master = tok(PAULO_ID, 'ADMIN');

const seed = () => {
  P.__reset(); clearPushes();
  const u = (o: any) => S.user.push({ role: 'USER', active: true, isFinanceActive: true, isTestAccount: false, name: o.id, phone: null, photoUrl: null, coachId: null, nutritionistId: null, ...o });
  u({ id: PAULO_ID, role: 'ADMIN', name: 'Paulo Master', pushToken: 'ExponentPushToken[paulo]' });
  u({ id: 'cA', role: 'COACH', name: 'Coach A', pushToken: 'ExponentPushToken[cA]' });
  u({ id: 'cB', role: 'COACH', name: 'Coach B' });
  u({ id: 's1', name: 'Samara Franco', coachId: 'cA', pushToken: 'ExponentPushToken[s1]' });
  u({ id: 's2', name: 'Bia Costa', coachId: 'cB', pushToken: 'ExponentPushToken[s2]' });
  u({ id: 's3', name: 'Carla Dias', coachId: 'cA' });
  const ex = (id: string, name: string, category: string, extra: any = {}) => S.exercise.push({ id, name, category, subCategory: 'Geral', defaultSubstitutes: [], videoUrl: null, coachId: 'cA', tags: null, ...extra });
  ex('e1', 'Cadeira adutora', 'PERNAS'); ex('e2', 'Leg press', 'PERNAS'); ex('e3', 'Agachamento livre', 'PERNAS'); ex('e4', 'Afundo', 'PERNAS');
  ex('e5', 'Supino reto', 'PEITO'); ex('e6', 'Crucifixo', 'PEITO'); ex('e7', 'Esteira', 'CARDIO'); ex('e8', 'Panturrilha no banco', 'PANTURRILHA');
};
const tech = (sets: number, rest: number, t = '') => JSON.stringify({ t, b: [{ sets: String(sets), reps: '12', technique: t, restTime: String(rest) }], o: '' });
const row = (exerciseId: string, day: string, sets: number, rest: number, t = '') => ({ exerciseId, day, sets, reps: '12', restTime: rest, technique: tech(sets, rest, t) });
const hist = (o: any) => { const r = { id: 'h' + S.nextId++, userId: 's1', day: 'A', workoutId: 'w1', date: new Date(), timeOk: false, timeNote: 'faltou tempo', duration: 50, exerciseStatus: null, ...o }; S.workoutHistory.push(r); return r; };
const tasks = async (as = cA, coach = 'cA') => (await call(hojeGET, `/api/agenda/hoje?coachId=${coach}`, as)).json.tasks as any[];
const resolve = (taskKey: string, extra: any = {}, as = cA, coachId = 'cA') => call(resPOST, '/api/agenda/hoje/resolvidas', as, post({ coachId, taskKey, task: { type: taskKey.split(':')[0], title: 'T ' + taskKey, subtitle: 'sub', person: { kind: 'student', id: 's1', name: 'Samara Franco' } }, ...extra }));

let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => {
  try { seed(); await fn(); passed++; console.log('  ok  ' + name); }
  catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); }
};

(async () => {
  const msg = (as: string | null, o: any = {}) => call(msgPOST, '/api/student-messages', as, post({ studentId: 's1', kind: 'AJUSTE_TREINO', title: 'Ajustei o seu treino A', body: 'Tirei X.', workoutId: 'w1', day: 'A', followUp: true, ...o }));
  const report = (as: string | null, o: any = {}) => call(eqPOST, '/api/equipment-report', as, post({ exerciseId: 'e1', workoutId: 'w1', day: 'A', note: 'não tem na academia', ...o }));

  // ───────────── comparação ─────────────
  await block('diff: tirar só o do dia A não mexe no mesmo exercício do dia B (cada dia tem a sua contagem)', () => {
    const d = D.diffWorkout([row('e5', 'A', 3, 60), row('e5', 'B', 3, 60)], [row('e5', 'B', 3, 60)], { e5: 'Supino' });
    assert.deepStrictEqual(d.changes.map((c) => [c.type, c.day]), [['REMOVED', 'A']]);
  });
  await block('diff: cardio com descanso diferente não vira "descanso ajustado"', () => {
    const cardio = new Set(['e7']);
    const d = D.diffWorkout([row('e7', 'A', 20, 30)], [row('e7', 'A', 20, 60)], { e7: 'Esteira' }, { cardio });
    assert.strictEqual(d.hasChanges, false);
    assert.strictEqual(D.diffWorkout([row('e5', 'A', 3, 30)], [row('e5', 'A', 3, 60)], { e5: 'Supino' }).changes[0].type, 'REST');   // musculação continua valendo
  });
  await block('diff: dia que ficou vazio não mostra "de X para 0 min"; mesmo exercício tirado em dois dias é citado uma vez', () => {
    const d = D.diffWorkout([row('e5', 'A', 3, 60)], [], { e5: 'Supino' }); assert.deepStrictEqual(d.estimate, []); assert.strictEqual(d.changes.length, 1);
    const d2 = D.diffWorkout([row('e5', 'A', 3, 60), row('e5', 'B', 3, 60)], [], { e5: 'Supino' }); assert.deepStrictEqual(d2.lines, ['Tirei Supino.']);
  });
  await block('texto: com vários dias mudados o tempo estimado citado é o do dia da mensagem', () => {
    const diff = { lines: ['Tirei X.'], estimate: [{ day: 'A', before: 60, after: 50 }, { day: 'B', before: 70, after: 40 }] };
    assert.ok(D.buildAdjustmentMessage({ studentName: 'S', day: 'B', diff }).body.includes('de 70 para 40 min'));
    assert.ok(D.buildAdjustmentMessage({ studentName: 'S', day: 'A', diff }).body.includes('de 60 para 50 min'));
    assert.ok(D.buildAdjustmentMessage({ studentName: 'S', day: null, diff }).body.includes('de 60 para 50 min'));
  });
  await block('mensagem: lista de mudanças sem texto vira nenhuma lista (null)', () => {
    const r: any = M.cleanMessage({ kind: 'LIVRE', title: 't', body: 'b', changes: [{ type: 'X', text: '   ' }, { type: 'Y' }] });
    assert.strictEqual(r.value.changes, null);
  });
  await block('mensagens: o filtro de dia separa ajustes do mesmo treino em dias diferentes', async () => {
    await msg(cA); await msg(cA, { day: 'B' });
    assert.strictEqual((await call(msgGET, '/api/student-messages?workoutId=w1&day=A', s1)).json.messages.length, 1);
    assert.strictEqual((await call(msgGET, '/api/student-messages?workoutId=w1&day=B', s1)).json.messages.length, 1);
    assert.strictEqual((await call(msgGET, '/api/student-messages?workoutId=w1', s1)).json.messages.length, 2);
  });

  // ───────────── resultado do ajuste ─────────────
  const resolveWith = async (notify: any) => { const h = hist({}); await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: `tempo:${h.id}`, task: { type: 'tempo', title: 't', person: { kind: 'student', id: 's1', name: 'S' } }, notify })); return h; };
  await block('resultado: treino de OUTRA ficha no mesmo dia não conta; depois de gravado o resultado não muda mesmo se o histórico sumir', async () => {
    await resolveWith({ studentId: 's1', kind: 'AJUSTE_TREINO', title: 'Ajustei', body: 'b', workoutId: 'w1', day: 'A', followUp: true });
    const get = async () => (await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cA)).json.items[0].message;
    S.workoutHistory.push({ id: 'o1', userId: 's1', day: 'A', workoutId: 'w9', date: new Date(Date.now() + 1000), timeOk: true });
    assert.strictEqual((await get()).outcome, null);
    S.workoutHistory.push({ id: 'o2', userId: 's1', day: 'A', workoutId: 'w1', date: new Date(Date.now() + 2000), timeOk: true });
    assert.strictEqual((await get()).outcome, 'WORKED');
    S.workoutHistory.length = 0;   // o histórico foi limpo depois
    assert.strictEqual((await get()).outcome, 'WORKED');
  });
  await block('resultado: só ajuste de treino tem resultado — mensagem livre nunca ganha "funcionou"', async () => {
    await resolveWith({ studentId: 's1', kind: 'LIVRE', title: 'Oi', body: 'b', day: 'A' });
    S.workoutHistory.push({ id: 'o1', userId: 's1', day: 'A', workoutId: 'w1', date: new Date(Date.now() + 1000), timeOk: true });
    const m = (await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cA)).json.items[0].message;
    assert.strictEqual(m.kind, 'LIVRE'); assert.strictEqual(m.outcome, null); assert.strictEqual(S.studentCoachMessage[0].outcome, null);
  });

  // ───────────── resolver / reabrir não mexe em aviso que já mudou de situação ─────────────
  await block('RESOLVIDO/REABRIR num cartão velho não desfaz "voltou a ter" nem "outra academia"', async () => {
    await report(s1); const id = S.equipmentReport[0].id; const key = `aparelho:${id}`;
    S.equipmentReport[0].status = 'AVAILABLE';
    await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: key, task: { type: 'aparelho', title: 't' } }));
    assert.strictEqual(S.equipmentReport[0].status, 'AVAILABLE');
    S.equipmentReport[0].status = 'OTHER_GYM';
    await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: key, action: 'reopen' }));
    assert.strictEqual(S.equipmentReport[0].status, 'OTHER_GYM');
    S.equipmentReport[0].status = 'RESOLVED';
    await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: key, action: 'reopen' }));
    assert.strictEqual(S.equipmentReport[0].status, 'OPEN');
  });
  await block('resolver apaga as resolvidas com mais de 1 ano (e só as do próprio coach)', async () => {
    S.agendaTaskResolved.push({ id: 'old', coachId: 'cA', taskKey: 'tempo:old', type: 'tempo', title: 'velha', resolvedAt: new Date(Date.now() - 400 * DAY) });
    S.agendaTaskResolved.push({ id: 'oldB', coachId: 'cB', taskKey: 'tempo:oldB', type: 'tempo', title: 'velha do B', resolvedAt: new Date(Date.now() - 400 * DAY) });
    await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: 'tempo:novo', task: { type: 'tempo', title: 't' } }));
    assert.deepStrictEqual(S.agendaTaskResolved.map((r: any) => r.taskKey).sort(), ['tempo:novo', 'tempo:oldB']);
  });
  await block('PATCH reabrir tira a cópia de Resolvidas (o aviso volta para a lista de uma vez)', async () => {
    await report(s1); const id = S.equipmentReport[0].id; const key = `aparelho:${id}`;
    await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: key, task: { type: 'aparelho', title: 't' } }));
    assert.strictEqual(S.agendaTaskResolved.length, 1);
    await call(eqPATCH, `/api/equipment-report/${id}`, cA, patch({ action: 'reopen' }), { params: { id } });
    assert.strictEqual(S.agendaTaskResolved.length, 0); assert.ok((await tasks()).some((t) => t.key === key));
  });

  // ───────────── 2º aviso: bordas ─────────────
  await block('2º aviso: ajuste de OUTRA ficha, de mais de 45 dias ou mensagem que não é ajuste não contam', async () => {
    const h = hist({ date: new Date(Date.now() - 1 * DAY) });
    const mk = (o: any) => S.studentCoachMessage.push({ id: 'm' + S.nextId++, userId: 's1', coachId: 'cA', title: 't', body: 'b', day: 'A', workoutId: 'w1', createdAt: new Date(Date.now() - 3 * DAY), kind: 'AJUSTE_TREINO', ...o });
    mk({ workoutId: 'w9' }); mk({ createdAt: new Date(Date.now() - 50 * DAY) }); mk({ kind: 'LIVRE' });
    const t = (await tasks()).find((x) => x.key === `tempo:${h.id}`)!; assert.ok(/^Sem tempo no treino/.test(t.title), t.title);
  });
  await block('2º aviso: urgência — repetido de até 7 dias continua "para hoje"; o primeiro aviso com mais de 3 dias vai para "em breve"', async () => {
    const h = hist({ date: new Date(Date.now() - 5 * DAY) });
    let t = (await tasks()).find((x) => x.key === `tempo:${h.id}`)!; assert.strictEqual(t.severity, 'soon');
    S.studentCoachMessage.push({ id: 'm1', userId: 's1', coachId: 'cA', kind: 'AJUSTE_TREINO', title: 't', body: 'b', day: 'A', workoutId: 'w1', createdAt: new Date(Date.now() - 8 * DAY) });
    t = (await tasks()).find((x) => x.key === `tempo:${h.id}`)!; assert.ok(/^2º aviso/.test(t.title)); assert.strictEqual(t.severity, 'today');
  });
  await block('2º aviso: mostra até 3 mudanças do ajuste anterior', async () => {
    const h = hist({ date: new Date(Date.now() - 1 * DAY) });
    S.studentCoachMessage.push({ id: 'm1', userId: 's1', coachId: 'cA', kind: 'AJUSTE_TREINO', title: 't', body: 'b', day: 'A', workoutId: 'w1', createdAt: new Date(Date.now() - 3 * DAY), changes: [1, 2, 3, 4, 5].map((i) => ({ text: 'Mudança ' + i })) });
    const t = (await tasks()).find((x) => x.key === `tempo:${h.id}`)!; assert.deepStrictEqual(t.lastAdjustLines, ['Mudança 1', 'Mudança 2', 'Mudança 3']);
  });
  await block('central HOJE: com mais de 8 avisos de aparelho viram 8 cartões + uma linha "+N"', async () => {
    for (let i = 0; i < 10; i++) { S.user.push({ id: 'x' + i, role: 'USER', name: 'Aluno ' + i, coachId: 'cA', active: true }); S.equipmentReport.push({ id: 'q' + i, userId: 'x' + i, coachId: 'cA', exerciseId: 'e1', exerciseName: 'Cadeira adutora', status: 'OPEN', lastReportedAt: new Date(Date.now() - i * 1000), count: 1, note: null, day: null }); }
    const list = await tasks(); assert.strictEqual(list.filter((t) => t.type === 'aparelho').length, 8); const more = list.find((t) => t.type === 'aparelho_mais')!; assert.strictEqual(more.count, 2); assert.ok(/\+ 2 avisos de aparelho/.test(more.title));
  });

  // ───────────── substitutos ─────────────

  // ───────────── salvar a ficha: só o que está EM ABERTO é resolvido sozinho ─────────────
  await block('salvar a ficha tirando um exercício cujo aviso já estava tratado/voltou a ter NÃO mexe nesse aviso', async () => {
    S.workout.push({ id: 'w1', userId: 's1', name: 'H', startDate: new Date(), endDate: null, archived: false });
    S.equipmentReport.push({ id: 'r1', userId: 's1', coachId: 'cA', exerciseId: 'e1', exerciseName: 'Cadeira adutora', workoutId: 'w1', day: 'A', status: 'AVAILABLE', resolution: null });
    S.equipmentReport.push({ id: 'r2', userId: 's1', coachId: 'cA', exerciseId: 'e2', exerciseName: 'Leg press', workoutId: 'w1', day: 'A', status: 'RESOLVED', resolution: 'trocado por X' });
    const r = await call(workoutPUT, '/api/workout/w1', cA, { method: 'PUT', body: JSON.stringify({ name: 'H', startDate: new Date().toISOString(), endDate: new Date(Date.now() + DAY).toISOString(), exercises: [{ exerciseId: 'e5', day: 'A', sets: 3, reps: '12', restTime: 60, technique: '' }] }) }, { params: { id: 'w1' } });
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.equipmentResolved, []);
    assert.deepStrictEqual(S.equipmentReport.map((x: any) => [x.status, x.resolution]), [['AVAILABLE', null], ['RESOLVED', 'trocado por X']]); assert.strictEqual(S.agendaTaskResolved.length, 0);
  });

  console.log(`\n${passed} ok, ${fails} falhas`);
  process.exit(fails ? 1 : 0);
})();
