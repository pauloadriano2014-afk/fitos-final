import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { POST as finishPOST } from '/home/user/fitos-final/app/api/workout/finish/route';
import { POST as startPOST } from '/home/user/fitos-final/app/api/workout/start/route';
import * as WS from '/home/user/fitos-final/lib/workoutSessions';
import * as WD from '/home/user/fitos-final/lib/workoutDuration';
import { runAgendaCron } from '/home/user/fitos-final/lib/agendaCron';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const H = 3600000;
const reset = () => { P.__reset(); P.__addUser({ id: 'c1', role: 'COACH', pushToken: 'tok' }); P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1', pushToken: 'ExponentPushToken[s1]' }); P.__addUser({ id: 's2', name: 'Bia Lima', coachId: 'c1' }); };
const flush = () => new Promise((r) => setTimeout(r, 25));
const callRoute = async (fn: any, url: string, b: any, as: string | null = 's1', role = 'USER') => { const h: any = { 'content-type': 'application/json' }; if (as) h.authorization = 'Bearer ' + tok(as, role); const r = await fn(new Request('http://x' + url, { method: 'POST', headers: h, body: typeof b === 'string' ? b : JSON.stringify(b) })); return { status: r.status, json: await r.json().catch(() => null) }; };
const start = (b: any, as: string | null = 's1', role = 'USER') => callRoute(startPOST, '/api/workout/start', b, as, role);
const ex = [{ exerciseId: 'e1', name: 'Supino', sets: [{ index: 1, weight: '40', reps: '10' }] }, { exerciseId: 'c1', name: 'Escada ergométrica', sets: [{ index: 1, weight: '10', reps: '200', cardioSeconds: 612, cardioKcal: 187 }] }];
const fin = (o: any = {}) => callRoute(finishPOST, '/api/workout/finish', { userId: 's1', workoutName: 'PEITO', day: 'A', workoutId: 'w1', exercisesData: ex, duration: 52, rpe: 8, feedback: '', ...o });
const pushes = () => (globalThis as any).__pushes as any[];
const sess = (o: any = {}) => { const row = { id: 'ws' + S.nextId++, userId: 's1', clientKey: 'w1:A:' + S.nextId, workoutId: 'w1', day: 'A', workoutName: 'PEITO', startedAt: new Date(), finishedAt: null, remindedAt: null, reminderCount: 0, ...o }; S.sessions.push(row); return row; };
const NOW = new Date('2026-10-07T18:00:00Z');   // 15:00 em Brasília (fora do horário de silêncio)
const NIGHT = new Date('2026-10-08T02:30:00Z'); // 23:30 em Brasília (silêncio)
const sender = () => { const sent: any[] = []; return { sent, fn: async (u: any, t: string, b: string, d: any) => { sent.push({ to: u.id, title: t, body: b, data: d }); } }; };

let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { reset(); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); } };

