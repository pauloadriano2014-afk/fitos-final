import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as W from '/home/user/fitos-final/lib/weeklyFeedback';
import { GET as userGET, POST as userPOST } from '/home/user/fitos-final/app/api/user/weekly-feedback/route';
import { GET as boardGET } from '/home/user/fitos-final/app/api/admin/weekly-feedback/route';
import { PATCH as fbPATCH } from '/home/user/fitos-final/app/api/admin/weekly-feedback/[id]/route';
import { POST as nudgePOST } from '/home/user/fitos-final/app/api/admin/weekly-feedback/nudge/route';
import { GET as cronGET, POST as cronPOST } from '/home/user/fitos-final/app/api/cron/weekly-feedback/route';
import { GET as dataGET } from '/home/user/fitos-final/app/api/admin/data/route';
const db = (prisma as any).__db;
const RealDate = Date;
const freeze = (iso: string) => { class FD extends RealDate { constructor(...a: any[]) { if (a.length === 0) super(iso); else super(...(a as [any])); } static now() { return new RealDate(iso).getTime(); } } (globalThis as any).Date = FD; };
const unfreeze = () => { (globalThis as any).Date = RealDate; };
const tok = (id: string, role = 'ALUNO') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const H = (as: string, role = 'ALUNO') => ({ authorization: 'Bearer ' + tok(as, role), 'content-type': 'application/json' });
const call = async (fn: any, url: string, as: string, role = 'ALUNO', body?: any, ctx?: any) => { const r = await fn(new Request('http://x' + url, { method: body ? (ctx ? 'PATCH' : 'POST') : 'GET', headers: H(as, role), ...(body ? { body: JSON.stringify(body) } : {}) }), ctx); return { status: r.status, json: await r.json() }; };
const sent: any[] = []; (globalThis as any).fetch = async (url: string, init: any) => { sent.push(JSON.parse(init.body)); return { json: async () => ({ data: { status: 'ok' } }) }; };
const tick = () => new Promise((r) => setTimeout(r, 15));

