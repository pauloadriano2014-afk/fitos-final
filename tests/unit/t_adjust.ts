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
  // ───────────── comparação antes/depois ─────────────
  await block('diff: exercício tirado, séries a menos, descanso menor e bi-set aparecem em frases agrupadas', () => {
    const before = [row('e5', 'A', 4, 90), row('e6', 'A', 4, 90), row('e1', 'A', 4, 90), row('e2', 'A', 3, 60)];
    const after = [row('e5', 'A', 3, 60, 'BISET'), row('e6', 'A', 4, 90), row('e2', 'A', 3, 60)];
    const names = { e1: 'Cadeira adutora', e2: 'Leg press', e5: 'Supino reto', e6: 'Crucifixo' };
    const d = D.diffWorkout(before, after, names);
    assert.strictEqual(d.hasChanges, true);
    assert.deepStrictEqual(d.changes.filter((c) => c.type === 'REMOVED').map((c) => c.exercise), ['Cadeira adutora']);
    const sets = d.changes.find((c) => c.type === 'SETS')!; assert.strictEqual(sets.exercise, 'Supino reto'); assert.strictEqual(sets.from, 4); assert.strictEqual(sets.to, 3);
    const rest = d.changes.find((c) => c.type === 'REST')!; assert.strictEqual(rest.from, 90); assert.strictEqual(rest.to, 60);
    const tc = d.changes.find((c) => c.type === 'TECHNIQUE')!; assert.ok(/bi-set/.test(tc.text), tc.text);
    assert.ok(d.lines.some((l) => l === 'Tirei Cadeira adutora.'), JSON.stringify(d.lines));
    assert.ok(d.lines.some((l) => /Menos séries: Supino reto \(4→3\)/.test(l)));
    assert.ok(d.lines.some((l) => /Descanso ajustado: Supino reto \(90s→60s\)/.test(l)));
    assert.ok(d.estimate.length === 1 && d.estimate[0].after < d.estimate[0].before, JSON.stringify(d.estimate));
  });
  await block('diff: sem mudança nenhuma = nada para avisar; ordem diferente não conta', () => {
    const rows = [row('e5', 'A', 3, 60), row('e6', 'A', 3, 60)];
    const d = D.diffWorkout(rows, [rows[1], rows[0]], {});
    assert.strictEqual(d.hasChanges, false); assert.deepStrictEqual(d.lines, []); assert.deepStrictEqual(d.estimate, []);
  });
  await block('diff: o mesmo exercício duas vezes no dia — tirar uma das duas conta como tirado', () => {
    const d = D.diffWorkout([row('e5', 'A', 3, 60), row('e5', 'A', 3, 60)], [row('e5', 'A', 3, 60)], { e5: 'Supino reto' });
    assert.strictEqual(d.changes.length, 1); assert.strictEqual(d.changes[0].type, 'REMOVED');
  });
  await block('diff: dias diferentes não se misturam (A e B) e a letra do dia vem junto', () => {
    const d = D.diffWorkout([row('e5', 'A', 3, 60), row('e5', 'B', 3, 60)], [row('e5', 'A', 3, 60)], { e5: 'Supino reto' });
    assert.strictEqual(d.changes.length, 1); assert.strictEqual(d.changes[0].day, 'B');
  });
  await block('diff: cardio conta séries como minutos', () => {
    const cardio = new Set(['e7']);
    assert.strictEqual(D.estimateMinutes([row('e7', 'A', 20, 0)], 'A', cardio), 20);
    const d = D.diffWorkout([row('e7', 'A', 30, 0)], [row('e7', 'A', 15, 0)], { e7: 'Esteira' }, { cardio });
    assert.ok(/30 → 15 min/.test(d.changes[0].text), d.changes[0].text);
    assert.deepStrictEqual(d.estimate, [{ day: 'A', before: 30, after: 15 }]);
  });
  await block('tempo estimado: séries × (40 s de execução + descanso), em minutos; soma os blocos de uma técnica', () => {
    assert.strictEqual(D.estimateMinutes([row('e5', 'A', 3, 60)], 'A'), 5);   // 3×(40+60) = 300 s
    const d = D.diffWorkout([row('e5', 'A', 3, 60)], [row('e5', 'A', 2, 60)], { e5: 'Supino' });
    assert.deepStrictEqual(d.estimate, [{ day: 'A', before: 5, after: 3 }]);
    const blocks = JSON.stringify({ t: 'DROPSET', b: [{ sets: '2', reps: '10', technique: 'DROPSET', restTime: '60' }, { sets: '2', reps: '8', technique: '', restTime: '30' }], o: '' });
    assert.strictEqual(D.parseRow({ exerciseId: 'x', day: 'A', sets: 2, restTime: 60, technique: blocks }).totalSets, 4);   // 2 + 2 séries nos dois blocos
    assert.strictEqual(D.estimateMinutes([{ exerciseId: 'x', day: 'A', sets: 2, restTime: 60, technique: blocks }], 'A'), Math.round((4 * 40 + 2 * 60 + 2 * 30) / 60));
    assert.strictEqual(D.estimateMinutes([row('e5', 'B', 3, 60)], 'A'), 0);   // outro dia não conta
    assert.strictEqual(D.parseRow({ exerciseId: 'x', day: 'A', sets: 3, restTime: 45, technique: 'BISET' }).technique, 'BISET');   // técnica em texto simples (formato antigo)
  });
  await block('texto sugerido: cumprimenta, lista, mostra o tempo estimado e pede para avisar se faltar', () => {
    const diff = { lines: ['Tirei Cadeira adutora.', 'Menos séries: Supino reto (4→3).'], estimate: [{ day: 'A', before: 62, after: 48 }] };
    const m = D.buildAdjustmentMessage({ studentName: 'Samara Franco', day: 'A', diff });
    assert.strictEqual(m.title, 'Ajustei o seu treino A');
    assert.ok(m.body.startsWith('Oi, Samara! Ajustei o seu treino A'), m.body);
    assert.ok(m.body.includes('• Tirei Cadeira adutora.') && m.body.includes('• Menos séries'));
    assert.ok(m.body.includes('Tempo estimado: de 62 para 48 min.'));
    assert.ok(/não deu tempo/.test(m.body));
    assert.ok(!/não deu tempo/.test(D.buildAdjustmentMessage({ studentName: 'X', day: 'A', diff, followUp: false }).body));
  });
  await block('validação da mensagem: tipo, título e texto obrigatórios; corta o excesso; limita a lista de mudanças', () => {
    assert.strictEqual((M.cleanMessage({ kind: 'X', title: 't', body: 'b' }) as any).ok, false);
    assert.strictEqual((M.cleanMessage({ kind: 'LIVRE', title: '', body: 'b' }) as any).ok, false);
    assert.strictEqual((M.cleanMessage({ kind: 'LIVRE', title: 't', body: '   ' }) as any).ok, false);
    const r: any = M.cleanMessage({ kind: 'AJUSTE_TREINO', title: 'a'.repeat(500), body: 'b'.repeat(5000), changes: Array.from({ length: 60 }, (_, i) => ({ type: 'REMOVED', text: 'x' + i })), followUp: true, workoutId: 'w1', day: 'A' });
    assert.ok(r.ok); assert.strictEqual(r.value.title.length, M.MAX_TITLE); assert.strictEqual(r.value.body.length, M.MAX_BODY); assert.strictEqual(r.value.changes.length, M.MAX_CHANGES); assert.strictEqual(r.value.followUp, true);
    assert.strictEqual((M.cleanMessage({ kind: 'LIVRE', title: 't', body: 'b', followUp: 'sim' }) as any).value.followUp, false);   // só o booleano verdadeiro vale
  });

  // ───────────── mensagens do coach ao aluno ─────────────
  const msg = (as: string | null, o: any = {}) => call(msgPOST, '/api/student-messages', as, post({ studentId: 's1', kind: 'AJUSTE_TREINO', title: 'Ajustei o seu treino A', body: 'Tirei X.', workoutId: 'w1', day: 'A', followUp: true, ...o }));
  await block('mensagem: o coach do aluno envia, fica gravada e o aluno recebe push', async () => {
    const r = await msg(cA); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(S.studentCoachMessage.length, 1);
    const m = S.studentCoachMessage[0]; assert.strictEqual(m.userId, 's1'); assert.strictEqual(m.coachId, 'cA'); assert.strictEqual(m.followUp, true); assert.strictEqual(m.readAt, null);
    assert.strictEqual(pushes().length, 1); assert.strictEqual(pushes()[0].to, 's1'); assert.ok(/ajustou seu treino/.test(pushes()[0].title)); assert.strictEqual(pushes()[0].data.type, 'coach_message');
    assert.strictEqual(r.json.pushed, true);
  });
  await block('mensagem: master pode; outro coach, o próprio aluno e quem não está logado não', async () => {
    assert.strictEqual((await msg(master)).status, 200);
    clearPushes(); S.studentCoachMessage.length = 0;
    assert.strictEqual((await msg(cB)).status, 403);
    assert.strictEqual((await msg(s1)).status, 403);
    assert.strictEqual((await msg(null)).status, 401);
    assert.strictEqual(S.studentCoachMessage.length, 0); assert.strictEqual(pushes().length, 0);
  });
  await block('mensagem: dados inválidos viram 400 e nada é gravado; aluno inexistente 404; push que falha não desfaz a mensagem', async () => {
    assert.strictEqual((await msg(cA, { kind: 'NADA' })).status, 400);
    assert.strictEqual((await msg(cA, { body: '' })).status, 400);
    assert.strictEqual((await msg(cA, { studentId: '' })).status, 400);
    assert.strictEqual((await msg(cA, { studentId: 'nao-existe' })).status, 404);
    assert.strictEqual((await msg(cA, { studentId: 'cB' })).status, 404);   // só aluno recebe
    assert.strictEqual(S.studentCoachMessage.length, 0);
    (globalThis as any).__pushFail = true;
    const r = await msg(cA); (globalThis as any).__pushFail = false;
    assert.strictEqual(r.status, 200); assert.strictEqual(S.studentCoachMessage.length, 1);
  });
  await block('mensagem: aluno sem celular cadastrado recebe a mensagem mesmo assim (pushed=false)', async () => {
    S.user.find((x: any) => x.id === 's3').pushToken = null;
    const r = await msg(cA, { studentId: 's3' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.pushed, false); assert.strictEqual(S.studentCoachMessage.length, 1);
  });
  await block('ler mensagens: o aluno vê só as dele, filtros por tipo/ficha/dia, não lidas e janela de 30 dias; o coach vê as do aluno; outro coach não', async () => {
    await msg(cA); await msg(cA, { kind: 'LIVRE', title: 'Oi', body: 'Bom treino', workoutId: null, day: null });
    S.studentCoachMessage.push({ id: 'old', userId: 's1', coachId: 'cA', kind: 'LIVRE', title: 'velha', body: 'x', createdAt: new Date(Date.now() - 40 * DAY), readAt: null });
    await msg(cA, { studentId: 's2' });   // não é do cA: 403
    const all = await call(msgGET, '/api/student-messages', s1); assert.strictEqual(all.json.messages.length, 2);
    assert.strictEqual((await call(msgGET, '/api/student-messages?kind=AJUSTE_TREINO', s1)).json.messages.length, 1);
    assert.strictEqual((await call(msgGET, '/api/student-messages?workoutId=w1&day=A', s1)).json.messages.length, 1);
    assert.strictEqual((await call(msgGET, '/api/student-messages?workoutId=zzz', s1)).json.messages.length, 0);
    S.studentCoachMessage[0].readAt = new Date();
    assert.strictEqual((await call(msgGET, '/api/student-messages?unread=1', s1)).json.messages.length, 1);
    assert.strictEqual((await call(msgGET, '/api/student-messages?userId=s1', cA)).json.messages.length, 2);
    assert.strictEqual((await call(msgGET, '/api/student-messages?userId=s1', cB)).status, 403);
    assert.strictEqual((await call(msgGET, '/api/student-messages?userId=s1', s2)).status, 403);
    assert.strictEqual((await call(msgGET, '/api/student-messages', null)).status, 401);
  });
  await block('marcar como lida: só o dono; repetir não muda a data', async () => {
    await msg(cA); const id = S.studentCoachMessage[0].id;
    assert.strictEqual((await call(msgPATCH, `/api/student-messages/${id}`, s2, patch({ read: true }), { params: { id } })).status, 403);
    assert.strictEqual((await call(msgPATCH, `/api/student-messages/${id}`, cA, patch({ read: true }), { params: { id } })).status, 403);
    assert.strictEqual((await call(msgPATCH, `/api/student-messages/${id}`, s1, patch({ read: true }), { params: { id } })).status, 200);
    const first = S.studentCoachMessage[0].readAt; assert.ok(first);
    await call(msgPATCH, `/api/student-messages/${id}`, s1, patch({ read: true }), { params: { id } });
    assert.strictEqual(S.studentCoachMessage[0].readAt, first);
    assert.strictEqual((await call(msgPATCH, '/api/student-messages/zzz', s1, patch({}), { params: { id: 'zzz' } })).status, 404);
  });
  await block('sem as tabelas novas: o aluno não vê erro (lista vazia) e o coach recebe aviso claro (503)', async () => {
    S.failOn.studentCoachMessage = { code: 'P2021', message: 'relation does not exist' };
    const g = await call(msgGET, '/api/student-messages', s1); assert.strictEqual(g.status, 200); assert.deepStrictEqual(g.json.messages, []);
    const p = await msg(cA); assert.strictEqual(p.status, 503); assert.ok(p.json.unavailable);
  });

  // ───────────── RESOLVIDO + aba Resolvidas ─────────────
  await block('resolver: a pendência some da central, vai para Resolvidas com a cópia do que o coach viu e a nota', async () => {
    const h = hist({}); const key = `tempo:${h.id}`;
    assert.ok((await tasks()).some((t) => t.key === key));
    const r = await resolve(key, { note: 'ajustei a ficha' }); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(!(await tasks()).some((t) => t.key === key));
    const list = (await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cA)).json;
    assert.strictEqual(list.total, 1); const it = list.items[0];
    assert.strictEqual(it.taskKey, key); assert.strictEqual(it.note, 'ajustei a ficha'); assert.strictEqual(it.person.name, 'Samara Franco'); assert.strictEqual(it.message, null);
    assert.deepStrictEqual(list.types, ['tempo']);
  });
  await block('resolver duas vezes não duplica (atualiza); resolver e adiar antes limpa o adiamento', async () => {
    S.agendaTaskSnooze.push({ id: 'z', coachId: 'cA', taskKey: 'tempo:hx', until: new Date(Date.now() + 30 * DAY) });
    await resolve('tempo:hx', { note: 'a' }); await resolve('tempo:hx', { note: 'b' });
    assert.strictEqual(S.agendaTaskResolved.length, 1); assert.strictEqual(S.agendaTaskResolved[0].note, 'b'); assert.strictEqual(S.agendaTaskSnooze.length, 0);
  });
  await block('resolver com AVISAR O ALUNO: manda a mensagem, liga à resolvida e o aluno recebe o push', async () => {
    const h = hist({}); const key = `tempo:${h.id}`;
    const r = await resolve(key, { notify: { studentId: 's1', kind: 'AJUSTE_TREINO', title: 'Ajustei o seu treino A', body: 'Tirei X.', workoutId: 'w1', day: 'A', followUp: true, changes: [{ type: 'REMOVED', exercise: 'X', text: 'Tirei X' }] } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); assert.strictEqual(r.json.pushed, true);
    assert.strictEqual(S.studentCoachMessage.length, 1); assert.strictEqual(S.studentCoachMessage[0].sourceTaskKey, key);
    assert.strictEqual(S.agendaTaskResolved[0].messageId, S.studentCoachMessage[0].id);
    assert.strictEqual(pushes().filter((p: any) => p.to === 's1').length, 1);
    const it = (await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cA)).json.items[0];
    assert.strictEqual(it.message.kind, 'AJUSTE_TREINO'); assert.strictEqual(it.message.outcome, null);
  });
  await block('resolver: aviso a aluno de OUTRO coach é recusado e a pendência NÃO é resolvida (nada de meio-termo)', async () => {
    const h = hist({}); const key = `tempo:${h.id}`;
    const r = await resolve(key, { notify: { studentId: 's2', kind: 'LIVRE', title: 't', body: 'b' } });
    assert.strictEqual(r.status, 403); assert.strictEqual(S.agendaTaskResolved.length, 0); assert.strictEqual(S.studentCoachMessage.length, 0);
    assert.ok((await tasks()).some((t) => t.key === key));
    assert.strictEqual((await resolve(key, { notify: { studentId: 's1', kind: 'LIVRE', title: 't', body: '' } })).status, 400);
    assert.strictEqual(S.agendaTaskResolved.length, 0);
  });
  await block('resolver: só o próprio coach (ou master); linha "+N" e chave inválida são recusadas; texto longo é cortado', async () => {
    assert.strictEqual((await resolve('tempo:h1', {}, cB, 'cA')).status, 403);
    assert.strictEqual((await resolve('tempo:h1', {}, s1, 's1')).status, 403);
    assert.strictEqual((await resolve('tempo:h1', {}, null)).status, 401);
    assert.strictEqual((await resolve('tempo:mais')).status, 400);
    assert.strictEqual((await resolve('x'.repeat(200))).status, 400);
    assert.strictEqual((await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA' }))).status, 400);
    assert.strictEqual((await resolve('tempo:ok', { note: 'n'.repeat(900) })).status, 200);
    assert.strictEqual(S.agendaTaskResolved[0].note.length, 300);
    assert.strictEqual((await resolve('tempo:m', {}, master, 'cA')).status, 200);
  });
  await block('REABRIR: a pendência volta se a condição continua; reabrir o que não existe não dá erro', async () => {
    const h = hist({}); const key = `tempo:${h.id}`;
    await resolve(key);
    const r = await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: key, action: 'reopen' }));
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.reopened, true);
    assert.ok((await tasks()).some((t) => t.key === key)); assert.strictEqual(S.agendaTaskResolved.length, 0);
    assert.strictEqual((await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: 'nada:1', action: 'reopen' }))).json.reopened, false);
    assert.strictEqual((await call(resPOST, '/api/agenda/hoje/resolvidas', cB, post({ coachId: 'cA', taskKey: key, action: 'reopen' }))).status, 403);
  });
  await block('resolver é por coach: o que o coach A resolve continua pendente para o master e o coach B nem enxerga', async () => {
    const h = hist({}); const key = `tempo:${h.id}`;
    await resolve(key);
    assert.ok(!(await tasks(cA, 'cA')).some((t) => t.key === key));
    const list = (await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cB', cB)).json; assert.strictEqual(list.total, 0);
    assert.strictEqual((await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cB)).status, 403);
  });
  await block('Resolvidas: busca por aluno/nota, filtro por tipo, mais recentes primeiro, limite e as com mais de 1 ano ficam de fora', async () => {
    await resolve('tempo:a', { note: 'cortei o cardio' }); await resolve('aparelho:b', { task: { type: 'aparelho', title: 'Samara não tem: Leg press', person: { kind: 'student', id: 's1', name: 'Samara Franco' } } });
    S.agendaTaskResolved.push({ id: 'old', coachId: 'cA', taskKey: 'tempo:old', type: 'tempo', title: 'velha', resolvedAt: new Date(Date.now() - 400 * DAY) });
    S.agendaTaskResolved.find((r: any) => r.taskKey === 'tempo:a').resolvedAt = new Date(Date.now() - 1000);
    const get = async (q: string) => (await call(resGET, `/api/agenda/hoje/resolvidas?coachId=cA${q}`, cA)).json;
    const all = await get(''); assert.strictEqual(all.total, 2); assert.strictEqual(all.items[0].taskKey, 'aparelho:b');
    assert.deepStrictEqual(all.types, ['aparelho', 'tempo']);
    assert.strictEqual((await get('&q=CORTEI')).total, 1); assert.strictEqual((await get('&q=samara')).total, 2); assert.strictEqual((await get('&q=nada')).total, 0);
    assert.strictEqual((await get('&type=aparelho')).total, 1); assert.strictEqual((await get('&limit=1')).items.length, 1);
    assert.strictEqual((await get('&limit=1')).total, 2);
  });
  await block('resultado do ajuste: o primeiro treino depois do aviso em que o aluno respondeu "deu tempo" vira FUNCIONOU; resposta em branco e outro dia não contam', async () => {
    const h = hist({}); const key = `tempo:${h.id}`;
    await resolve(key, { notify: { studentId: 's1', kind: 'AJUSTE_TREINO', title: 'Ajustei', body: 'b', workoutId: 'w1', day: 'A', followUp: true } });
    const get = async () => (await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cA)).json.items[0].message;
    assert.strictEqual((await get()).outcome, null);
    S.workoutHistory.push({ id: 'p1', userId: 's1', day: 'A', workoutId: 'w1', date: new Date(Date.now() - 5 * DAY), timeOk: true });   // antes do aviso: não conta
    S.workoutHistory.push({ id: 'p2', userId: 's1', day: 'B', workoutId: 'w1', date: new Date(Date.now() + 1000), timeOk: true });     // outro dia: não conta
    S.workoutHistory.push({ id: 'p3', userId: 's1', day: 'A', workoutId: 'w1', date: new Date(Date.now() + 2000), timeOk: null });     // sem resposta: não prova nada
    assert.strictEqual((await get()).outcome, null);
    S.workoutHistory.push({ id: 'p4', userId: 's1', day: 'A', workoutId: 'w1', date: new Date(Date.now() + 3000), timeOk: true });
    const m = await get(); assert.strictEqual(m.outcome, 'WORKED'); assert.ok(m.outcomeAt);
    assert.strictEqual(S.studentCoachMessage[0].outcome, 'WORKED');
    S.workoutHistory.push({ id: 'p5', userId: 's1', day: 'A', workoutId: 'w1', date: new Date(Date.now() + 4000), timeOk: false });
    assert.strictEqual((await get()).outcome, 'WORKED');   // o primeiro resultado vale; um treino ruim depois vira novo aviso, não reescreve o histórico
  });
  await block('resultado do ajuste: faltou de novo = STILL_SHORT', async () => {
    const h = hist({}); await resolve(`tempo:${h.id}`, { notify: { studentId: 's1', kind: 'AJUSTE_TREINO', title: 'Ajustei', body: 'b', day: 'A', followUp: true } });
    S.workoutHistory.push({ id: 'q1', userId: 's1', day: 'A', workoutId: null, date: new Date(Date.now() + 1000), timeOk: false });
    assert.strictEqual((await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cA)).json.items[0].message.outcome, 'STILL_SHORT');
  });
  await block('2º aviso: faltou tempo de novo DEPOIS de um ajuste → título "2º aviso", mostra o que já foi feito; sem ajuste anterior ou de outro dia segue como 1º', async () => {
    const h0 = hist({ date: new Date(Date.now() - 4 * DAY) });
    let t = (await tasks()).find((x) => x.key === `tempo:${h0.id}`)!; assert.ok(/^Sem tempo no treino/.test(t.title)); assert.strictEqual(t.adjustments, undefined);
    await resolve(`tempo:${h0.id}`, { notify: { studentId: 's1', kind: 'AJUSTE_TREINO', title: 'Ajustei', body: 'b', day: 'A', workoutId: 'w1', followUp: true, changes: [{ type: 'REMOVED', exercise: 'Cadeira adutora', text: 'Tirei Cadeira adutora' }] } });
    S.studentCoachMessage[0].createdAt = new Date(Date.now() - 2 * DAY);
    const h1 = hist({ date: new Date(Date.now() - 1 * DAY) });
    t = (await tasks()).find((x) => x.key === `tempo:${h1.id}`)!;
    assert.ok(/^2º aviso de falta de tempo: Samara Franco/.test(t.title), t.title); assert.strictEqual(t.adjustments, 1);
    assert.ok(/já ajustei em \d\d\/\d\d: Tirei Cadeira adutora/.test(t.subtitle), t.subtitle);
    assert.deepStrictEqual(t.lastAdjustLines, ['Tirei Cadeira adutora']); assert.ok(!/técnica|metodologia/i.test(t.subtitle));   // só o aviso: nada de lista de técnicas
    // falta de tempo em OUTRO dia de treino não é "de novo"
    S.workoutHistory.length = 0; const hb = hist({ day: 'B', date: new Date(Date.now() - 1 * DAY) });
    t = (await tasks()).find((x) => x.key === `tempo:${hb.id}`)!; assert.ok(/^Sem tempo no treino/.test(t.title), t.title);
  });
  await block('2º aviso: o ajuste feito DEPOIS da falta de tempo não conta (só os anteriores); o 3º aviso soma', async () => {
    const h0 = hist({ date: new Date(Date.now() - 6 * DAY) });
    S.studentCoachMessage.push({ id: 'm1', userId: 's1', coachId: 'cA', kind: 'AJUSTE_TREINO', title: 't', body: 'b', day: 'A', workoutId: 'w1', createdAt: new Date(Date.now() - 5 * DAY) });
    S.studentCoachMessage.push({ id: 'm2', userId: 's1', coachId: 'cA', kind: 'AJUSTE_TREINO', title: 't', body: 'b', day: 'A', workoutId: 'w1', createdAt: new Date(Date.now() - 3 * DAY) });
    S.studentCoachMessage.push({ id: 'm3', userId: 's1', coachId: 'cA', kind: 'AJUSTE_TREINO', title: 't', body: 'b', day: 'A', workoutId: 'w1', createdAt: new Date(Date.now() + 5000) });
    S.workoutHistory.length = 0; const h2 = hist({ date: new Date(Date.now() - 1 * DAY) });
    const t = (await tasks()).find((x) => x.key === `tempo:${h2.id}`)!; assert.ok(/^3º aviso/.test(t.title), t.title); assert.strictEqual(t.adjustments, 2);
    void h0;
  });
  await block('2º aviso: sem a tabela de mensagens a pendência sai igual a antes (nunca some)', async () => {
    const h = hist({}); S.failOn.studentCoachMessage = { code: 'P2021', message: 'relation does not exist' };
    const t = (await tasks()).find((x) => x.key === `tempo:${h.id}`)!; assert.ok(t && /^Sem tempo no treino/.test(t.title));
  });
  await block('resolver pendência de "outro assunto" (cobrança, observação) também funciona e aparece com o tipo certo', async () => {
    await resolve('cobranca:s1:2026-10-01', { task: { type: 'cobranca', title: 'Cobrança atrasada: Samara', person: { kind: 'student', id: 's1', name: 'Samara' } } });
    await resolve('obs:abc', { task: { type: 'obs', title: '3 observações de exercício sem resposta', person: null } });
    const l = (await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cA)).json;
    assert.deepStrictEqual(l.types, ['cobranca', 'obs']); assert.strictEqual(l.items.find((i: any) => i.type === 'obs').person, null);
  });

  // ───────────── aparelho que o aluno não tem ─────────────
  const report = (as: string | null, o: any = {}) => call(eqPOST, '/api/equipment-report', as, post({ exerciseId: 'e1', workoutId: 'w1', day: 'A', note: 'não tem na academia', ...o }));
  await block('aluno avisa: o aviso é gravado, o coach recebe push e o aluno NÃO recebe sugestão de troca (o coach escolhe)', async () => {
    S.exercise.find((e: any) => e.id === 'e1').defaultSubstitutes = ['e2'];
    S.workoutExercise.push({ id: 'we1', workoutId: 'w1', exerciseId: 'e1', substitutes: ['e3'], substituteId: null });
    const r = await report(s1, { workoutExerciseId: 'we1' }); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const rep = S.equipmentReport[0]; assert.strictEqual(rep.userId, 's1'); assert.strictEqual(rep.coachId, 'cA'); assert.strictEqual(rep.exerciseName, 'Cadeira adutora'); assert.strictEqual(rep.status, 'OPEN'); assert.strictEqual(rep.count, 1);
    assert.strictEqual(pushes().length, 1); assert.strictEqual(pushes()[0].to, 'cA'); assert.ok(/Samara Franco não tem: Cadeira adutora/.test(pushes()[0].title));
    assert.deepStrictEqual(r.json.substitutes, [], 'sem sugestão de troca para o aluno, mesmo com substitutos cadastrados no cartão e no exercício');
  });
  await block('avisar de novo: soma ao mesmo aviso (sem duplicar nem repetir o push); se o coach já tinha tratado, ele volta para a lista com push', async () => {
    await report(s1); clearPushes();
    await report(s1, { note: 'continua sem' }); assert.strictEqual(S.equipmentReport.length, 1); assert.strictEqual(S.equipmentReport[0].count, 2); assert.strictEqual(S.equipmentReport[0].note, 'continua sem'); assert.strictEqual(pushes().length, 0);
    S.equipmentReport[0].status = 'RESOLVED';
    await report(s1); assert.strictEqual(S.equipmentReport[0].status, 'OPEN'); assert.strictEqual(S.equipmentReport[0].count, 3); assert.strictEqual(pushes().length, 1);
    S.equipmentReport[0].status = 'AVAILABLE'; clearPushes();
    await report(s1); assert.strictEqual(S.equipmentReport.length, 2);   // "voltou a ter" e faltou de novo = aviso novo
    assert.strictEqual(pushes().length, 1);
  });
  await block('avisar: exercício inexistente 404; sem exercício 400; aluno não avisa por outro; coach avisa por um aluno dele', async () => {
    assert.strictEqual((await report(s1, { exerciseId: 'zzz' })).status, 404);
    assert.strictEqual((await report(s1, { exerciseId: '' })).status, 400);
    assert.strictEqual((await report(s2, { userId: 's1' })).status, 403);
    assert.strictEqual((await report(null)).status, 401);
    assert.strictEqual((await report(cA, { userId: 's1' })).status, 200);
    assert.strictEqual((await report(cB, { userId: 's1' })).status, 403);
    assert.strictEqual((await report(cA, { userId: 'cB' })).status, 404);
  });
  await block('central HOJE: um cartão por aviso em aberto, com aluno, exercício, dia e quantas vezes; tratados e de outra academia não aparecem', async () => {
    await report(s1); await report(s1); await report(s1, { exerciseId: 'e8', day: 'B' });
    S.equipmentReport.push({ id: 'ro', userId: 's1', coachId: 'cA', exerciseId: 'e4', exerciseName: 'Afundo', status: 'RESOLVED', lastReportedAt: new Date() });
    S.equipmentReport.push({ id: 'rg', userId: 's1', coachId: 'cA', exerciseId: 'e3', exerciseName: 'Agachamento livre', status: 'OTHER_GYM', lastReportedAt: new Date() });
    const ap = (await tasks()).filter((t) => t.type === 'aparelho'); assert.strictEqual(ap.length, 2);
    const t = ap.find((x) => x.exerciseId === 'e1')!;
    assert.strictEqual(t.title, 'Samara não tem: Cadeira adutora'); assert.ok(/Treino A · avisou em \d\d\/\d\d · 2 vezes · “não tem na academia”/.test(t.subtitle), t.subtitle);
    assert.strictEqual(t.severity, 'today'); assert.strictEqual(t.target.id, 's1'); assert.strictEqual(t.reportId, S.equipmentReport[0].id);
  });
  await block('central HOJE: aviso de aluno de outro coach não aparece; avisos antigos ficam como "em breve", não como urgentes', async () => {
    await report(s2, { exerciseId: 'e5' });
    assert.strictEqual((await tasks()).filter((t) => t.type === 'aparelho').length, 0);
    S.equipmentReport.push({ id: 'old', userId: 's1', coachId: 'cA', exerciseId: 'e1', exerciseName: 'Cadeira adutora', status: 'OPEN', lastReportedAt: new Date(Date.now() - 9 * DAY), count: 1, note: null, day: null });
    assert.strictEqual((await tasks()).find((t) => t.type === 'aparelho')!.severity, 'soon');
  });
  await block('RESOLVIDO no aviso de aparelho: o aviso vira tratado (continua valendo como "não tem"), some da central; REABRIR devolve', async () => {
    await report(s1); const id = S.equipmentReport[0].id; const key = `aparelho:${id}`;
    await resolve(key, { resolution: 'Trocado por leg press' });
    assert.strictEqual(S.equipmentReport[0].status, 'RESOLVED'); assert.strictEqual(S.equipmentReport[0].resolution, 'Trocado por leg press');
    assert.ok(!(await tasks()).some((t) => t.key === key));
    assert.deepStrictEqual(await EQ.unavailableExerciseIds('s1'), ['e1']);
    await call(resPOST, '/api/agenda/hoje/resolvidas', cA, post({ coachId: 'cA', taskKey: key, action: 'reopen' }));
    assert.strictEqual(S.equipmentReport[0].status, 'OPEN'); assert.ok((await tasks()).some((t) => t.key === key));
  });
  await block('PATCH do aviso: resolver, voltou a ter (sai dos alertas), reabrir; só o coach do aluno', async () => {
    await report(s1); const id = S.equipmentReport[0].id;
    assert.strictEqual((await call(eqPATCH, `/api/equipment-report/${id}`, s1, patch({ action: 'resolve' }), { params: { id } })).status, 403);
    assert.strictEqual((await call(eqPATCH, `/api/equipment-report/${id}`, cB, patch({ action: 'resolve' }), { params: { id } })).status, 403);
    assert.strictEqual((await call(eqPATCH, `/api/equipment-report/${id}`, cA, patch({ action: 'xx' }), { params: { id } })).status, 400);
    assert.strictEqual((await call(eqPATCH, '/api/equipment-report/nao', cA, patch({ action: 'resolve' }), { params: { id: 'nao' } })).status, 404);
    await call(eqPATCH, `/api/equipment-report/${id}`, cA, patch({ action: 'resolve', resolution: 'ok', replacedWithId: 'e2' }), { params: { id } });
    assert.strictEqual(S.equipmentReport[0].status, 'RESOLVED'); assert.strictEqual(S.equipmentReport[0].replacedWithId, 'e2');
    await call(eqPATCH, `/api/equipment-report/${id}`, cA, patch({ action: 'available' }), { params: { id } });
    assert.strictEqual(S.equipmentReport[0].status, 'AVAILABLE'); assert.deepStrictEqual(await EQ.unavailableExerciseIds('s1'), []);
    await call(eqPATCH, `/api/equipment-report/${id}`, cA, patch({ action: 'reopen' }), { params: { id } });
    assert.strictEqual(S.equipmentReport[0].status, 'OPEN'); assert.strictEqual(S.equipmentReport[0].resolvedAt, null);
  });
  await block('MUDOU DE ACADEMIA: avisos em aberto e tratados viram "outra academia" (nada apagado), param de alertar; avisar de novo cria aviso novo', async () => {
    await report(s1); await report(s1, { exerciseId: 'e8' }); S.equipmentReport[1].status = 'RESOLVED';
    S.equipmentReport.push({ id: 'av', userId: 's1', coachId: 'cA', exerciseId: 'e6', exerciseName: 'Crucifixo', status: 'AVAILABLE' });
    const id0 = S.equipmentReport[0].id; await resolve(`aparelho:${id0}`, {}); S.equipmentReport[0].status = 'OPEN';
    assert.strictEqual((await call(gymPOST, '/api/equipment-report/gym-change', s1, post({ userId: 's1' }))).status, 403);
    assert.strictEqual((await call(gymPOST, '/api/equipment-report/gym-change', cB, post({ userId: 's1' }))).status, 403);
    assert.strictEqual((await call(gymPOST, '/api/equipment-report/gym-change', cA, post({}))).status, 400);
    const r = await call(gymPOST, '/api/equipment-report/gym-change', cA, post({ userId: 's1' })); assert.strictEqual(r.json.moved, 2);
    assert.deepStrictEqual(S.equipmentReport.map((x: any) => x.status), ['OTHER_GYM', 'OTHER_GYM', 'AVAILABLE']); assert.strictEqual(S.equipmentReport.length, 3);
    assert.deepStrictEqual(await EQ.unavailableExerciseIds('s1'), []); assert.strictEqual((await tasks()).filter((t) => t.type === 'aparelho').length, 0);
    assert.strictEqual(S.agendaTaskResolved.length, 0);   // a cópia do "resolvido" de um aviso que mudou de academia não fica solta
    await report(s1); assert.strictEqual(S.equipmentReport.length, 4);
  });
  await block('listar avisos: o aluno vê os ativos (ou todos com status=all), o coach também, outro coach não', async () => {
    await report(s1); S.equipmentReport.push({ id: 'x', userId: 's1', exerciseId: 'e3', exerciseName: 'Agachamento livre', status: 'OTHER_GYM', lastReportedAt: new Date(Date.now() - 1000) });
    assert.strictEqual((await call(eqGET, '/api/equipment-report', s1)).json.reports.length, 1);
    assert.strictEqual((await call(eqGET, '/api/equipment-report?userId=s1&status=all', cA)).json.reports.length, 2);
    assert.strictEqual((await call(eqGET, '/api/equipment-report?userId=s1', cB)).status, 403);
    assert.strictEqual((await call(eqGET, '/api/equipment-report?userId=s1', s2)).status, 403);
    assert.strictEqual((await call(eqGET, '/api/equipment-report?userId=nao', cA)).status, 404);
  });
  await block('ranking de aparelhos que faltam: conta ALUNOS diferentes, em ordem, com nomes e se já tem substituto padrão', async () => {
    S.user.push({ id: 's4', role: 'USER', name: 'Dani Lima', coachId: 'cA', active: true });
    S.exercise.find((e: any) => e.id === 'e1').defaultSubstitutes = ['e2'];
    await report(s1); await report(s1); await report(cA, { userId: 's3' }); await report(cA, { userId: 's4', exerciseId: 'e8' });
    S.equipmentReport.push({ id: 'old', userId: 's1', coachId: 'cA', exerciseId: 'e5', exerciseName: 'Supino reto', status: 'RESOLVED', lastReportedAt: new Date(Date.now() - 300 * DAY) });
    S.equipmentReport.push({ id: 'gym', userId: 's1', coachId: 'cA', exerciseId: 'e6', exerciseName: 'Crucifixo', status: 'OTHER_GYM', lastReportedAt: new Date() });
    const r = (await call(rankGET, '/api/equipment-report/ranking?coachId=cA', cA)).json.items;
    assert.deepStrictEqual(r.map((x: any) => [x.exerciseName, x.students]), [['Cadeira adutora', 2], ['Panturrilha no banco', 1]]);
    assert.deepStrictEqual(r[0].names.sort(), ['Carla', 'Samara']); assert.strictEqual(r[0].hasDefaultSubstitute, true); assert.strictEqual(r[1].hasDefaultSubstitute, false);
    assert.strictEqual((await call(rankGET, '/api/equipment-report/ranking?coachId=cA', cB)).status, 403);
    assert.strictEqual((await call(rankGET, '/api/equipment-report/ranking?coachId=cB', cB)).json.items.length, 0);
  });
  await block('sem a tabela de avisos: central HOJE e listas seguem funcionando; o aluno recebe lista vazia e o aviso responde 503', async () => {
    S.failOn.equipmentReport = { code: 'P2021', message: 'relation does not exist' };
    assert.deepStrictEqual((await call(eqGET, '/api/equipment-report', s1)).json.reports, []);
    assert.strictEqual((await report(s1)).status, 503);
    assert.strictEqual((await call(hojeGET, '/api/agenda/hoje?coachId=cA', cA)).status, 200);
    assert.deepStrictEqual(await EQ.unavailableExerciseIds('s1'), []);
    assert.deepStrictEqual((await call(rankGET, '/api/equipment-report/ranking?coachId=cA', cA)).json.items, []);
  });

  // ───────────── a IA evita o que o aluno não tem ─────────────
  await block('IA: tira os exercícios que o aluno não tem; se esvaziar um grupo (menos de 2 sobrando) o exercício volta; sem avisos nada muda', () => {
    const lib = (id: string, name: string, category: string) => ({ id, name, category, tags: null as any });
    const L = [lib('a', 'A1', 'PEITO'), lib('b', 'A2', 'PEITO'), lib('c', 'A3', 'PEITO'), lib('d', 'P1', 'PERNAS'), lib('e', 'P2', 'PERNAS')];
    assert.deepStrictEqual(EQ.filterUnavailable(L, new Set()), { list: L, avoided: [] });
    const r = EQ.filterUnavailable(L, new Set(['a']));
    assert.deepStrictEqual(r.list.map((x) => x.id).sort(), ['b', 'c', 'd', 'e']); assert.deepStrictEqual(r.avoided, ['A1']);
    const r2 = EQ.filterUnavailable(L, new Set(['d']));   // sobraria só 1 de PERNAS → volta
    assert.deepStrictEqual(r2.list.map((x) => x.id).sort(), ['a', 'b', 'c', 'd', 'e']); assert.deepStrictEqual(r2.avoided, []);
    const r3 = EQ.filterUnavailable([lib('a', 'A1', 'PEITO'), { ...lib('b', 'A2', 'X'), tags: { target: 'PEITO' } }, lib('c', 'A3', 'PEITO')], new Set(['a']));   // o "target" das tags manda sobre a categoria
    assert.deepStrictEqual(r3.avoided, ['A1']);
  });

  // ───────────── salvar a ficha: o que mudou + avisos resolvidos ─────────────
  const put = (as: string | null, workoutId: string, exercises: any[], extra: any = {}) => call(workoutPUT, `/api/workout/${workoutId}`, as, { method: 'PUT', body: JSON.stringify({ name: 'Hipertrofia', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 30 * DAY).toISOString(), exercises, ...extra }) }, { params: { id: workoutId } });
  const seedWorkout = () => {
    S.workout.push({ id: 'w1', userId: 's1', name: 'Hipertrofia', startDate: new Date(), endDate: null, archived: false });
    [['e5', 4, 90], ['e6', 4, 90], ['e1', 4, 90], ['e2', 3, 60]].forEach(([id, sets, rest], i) => S.workoutExercise.push({ id: 'we' + i, workoutId: 'w1', exerciseId: id, day: 'A', sets, reps: '12', restTime: rest, technique: tech(sets as number, rest as number), order: i }));
  };
  const ex = (id: string, sets: number, rest: number, t = '') => ({ exerciseId: id, day: 'A', sets, reps: '12', restTime: rest, technique: tech(sets, rest, t) });
  await block('salvar ficha: a resposta traz o que mudou (frases + tempo) e a ficha é salva do mesmo jeito de antes', async () => {
    seedWorkout();
    const r = await put(cA, 'w1', [ex('e5', 3, 60, 'BISET'), ex('e6', 4, 90), ex('e2', 3, 60)]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); assert.strictEqual(r.json.id, 'w1'); assert.strictEqual(r.json.name, 'Hipertrofia');
    assert.strictEqual(S.workoutExercise.length, 3);
    const a = r.json.adjustment; assert.strictEqual(a.hasChanges, true);
    assert.ok(a.lines.includes('Tirei Cadeira adutora.'), JSON.stringify(a.lines)); assert.ok(a.estimate[0].after < a.estimate[0].before);
    assert.deepStrictEqual(r.json.equipmentResolved, []);
  });
  await block('salvar ficha sem mudar nada: adjustment.hasChanges=false (o app não pergunta se quer avisar o aluno)', async () => {
    seedWorkout();
    const r = await put(cA, 'w1', [ex('e5', 4, 90), ex('e6', 4, 90), ex('e1', 4, 90), ex('e2', 3, 60)]);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.adjustment.hasChanges, false);
  });
  await block('salvar ficha tirando o exercício que o aluno não tinha: o aviso fica TRATADO, vai para Resolvidas e a resposta diz qual (para o coach avisar o aluno)', async () => {
    seedWorkout(); await report(s1, { workoutId: 'w1', exerciseId: 'e1' }); await report(s1, { workoutId: 'w1', exerciseId: 'e5', day: 'A' }); const idE1 = S.equipmentReport[0].id;
    const r = await put(cA, 'w1', [ex('e5', 4, 90), ex('e6', 4, 90), ex('e2', 3, 60)]);
    assert.deepStrictEqual(r.json.equipmentResolved.map((x: any) => x.exerciseName), ['Cadeira adutora']);   // Supino continua na ficha: segue em aberto
    assert.strictEqual(S.equipmentReport[0].status, 'RESOLVED'); assert.strictEqual(S.equipmentReport[0].resolution, 'Exercício trocado na ficha'); assert.strictEqual(S.equipmentReport[1].status, 'OPEN');
    assert.ok(!(await tasks()).some((t) => t.key === `aparelho:${idE1}`)); assert.ok((await tasks()).some((t) => t.type === 'aparelho' && t.exerciseId === 'e5'));
    const l = (await call(resGET, '/api/agenda/hoje/resolvidas?coachId=cA', cA)).json; assert.strictEqual(l.total, 1); assert.strictEqual(l.items[0].taskKey, `aparelho:${idE1}`); assert.strictEqual(l.items[0].note, 'Exercício trocado na ficha');
  });
  await block('salvar ficha: acesso continua como antes (aluno de outro coach 403) e uma falha na comparação nunca derruba o salvar', async () => {
    seedWorkout();
    assert.strictEqual((await put(cB, 'w1', [ex('e5', 3, 60)])).status, 403);
    S.failOn.equipmentReport = { code: 'P2021', message: 'relation does not exist' };
    const r = await put(cA, 'w1', [ex('e5', 3, 60)]); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.equipmentResolved, []); assert.strictEqual(r.json.adjustment.hasChanges, true);
  });

  console.log(`\n${passed} ok, ${fails} falhas`);
  process.exit(fails ? 1 : 0);
})();