(async () => {
  await block('texto puro: início aceito só com chave válida; hora do app só dentro da faixa', () => {
    const now = new Date('2026-10-07T18:00:00Z');
    assert.deepStrictEqual(WS.parseSessionInput({ clientKey: 'w1:A:1' }, now), { ok: true, value: { clientKey: 'w1:A:1', workoutId: null, day: null, workoutName: null, startedAt: now } });
    for (const bad of [{}, { clientKey: '' }, { clientKey: 'tem espaço' }, { clientKey: 'a'.repeat(121) }, { clientKey: 5 }, null, undefined]) assert.strictEqual((WS.parseSessionInput(bad as any, now) as any).ok, false, JSON.stringify(bad));
    const v = (o: any) => (WS.parseSessionInput({ clientKey: 'k', ...o }, now) as any).value;
    assert.strictEqual(v({ startedAt: now.getTime() - 3 * H }).startedAt.getTime(), now.getTime() - 3 * H, 'hora real do início');
    assert.strictEqual(v({ startedAt: now.getTime() - 18 * H }).startedAt.getTime(), now.getTime() - 18 * H, '18 h ainda vale');
    assert.strictEqual(v({ startedAt: now.getTime() - 18 * H - 1000 }).startedAt.getTime(), now.getTime(), 'mais antigo que 18 h = agora');
    assert.strictEqual(v({ startedAt: now.getTime() + 60000 }).startedAt.getTime(), now.getTime() + 60000, '1 min à frente (relógio adiantado) vale');
    assert.strictEqual(v({ startedAt: now.getTime() + 120000 }).startedAt.getTime(), now.getTime() + 120000, 'até 2 min à frente vale (limite incluso)');
    assert.strictEqual(v({ startedAt: now.getTime() + 120001 }).startedAt.getTime(), now.getTime(), 'passou de 2 min = agora');
    assert.strictEqual(v({ startedAt: now.getTime() + 3 * 60000 }).startedAt.getTime(), now.getTime(), 'no futuro = agora');
    for (const junk of ['abc', -5, 0, null, NaN]) assert.strictEqual(v({ startedAt: junk }).startedAt.getTime(), now.getTime(), String(junk));
    assert.strictEqual(v({ startedAt: String(now.getTime() - H) }).startedAt.getTime(), now.getTime() - H, 'número em texto vale');
    assert.deepStrictEqual([v({ workoutName: '  PEITO  ' }).workoutName, v({ workoutName: '   ' }).workoutName, v({ workoutName: 'x'.repeat(200) }).workoutName.length, v({ day: ' a ' }).day, v({ workoutId: 'w'.repeat(200) }).workoutId.length], ['PEITO', null, 80, 'A', 80]);
  });
  await block('texto puro: qual lembrete está na hora (1º com 2h30, 2º no dia seguinte, nunca depois de 40 h)', () => {
    const t0 = new Date('2026-10-07T12:00:00Z'); const at = (h: number) => new Date(t0.getTime() + h * H);
    const st = (o: any) => WS.reminderStage({ startedAt: t0, ...o } as any, at(o.__h));
    assert.strictEqual(WS.reminderStage({ startedAt: t0 }, at(2.49)), null); assert.strictEqual(WS.reminderStage({ startedAt: t0 }, at(2.5)), 1); assert.strictEqual(WS.reminderStage({ startedAt: t0 }, at(30)), 1, 'atrasado por silêncio: ainda manda o 1º');
    assert.strictEqual(WS.reminderStage({ startedAt: t0, finishedAt: at(1) }, at(5)), null, 'finalizado nunca');
    assert.strictEqual(WS.reminderStage({ startedAt: t0 }, at(40)), 1); assert.strictEqual(WS.reminderStage({ startedAt: t0 }, at(40.01)), null, 'depois de 40 h desiste');
    const one = (h: number, firstAt: number) => WS.reminderStage({ startedAt: t0, reminderCount: 1, remindedAt: at(firstAt) }, at(h));
    assert.strictEqual(one(19.9, 3), null, '2º só com 20 h de treino aberto'); assert.strictEqual(one(20, 3), 2); assert.strictEqual(one(20, 9), null, 'e 12 h depois do 1º'); assert.strictEqual(one(21, 9), 2);
    assert.strictEqual(WS.reminderStage({ startedAt: t0, reminderCount: 1, remindedAt: null }, at(21)), 2, 'sem data do 1º aviso: vale');
    assert.strictEqual(WS.reminderStage({ startedAt: t0, reminderCount: 2, remindedAt: at(21) }, at(35)), null, 'no máximo 2 avisos');
    assert.strictEqual(WS.reminderStage({ startedAt: t0.toISOString() as any, reminderCount: 0 }, at(3)), 1, 'aceita datas em texto');
    const m1 = WS.unfinishedMessage('Ana Souza', { workoutName: 'PEITO E TRÍCEPS', day: 'A' }, 1), m2 = WS.unfinishedMessage('', { workoutName: null, day: 'B' }, 2);
    assert.deepStrictEqual(m1, { title: 'Você terminou o treino? 💪', body: 'Ana, seu treino "PEITO E TRÍCEPS" ficou aberto. Toque para finalizar e salvar as suas cargas.' });
    assert.deepStrictEqual(m2, { title: 'Seu treino ainda está aberto', body: 'Salve o que você já fez em "Treino B" para o seu coach acompanhar a sua evolução. Leva 1 minuto.' });
    assert.ok(/Seu treino "de hoje" ficou aberto/.test(WS.unfinishedMessage(null, {}, 1).body));
    for (const t of [m1.title, m1.body, m2.title, m2.body]) assert.ok(!/atrasad|preguiç|esquec|falt/i.test(t), 'tom acolhedor, sem cobrança: ' + t);
  });
  await block('texto puro: duração em minutos inteiros de 0 a 1440; cardio em segundos e calorias válidos', () => {
    for (const [i, o] of [[52, 52], ['45,6', 46], ['45.4', 45], [0, 0], [-3, 0], ['abc', 0], [null, 0], [undefined, 0], [99999, 1440], [1440, 1440], [0.4, 0], [Infinity, 0]] as any[]) assert.strictEqual(WD.cleanDuration(i), o, String(i));
    assert.deepStrictEqual(WD.cleanCardio({ cardioSeconds: 612, cardioKcal: 187 }), { cardioSeconds: 612, cardioKcal: 187 });
    assert.deepStrictEqual(WD.cleanCardio({ cardioSeconds: '600', cardioKcal: '190,6' }), { cardioSeconds: 600, cardioKcal: 191 });
    assert.deepStrictEqual(WD.cleanCardio({ cardioSeconds: 0, cardioKcal: -4 }), { cardioSeconds: null, cardioKcal: null });
    assert.deepStrictEqual(WD.cleanCardio({ cardioSeconds: 999999, cardioKcal: 999999 }), { cardioSeconds: 21600, cardioKcal: 5000 }, 'teto: 6 h e 5000 kcal');
    assert.deepStrictEqual(WD.cleanCardio({}), { cardioSeconds: null, cardioKcal: null }); assert.deepStrictEqual(WD.cleanCardio(null), { cardioSeconds: null, cardioKcal: null }); assert.deepStrictEqual(WD.cleanCardio({ cardioSeconds: 'x', cardioKcal: '' }), { cardioSeconds: null, cardioKcal: null });
  });
  await block('rota de início: abre a sessão, é idempotente e só o próprio aluno abre', async () => {
    const t = Date.now() - 20 * 60000;
    const r = await start({ userId: 's1', clientKey: 'w1:A:' + t, workoutId: 'w1', day: 'a', workoutName: ' PEITO ', startedAt: t }); assert.deepStrictEqual([r.status, r.json], [200, { success: true, created: true }]);
    assert.strictEqual(S.sessions.length, 1); const row = S.sessions[0];
    assert.deepStrictEqual([row.userId, row.clientKey, row.workoutId, row.day, row.workoutName, row.startedAt.getTime(), row.finishedAt], ['s1', 'w1:A:' + t, 'w1', 'A', 'PEITO', t, null]);
    const again = await start({ userId: 's1', clientKey: 'w1:A:' + t, startedAt: Date.now() }); assert.deepStrictEqual(again.json, { success: true, created: false }); assert.strictEqual(S.sessions.length, 1); assert.strictEqual(S.sessions[0].startedAt.getTime(), t, 'o relógio não recomeça');
    const both = await Promise.all([start({ userId: 's1', clientKey: 'novo' }), start({ userId: 's1', clientKey: 'novo' })]); assert.deepStrictEqual(both.map((b) => b.json.created).sort(), [false, true], 'dois pedidos juntos: um cria'); assert.strictEqual(S.sessions.length, 2);
    // outro aluno com a mesma chave é outra sessão
    assert.strictEqual((await start({ userId: 's2', clientKey: 'novo' }, 's2')).json.created, true); assert.strictEqual(S.sessions.length, 3);
    // validações e permissões
    assert.strictEqual((await start({ userId: 's1', clientKey: 'x' }, null)).status, 401);
    assert.strictEqual((await start({ userId: 's2', clientKey: 'x' }, 's1')).status, 403, 'não abre sessão de outro aluno');
    assert.strictEqual((await start({ userId: 's1', clientKey: 'x' }, 'c1', 'COACH')).status, 403, 'nem o coach (o lembrete é do próprio aluno)');
    assert.strictEqual((await start({ clientKey: 'x' })).status, 400); assert.strictEqual((await start({ userId: 's1' })).status, 400); assert.strictEqual((await start({ userId: 's1', clientKey: 'tem espaço' })).status, 400);
    assert.strictEqual((await start('{lixo')).status, 400); assert.strictEqual((await start('null')).status, 400); assert.strictEqual((await start('"texto"')).status, 400);
    assert.strictEqual(S.sessions.length, 3, 'nada inválido gravou');
    // tabela ainda não criada: não quebra o app
    S.sessionFail = { code: 'P2021', message: 'The table `public.WorkoutSession` does not exist' };
    const miss = await start({ userId: 's1', clientKey: 'zzz' }); assert.deepStrictEqual([miss.status, miss.json.success], [200, false]); assert.ok(/db push/.test(miss.json.skipped));
    S.sessionFail = { code: 'XX', message: 'boom' }; assert.strictEqual((await start({ userId: 's1', clientKey: 'zzz' })).status, 500);
  });
  await block('finalizar: fecha a sessão pela chave e, por garantia, pela mesma ficha + dia; não mexe nas dos outros', async () => {
    const a = sess({ clientKey: 'w1:A:111' }), b = sess({ clientKey: 'w1:B:222', day: 'B' }), other = sess({ userId: 's2', clientKey: 'w1:A:111' }), mism = sess({ clientKey: 'w1:A:999' }), done = sess({ clientKey: 'old', finishedAt: new Date(1000) });
    const r = await fin({ clientKey: 'w1:A:111' }); await flush(); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(a.finishedAt instanceof Date, 'fechou pela chave'); assert.ok(mism.finishedAt instanceof Date, 'fechou a de mesma ficha + dia com outra chave');
    assert.strictEqual(b.finishedAt, null, 'outro dia fica aberto'); assert.strictEqual(other.finishedAt, null, 'outro aluno fica aberto'); assert.strictEqual(done.finishedAt.getTime(), 1000, 'já fechada não muda');
    const k2 = sess({ clientKey: 'k:only', workoutId: 'w9', day: 'C' }); await fin({ clientKey: 'k:only' }); await flush(); assert.ok(k2.finishedAt instanceof Date, 'só a chave bate (outra ficha e outro dia): fecha mesmo assim');
    // reenvio (duplicado) também garante o fechamento
    const late = sess({ clientKey: 'w1:A:111' + 'x' }); late.clientKey = 'w1:A:111'; S.sessions.splice(S.sessions.indexOf(a), 1);   // sessão reaberta com a mesma chave
    const dup = await fin({ clientKey: 'w1:A:111' }); assert.strictEqual(dup.json.duplicate, true); assert.ok(late.finishedAt instanceof Date, 'o reenvio fecha também');
    // sem sessão (app antigo): finaliza normal; sem workoutId/dia e sem chave: nada a fechar
    reset(); assert.strictEqual((await fin({ clientKey: 'solta' })).status, 200); assert.strictEqual(S.histories.length, 1);
    const open = sess({ workoutId: null, day: null, clientKey: 'k1' }); assert.strictEqual((await fin({ workoutId: undefined, day: undefined, clientKey: undefined })).status, 200); assert.strictEqual(open.finishedAt, null, 'sem ficha + dia nem chave igual: não fecha às cegas');
  });
  await block('finalizar: o treino é gravado mesmo se a tabela de sessões não existir ou falhar', async () => {
    S.sessionFail = { code: 'P2021', message: 'The table `public.WorkoutSession` does not exist' };
    const r = await fin({ clientKey: 'k' }); assert.strictEqual(r.status, 200, JSON.stringify(r.json)); assert.strictEqual(S.histories.length, 1);
    S.sessionFail = { code: 'XX', message: 'boom' }; const r2 = await fin({ clientKey: 'k2' }); assert.strictEqual(r2.status, 200); assert.strictEqual(S.histories.length, 2, 'erro inesperado só vai para o log');
  });
  await block('finalizar: duração limpa, cardio feito gravado e o coach recebe o tempo no aviso', async () => {
    await fin({ clientKey: 'a', duration: '47,6' }); await flush();
    const h = S.histories[0]; assert.strictEqual(h.duration, 48);
    const cardio = h.details.find((d: any) => d.exerciseName === 'Escada ergométrica'), forca = h.details.find((d: any) => d.exerciseName === 'Supino');
    assert.deepStrictEqual([cardio.cardioSeconds, cardio.cardioKcal, cardio.weight, cardio.reps], [612, 187, 10, '200']); assert.deepStrictEqual([forca.cardioSeconds, forca.cardioKcal], [null, null], 'força não tem cardio');
    assert.strictEqual(pushes().length, 1); assert.strictEqual(pushes()[0].body, 'Ana Souza finalizou o treino "A" · 48 min'); assert.strictEqual(pushes()[0].data.type, 'workout_finished');
    // inválidos: duração 0 (sem tempo) não aparece no aviso; cardio inválido vira nulo
    reset(); await fin({ clientKey: 'b', duration: -5, exercisesData: [{ exerciseId: 'c1', name: 'Elíptico', sets: [{ index: 1, weight: '10', reps: '100', cardioSeconds: -1, cardioKcal: 'x' }] }] }); await flush();
    assert.strictEqual(S.histories[0].duration, 0); assert.strictEqual(pushes()[0].body, 'Ana Souza finalizou o treino "A"', 'sem tempo = sem "· 0 min"'); assert.deepStrictEqual([S.histories[0].details[0].cardioSeconds, S.histories[0].details[0].cardioKcal], [null, null]);
    // com comentário o aviso continua sendo o comentário (sem tempo colado na citação)
    reset(); await fin({ clientKey: 'c', feedback: 'Foi pesado', duration: 50 }); await flush(); assert.ok(/Foi pesado/.test(pushes()[0].body) && !/min/.test(pushes()[0].body)); assert.strictEqual(pushes()[0].data.type, 'workout_feedback');
  });
  await block('lembrete: 1º aviso depois de 2h30, uma vez só; fora disso não manda', async () => {
    const mk = (hAgo: number, o: any = {}) => sess({ startedAt: new Date(NOW.getTime() - hAgo * H), ...o });
    const cedo = mk(1), pronto = mk(3, { workoutName: 'PEITO E TRÍCEPS' }), fechado = mk(5, { finishedAt: new Date() }), velho = mk(41), semUser = mk(4, { userId: 'ghost' }), outroAluno = mk(6, { userId: 's2' }), jaAvisado = mk(30, { reminderCount: 2, remindedAt: new Date(NOW.getTime() - 10 * H) });
    const { sent, fn } = sender();
    const r = await WS.runWorkoutReminders({ db: prisma, sendToUser: fn, now: NOW });
    assert.deepStrictEqual(sent.map((x) => [x.to, x.data.workoutName]).sort(), [['s1', 'PEITO E TRÍCEPS'], ['s2', 'PEITO']].sort());
    assert.deepStrictEqual([r.sent, r.quiet], [2, 0]);
    assert.strictEqual(r.checked, 3, 'o cron só olha sessões abertas, com menos de 2 avisos e entre 2h30 e 40 h (não a de 1 h, a fechada, a de 41 h nem a que já recebeu os 2 avisos)'); assert.strictEqual(jaAvisado.reminderCount, 2);
    assert.deepStrictEqual([cedo.reminderCount, pronto.reminderCount, fechado.reminderCount, velho.reminderCount, outroAluno.reminderCount], [0, 1, 0, 0, 1]); assert.strictEqual(pronto.remindedAt.getTime(), NOW.getTime());
    assert.strictEqual(semUser.reminderCount, 1, 'reservou e não tinha para quem mandar');
    const m = sent.find((x) => x.to === 's1'); assert.deepStrictEqual([m.title, m.body, m.data], ['Você terminou o treino? 💪', 'Ana, seu treino "PEITO E TRÍCEPS" ficou aberto. Toque para finalizar e salvar as suas cargas.', { type: 'workout_unfinished', workoutId: 'w1', day: 'A', workoutName: 'PEITO E TRÍCEPS' }]);
    const again = sender(); const r2 = await WS.runWorkoutReminders({ db: prisma, sendToUser: again.fn, now: NOW }); assert.strictEqual(again.sent.length, 0, 'outra execução no mesmo instante não repete'); assert.strictEqual(r2.sent, 0);
    // duas execuções AO MESMO TEMPO: só uma manda
    const fresh = mk(3, { userId: 's1', clientKey: 'novo' }); const s1 = sender(), s2 = sender();
    await Promise.all([WS.runWorkoutReminders({ db: prisma, sendToUser: s1.fn, now: NOW }), WS.runWorkoutReminders({ db: prisma, sendToUser: s2.fn, now: NOW })]);
    assert.strictEqual(s1.sent.length + s2.sent.length, 1, 'reserva no banco antes de enviar'); assert.strictEqual(fresh.reminderCount, 1);
  });
  await block('lembrete: 2º aviso no dia seguinte; nunca de madrugada ou à noite; usuário inativo não recebe', async () => {
    const s = sess({ startedAt: new Date(NOW.getTime() - 21 * H), reminderCount: 1, remindedAt: new Date(NOW.getTime() - 18 * H) });
    const a = sender(); await WS.runWorkoutReminders({ db: prisma, sendToUser: a.fn, now: NOW });
    assert.strictEqual(a.sent.length, 1); assert.strictEqual(a.sent[0].title, 'Seu treino ainda está aberto'); assert.strictEqual(s.reminderCount, 2);
    const b = sender(); await WS.runWorkoutReminders({ db: prisma, sendToUser: b.fn, now: new Date(NOW.getTime() + 20 * H) }); assert.strictEqual(b.sent.length, 0, 'no máximo 2 avisos');
    // 2º aviso muito cedo depois do 1º: espera
    reset(); const early = sess({ startedAt: new Date(NOW.getTime() - 21 * H), reminderCount: 1, remindedAt: new Date(NOW.getTime() - 5 * H) }); const c = sender(); await WS.runWorkoutReminders({ db: prisma, sendToUser: c.fn, now: NOW }); assert.strictEqual(c.sent.length, 0); assert.strictEqual(early.reminderCount, 1);
    // horário de silêncio (23:30 BRT): conta e espera, sem reservar
    reset(); const q = sess({ startedAt: new Date(NIGHT.getTime() - 4 * H) }); const d = sender(); const rq = await WS.runWorkoutReminders({ db: prisma, sendToUser: d.fn, now: NIGHT }); assert.deepStrictEqual([d.sent.length, rq.quiet, q.reminderCount], [0, 1, 0], 'não reservou: sai na manhã seguinte');
    const morning = new Date('2026-10-08T10:00:00Z'); const e = sender(); await WS.runWorkoutReminders({ db: prisma, sendToUser: e.fn, now: morning }); assert.strictEqual(e.sent.length, 1, 'de manhã sai (a sessão tem 12 h)'); assert.strictEqual(q.reminderCount, 1);
    // conta desativada
    reset(); S.users.get('s1').active = false; const f = sess({ startedAt: new Date(NOW.getTime() - 3 * H) }); const g = sender(); await WS.runWorkoutReminders({ db: prisma, sendToUser: g.fn, now: NOW }); assert.strictEqual(g.sent.length, 0);
  });
  await block('lembrete: limpa sessões com mais de 60 dias e aparece no cron "all" e "workouts" (sem atrapalhar a agenda)', async () => {
    const velha = sess({ startedAt: new Date(NOW.getTime() - 60.5 * 24 * H), finishedAt: new Date() }), nova = sess({ startedAt: new Date(NOW.getTime() - 59.5 * 24 * H), finishedAt: new Date() }); const { fn } = sender();
    const r: any = await WS.runWorkoutReminders({ db: prisma, sendToUser: fn, now: NOW }); assert.strictEqual(r.cleaned, 1); assert.deepStrictEqual(S.sessions.map((x: any) => x.id), [nova.id]); assert.ok(velha);
    reset(); sess({ startedAt: new Date(NOW.getTime() - 3 * H) });
    const onlyW = sender(); const res: any = await runAgendaCron('workouts', { db: prisma, sendToUser: onlyW.fn, now: NOW }); assert.deepStrictEqual(Object.keys(res), ['workouts']); assert.strictEqual(res.workouts.sent, 1);
    reset(); sess({ startedAt: new Date(NOW.getTime() - 3 * H) }); S.sessionFail = { code: 'P2021', message: 'table does not exist' };
    const all: any = await runAgendaCron('workouts', { db: prisma, sendToUser: sender().fn, now: NOW }); assert.ok(all.workouts.error, 'tabela ausente vira erro isolado, não derruba');
    // o cron de sempre (sem ?task=) = "all": agenda E lembrete de treino; as tarefas soltas não misturam
    reset(); sess({ startedAt: new Date(NOW.getTime() - 3 * H) });
    const stub: any = { ...P, agendaSeries: { findMany: async () => [] }, agendaEvent: { findMany: async () => [] }, agendaSettings: { findMany: async () => [] } };
    const every = sender(); const resAll: any = await runAgendaCron('all', { db: stub, sendToUser: every.fn, now: NOW });
    assert.deepStrictEqual(Object.keys(resAll), ['reminders', 'summary', 'workouts']); assert.strictEqual(resAll.workouts.sent, 1); assert.strictEqual(every.sent.length, 1);
    assert.deepStrictEqual(Object.keys(await runAgendaCron('reminders', { db: stub, sendToUser: sender().fn, now: NOW })), ['reminders']); assert.deepStrictEqual(Object.keys(await runAgendaCron('summary', { db: stub, sendToUser: sender().fn, now: NOW })), ['summary']);
  });
  console.log(`\n${fails ? 'FALHOU' : 'OK'}: ${passed} blocos ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
