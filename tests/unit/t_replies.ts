import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { GET as repliesGET } from '/home/user/fitos-final/app/api/user/coach-replies/route';
import { GET as alertsGET } from '/home/user/fitos-final/app/api/admin/alerts/route';
import { PATCH as alertPATCH } from '/home/user/fitos-final/app/api/admin/alerts/[id]/route';
import { replyItemsFromHistory, replyItemsFromAlerts } from '/home/user/fitos-final/lib/coachReplies';
const db = (prisma as any).__db;
const tok = (id: string, role = 'ALUNO') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const T = (m: number) => new Date(Date.UTC(2026, 9, 1, 12, 0) + m * 60000).toISOString();
const get = async (as: string, url: string, fn: any) => { const r = await fn(new Request('http://x' + url, { headers: { authorization: 'Bearer ' + tok(as, as.startsWith('coach') ? 'COACH' : 'ALUNO') } })); return { status: r.status, json: await r.json() }; };
const patch = async (as: string, id: string, body: any) => { const r = await alertPATCH(new Request('http://x/api/admin/alerts/' + id, { method: 'PATCH', headers: { authorization: 'Bearer ' + tok(as, 'COACH'), 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: { id } }); return { status: r.status, json: await r.json() }; };

(async () => {
  db.users.push(
    { id: 'coach-a', role: 'COACH', accountStatus: 'ACTIVE', name: 'Coach A', coachId: null },
    { id: 'coach-b', role: 'COACH', accountStatus: 'ACTIVE', name: 'Coach B', coachId: null },
    { id: 's1', role: 'ALUNO', name: 'Bruno', coachId: 'coach-a', pushToken: 'ExponentPushToken[bruno]' },
    { id: 's2', role: 'ALUNO', name: 'Outro', coachId: 'coach-b', pushToken: null },
  );
  db.histories.push(
    { id: 'h1', userId: 's1', name: 'Set/Out', workoutName: 'Ombros', date: T(0), feedback: 'Treino bom, senti bastante ombros', feedbackResolvedAt: T(100), coachReply: 'Vou ajustar o treino para sobrar um tempinho pro cardio então.', coachReplyAt: T(100),
      details: [{ id: 'd1', exerciseName: 'Desenvolvimento', setNumber: 1, note: 'ombro estalando', resolvedAt: T(120), coachReply: 'Reduz a carga em 20% e manda vídeo.', coachReplyAt: T(120) }, { id: 'd2', exerciseName: 'Elevação', setNumber: 1, note: 'ok', resolvedAt: null, coachReply: null }] },
    { id: 'h2', userId: 's1', name: 'Set/Out', workoutName: null, date: T(-1000), feedback: 'cansado', feedbackResolvedAt: T(-900), coachReply: null, coachReplyAt: null, details: [] },
    { id: 'h3', userId: 's1', name: 'Pendente', workoutName: 'Pernas', date: T(-2000), feedback: 'sem resposta ainda', feedbackResolvedAt: null, coachReply: null, coachReplyAt: null, details: [{ id: 'd3', exerciseName: 'Leg', setNumber: 1, note: 'joelho', resolvedAt: null }] },
    { id: 'h9', userId: 's2', name: 'Outro aluno', workoutName: 'Peito', date: T(0), feedback: 'segredo', feedbackResolvedAt: T(10), coachReply: 'resposta privada do outro aluno', coachReplyAt: T(10), details: [] },
  );
  db.alerts.push(
    { id: 'a1', userId: 's1', coachId: 'coach-a', type: 'EXERCISE_NOTE', title: '📝 Observação em "Correr na esteira"', message: 'Não consegui fazer esteira hoje', exerciseName: 'Correr na esteira', workoutId: 'w1', day: 'Seg', workoutExerciseId: 'we1', isRead: false, createdAt: T(50) },
    { id: 'a2', userId: 's1', coachId: 'coach-a', type: 'STAGNATION', title: 'Estagnação', message: 'carga parada', isRead: false, createdAt: T(60) },
  );

  // ── peças puras ──
  const items = replyItemsFromHistory(db.histories.filter((h: any) => h.userId === 's1'));
  assert.deepEqual(items.map((i) => i.id).sort(), ['reply-e-d1', 'reply-w-h1', 'reply-w-h2']);
  const w1 = items.find((i) => i.id === 'reply-w-h1')!; assert.equal(w1.title, '💬 Seu coach respondeu seu feedback do treino "Ombros"'); assert.ok(w1.content.startsWith('Vou ajustar o treino') && w1.content.includes('Você escreveu: "Treino bom, senti bastante ombros"'), w1.content);
  assert.deepEqual(w1.ctaParams, { highlightWorkoutHistoryId: 'h1' }); assert.equal(w1.ctaRoute, 'UserHistory'); assert.equal(w1.date, T(100));
  const e1 = items.find((i) => i.id === 'reply-e-d1')!; assert.equal(e1.title, '💬 Seu coach respondeu sobre "Desenvolvimento"'); assert.ok(e1.content.includes('Reduz a carga') && e1.content.includes('"ombro estalando"')); assert.deepEqual(e1.ctaParams, { highlightWorkoutHistoryId: 'h1', highlightExerciseHistoryId: 'd1' });
  const w2 = items.find((i) => i.id === 'reply-w-h2')!; assert.ok(w2.title.startsWith('✅ Seu coach viu seu feedback do treino "Set/Out"') && w2.content.startsWith('Seu coach leu seu comentário') && w2.content.includes('"cansado"'), w2.title + '|' + w2.content);
  assert.deepEqual(replyItemsFromHistory(null), []); assert.deepEqual(replyItemsFromAlerts(undefined), []);
  console.log('OK  respostas: feedback do treino e observação de exercício (com resposta ou só "visto") viram avisos com o treino certo no toque');

  // ── rota do aluno ──
  let r = await get('s1', '/api/user/coach-replies?userId=s1', repliesGET); assert.equal(r.status, 200);
  assert.deepEqual(r.json.map((i: any) => i.id), ['reply-e-d1', 'reply-w-h1', 'reply-w-h2'], 'mais novo primeiro; só do próprio aluno; sem o que não foi respondido');
  assert.ok(!JSON.stringify(r.json).includes('privada do outro aluno') && !JSON.stringify(r.json).includes('sem resposta ainda'));
  assert.equal((await get('s2', '/api/user/coach-replies?userId=s1', repliesGET)).status, 403, 'aluno não lê as respostas de outro');
  assert.equal((await get('coach-b', '/api/user/coach-replies?userId=s1', repliesGET)).status, 403, 'coach de outro time não lê');
  assert.equal((await get('coach-a', '/api/user/coach-replies?userId=s1', repliesGET)).status, 200);
  assert.deepEqual((await get('s1', '/api/user/coach-replies', repliesGET)).json, []);
  console.log('OK  GET /api/user/coach-replies: só as respostas do próprio aluno (ou do coach dele), ordenadas');

  // ── responder uma observação enviada na hora ──
  const sent: any[] = []; (globalThis as any).fetch = async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body) }); return { json: async () => ({ data: { status: 'ok' } }) }; };
  assert.equal((await patch('coach-b', 'a1', { reply: 'oi' })).status, 403, 'coach de outro time não responde');
  assert.equal((await patch('coach-a', 'a2', { reply: 'oi' })).status, 400, 'estagnação não é respondível');
  assert.equal((await patch('coach-a', 'a1', { reply: '   ' })).status, 200); assert.equal(db.alerts.find((a: any) => a.id === 'a1').isRead, false, 'resposta vazia = comportamento antigo (isRead undefined não muda nada)');
  const bruno = db.users.find((x: any) => x.id === 's1'); assert.equal(bruno.lastContactDate, undefined, 'até aqui (resposta vazia, 403, 400) ninguém "falou" com o aluno');
  r = await patch('coach-a', 'a1', { reply: '  Sem problema, troca por 20 min de bike.  ' }); assert.equal(r.status, 200); assert.equal(r.json.replied, true);
  assert.ok(bruno.lastContactDate && Date.now() - new Date(bruno.lastContactDate).getTime() < 60000, 'responder a observação conta como falar com o aluno');
  assert.equal(db.alerts.find((a: any) => a.id === 'a1').isRead, true, 'a observação original fica resolvida');
  const row = db.alerts.find((a: any) => a.type === 'COACH_REPLY'); assert.ok(row); assert.equal(row.userId, 's1'); assert.equal(row.message, 'Sem problema, troca por 20 min de bike.'); assert.equal(row.title, '💬 Seu coach respondeu sobre "Correr na esteira"'); assert.equal(row.isRead, false); assert.equal(row.coachId, 'coach-a');
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(sent.length, 1); assert.equal(sent[0].body.to, 'ExponentPushToken[bruno]'); assert.equal(sent[0].body.data.type, 'coach_reply'); assert.equal(sent[0].body.title, '💬 Seu coach respondeu sobre "Correr na esteira"'); assert.ok(sent[0].body.body.startsWith('Sem problema'));
  // a resposta aparece no sininho do aluno (sem CTA, não há histórico pra abrir) e NÃO no painel do coach
  r = await get('s1', '/api/user/coach-replies?userId=s1', repliesGET); const live = r.json.find((i: any) => i.id === 'reply-a-' + row.id); assert.ok(live); assert.equal(live.content, 'Sem problema, troca por 20 min de bike.'); assert.equal(live.ctaLabel, null); assert.equal(live.ctaParams, null);
  const panel = await get('coach-a', '/api/admin/alerts?userId=s1', alertsGET); assert.deepEqual(panel.json.map((a: any) => a.id), ['a2'], 'painel do coach: sem a observação resolvida e sem a resposta (COACH_REPLY)');
  // marcar como vista continua igual ao de antes
  assert.equal((await patch('coach-a', 'a2', { isRead: true })).status, 200); assert.equal(db.alerts.find((a: any) => a.id === 'a2').isRead, true); assert.equal(sent.length, 1, 'marcar como visto não avisa o aluno');
  console.log('OK  responder observação na hora: cria a resposta do aluno, resolve a observação, manda push; some do painel do coach; "visto" sem resposta segue igual');

  // ── se a parte das observações falhar, o resto da lista continua ──
  const origErr = console.error; console.error = () => {}; const origFind = db.__noop; (prisma as any).studentAlert.findMany = async () => { throw new Error('tabela indisponível'); };
  r = await get('s1', '/api/user/coach-replies?userId=s1', repliesGET); console.error = origErr; assert.equal(r.status, 200); assert.equal(r.json.length, 3, 'sem as respostas "na hora", mas com as do histórico');
  console.log('OK  falha numa das fontes não derruba o sininho\n\nTODOS OS TESTES DAS RESPOSTAS DO COACH (BACKEND) PASSARAM');
})().catch((e) => { console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