(async () => {
  // ═════ A. semana (horário de Brasília) ═════
  assert.equal(W.mondayOf(new RealDate('2026-10-05T12:00:00Z')), '2026-10-05', 'segunda 09h BRT');
  assert.equal(W.mondayOf(new RealDate('2026-10-05T02:59:00Z')), '2026-09-28', 'domingo 23:59 BRT ainda é a semana anterior');
  assert.equal(W.mondayOf(new RealDate('2026-10-05T03:00:00Z')), '2026-10-05', 'segunda 00:00 BRT já é a nova semana');
  assert.equal(W.mondayOf(new RealDate('2026-10-11T23:00:00Z')), '2026-10-05', 'domingo à noite'); assert.equal(W.mondayOf(new RealDate('2026-10-14T15:00:00Z')), '2026-10-12');
  assert.equal(W.evaluatedWeekStart(new RealDate('2026-10-05T12:00:00Z')), '2026-09-28'); assert.equal(W.evaluatedWeekStart(new RealDate('2026-10-11T23:00:00Z')), '2026-09-28', 'o card dura a semana toda');
  assert.equal(W.addDays('2026-12-28', 7), '2027-01-04', 'virada de ano'); assert.equal(W.addDays('2026-03-02', -7), '2026-02-23');
  const wr = W.weekRange('2026-09-28'); assert.equal(wr.start.toISOString(), '2026-09-28T03:00:00.000Z'); assert.equal(wr.end.toISOString(), '2026-10-05T03:00:00.000Z');
  assert.equal(W.isWeekStart('2026-09-28'), true); assert.equal(W.isWeekStart('2026-09-29'), false); assert.equal(W.isWeekStart('lixo'), false); assert.equal(W.isWeekStart(null), false);
  assert.equal(W.weekLabel('2026-09-28'), '28/09 a 04/10');
  // perguntas: as 6 do WhatsApp + extras da anamnese
  const ids = (q: W.Question[]) => q.map((x) => x.id);
  assert.deepEqual(ids(W.buildQuestions({})), ['trained', 'performance', 'difficulty', 'energy', 'protocol', 'effort']);
  assert.deepEqual(ids(W.buildQuestions({ limitations: ['Nenhuma'], sleepQuality: 'Ótimo' })), ['trained', 'performance', 'difficulty', 'energy', 'protocol', 'effort'], 'sem limitação/sono bom: nada extra');
  assert.deepEqual(ids(W.buildQuestions({ limitations: ['Joelho', 'Ombro'], dietModule: true, sleepQuality: 'Péssimo' })), ['trained', 'performance', 'difficulty', 'energy', 'protocol', 'limitation', 'diet', 'effort'], 'no máximo 2 extras (limitação > dieta > sono)');
  assert.ok(W.buildQuestions({ limitations: ['Joelho', 'Ombro'] }).find((q) => q.id === 'limitation')!.label.includes('Joelho, Ombro'));
  assert.deepEqual(ids(W.buildQuestions({ sleepQuality: 'Ruim' })).slice(-2), ['sleep', 'effort']); assert.equal(W.buildQuestions({ dietModule: true }).find((q) => q.id === 'diet')!.max, 10);
  // validação
  const qs = W.buildQuestions({ limitations: ['Joelho'], dietModule: true });
  const good = { trained: 'MOST', performance: 'BETTER', difficulty: 'NO', energy: 'GOOD', limitation: 'NO', diet: '8', effort: 9 };
  let v: any = W.validateAnswers(qs, good); assert.equal(v.ok, true); assert.deepEqual(v.clean, { trained: 'MOST', performance: 'BETTER', difficulty: 'NO', energy: 'GOOD', limitation: 'NO', diet: 8, effort: 9 }, 'texto "8" vira número; protocolo opcional fica de fora');
  assert.equal(W.validateAnswers(qs, { ...good, trained: undefined }).ok, false); assert.equal((W.validateAnswers(qs, { ...good, trained: 'XYZ' }) as any).field, 'trained'); assert.equal((W.validateAnswers(qs, { ...good, effort: 11 }) as any).field, 'effort');
  assert.equal((W.validateAnswers(qs, { ...good, effort: 7.5 }) as any).field, 'effort'); assert.equal((W.validateAnswers(qs, { ...good, effort: -1 }) as any).field, 'effort'); assert.equal((W.validateAnswers(qs, { ...good, diet: '' }) as any).field, 'diet');
  assert.equal((W.validateAnswers(qs, { ...good, difficulty: 'YES' }) as any).field, 'difficulty_text', 'Sim em dificuldade exige contar o que sentiu'); assert.equal((W.validateAnswers(qs, { ...good, difficulty: 'YES', difficulty_text: '   ' }) as any).field, 'difficulty_text');
  v = W.validateAnswers(qs, { ...good, difficulty: 'YES', difficulty_text: '  Ombro estalando no desenvolvimento ', protocol: '  Trocar o supino  ', lixo: 'x', limitation: 'MUCH' }); assert.equal(v.ok, true); assert.equal(v.clean.difficulty_text, 'Ombro estalando no desenvolvimento'); assert.equal(v.clean.protocol, 'Trocar o supino'); assert.ok(!('lixo' in v.clean)); assert.ok(!('limitation_text' in v.clean), 'texto opcional vazio não entra');
  assert.equal(W.validateAnswers(qs, { ...good, difficulty: 'NO', difficulty_text: 'ignorado' }).ok && !('difficulty_text' in (W.validateAnswers(qs, { ...good, difficulty: 'NO', difficulty_text: 'ignorado' }) as any).clean), true, 'texto só vale quando a resposta o pede');
  assert.equal((W.validateAnswers(qs, { ...good, protocol: 'x'.repeat(900) }) as any).clean.protocol.length, 600); assert.equal(W.validateAnswers(qs, null).ok, false); assert.equal(W.validateAnswers(qs, [1, 2]).ok, false);
  // alertas
  assert.deepEqual(W.deriveSummary({ trained: 'ALL', performance: 'BETTER', difficulty: 'NO', energy: 'GREAT', effort: 10 }), { score: 10, flags: [] });
  assert.deepEqual(W.deriveSummary({ trained: 'LITTLE', performance: 'WORSE', difficulty: 'YES', energy: 'BAD', effort: 3, protocol: 'ajustar' }).flags, ['PAIN', 'LOW_ADHERENCE', 'LOW_ENERGY', 'LOW_EFFORT', 'REGRESSED', 'ADJUST']);
  assert.deepEqual(W.deriveSummary({ trained: 'MOST', limitation: 'MUCH', effort: 5 }).flags, ['PAIN']); assert.equal(W.deriveSummary({ effort: 4 }).flags[0], 'LOW_EFFORT'); assert.equal(W.deriveSummary({}).score, null);
  assert.equal(W.needsAttention(['ADJUST', 'REGRESSED']), false); assert.equal(W.needsAttention(['ADJUST', 'PAIN']), true); assert.equal(W.needsAttention(undefined), false);
  const view = W.answersView(qs, { trained: 'MOST', difficulty: 'YES', difficulty_text: 'ombro', effort: 9, diet: 8 }); assert.deepEqual(view.map((x) => [x.id, x.value, x.text]), [['trained', 'Quase tudo', undefined], ['difficulty', 'Sim', 'ombro'], ['diet', '8/10', undefined], ['effort', '9/10', undefined]]);
  // quem é perguntado
  const now = new RealDate('2026-10-05T12:00:00Z');
  assert.equal(W.isDueStudent({ coachId: 'c', createdAt: '2026-08-01' }, now), true); assert.equal(W.isDueStudent({ coachId: 'c', createdAt: '2026-10-02T12:00:00Z' }, now), true, 'entrou durante a semana avaliada');
  assert.equal(W.isDueStudent({ coachId: 'c', createdAt: '2026-10-05T10:00:00Z' }, now), false, 'entrou nesta segunda: ainda não teve semana pra avaliar'); assert.equal(W.isDueStudent({ coachId: null, createdAt: '2026-08-01' }, now), false);
  assert.equal(W.isDueStudent({ coachId: 'c', active: false }, now), false); assert.equal(W.isDueStudent({ coachId: 'c', accountStatus: 'DELETED' }, now), false); assert.equal(W.isDueStudent({ coachId: 'c', role: 'COACH' }, now), false);
  console.log('OK  feedback da semana (lógica): semana segunda-domingo em Brasília, perguntas do WhatsApp + extras da anamnese, validação, alertas, quem é perguntado');

  // ═════ B. rotas do aluno ═════
  freeze('2026-10-05T12:00:00Z');   // segunda 09h em Brasília -> semana avaliada: 28/09 a 04/10
  const T = (iso: string) => iso;
  db.users.push(
    { id: 'coach-a', role: 'COACH', accountStatus: 'ACTIVE', name: 'Coach A', pushToken: 'ExponentPushToken[coachA]', coachId: null },
    { id: 'coach-b', role: 'COACH', accountStatus: 'ACTIVE', name: 'Coach B', pushToken: null, coachId: null },
    { id: 's1', role: 'USER', name: 'Bruno Lopes Mafra', coachId: 'coach-a', createdAt: T('2026-08-01T12:00:00Z'), active: true, accountStatus: 'ACTIVE', dietModule: true, pushToken: 'ExponentPushToken[bruno]', lastContactDate: T('2026-10-02T12:00:00Z'), nextCheckInDate: T('2026-10-20T12:00:00Z'), disableCheckIn: false },
    { id: 's2', role: 'USER', name: 'Juliana Silva', coachId: 'coach-a', createdAt: T('2026-10-02T12:00:00Z'), active: true, accountStatus: 'ACTIVE', dietModule: false, pushToken: 'ExponentPushToken[ju]', lastContactDate: null },
    { id: 's3', role: 'USER', name: 'Novo Aluno', coachId: 'coach-a', createdAt: T('2026-10-05T10:00:00Z'), active: true, accountStatus: 'ACTIVE', pushToken: null },
    { id: 's4', role: 'USER', name: 'Outro Coach', coachId: 'coach-b', createdAt: T('2026-08-01T12:00:00Z'), active: true, accountStatus: 'ACTIVE', pushToken: null },
    { id: 's5', role: 'USER', name: 'Inativo', coachId: 'coach-a', createdAt: T('2026-08-01T12:00:00Z'), active: false, accountStatus: 'ACTIVE', pushToken: null },
  );
  db.anamneses.push({ userId: 's1', limitacoes: ['Joelho'], sleepQuality: 'Ruim', frequencia: 5, createdAt: T('2026-08-02T12:00:00Z') }, { userId: 's2', limitacoes: ['Nenhuma'], sleepQuality: 'Bom', frequencia: 3, createdAt: T('2026-10-02T12:00:00Z') });
  db.histories.push(
    { id: 'h1', userId: 's1', name: 'x', date: T('2026-09-29T12:00:00Z'), details: [] }, { id: 'h2', userId: 's1', name: 'x', date: T('2026-10-01T12:00:00Z'), details: [] }, { id: 'h3', userId: 's1', name: 'x', date: T('2026-10-04T12:00:00Z'), details: [] },
    { id: 'h4', userId: 's1', name: 'x', date: T('2026-10-05T10:00:00Z'), details: [] }, { id: 'h5', userId: 's1', name: 'x', date: T('2026-09-27T12:00:00Z'), details: [] }, { id: 'h6', userId: 's2', name: 'x', date: T('2026-10-03T12:00:00Z'), details: [] },
  );
  db.alerts.push({ id: 'n1', userId: 's1', type: 'EXERCISE_NOTE', isRead: false, createdAt: T('2026-10-01T10:00:00Z'), title: 'x', message: 'x' }, { id: 'n2', userId: 's1', type: 'EXERCISE_NOTE', isRead: true, createdAt: T('2026-10-01T10:00:00Z'), title: 'x', message: 'x' });
  db.checkins.push({ userId: 's1', date: T('2026-09-20T12:00:00Z') });
  let r = await call(userGET, '/api/user/weekly-feedback?userId=s1', 's1'); assert.equal(r.status, 200);
  assert.equal(r.json.available, true); assert.equal(r.json.due, true); assert.equal(r.json.answered, false); assert.equal(r.json.weekStart, '2026-09-28'); assert.equal(r.json.weekLabel, '28/09 a 04/10');
  assert.deepEqual(r.json.questions.map((q: any) => q.id), ['trained', 'performance', 'difficulty', 'energy', 'protocol', 'limitation', 'diet', 'diet_issue', 'sleep', 'effort'], 'extras do Bruno: limitação (joelho), dieta (módulo ligado) + o que atrapalhou, sono ruim');
  r = await call(userGET, '/api/user/weekly-feedback?userId=s2', 's2'); assert.deepEqual(r.json.questions.map((q: any) => q.id), ['trained', 'performance', 'difficulty', 'energy', 'protocol', 'effort'], 'Juliana: só as de sempre');
  r = await call(userGET, '/api/user/weekly-feedback?userId=s3', 's3'); assert.equal(r.json.due, false); assert.ok(!r.json.questions, 'aluno novo (entrou nesta segunda) não é perguntado');
  assert.equal((await call(userGET, '/api/user/weekly-feedback?userId=s1', 's2')).status, 403, 'aluno não vê o de outro'); assert.equal((await call(userGET, '/api/user/weekly-feedback?userId=s1', 'coach-b', 'COACH')).status, 403);
  assert.equal((await call(userGET, '/api/user/weekly-feedback?userId=s1', 'coach-a', 'COACH')).status, 200); assert.deepEqual((await call(userGET, '/api/user/weekly-feedback', 's1')).json, { available: false });
  // enviar
  const answers = { trained: 'PART', performance: 'SAME', difficulty: 'YES', difficulty_text: 'Ombro estalando no desenvolvimento', energy: 'OK', protocol: 'Queria trocar o supino', limitation: 'LITTLE', diet: 7, diet_issue: 'NONE', sleep: 'SAME', effort: 8 };
  assert.equal((await call(userPOST, '/api/user/weekly-feedback', 's1', 'ALUNO', { userId: 's1', weekStart: '2026-10-05', answers })).status, 400, 'semana errada (a corrente não é avaliada)');
  assert.equal((await call(userPOST, '/api/user/weekly-feedback', 's1', 'ALUNO', { userId: 's1', weekStart: '2026-09-21', answers })).status, 400, 'semana já fechada');
  r = await call(userPOST, '/api/user/weekly-feedback', 's1', 'ALUNO', { userId: 's1', weekStart: '2026-09-28', answers: { ...answers, trained: undefined } }); assert.equal(r.status, 400); assert.equal(r.json.field, 'trained');
  assert.equal((await call(userPOST, '/api/user/weekly-feedback', 's3', 'ALUNO', { userId: 's3', weekStart: '2026-09-28', answers })).status, 400, 'não-elegível');
  assert.equal((await call(userPOST, '/api/user/weekly-feedback', 's2', 'ALUNO', { userId: 's1', weekStart: '2026-09-28', answers })).status, 403, 'não responde por outro');
  sent.length = 0; r = await call(userPOST, '/api/user/weekly-feedback', 's1', 'ALUNO', { userId: 's1', weekStart: '2026-09-28', answers }); assert.equal(r.status, 200, JSON.stringify(r.json)); await tick();
  assert.equal(db.weekly.length, 1); const row = db.weekly[0]; assert.equal(row.userId, 's1'); assert.equal(row.coachId, 'coach-a'); assert.equal(row.weekStart, '2026-09-28'); assert.equal(row.score, 8); assert.deepEqual(row.flags, ['PAIN', 'LOW_ADHERENCE', 'ADJUST']); assert.equal(row.answers.difficulty_text, 'Ombro estalando no desenvolvimento'); assert.equal(row.questions.length, 10); assert.equal(row.facts.training.done, 3, 'os fatos da semana ficam guardados junto da resposta');
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'ExponentPushToken[coachA]'); assert.equal(sent[0].title, 'Bruno Lopes respondeu o feedback da semana'); assert.equal(sent[0].body, 'Dedicação 8/10 · ⚠ dor / desconforto, treinou pouco'); assert.deepEqual(sent[0].data, { type: 'weekly_feedback', studentId: 's1', feedbackId: row.id });
  r = await call(userGET, '/api/user/weekly-feedback?userId=s1', 's1'); assert.equal(r.json.answered, true); assert.equal(r.json.due, false); assert.ok(!r.json.questions);
  // refazer enquanto o coach não viu: atualiza, sem novo push; depois que o coach viu: 409
  sent.length = 0; r = await call(userPOST, '/api/user/weekly-feedback', 's1', 'ALUNO', { userId: 's1', weekStart: '2026-09-28', answers: { ...answers, difficulty: 'NO', trained: 'ALL', effort: 9 } }); assert.equal(r.status, 200); await tick();
  assert.equal(db.weekly.length, 1, 'continua uma resposta só'); assert.equal(db.weekly[0].score, 9); assert.deepEqual(db.weekly[0].flags, ['ADJUST']); assert.equal(sent.length, 0, 'refazer não avisa o coach de novo');
  db.weekly[0].coachSeenAt = T('2026-10-05T13:00:00Z'); assert.equal((await call(userPOST, '/api/user/weekly-feedback', 's1', 'ALUNO', { userId: 's1', weekStart: '2026-09-28', answers })).status, 409); db.weekly[0].coachSeenAt = null;
  // duas respostas ao mesmo tempo (corrida): a segunda vira atualização
  db.nextCreateP2002 = true; r = await call(userPOST, '/api/user/weekly-feedback', 's2', 'ALUNO', { userId: 's2', weekStart: '2026-09-28', answers: { trained: 'ALL', performance: 'BETTER', difficulty: 'NO', energy: 'GREAT', effort: 10 } }); assert.equal(r.status, 200); assert.equal(db.weekly.filter((w: any) => w.userId === 's2').length, 1); assert.equal(db.weekly.find((w: any) => w.userId === 's2').score, 10);
  db.weekly.splice(db.weekly.findIndex((w: any) => w.userId === 's2'), 1);
  // banco sem a tabela (deploy antes do db push): o card some, o envio avisa
  db.weeklyDown = true; assert.deepEqual((await call(userGET, '/api/user/weekly-feedback?userId=s2', 's2')).json, { available: false }); assert.equal((await call(userPOST, '/api/user/weekly-feedback', 's2', 'ALUNO', { userId: 's2', weekStart: '2026-09-28', answers })).status, 503); db.weeklyDown = false;
  console.log('OK  rotas do aluno: card só para quem deve, extras da anamnese, validação, alerta e push ao coach, refazer até o coach ver, corrida, banco sem a tabela');

  // ═════ C. painel do coach ═════
  db.weekly[0].answers = answers; db.weekly[0].flags = ['PAIN', 'LOW_ADHERENCE', 'ADJUST']; db.weekly[0].score = 8;   // volta ao envio original do Bruno
  let b = await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a', 'coach-a', 'COACH'); assert.equal(b.status, 200, JSON.stringify(b.json));
  assert.equal(b.json.available, true); assert.equal(b.json.weekStart, '2026-09-28'); assert.equal(b.json.weekLabel, '28/09 a 04/10'); assert.equal(b.json.prevWeek, '2026-09-21'); assert.equal(b.json.nextWeek, null);
  assert.deepEqual(b.json.rows.map((x: any) => x.studentId), ['s1', 's2'], 'só alunos elegíveis deste coach (sem o novo, sem o inativo, sem o de outro coach); respondeu-com-alerta primeiro');
  const [r1, r2] = b.json.rows; assert.equal(r1.answered, true); assert.equal(r1.attention, true); assert.equal(r1.awaitingReply, true); assert.equal(r1.score, 8); assert.deepEqual(r1.flags, ['PAIN', 'LOW_ADHERENCE', 'ADJUST']);
  assert.equal(r1.workoutsDone, 3, 'treinos da semana avaliada (fora do intervalo não conta)'); assert.equal(r1.plannedPerWeek, 5); assert.equal(r1.openNotes, 1); assert.equal(r1.daysSinceContact, 3);
  assert.deepEqual(r1.view.map((x: any) => x.id), ['trained', 'performance', 'difficulty', 'energy', 'protocol', 'limitation', 'diet', 'diet_issue', 'sleep', 'effort']); assert.equal(r1.view.find((x: any) => x.id === 'difficulty').text, 'Ombro estalando no desenvolvimento'); assert.equal(r1.view.find((x: any) => x.id === 'trained').value, 'Cumpri parte');
  assert.equal(r2.answered, false); assert.equal(r2.workoutsDone, 1); assert.equal(r2.plannedPerWeek, null, 'Juliana entrou na sexta: semana parcial, não compara com a frequência'); assert.equal(r2.daysSinceContact, null); assert.equal(r2.nudgedAt, null);
  assert.deepEqual(b.json.totals, { students: 2, answered: 1, pending: 1, attention: 1, awaitingReply: 1, nudged: 0, contacted7d: 1 }); assert.deepEqual(b.json.coach, { repliedPct: 0, nudgedPct: 0, contactedPct: 50 });
  assert.ok(!JSON.stringify(b.json).includes('Outro Coach') && !JSON.stringify(b.json).includes('Novo Aluno') && !JSON.stringify(b.json).includes('Inativo'));
  const bb = await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-b', 'coach-b', 'COACH'); assert.deepEqual(bb.json.rows.map((x: any) => x.studentId), ['s4']); assert.equal(bb.json.totals.pending, 1);
  assert.equal((await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a', 'coach-b', 'COACH')).status, 403, 'outro coach não abre o painel'); assert.equal((await call(boardGET, '/api/admin/weekly-feedback?adminId=s1', 's1')).status, 403, 'aluno não abre o painel');
  assert.equal((await call(boardGET, '/api/admin/weekly-feedback', 'coach-a', 'COACH')).status, 400);
  let old = await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a&weekStart=2026-09-21', 'coach-a', 'COACH'); assert.equal(old.json.weekStart, '2026-09-21'); assert.equal(old.json.nextWeek, '2026-09-28'); assert.deepEqual(old.json.rows.map((x: any) => x.studentId), ['s1'], 'na semana anterior só quem já existia (Juliana entrou depois)'); assert.equal(old.json.rows[0].answered, false);
  assert.equal((await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a&weekStart=2026-09-29', 'coach-a', 'COACH')).json.weekStart, '2026-09-28', 'data que não é segunda volta pra semana atual'); assert.equal((await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a&weekStart=2026-10-12', 'coach-a', 'COACH')).json.weekStart, '2026-09-28', 'semana futura também');
  db.weeklyDown = true; assert.equal((await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a', 'coach-a', 'COACH')).json.available, false); db.weeklyDown = false;
  console.log('OK  painel do coach: elegíveis do próprio coach, alerta primeiro, treinos feitos x planejados, observações abertas, contato, totais e auto-avaliação; semanas anteriores; sem a tabela avisa');

  // ═════ D. ver, responder e cobrar ═════
  const ctx = (id: string) => ({ params: { id } }); const fid = db.weekly[0].id;
  assert.equal((await call(fbPATCH, '/x', 's1', 'ALUNO', { seen: true }, ctx(fid))).status, 403, 'o próprio aluno não responde o dele'); assert.equal((await call(fbPATCH, '/x', 'coach-b', 'COACH', { seen: true }, ctx(fid))).status, 403);
  assert.equal((await call(fbPATCH, '/x', 'coach-a', 'COACH', {}, ctx(fid))).status, 400); assert.equal((await call(fbPATCH, '/x', 'coach-a', 'COACH', { seen: true }, ctx('nao-existe'))).status, 404);
  const s1row = db.users.find((x: any) => x.id === 's1'); const contactBefore = s1row.lastContactDate;
  assert.equal((await call(fbPATCH, '/x', 'coach-a', 'COACH', { seen: true }, ctx(fid))).status, 200); assert.ok(db.weekly[0].coachSeenAt); assert.equal(db.weekly[0].coachReply, null);
  assert.equal(s1row.lastContactDate, contactBefore, 'só marcar como visto NÃO conta como falar com o aluno');
  b = await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a', 'coach-a', 'COACH'); assert.equal(b.json.rows.find((x: any) => x.studentId === 's1').awaitingReply, false); assert.equal(b.json.totals.awaitingReply, 0); assert.equal(b.json.coach.repliedPct, 100);
  sent.length = 0; r = await call(fbPATCH, '/x', 'coach-a', 'COACH', { reply: '  Vamos trocar o supino e reduzir a carga do desenvolvimento.  ' }, ctx(fid)); assert.equal(r.status, 200); await tick();
  assert.equal(db.weekly[0].coachReply, 'Vamos trocar o supino e reduzir a carga do desenvolvimento.'); assert.ok(db.weekly[0].coachReplyAt);
  assert.ok(s1row.lastContactDate && Date.now() - new Date(s1row.lastContactDate).getTime() < 60000, 'RESPONDER o feedback conta como falar com o aluno (último contato = agora)');
  b = await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a', 'coach-a', 'COACH'); assert.equal(b.json.rows.find((x: any) => x.studentId === 's1').daysSinceContact, 0, 'o painel mostra "contato hoje"');
  const replyRow = db.alerts.find((a: any) => a.type === 'COACH_REPLY' && a.userId === 's1'); assert.ok(replyRow); assert.equal(replyRow.message, 'Vamos trocar o supino e reduzir a carga do desenvolvimento.'); assert.ok(replyRow.title.includes('feedback da semana') && replyRow.title.includes('28/09 a 04/10'));
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'ExponentPushToken[bruno]'); assert.equal(sent[0].data.type, 'coach_reply');
  console.log('OK  coach vê/responde o feedback: marca visto, resposta vira aviso no sino do aluno + push; só o coach do aluno');

  sent.length = 0;
  assert.equal((await call(nudgePOST, '/x', 'coach-a', 'COACH', { studentId: 's1' })).status, 409, 'já respondeu'); assert.equal((await call(nudgePOST, '/x', 'coach-a', 'COACH', { studentId: 's3' })).status, 400, 'não-elegível'); assert.equal((await call(nudgePOST, '/x', 'coach-a', 'COACH', {})).status, 400);
  assert.equal((await call(nudgePOST, '/x', 'coach-b', 'COACH', { studentId: 's2' })).status, 403); assert.equal((await call(nudgePOST, '/x', 's2', 'ALUNO', { studentId: 's2' })).status, 403, 'aluno não se cobra');
  r = await call(nudgePOST, '/x', 'coach-a', 'COACH', { studentId: 's2' }); assert.equal(r.status, 200); await tick();
  const nudgeRow = db.alerts.find((a: any) => a.type === 'WEEKLY_NUDGE'); assert.ok(nudgeRow && nudgeRow.userId === 's2' && nudgeRow.isRead === true, 'registro da cobrança (já lido: não vira pendência no painel)'); assert.equal(sent.length, 1); assert.equal(sent[0].data.type, 'weekly_feedback_due'); assert.equal(sent[0].title, 'Seu coach está esperando seu feedback');
  assert.equal((await call(nudgePOST, '/x', 'coach-a', 'COACH', { studentId: 's2' })).status, 429, 'uma cobrança a cada 12 h');
  b = await call(boardGET, '/api/admin/weekly-feedback?adminId=coach-a', 'coach-a', 'COACH'); assert.ok(b.json.rows.find((x: any) => x.studentId === 's2').nudgedAt); assert.equal(b.json.totals.nudged, 1); assert.equal(b.json.coach.nudgedPct, 100);
  freeze('2026-10-06T01:00:00Z'); assert.equal((await call(nudgePOST, '/x', 'coach-a', 'COACH', { studentId: 's2' })).status, 200, 'passadas 12 h pode cobrar de novo'); freeze('2026-10-05T12:00:00Z');
  console.log('OK  cobrar: só quem não respondeu e é elegível, push "seu coach está esperando", registro, limite de 12 h, aparece no painel');

  // ═════ E. cron ═════
  const cronCall = async (fn: any, task: string, secret?: string) => { const r = await fn(new Request('http://x/api/cron/weekly-feedback?task=' + task, { method: 'POST', headers: secret ? { authorization: 'Bearer ' + secret } : {} })); return { status: r.status, json: await r.json() }; };
  delete process.env.CRON_SECRET; assert.equal((await cronCall(cronPOST, 'students', 'x')).status, 503, 'sem CRON_SECRET a rota fica desligada'); process.env.CRON_SECRET = 's3cret';
  assert.equal((await cronCall(cronPOST, 'students')).status, 401); assert.equal((await cronCall(cronPOST, 'students', 'errado!')).status, 401); assert.equal((await cronCall(cronPOST, 'lixo', 's3cret')).status, 400);
  db.weekly.splice(0, db.weekly.length); db.weekly.push({ id: 'wf-x', userId: 's1', coachId: 'coach-a', weekStart: '2026-09-28', createdAt: '2026-10-05T12:00:00.000Z', coachSeenAt: null, flags: ['PAIN'], score: 5, answers: { effort: 5 }, questions: [] });
  sent.length = 0; r = await cronCall(cronPOST, 'students', 's3cret'); await tick(); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.deepEqual([r.json.students, r.json.notified], [3, 2], 'elegíveis: Bruno, Juliana e o aluno do coach B (sem o novo e o inativo); notifica só quem não respondeu');
  const stuPush = sent.flat(); assert.deepEqual(stuPush.map((m: any) => m.to).sort(), ['ExponentPushToken[ju]'], 'só quem tem token do Expo (os demais não têm celular registrado)'); assert.equal(stuPush[0].title, 'Feedback da semana'); assert.equal(stuPush[0].data.type, 'weekly_feedback_due');
  sent.length = 0; await cronCall(cronGET, 'reminder', 's3cret'); await tick(); assert.equal(sent.flat()[0].title, '⏰ Ainda dá tempo do feedback da semana');
  sent.length = 0; r = await cronCall(cronPOST, 'coaches', 's3cret'); await tick(); assert.equal(r.status, 200); assert.equal(r.json.coaches, 2);
  const digest = sent.find((m: any) => m.to === 'ExponentPushToken[coachA]'); assert.equal(digest.title, '📋 Feedback da semana dos seus alunos'); assert.equal(digest.body, '1 de 2 responderam · 1 com alerta · 1 aguardando sua resposta · 1 sem retorno (cobre no painel)'); assert.equal(digest.data.type, 'weekly_digest');
  // auto: um agendamento diário escolhe a tarefa pelo dia da semana (Brasília)
  freeze('2026-10-05T11:00:00Z'); sent.length = 0; r = await cronCall(cronPOST, 'auto', 's3cret'); await tick(); assert.equal(r.json.auto, true); assert.equal(r.json.task, 'students', 'segunda -> alunos'); assert.equal(sent.flat()[0].title, 'Feedback da semana');
  freeze('2026-10-06T11:00:00Z'); sent.length = 0; r = await cronCall(cronPOST, 'auto', 's3cret'); await tick(); assert.equal(r.json.task, 'coaches', 'terça -> resumo ao coach'); assert.ok(sent.some((m: any) => m.data.type === 'weekly_digest'));
  freeze('2026-10-07T11:00:00Z'); sent.length = 0; r = await cronCall(cronPOST, 'auto', 's3cret'); await tick(); assert.equal(r.json.task, 'reminder', 'quarta -> lembrete'); assert.equal(sent.flat()[0].title, '⏰ Ainda dá tempo do feedback da semana');
  for (const d of ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) { freeze(d + 'T11:00:00Z'); sent.length = 0; r = await cronCall(cronPOST, 'auto', 's3cret'); await tick(); assert.equal(r.json.skipped, true, d + ' sem tarefa'); assert.equal(sent.length, 0); }
  freeze('2026-10-05T02:00:00Z'); sent.length = 0; r = await cronCall(cronPOST, 'auto', 's3cret'); assert.equal(r.json.skipped, true, 'domingo 23h em Brasília ainda é domingo (UTC já é segunda)');
  freeze('2026-10-05T12:00:00Z');
  db.weeklyDown = true; const origErr = console.error; console.error = () => {}; assert.equal((await cronCall(cronPOST, 'students', 's3cret')).status, 503); console.error = origErr; db.weeklyDown = false;
  console.log('OK  cron: desligado sem CRON_SECRET, exige o segredo, push aos alunos pendentes, lembrete, resumo ao coach');

  // ═════ F. FEED do coach ═════
  const asAdmin = async (adminId: string) => { const r = await dataGET(new Request('http://x/api/admin/data?adminId=' + adminId, { headers: H(adminId, 'COACH') })); return r.json(); };
  db.weekly.push({ id: 'wf-old', userId: 's2', coachId: 'coach-a', weekStart: '2026-09-14', createdAt: '2026-09-10T12:00:00.000Z', coachSeenAt: null, flags: [], score: 9, answers: { effort: 9 }, questions: [] }, { id: 'wf-seen', userId: 's2', coachId: 'coach-a', weekStart: '2026-09-21', createdAt: '2026-10-03T12:00:00.000Z', coachSeenAt: '2026-10-04T12:00:00.000Z', flags: [], score: 9, answers: { effort: 9 }, questions: [] }, { id: 'wf-b', userId: 's4', coachId: 'coach-b', weekStart: '2026-09-28', createdAt: '2026-10-05T11:00:00.000Z', coachSeenAt: null, flags: [], score: 7, answers: { effort: 7 }, questions: [] });
  let d = await asAdmin('coach-a'); assert.deepEqual(d.recentWeekly.map((x: any) => x.id), ['wf-x'], 'só não vistos, dos últimos 14 dias, dos alunos do coach');
  assert.equal(d.recentWeekly[0].score, 5); assert.deepEqual(d.recentWeekly[0].flags, ['PAIN']); assert.equal(d.recentWeekly[0].user.name, 'Bruno Lopes Mafra'); assert.ok(!('answers' in d.recentWeekly[0]), 'respostas completas não vão no feed (leve)'); assert.equal(d.recentWeekly[0].excerpt, null);
  db.weekly[0].answers = { effort: 5, difficulty_text: 'Ombro estalando', protocol: 'trocar supino' }; d = await asAdmin('coach-a'); assert.equal(d.recentWeekly[0].excerpt, 'Ombro estalando', 'o que a dor contou vem primeiro');
  db.weeklyDown = true; console.error = () => {}; d = await asAdmin('coach-a'); console.error = origErr; assert.deepEqual(d.recentWeekly, []); assert.ok(Array.isArray(d.recentLogs), 'sem a tabela o painel continua carregando'); db.weeklyDown = false;
  unfreeze();
  console.log('OK  feed do coach: feedbacks da semana ainda não vistos (14 dias) com trecho do que importa; painel não cai sem a tabela\n\nTODOS OS TESTES DO FEEDBACK DA SEMANA (BACKEND) PASSARAM');
})().catch((e) => { unfreeze(); console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
