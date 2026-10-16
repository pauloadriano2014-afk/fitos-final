import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as F from '/home/user/fitos-final/lib/weeklyFacts';
import * as L from '/home/user/fitos-final/lib/weeklyFactsLoader';
import * as Q from '/home/user/fitos-final/lib/weeklyQuestions';
import * as W from '/home/user/fitos-final/lib/weeklyFeedback';
import * as AI from '/home/user/fitos-final/lib/weeklyAI';
import * as S from '/home/user/fitos-final/lib/weeklyQuestionSet';
import * as WA from '/home/user/fitos-final/lib/weeklyWhatsApp';
import * as CR from '/home/user/fitos-final/lib/weeklyCron';
import * as ACC from '/home/user/fitos-final/lib/aiAccess';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
import { GET as userGET, POST as userPOST } from '/home/user/fitos-final/app/api/user/weekly-feedback/route';
import { GET as boardGET } from '/home/user/fitos-final/app/api/admin/weekly-feedback/route';
import { POST as waPOST } from '/home/user/fitos-final/app/api/admin/weekly-feedback/whatsapp/route';
import { POST as cronPOST } from '/home/user/fitos-final/app/api/cron/weekly-feedback/route';
const db = (prisma as any).__db;
const RealDate = Date;
const freeze = (iso: string) => { class FD extends RealDate { constructor(...a: any[]) { if (a.length === 0) super(iso); else super(...(a as [any])); } static now() { return new RealDate(iso).getTime(); } } (globalThis as any).Date = FD; };
const unfreeze = () => { (globalThis as any).Date = RealDate; };
const tok = (id: string, role = 'ALUNO') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const H = (as: string, role = 'ALUNO') => ({ authorization: 'Bearer ' + tok(as, role), 'content-type': 'application/json' });
const call = async (fn: any, url: string, as: string, role = 'ALUNO', body?: any) => { const r = await fn(new Request('http://x' + url, { method: body ? 'POST' : 'GET', headers: H(as, role), ...(body ? { body: JSON.stringify(body) } : {}) })); return { status: r.status, json: await r.json() }; };
const sent: any[] = []; (globalThis as any).fetch = async (url: string, init: any) => { sent.push(JSON.parse(init.body)); return { json: async () => ({ data: { status: 'ok' } }) }; };
const quiet = async (fn: () => Promise<any>) => { const w = console.warn, e = console.error; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; } };
const ids = (q: W.Question[]) => q.map((x) => x.id);

const WS = '2026-09-28';                       // semana avaliada: seg 28/09 a dom 04/10
const NOW = new RealDate('2026-10-05T12:00:00Z');   // segunda 09h em Brasília
const TUE = '2026-09-29T12:00:00Z', THU = '2026-10-01T12:00:00Z', SAT = '2026-10-03T12:00:00Z', FRI = '2026-10-02T12:00:00Z';
const base = (o: Partial<F.FactsInput> = {}): F.FactsInput => ({ weekStart: WS, now: NOW, planDays: ['A', 'B', 'C', 'D', 'E'], sessions: [], notes: [], checkin: null, diet: null, ...o });

(async () => {
  // ═════ A. fatos da semana (lógica pura) ═════
  let f = F.computeFacts(base({ sessions: [{ date: TUE, day: 'a' }, { date: THU, day: 'C' }, { date: SAT, day: 'E', rpe: 8 }, { date: '2026-10-05T04:00:00Z', day: 'B' }, { date: '2026-09-28T02:00:00Z', day: 'D' }] }));
  assert.deepEqual([f.training.planned, f.training.plannedSource, f.training.done], [5, 'PLAN', 3], 'fora da semana (segunda 01h BRT e domingo anterior 23h BRT) não conta');
  assert.deepEqual(f.training.weekdays, ['terça', 'quinta', 'sábado']); assert.deepEqual(f.training.doneDays, ['A', 'C', 'E']); assert.deepEqual(f.training.missingDays, ['B', 'D']); assert.equal(f.training.avgRpe, 8);
  assert.equal(F.trainingSentence(f), '3 de 5 treinos registrados (terça, quinta e sábado)'); assert.equal(F.missingDaysText(f.training.missingDays), 'o Treino B e o Treino D'); assert.equal(F.missingDaysText(['B', 'C', 'E']), 'o Treino B, o Treino C e o Treino E');
  assert.equal(F.isLowLogged(f), false, '3 de 5 = 60%: ainda não é alerta'); assert.equal(F.hasPlanGap(f), true);
  f = F.computeFacts(base({ sessions: [{ date: TUE, day: 'A' }, { date: THU, day: 'B' }] })); assert.equal(F.isLowLogged(f), true, '2 de 5 = 40%'); assert.equal(F.isLowLogged(null), false);
  f = F.computeFacts(base({ sessions: [] })); assert.equal(F.trainingSentence(f), 'nenhum treino registrado'); assert.equal(F.isLowLogged(f), true); assert.deepEqual(f.training.missingDays, ['A', 'B', 'C', 'D', 'E']);
  f = F.computeFacts(base({ sessions: [{ date: TUE, day: 'A' }, { date: TUE, day: 'A' }, { date: THU, day: 'A' }] })); assert.equal(f.training.done, 2, 'o mesmo treino finalizado 2x no mesmo dia conta 1; em dias diferentes conta 2');
  // dia deduzido pelos exercícios feitos (registros antigos, sem `day`)
  const pde = { A: ['e1', 'e2', 'e3'], B: ['e4', 'e5', 'e6'] };
  assert.equal(F.resolveSessionDay({ date: TUE, exerciseIds: ['e1', 'e2'] }, pde), 'A'); assert.equal(F.resolveSessionDay({ date: TUE, exerciseIds: ['e4'] }, pde), 'B'); assert.equal(F.resolveSessionDay({ date: TUE, exerciseIds: ['e1', 'e4'] }, pde), null, 'empate: não chuta');
  assert.equal(F.resolveSessionDay({ date: TUE, exerciseIds: ['zzz'] }, pde), null); assert.equal(F.resolveSessionDay({ date: TUE }, pde), null); assert.equal(F.resolveSessionDay({ date: TUE, day: ' c ' }, pde), 'C');
  f = F.computeFacts(base({ planDays: ['A', 'B'], planDayExercises: pde, sessions: [{ date: TUE, exerciseIds: ['e1', 'e2'] }, { date: THU, exerciseIds: ['x9'] }] })); assert.equal(f.training.done, 2); assert.deepEqual(f.training.doneDays, ['A']); assert.deepEqual(f.training.missingDays, [], 'com um registro sem dia identificado não afirma qual treino faltou');
  // semana parcial e sem plano
  f = F.computeFacts(base({ partialWeek: true, sessions: [{ date: FRI, day: 'A' }] })); assert.deepEqual([f.training.planned, f.training.plannedSource, f.training.partialWeek], [null, null, true]); assert.equal(F.hasPlanGap(f), false); assert.equal(F.isLowLogged(f), false);
  f = F.computeFacts(base({ planDays: [], declaredFreq: 4, sessions: [{ date: TUE }, { date: THU }] })); assert.deepEqual([f.training.planned, f.training.plannedSource], [4, 'ANAMNESE']); assert.equal(F.hasPlanGap(f), false, 'frequência da anamnese não é plano: não cobra'); assert.equal(F.trainingSentence(f), '2 treinos registrados (terça e quinta)'); assert.equal(F.isLowLogged(f), false);
  assert.ok(F.describeFacts(f)[0].text.includes('meta da anamnese: 4x/semana'));
  f = F.computeFacts(base({ planDays: [], declaredFreq: null })); assert.deepEqual(F.describeFacts(f), []);
  // observações
  const long = 'x'.repeat(400);
  f = F.computeFacts(base({ notes: [
    { kind: 'EXERCISE', exercise: 'Supino inclinado', text: 'Ombro   incomodou\n no final', date: TUE, handled: false },
    { kind: 'EXERCISE', exercise: 'supino inclinado', text: 'ombro incomodou no final', date: THU },
    { kind: 'WORKOUT', text: long, date: SAT, handled: true },
    { kind: 'EXERCISE', exercise: 'Agachamento', text: '   ', date: SAT }, { kind: 'EXERCISE', exercise: 'Leg', text: 'fora da semana', date: '2026-10-06T12:00:00Z' },
  ] }));
  assert.equal(f.notes.length, 2, 'repetida some, vazia some, fora da semana some'); assert.equal(f.notes[0].kind, 'WORKOUT'); assert.equal(f.notes[0].text.length, 240, 'texto cortado'); assert.equal(f.notes[0].weekday, 'sábado'); assert.equal(f.notes[0].handled, true);
  assert.equal(f.notes[1].text, 'ombro incomodou no final', 'repetida: fica a mais recente (quinta)'); assert.equal(f.notes[1].weekday, 'quinta'); assert.equal(f.notes[1].handled, false);
  f = F.computeFacts(base({ notes: Array.from({ length: 9 }, (_, i) => ({ kind: 'EXERCISE' as const, exercise: 'E' + i, text: 'nota ' + i, date: TUE })) })); assert.equal(f.notes.length, 6, 'no máximo 6');
  // dieta
  f = F.computeFacts(base({ diet: { enabled: true, mealLogs: [{ date: '2026-09-28', status: 'SEGUIU' }, { date: '2026-09-28', status: 'PULOU' }, { date: '2026-09-29', status: 'SUBSTITUIU' }, { date: '2026-09-29', status: 'LIVRE' }], daily: [{ date: '2026-09-28', adherence: 'SIM' }, { date: '2026-09-29', adherence: 'NAO', note: 'churrasco' }, { date: '2026-09-30', adherence: 'PARCIAL' }] } }));
  assert.deepEqual([f.diet.enabled, f.diet.hasData, f.diet.loggedDays, f.diet.meals, f.diet.followed, f.diet.substituted, f.diet.skipped, f.diet.free, f.diet.dayYes, f.diet.dayPartial, f.diet.dayNo], [true, true, 2, 4, 1, 1, 1, 1, 1, 1, 1]); assert.deepEqual(f.diet.notes, ['churrasco']);
  f = F.computeFacts(base({ diet: { enabled: true, mealLogs: [], daily: [] } })); assert.equal(f.diet.hasData, false); assert.equal(F.computeFacts(base({ diet: null })).diet.enabled, false);
  // check-in com fotos (hoje = segunda 05/10 em Brasília)
  const ck = (o: any) => F.computeFacts(base({ checkin: o })).checkin;
  assert.deepEqual(ck({ hasAny: true, nextCheckInDate: '2026-10-01T12:00:00Z' }), { status: 'LATE', dueDate: '2026-10-01', daysLate: 4 });
  assert.deepEqual(ck({ hasAny: true, nextCheckInDate: '2026-10-05T01:00:00Z' }), { status: 'LATE', dueDate: '2026-10-04', daysLate: 1 }, '01h UTC de segunda ainda é domingo em Brasília: atrasado 1 dia');
  assert.equal(ck({ hasAny: true, nextCheckInDate: '2026-10-05T12:00:00Z' }).status, 'DUE'); assert.equal(ck({ hasAny: true, nextCheckInDate: '2026-10-10T12:00:00Z' }).status, 'OK');
  assert.equal(ck({ hasAny: true, disabled: true, nextCheckInDate: '2026-09-01T12:00:00Z' }).status, 'DISABLED'); assert.equal(ck({ hasAny: true }).status, 'OK', 'sem data marcada: nada a cobrar');
  assert.equal(ck({ hasAny: false, accountCreatedAt: '2026-08-01T12:00:00Z' }).status, 'NEVER', 'nunca mandou fotos'); assert.equal(ck({ hasAny: false, accountCreatedAt: '2026-10-01T12:00:00Z' }).status, 'OK', 'aluno novo (3 dias): não cobra ainda');
  assert.equal(ck(null).status, 'OK');
  // perfil
  f = F.computeFacts(base({ limitations: ['Nenhuma', 'Ombro direito', 'sem limitações', ''], sleepQuality: 'Péssimo' })); assert.deepEqual(f.profile, { limitations: ['Ombro direito'], poorSleep: true, topics: [] }); assert.equal(F.computeFacts(base({ sleepQuality: 'Bom' })).profile.poorSleep, false);
  // linhas do coach
  f = F.computeFacts(base({ sessions: [{ date: TUE, day: 'A', rpe: 7 }, { date: THU, day: 'C', rpe: 8 }], notes: [{ kind: 'EXERCISE', exercise: 'Supino', text: 'dor no ombro', date: TUE, handled: false }], diet: { enabled: true, mealLogs: [{ date: WS, status: 'SEGUIU' }], daily: [{ date: WS, adherence: 'SIM' }] }, checkin: { hasAny: true, nextCheckInDate: '2026-10-01T12:00:00Z' } }));
  const lines = F.describeFacts(f); assert.deepEqual(lines.map((x) => x.key), ['training', 'note0', 'diet', 'checkin']);
  assert.equal(lines[0].text, 'Treinos: 2 de 5 treinos registrados (terça e quinta) · sem registro: Treino B, Treino D, Treino E · esforço médio 7.5/10'); assert.equal(lines[0].tone, 'bad');
  assert.equal(lines[1].text, 'Observação (Supino) · terça: "dor no ombro" · sem resposta'); assert.equal(lines[2].text, 'Dieta: 1 refeição marcada em 1 dia · fim do dia: 1 seguiu · 0 parcial · 0 não'); assert.equal(lines[3].text, 'Check-in com fotos atrasado há 4 dias (marcado para 01/10)'); assert.equal(lines[3].tone, 'bad');
  console.log('OK  fatos da semana: treinos x plano (dia gravado ou deduzido), semana parcial, sem plano, observações, dieta, check-in em horário de Brasília, linhas pro coach');

  // ═════ B. perguntas com os dados ═════
  const facts = (o: Partial<F.FactsInput> = {}) => F.computeFacts(base(o));
  const none = Q.buildWeeklyQuestions({ facts: null, limitations: ['Joelho'], dietModule: true });
  assert.deepEqual(ids(none), ids(W.buildQuestions({ limitations: ['Joelho'], dietModule: true })), 'sem dados = perguntas de sempre');
  let qs = Q.buildWeeklyQuestions({ facts: facts({ sessions: [{ date: TUE, day: 'A' }, { date: THU, day: 'C' }, { date: SAT, day: 'E' }] }) });
  assert.deepEqual(ids(qs), ['trained', 'training_gap', 'performance', 'difficulty', 'energy', 'protocol', 'effort']);
  assert.equal(qs[0].hint, 'No app aparece: 3 de 5 treinos registrados (terça, quinta e sábado).'); assert.equal(qs[1].label, '🗓️ Vi 3 de 5 treinos registrados (faltou o Treino B e o Treino D). O que aconteceu nos que ficaram de fora?');
  assert.ok(qs[1].options!.some((o) => o.value === 'NOLOG' && /esqueci de registrar/.test(o.label)), '"treinei, mas esqueci de registrar" é a primeira opção'); assert.deepEqual(qs[1].textWhen!.values.length, 7); assert.equal(qs[1].textWhen!.required, false);
  qs = Q.buildWeeklyQuestions({ facts: facts({ sessions: [] }) }); assert.equal(qs.find((q) => q.id === 'training_gap')!.label, '🗓️ Não vi nenhum treino registrado na semana. O que aconteceu?');
  qs = Q.buildWeeklyQuestions({ facts: facts({ sessions: [{ date: TUE, day: 'A' }, { date: THU, day: 'B' }, { date: SAT, day: 'C' }, { date: SAT, day: 'D' }, { date: FRI, day: 'E' }] }) }); assert.ok(!ids(qs).includes('training_gap'), 'cumpriu o plano: não pergunta o que faltou');
  qs = Q.buildWeeklyQuestions({ facts: facts({ partialWeek: true, sessions: [] }) }); assert.ok(!ids(qs).includes('training_gap'), 'semana parcial não cobra'); assert.ok(!qs[0].hint);
  qs = Q.buildWeeklyQuestions({ facts: facts({ planDays: [], declaredFreq: 5, sessions: [] }) }); assert.ok(!ids(qs).includes('training_gap'), 'sem plano ativo não cobra pela anamnese');
  // observações escritas na semana voltam na pergunta de dor/dificuldade
  qs = Q.buildWeeklyQuestions({ facts: facts({ notes: [{ kind: 'EXERCISE', exercise: 'Supino inclinado', text: 'Ombro incomodou', date: TUE }] }) }); assert.equal(qs.find((q) => q.id === 'difficulty')!.hint, 'Você comentou durante a semana: "Ombro incomodou" (Supino inclinado).');
  // check-in atrasado
  qs = Q.buildWeeklyQuestions({ facts: facts({ checkin: { hasAny: true, nextCheckInDate: '2026-10-01T12:00:00Z' } }) }); const ci = qs.find((q) => q.id === 'checkin_missed')!;
  assert.deepEqual(ids(qs).slice(0, 6), ['trained', 'training_gap', 'performance', 'difficulty', 'energy', 'checkin_missed']); assert.equal(ci.label, '📸 Seu check-in com fotos estava marcado para 01/10 e ainda não chegou. O que aconteceu?'); assert.ok(ci.hint!.includes('envie as fotos hoje'));
  assert.deepEqual(ci.options!.map((o) => o.value), ['FORGOT', 'NOTIME', 'UNCOMFORTABLE', 'TECH', 'WILLSEND', 'OTHER']); assert.ok(!ci.textWhen!.values.includes('WILLSEND'));
  qs = Q.buildWeeklyQuestions({ facts: facts({ checkin: { hasAny: false, accountCreatedAt: '2026-08-01T12:00:00Z' } }) }); assert.equal(qs.find((q) => q.id === 'checkin_missed')!.label, '📸 Ainda não recebemos as suas fotos do check-in. O que aconteceu?');
  qs = Q.buildWeeklyQuestions({ facts: facts({ checkin: { hasAny: true, nextCheckInDate: '2026-10-20T12:00:00Z' } }) }); assert.ok(!ids(qs).includes('checkin_missed')); qs = Q.buildWeeklyQuestions({ facts: facts({ checkin: { hasAny: true, disabled: true, nextCheckInDate: '2026-09-01T12:00:00Z' } }) }); assert.ok(!ids(qs).includes('checkin_missed'), 'check-in desligado pelo coach');
  // dieta: sempre pergunta (mesmo sem marcar refeição) + o que atrapalhou
  qs = Q.buildWeeklyQuestions({ facts: facts({ diet: { enabled: true, mealLogs: [], daily: [] } }) }); assert.deepEqual(ids(qs).slice(-3), ['diet', 'diet_issue', 'effort']); assert.ok(!qs.find((q) => q.id === 'diet')!.hint, 'sem marcações no diário: não afirma nada');
  qs = Q.buildWeeklyQuestions({ facts: facts({ diet: { enabled: true, mealLogs: [{ date: WS, status: 'SEGUIU' }, { date: '2026-09-29', status: 'SEGUIU' }], daily: [] } }) }); assert.equal(qs.find((q) => q.id === 'diet')!.hint, 'No diário aparecem 2 refeições marcadas em 2 dias.');
  assert.deepEqual(qs.find((q) => q.id === 'diet_issue')!.options!.map((o) => o.value), ['NONE', 'OUT', 'HUNGER', 'TIME', 'DISLIKE', 'OTHER']);
  // tudo junto: limitação, dieta, sono, gap, check-in
  qs = Q.buildWeeklyQuestions({ facts: facts({ limitations: ['Joelho'], sleepQuality: 'Ruim', sessions: [{ date: TUE, day: 'A' }], diet: { enabled: true, mealLogs: [], daily: [] }, checkin: { hasAny: true, nextCheckInDate: '2026-10-01T12:00:00Z' } }) });
  assert.deepEqual(ids(qs), ['trained', 'training_gap', 'performance', 'difficulty', 'energy', 'checkin_missed', 'protocol', 'limitation', 'diet', 'diet_issue', 'sleep', 'effort']);
  // validação das perguntas novas
  const full = { trained: 'PART', training_gap: 'TIME', performance: 'SAME', difficulty: 'NO', energy: 'OK', checkin_missed: 'FORGOT', limitation: 'NO', diet: 6, diet_issue: 'OUT', sleep: 'SAME', effort: 7 };
  let v: any = W.validateAnswers(qs, full); assert.equal(v.ok, true, JSON.stringify(v)); assert.equal((W.validateAnswers(qs, { ...full, training_gap: undefined }) as any).field, 'training_gap'); assert.equal((W.validateAnswers(qs, { ...full, checkin_missed: 'XX' }) as any).field, 'checkin_missed');
  v = W.validateAnswers(qs, { ...full, training_gap: 'PAIN', training_gap_text: 'joelho', checkin_missed: 'WILLSEND', checkin_missed_text: 'ignorado' }); assert.equal(v.ok, true); assert.equal(v.clean.training_gap_text, 'joelho'); assert.ok(!('checkin_missed_text' in v.clean), 'WILLSEND não abre texto');
  // alertas: dos fatos + das respostas
  assert.deepEqual(W.deriveSummary({ trained: 'ALL', effort: 9 }, { lowLogged: true, checkinLate: true }).flags, ['LOW_LOGGED', 'CHECKIN_LATE'], 'diz que cumpriu tudo mas os registros mostram pouco: o alerta é objetivo');
  assert.deepEqual(W.deriveSummary({ training_gap: 'PAIN', effort: 9 }).flags, ['PAIN']); assert.deepEqual(W.deriveSummary({ training_gap: 'MOTIV', effort: 9 }).flags, ['MOTIVATION']); assert.deepEqual(W.deriveSummary({ effort: 9 }).flags, []);
  assert.equal(W.needsAttention(['LOW_LOGGED']), true); assert.equal(W.needsAttention(['CHECKIN_LATE']), false); assert.equal(W.needsAttention(['MOTIVATION']), false);
  console.log('OK  perguntas com dados: "3 de 5", o que aconteceu nos que faltaram, observações da semana, check-in atrasado, dieta; sem dados volta ao padrão; alertas objetivos');

  // ═════ C. IA: conferência do que volta e a chamada ═════
  const aiFacts = facts({ planDays: ['A', 'B', 'C'], sessions: [{ date: TUE, day: 'A' }, { date: THU, day: 'B' }], notes: [{ kind: 'EXERCISE', exercise: 'Supino inclinado', text: 'Ombro incomodou no final das séries', date: TUE }], limitations: ['Ombro'] });
  const aiQs = Q.buildWeeklyQuestions({ facts: aiFacts });
  const clean = (raw: any) => AI.sanitizeRefinement(raw, { facts: aiFacts, questions: aiQs });
  let rf = clean({ intro: 'Oi, Lia! Vi que você fez 2 dos 3 treinos da semana. Bora entender o que rolou? 💜', rewrites: [{ id: 'training_gap', label: 'Lia, o que rolou com o Treino C que ficou de fora?' }], follow_ups: ['Como está o ombro no supino inclinado depois do que você comentou?'] });
  assert.equal(rf.intro, 'Oi, Lia! Vi que você fez 2 dos 3 treinos da semana. Bora entender o que rolou? 💜'); assert.deepEqual(rf.labels, { training_gap: 'Lia, o que rolou com o Treino C que ficou de fora?' }); assert.equal(rf.followUps.length, 1);
  rf = clean({ intro: 'Oi! Você fez 14 treinos.', rewrites: [], follow_ups: [] }); assert.equal(rf.intro, null, 'número que não está nos fatos é descartado');
  rf = clean({ intro: 'Oi! 💜🔥 Bora?', rewrites: [], follow_ups: [] }); assert.equal(rf.intro, null, 'mais de 1 emoji');
  rf = clean({ intro: 'Oi, tudo bem? Veja https://golpe.com', rewrites: [], follow_ups: [] }); assert.equal(rf.intro, null, 'link nunca passa');
  rf = clean({ intro: 'Procure um diagnóstico e tome um remédio.', rewrites: [{ id: 'training_gap', label: 'Que remédio você tomou no treino?' }], follow_ups: ['Qual medicamento ajudou no ombro?'] }); assert.deepEqual([rf.intro, rf.labels, rf.followUps], [null, {}, []], 'nada de diagnóstico/remédio');
  rf = clean({ intro: '', rewrites: [{ id: 'trained', label: 'Mudei a pergunta fixa?' }, { id: 'effort', label: 'Quanto foi sua nota?' }, { id: 'sleep', label: 'E o sono do aluno?' }, { id: 'training_gap', label: 'Sem interrogação' }, { id: 'training_gap', label: 'x?' }], follow_ups: [] }); assert.deepEqual(rf.labels, {}, 'só as dinâmicas existentes, terminando em "?" e com tamanho decente');
  rf = clean({ rewrites: [{ id: 'training_gap', label: 'Primeira versão do texto?' }, { id: 'training_gap', label: 'Segunda versão do texto?' }] }); assert.equal(rf.labels.training_gap, 'Primeira versão do texto?', 'a primeira vale');
  rf = clean({ intro: 'x'.repeat(300), rewrites: [{ id: 'training_gap', label: 'y'.repeat(230) + '?' }], follow_ups: [] }); assert.deepEqual([rf.intro, rf.labels], [null, {}], 'textos longos demais');
  rf = clean({ follow_ups: ['Qual é o seu signo preferido hoje?', 'Como foi o ombro no supino inclinado?', 'Como foi o ombro no supino inclinado?', 'O ombro melhorou nessa semana depois dos treinos?', 'O ombro doeu de novo no treino de ontem à noite?'] }); assert.equal(rf.followUps.length, 2, 'só as que citam algo do que o aluno escreveu, sem repetir, no máx. 2'); assert.ok(rf.followUps.every((t) => /ombro/i.test(t)));
  assert.deepEqual(AI.sanitizeRefinement(null, { facts: aiFacts, questions: aiQs }), { intro: null, labels: {}, followUps: [] }); assert.deepEqual(AI.sanitizeRefinement('lixo', { facts: aiFacts, questions: aiQs }), { intro: null, labels: {}, followUps: [] });
  const noNotes = facts({ planDays: ['A', 'B', 'C'], sessions: [{ date: TUE, day: 'A' }] }); assert.deepEqual(AI.sanitizeRefinement({ follow_ups: ['Como está o ombro depois do treino?'] }, { facts: noNotes, questions: Q.buildWeeklyQuestions({ facts: noNotes }) }).followUps, [], 'sem observação nem limitação não há do que acompanhar');
  // aplica
  const applied = AI.applyRefinement(aiQs, { intro: null, labels: { training_gap: 'Texto novo?' }, followUps: ['Como está o ombro?', 'E o supino?'] });
  assert.equal(applied.find((q) => q.id === 'training_gap')!.label, 'Texto novo?'); assert.deepEqual(ids(applied).slice(-3), ['ai_followup_1', 'ai_followup_2', 'effort']); const fu = applied.find((q) => q.id === 'ai_followup_1')!; assert.deepEqual([fu.kind, fu.optional], ['text', true]);
  assert.equal(W.validateAnswers(applied, { trained: 'MOST', training_gap: 'TIME', performance: 'SAME', difficulty: 'NO', energy: 'OK', limitation: 'NO', effort: 7 }).ok, true, 'pergunta aberta da IA é opcional');
  assert.equal(AI.refinementUsed({ intro: null, labels: {}, followUps: [] }), false); assert.equal(AI.refinementUsed(null), false);
  // chamada ao Haiku
  const calls: any[] = []; const reply = (obj: any) => ({ messages: { create: async (params: any, opts: any) => { calls.push({ params, opts }); return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], usage: { input_tokens: 1200, output_tokens: 240 } }; } } });
  const good = { intro: 'Oi, Lia! Vi 2 dos 3 treinos da semana. Vamos conversar? 💜', rewrites: [{ id: 'training_gap', label: 'O que rolou com o Treino C, Lia?' }], follow_ups: ['Como está o ombro depois do que você contou sobre o supino inclinado?'] };
  let rr: any = await AI.refineWithAI({ name: 'LIA SOUZA', facts: aiFacts, questions: aiQs, options: { client: reply(good), timeoutMs: 5000, maxRetries: 0 } });
  assert.equal(rr.model, 'claude-haiku-4-5'); assert.equal(rr.intro, good.intro); assert.deepEqual(rr.usage, { input_tokens: 1200, output_tokens: 240 });
  const p = calls[0].params; assert.equal(p.model, 'claude-haiku-4-5'); assert.ok(p.max_tokens <= 1024); assert.equal(p.output_config.format.type, 'json_schema'); assert.equal(p.output_config.format.schema.additionalProperties, false); assert.ok(p.system.includes('Nunca invente'));
  assert.deepEqual(calls[0].opts, { timeout: 5000, maxRetries: 0 }); const sentPayload = JSON.parse(p.messages[0].content); assert.equal(sentPayload.aluno, 'Lia'); assert.equal(sentPayload.fatos.training.done, 2); assert.deepEqual(sentPayload.perguntas_para_reescrever.map((x: any) => x.id), ['training_gap', 'limitation'], 'só as dinâmicas vão pra reescrever');
  assert.ok(!JSON.stringify(sentPayload).includes('LIA SOUZA'), 'só o primeiro nome vai pra IA');
  assert.equal(await AI.refineWithAI({ facts: aiFacts, questions: aiQs, options: { client: reply('isso não é json') } }), null, 'resposta inválida -> sem IA');
  assert.equal(await AI.refineWithAI({ facts: aiFacts, questions: aiQs, options: { client: reply({ intro: '', rewrites: [], follow_ups: [] }) } }), null, 'nada aproveitável -> sem IA');
  assert.equal(await quiet(() => AI.refineWithAI({ facts: aiFacts, questions: aiQs, options: { client: { messages: { create: async () => { throw new Error('timeout'); } } } } })), null, 'erro/timeout -> sem IA');
  assert.equal(await AI.refineWithAI({ facts: aiFacts, questions: aiQs, options: { client: null } }), null); delete process.env.ANTHROPIC_API_KEY; assert.equal(await AI.refineWithAI({ facts: aiFacts, questions: aiQs }), null, 'sem chave da Anthropic: sem IA');
  assert.equal(AI.aiEnabled(), false); process.env.ANTHROPIC_API_KEY = 'k'; assert.equal(AI.aiEnabled(), true); process.env.WEEKLY_FEEDBACK_AI = 'off'; assert.equal(AI.aiEnabled(), false, 'chave de desligar'); delete process.env.WEEKLY_FEEDBACK_AI; delete process.env.ANTHROPIC_API_KEY;
  console.log('OK  IA (Haiku): conferência de números, links, diagnóstico/remédio, emoji, tamanho, perguntas fixas intocadas, follow-ups só do que o aluno escreveu; falha/timeout/sem chave = sem IA');

  // ═════ D. carregamento do banco + conjunto de perguntas ═════
  const T = (s: string) => s;
  db.users.push(
    { id: 'c1', role: 'COACH', accountStatus: 'ACTIVE', coachPlan: 'ELITE', name: 'Coach', pushToken: 'ExponentPushToken[coach]', coachId: null },
    { id: 'a1', role: 'USER', name: 'LIA SOUZA', coachId: 'c1', createdAt: T('2026-01-01T12:00:00Z'), active: true, accountStatus: 'ACTIVE', dietModule: true, pushToken: 'ExponentPushToken[lia]', phone: '(11) 98888-7777', nextCheckInDate: T('2026-10-01T12:00:00Z'), disableCheckIn: false, lastContactDate: null },
    { id: 'a2', role: 'USER', name: 'Caio Nunes', coachId: 'c1', createdAt: T('2026-09-30T12:00:00Z'), active: true, accountStatus: 'ACTIVE', dietModule: false, pushToken: null, phone: '55999998888', nextCheckInDate: null, disableCheckIn: false },
    { id: 'a3', role: 'USER', name: 'Rui Alves', coachId: 'c1', createdAt: T('2026-01-01T12:00:00Z'), active: true, accountStatus: 'ACTIVE', dietModule: false, pushToken: null, phone: '+55 11 98888-7777', nextCheckInDate: T('2026-10-20T12:00:00Z'), disableCheckIn: false },
    { id: 'a4', role: 'USER', name: 'Sem Fone', coachId: 'c1', createdAt: T('2026-01-01T12:00:00Z'), active: true, accountStatus: 'ACTIVE', dietModule: false, pushToken: null, phone: '123', nextCheckInDate: T('2026-10-20T12:00:00Z'), disableCheckIn: false },
  );
  db.anamneses.push({ userId: 'a1', limitacoes: ['Ombro'], sleepQuality: 'Bom', frequencia: 4, createdAt: T('2026-02-01T12:00:00Z') }, { userId: 'a3', limitacoes: [], sleepQuality: 'Bom', frequencia: 3, createdAt: T('2026-02-01T12:00:00Z') });
  db.workouts.push(
    { id: 'w1', userId: 'a1', archived: false, startDate: T('2026-09-01T03:00:00Z'), endDate: null, alternateSlot: null, createdAt: T('2026-09-01T12:00:00Z'), exercises: [{ day: 'A', exerciseId: 'e1' }, { day: 'A', exerciseId: 'e2' }, { day: 'B', exerciseId: 'e3' }, { day: 'C', exerciseId: 'e4' }, { day: 'OFF', exerciseId: 'e9' }, { day: 'Descanso ativo', exerciseId: 'e8' }] },
    { id: 'w0', userId: 'a1', archived: true, startDate: T('2026-08-01T03:00:00Z'), endDate: null, alternateSlot: null, createdAt: T('2026-08-01T12:00:00Z'), exercises: [{ day: 'A', exerciseId: 'e1' }, { day: 'B', exerciseId: 'e2' }, { day: 'C', exerciseId: 'e3' }, { day: 'D', exerciseId: 'e4' }] },
  );
  db.histories.push(
    { id: 'ha1', userId: 'a1', name: 'FICHA X', day: 'A', date: T(TUE), rpe: 7, feedback: 'Treino pesado, mas gostei', details: [{ exerciseId: 'e1', exerciseName: 'Supino', note: 'Ombro incomodou no final', resolvedAt: null, coachReplyAt: null }, { exerciseId: 'e1', exerciseName: 'Supino', note: 'Ombro incomodou no final', resolvedAt: null }, { exerciseId: 'e2', exerciseName: 'Crucifixo', note: null }] },
    { id: 'ha2', userId: 'a1', name: 'FICHA X', day: null, date: T(THU), rpe: 8, feedback: null, details: [{ exerciseId: 'e3', exerciseName: 'Remada', note: null }] },   // sem `day`: deduz o B pelos exercícios
    { id: 'ha3', userId: 'a1', name: 'FICHA X', day: 'A', date: T('2026-10-06T12:00:00Z'), details: [] },   // semana seguinte: não conta
  );
  db.alerts.push({ id: 'al1', userId: 'a1', type: 'EXERCISE_NOTE', isRead: true, createdAt: T(THU), title: 'x', message: 'Ombro incomodou no final', exerciseName: 'Supino' });
  db.checkins.push({ userId: 'a1', date: T('2026-09-17T12:00:00Z') });
  db.daily.push({ studentId: 'a1', date: '2026-09-30', dietAdherence: 'PARCIAL', dietNote: 'Jantar fora' }); db.mealLogs.push({ userId: 'a1', date: '2026-09-30', status: 'SEGUIU' }, { userId: 'a1', date: '2026-10-09', status: 'SEGUIU' });
  const a1 = db.users.find((u: any) => u.id === 'a1');
  let lf: F.WeeklyFacts = await L.loadWeeklyFacts(prisma, a1, WS, NOW);
  assert.deepEqual([lf.training.planned, lf.training.plannedSource, lf.training.done], [3, 'PLAN', 2], 'plano ativo: A, B, C (descanso fora; ficha arquivada fora)'); assert.deepEqual(lf.training.doneDays, ['A', 'B']); assert.deepEqual(lf.training.missingDays, ['C']);
  assert.equal(lf.training.avgRpe, 7.5); assert.equal(lf.notes.length, 2, 'observação do exercício (repetida em cada série e no alerta) vira 1; feedback do treino é outra'); assert.ok(lf.notes.some((n) => n.kind === 'WORKOUT' && n.text === 'Treino pesado, mas gostei')); assert.equal(lf.notes.find((n) => n.kind === 'EXERCISE')!.exercise, 'Supino');
  assert.equal(lf.notes.find((n) => n.kind === 'EXERCISE')!.handled, true, 'o alerta enviado na hora já foi lido pelo coach');
  assert.deepEqual([lf.diet.enabled, lf.diet.meals, lf.diet.loggedDays, lf.diet.dayPartial], [true, 1, 1, 1], 'refeição de outra semana não entra'); assert.deepEqual(lf.diet.notes, ['Jantar fora']);
  assert.deepEqual(lf.checkin, { status: 'LATE', dueDate: '2026-10-01', daysLate: 4 }); assert.deepEqual(lf.profile, { limitations: ['Ombro'], poorSleep: false, topics: [] });
  // semana parcial (entrou na quarta) e sem plano
  const a2 = db.users.find((u: any) => u.id === 'a2'); lf = await L.loadWeeklyFacts(prisma, a2, WS, NOW); assert.equal(lf.training.partialWeek, true); assert.equal(lf.training.planned, null);
  const a3 = db.users.find((u: any) => u.id === 'a3'); lf = await L.loadWeeklyFacts(prisma, a3, WS, NOW); assert.deepEqual([lf.training.plannedSource, lf.training.planned, lf.training.done, lf.training.partialWeek], ['ANAMNESE', 3, 0, false]); assert.equal(lf.checkin.status, 'NEVER', 'conta antiga que nunca mandou foto');
  // ficha que começou durante a semana também é semana parcial
  db.workouts.push({ id: 'w3', userId: 'a3', archived: false, startDate: T('2026-10-01T12:00:00Z'), endDate: null, alternateSlot: null, createdAt: T('2026-10-01T12:00:00Z'), exercises: [{ day: 'A', exerciseId: 'e1' }, { day: 'B', exerciseId: 'e2' }] });
  lf = await L.loadWeeklyFacts(prisma, a3, WS, NOW); assert.deepEqual([lf.training.partialWeek, lf.training.planned], [true, null]); db.workouts.pop();
  // alternância semanal de fichas (alternateSlot): só a ficha do slot da semana
  const alt = [{ id: 'p1', alternateSlot: 1, startDate: '2026-09-07T03:00:00Z' }, { id: 'p2', alternateSlot: 2, startDate: '2026-09-07T03:00:00Z' }, { id: 'p3', alternateSlot: null, startDate: '2026-09-01T03:00:00Z' }, { id: 'old', alternateSlot: null, archived: true }, { id: 'ended', endDate: '2026-09-20T12:00:00Z' }, { id: 'future', startDate: '2026-10-20T12:00:00Z' }];
  assert.deepEqual(L.activeWorkoutsForWeek(alt as any, '2026-09-28').map((w) => w.id), ['p3', 'p2'], 'semana 4 da dupla = slot 2'); assert.deepEqual(L.activeWorkoutsForWeek(alt as any, '2026-09-21').map((w) => w.id), ['p3', 'p1'], 'semana anterior = slot 1');
  // falha parcial: check-in indisponível não vira "nunca mandou"; falha no núcleo derruba o levantamento
  db.checkinDown = true; lf = await L.loadWeeklyFacts(prisma, a3, WS, NOW); assert.equal(lf.checkin.status, 'OK', 'sem conseguir ler o check-in, não afirma nada'); db.checkinDown = false;
  const origFind = (prisma as any).workout.findMany; (prisma as any).workout.findMany = async () => { throw new Error('banco fora'); }; await assert.rejects(() => L.loadWeeklyFacts(prisma, a3, WS, NOW), /banco fora/); (prisma as any).workout.findMany = origFind;

  // conjunto de perguntas: monta uma vez, guarda, e é o que vale depois
  delete process.env.ANTHROPIC_API_KEY;
  let set = await S.ensureQuestionSet(prisma, a1, { weekStart: WS, now: NOW }); assert.equal(set.persisted, true); assert.equal(set.source, 'RULES'); assert.equal(set.intro, null); assert.ok(ids(set.questions).includes('training_gap')); assert.equal(db.wq.length, 1); assert.equal(db.wq[0].facts.training.done, 2);
  const again = await S.ensureQuestionSet(prisma, a1, { weekStart: WS, now: NOW, ai: false }); assert.deepEqual(again.questions, set.questions); assert.equal(db.wq.length, 1, 'não monta de novo');
  assert.deepEqual(ids((await S.findQuestionSet(prisma, 'a1', WS))!.questions), ids(set.questions)); assert.equal(await S.findQuestionSet(prisma, 'a1', '2026-09-21'), null);
  // com IA
  db.wq.length = 0; const aiClient = reply({ intro: 'Oi, Lia! Vi 2 dos 3 treinos da semana. Vamos conversar? 💜', rewrites: [{ id: 'training_gap', label: 'O que rolou com o Treino C, Lia?' }], follow_ups: ['Como está o ombro depois do que você contou sobre o supino?'] });
  set = await S.ensureQuestionSet(prisma, a1, { weekStart: WS, now: NOW, ai: { client: aiClient } }); assert.equal(set.source, 'AI'); assert.equal(set.model, 'claude-haiku-4-5'); assert.equal(set.intro, 'Oi, Lia! Vi 2 dos 3 treinos da semana. Vamos conversar? 💜');
  assert.equal(set.questions.find((q) => q.id === 'training_gap')!.label, 'O que rolou com o Treino C, Lia?'); assert.ok(ids(set.questions).includes('ai_followup_1')); assert.equal(db.wq[0].source, 'AI'); assert.equal(db.aiLogs.length, 1); assert.equal(db.aiLogs[0].userId, 'a1'); assert.ok(db.aiLogs[0].question.startsWith('weekly-feedback:')); assert.equal(calls.length, 3 + 1, 'uma chamada por aluno/semana');
  const n0 = calls.length; await S.ensureQuestionSet(prisma, a1, { weekStart: WS, now: NOW, ai: { client: aiClient } }); assert.equal(calls.length, n0, 'segunda abertura não chama a IA');
  // IA falha: perguntas por regras, guardadas
  db.wq.length = 0; set = await quiet(() => S.ensureQuestionSet(prisma, a1, { weekStart: WS, now: NOW, ai: { client: { messages: { create: async () => { throw new Error('429'); } } } } })); assert.equal(set.source, 'RULES'); assert.ok(ids(set.questions).includes('training_gap')); assert.equal(db.wq.length, 1);
  // corrida: duas aberturas ao mesmo tempo -> vale a que gravou primeiro
  db.wq.length = 0; db.wqRace = true; set = await S.ensureQuestionSet(prisma, a1, { weekStart: WS, now: NOW, ai: false }); assert.equal(db.wq.length, 1); assert.equal(set.questions.length, 2, 'devolve o conjunto que ganhou a corrida'); db.wq.length = 0;
  // deploy antes do db push: monta na hora sem guardar
  db.wqDown = true; set = await S.ensureQuestionSet(prisma, a1, { weekStart: WS, now: NOW, ai: false }); assert.equal(set.persisted, false); assert.ok(set.questions.length > 5); assert.equal(await S.findQuestionSet(prisma, 'a1', WS), null); db.wqDown = false;
  // dados da semana indisponíveis: perguntas de sempre (com a anamnese), sem IA
  (prisma as any).workout.findMany = async () => { throw new Error('banco fora'); }; set = await quiet(() => S.ensureQuestionSet(prisma, a1, { weekStart: WS, now: NOW, ai: { client: aiClient } })); (prisma as any).workout.findMany = origFind;
  assert.equal(set.facts, null); assert.equal(set.source, 'RULES'); assert.deepEqual(ids(set.questions), ids(W.buildQuestions({ limitations: ['Ombro'], dietModule: true })), 'sem os dados da semana nunca deixa o aluno sem formulário'); db.wq.length = 0;
  console.log('OK  carregamento: plano ativo (sem descanso/arquivada), dia deduzido, observações sem repetir, dieta e check-in; alternância de fichas; conjunto de perguntas guardado, IA 1x por semana, falhas caem pro padrão');

  // ═════ E. rotas com IA ═════
  freeze('2026-10-05T12:00:00Z');
  process.env.ANTHROPIC_API_KEY = 'test-key'; let llmCalls = 0;
  (globalThis as any).__LLM = async () => { llmCalls++; return { content: [{ type: 'text', text: JSON.stringify({ intro: 'Oi, Lia! Vi 2 dos 3 treinos da semana. Vamos conversar? 💜', rewrites: [{ id: 'training_gap', label: 'O que rolou com o Treino C, Lia?' }], follow_ups: ['Como está o ombro depois do que você contou sobre o supino?'] }) }] }; };
  let r = await call(userGET, '/api/user/weekly-feedback?userId=a1', 'a1'); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.due, true); assert.equal(r.json.intro, 'Oi, Lia! Vi 2 dos 3 treinos da semana. Vamos conversar? 💜');
  const qIds = ids(r.json.questions); assert.deepEqual(qIds, ['trained', 'training_gap', 'performance', 'difficulty', 'energy', 'checkin_missed', 'protocol', 'limitation', 'diet', 'diet_issue', 'ai_followup_1', 'effort']);
  assert.equal(r.json.questions[0].hint, 'No app aparece: 2 de 3 treinos registrados (terça e quinta).'); assert.equal(r.json.questions[1].label, 'O que rolou com o Treino C, Lia?'); assert.equal(llmCalls, 1);
  const first = JSON.stringify(r.json.questions); r = await call(userGET, '/api/user/weekly-feedback?userId=a1', 'a1'); assert.equal(JSON.stringify(r.json.questions), first, 'as perguntas não mudam a cada abertura'); assert.equal(llmCalls, 1);
  const ans = { trained: 'PART', training_gap: 'NOLOG', training_gap_text: 'Fiz o C e esqueci de registrar', performance: 'SAME', difficulty: 'YES', difficulty_text: 'Ombro de novo', energy: 'OK', checkin_missed: 'FORGOT', limitation: 'LITTLE', diet: 7, diet_issue: 'OUT', ai_followup_1: 'Está melhor, só no final das séries', effort: 8 };
  assert.equal((await call(userPOST, '/api/user/weekly-feedback', 'a1', 'ALUNO', { userId: 'a1', weekStart: WS, answers: { ...ans, training_gap: undefined } })).json.field, 'training_gap', 'a validação usa as perguntas que o aluno viu');
  assert.equal((await call(userPOST, '/api/user/weekly-feedback', 'a1', 'ALUNO', { userId: 'a1', weekStart: WS, answers: { ...ans, diet_issue: 'XX' } })).status, 400);
  r = await call(userPOST, '/api/user/weekly-feedback', 'a1', 'ALUNO', { userId: 'a1', weekStart: WS, answers: ans }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(llmCalls, 1, 'responder não chama a IA de novo');
  const saved = db.weekly.find((w: any) => w.userId === 'a1'); assert.deepEqual(saved.flags, ['PAIN', 'LOW_ADHERENCE', 'ADJUST'].filter((x) => x !== 'ADJUST').concat(['CHECKIN_LATE']), 'dor + treinou pouco (respostas) + check-in atrasado (registros)');
  assert.equal(saved.facts.training.done, 2); assert.equal(saved.questions.length, 12); assert.equal(saved.answers.ai_followup_1, 'Está melhor, só no final das séries');
  // aluno que cumpriu menos de 60% do plano vira alerta objetivo, mesmo respondendo "cumpri tudo"
  db.histories.length = 0; db.histories.push({ id: 'hb1', userId: 'a1', name: 'F', day: 'A', date: T(TUE), details: [] }); db.wq.length = 0; db.weekly.length = 0; delete process.env.ANTHROPIC_API_KEY;
  r = await call(userPOST, '/api/user/weekly-feedback', 'a1', 'ALUNO', { userId: 'a1', weekStart: WS, answers: { trained: 'ALL', training_gap: 'TIME', performance: 'SAME', difficulty: 'NO', energy: 'GREAT', checkin_missed: 'WILLSEND', limitation: 'NO', diet: 9, diet_issue: 'NONE', effort: 9 } }); assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(db.weekly[0].flags, ['LOW_LOGGED', 'CHECKIN_LATE'], '1 de 3 registrado: alerta de aderência objetiva'); assert.equal(W.needsAttention(db.weekly[0].flags), true);
  sent.length = 0; db.weekly.length = 0; db.wq.length = 0; await new Promise((r) => setTimeout(r, 10));
  console.log('OK  rotas: perguntas e saudação da IA, estáveis entre aberturas; resposta validada contra o que o aluno viu e guarda os fatos; alerta objetivo (registrou pouco, check-in atrasado)');

  // ═════ F. WhatsApp ═════
  assert.equal(WA.normalizeBrPhone('(11) 98888-7777'), '5511988887777'); assert.equal(WA.normalizeBrPhone('11988887777'), '5511988887777'); assert.equal(WA.normalizeBrPhone('+55 11 98888-7777'), '5511988887777'); assert.equal(WA.normalizeBrPhone('55999998888'), '5555999998888', 'DDD 55 (RS) não é código do país');
  assert.equal(WA.normalizeBrPhone('1133334444'), '551133334444'); assert.equal(WA.normalizeBrPhone('123'), null); assert.equal(WA.normalizeBrPhone(null), null); assert.equal(WA.normalizeBrPhone('+1 415 555 2671 99'), null, 'número de outro país');
  const msg = WA.buildWhatsAppText({ name: 'LIA SOUZA', weekLabel: '28/09 a 04/10', intro: 'Oi, Lia! Vamos conversar?', questions: [{ id: 'trained', kind: 'choice', label: '🏋️ Treinos: conseguiu cumprir o planejado?', hint: 'No app aparece: 2 de 3 treinos registrados.', options: [{ value: 'ALL', label: 'Cumpri tudo' }, { value: 'LITTLE', label: 'Pouco ou nada' }] }, { id: 'protocol', kind: 'text', label: '🎯 Protocolo?' }, { id: 'effort', kind: 'scale', min: 0, max: 10, label: '⭐ Dedicação?' }] });
  assert.ok(msg.startsWith('Oi, Lia! Tudo bem?\n')); assert.ok(!msg.includes('💜'), 'sem coração no texto do WhatsApp'); assert.ok(msg.includes('(28/09 a 04/10)')); assert.ok(msg.includes('\nFEEDBACK DA SEMANA — PA ELITE')); assert.ok(msg.includes('Oi, Lia! Vamos conversar?')); assert.ok(msg.includes('1) 🏋️ Treinos: conseguiu cumprir o planejado?\n   No app aparece: 2 de 3 treinos registrados.\n   ➜ Cumpri tudo / Pouco ou nada'));
  assert.ok(msg.includes('2) 🎯 Protocolo?\n') && msg.includes('3) ⭐ Dedicação?\n   ➜ nota de 0 a 10')); assert.ok(msg.trim().endsWith('E não esquece de registrar suas cargas no app. 📲'));
  // rota
  assert.equal((await call(waPOST, '/x', 'c1', 'COACH', {})).status, 400); assert.equal((await call(waPOST, '/x', 'a1', 'ALUNO', { studentId: 'a1' })).status, 403, 'aluno não manda pra si'); assert.equal((await call(waPOST, '/x', 'a2', 'ALUNO', { studentId: 'a1' })).status, 403); assert.equal((await call(waPOST, '/x', 'c1', 'COACH', { studentId: 'nao' })).status, 404);
  assert.equal((await call(waPOST, '/x', 'c1', 'COACH', { studentId: 'a2' })).status, 200, 'a2 entrou na quarta, mas já existia na semana avaliada');
  r = await call(waPOST, '/x', 'c1', 'COACH', { studentId: 'a4' }); assert.equal(r.status, 400); assert.equal(r.json.code, 'NO_PHONE');
  db.histories.length = 0; db.histories.push({ id: 'hc1', userId: 'a1', name: 'F', day: 'A', date: T(TUE), details: [] }, { id: 'hc2', userId: 'a1', name: 'F', day: 'B', date: T(THU), details: [{ exerciseId: 'e3', exerciseName: 'Remada', note: 'Remada pesada demais' }] });
  r = await call(waPOST, '/x', 'c1', 'COACH', { studentId: 'a1' }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.phone, '5511988887777'); assert.ok(r.json.url.startsWith('https://wa.me/5511988887777?text=')); assert.equal(decodeURIComponent(r.json.url.split('?text=')[1]), r.json.text);
  assert.ok(r.json.text.startsWith('Oi, Lia! Tudo bem?\n') && !r.json.text.includes('💜')); assert.ok(r.json.text.includes('2 de 3 treinos registrados (terça e quinta)') && r.json.text.includes('faltou o Treino C'), 'o texto leva as perguntas personalizadas'); assert.ok(r.json.text.includes('📸 Seu check-in com fotos estava marcado para 01/10'));
  assert.ok(r.json.text.includes('Remada pesada demais'), 'e o que o aluno escreveu na semana');
  let nudges = db.alerts.filter((a: any) => a.type === 'WEEKLY_NUDGE' && a.userId === 'a1'); assert.equal(nudges.length, 1); assert.equal(nudges[0].userId, 'a1'); assert.equal(nudges[0].isRead, true); assert.ok(nudges[0].title.includes('WhatsApp'));
  r = await call(waPOST, '/x', 'c1', 'COACH', { studentId: 'a1' }); assert.equal(r.status, 200); assert.equal(db.alerts.filter((a: any) => a.type === 'WEEKLY_NUDGE' && a.userId === 'a1').length, 1, 'abrir de novo no mesmo dia não duplica a cobrança');
  db.weekly.push({ id: 'wf-a3', userId: 'a3', coachId: 'c1', weekStart: WS, createdAt: '2026-10-05T11:00:00.000Z', coachSeenAt: null, flags: [], score: 9, answers: { effort: 9 }, questions: [] }); assert.equal((await call(waPOST, '/x', 'c1', 'COACH', { studentId: 'a3' })).status, 409, 'quem já respondeu não recebe o reforço');
  db.users.push({ id: 'cx', role: 'COACH', accountStatus: 'ACTIVE', name: 'Outro', coachId: null }); assert.equal((await call(waPOST, '/x', 'cx', 'COACH', { studentId: 'a1' })).status, 403, 'só o coach do aluno'); db.weekly.length = 0;
  console.log('OK  WhatsApp: celular normalizado (DDD 55 não confunde), mensagem com saudação + o questionário personalizado, conta como cobrança 1x por 12 h, só o coach do aluno');

  // ═════ G. cron monta as perguntas ═════
  const students = ['x1', 'x2', 'x3', 'x4', 'x5'].map((id) => ({ id })); let running = 0, peak = 0; const done: string[] = [];
  const rep = await CR.prepareQuestionSets(students, WS, NOW, { concurrency: 2, ensure: async (s) => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; if (s.id === 'x3') throw new Error('falhou'); done.push(s.id); return { source: s.id === 'x1' ? 'AI' : 'RULES' }; } });
  assert.deepEqual(rep, { total: 5, ready: 4, ai: 1, rules: 3, skipped: 1 }); assert.equal(peak, 2, 'no máximo 2 ao mesmo tempo (concurrency)'); assert.equal(done.length, 4);
  unfreeze(); const slow = await CR.prepareQuestionSets(students, WS, NOW, { concurrency: 1, budgetMs: 8, ensure: async () => { await new Promise((r) => setTimeout(r, 6)); return { source: 'RULES' as const }; } }); freeze('2026-10-05T12:00:00Z'); assert.ok(slow.ready >= 1 && slow.skipped >= 1 && slow.ready + slow.skipped === 5, 'estourou o tempo: o resto fica pra 1ª abertura do card');
  // tarefa "students": prepara antes do push, e o push sai mesmo se a preparação falhar
  let order: string[] = []; const cdb = { user: { findMany: async () => [a1, a3].map((u: any) => ({ ...u })) }, weeklyFeedback: { findMany: async () => [] } };
  const res = await CR.runWeeklyTask('students', { db: cdb, now: NOW, sendToUsers: async (u: any[]) => { order.push('push:' + u.length); }, sendToUser: async () => {}, prepareQuestions: async (u: any[]) => { order.push('prep:' + u.length); return { total: u.length, ready: u.length, ai: 1, rules: 1, skipped: 0 }; } });
  assert.deepEqual(order, ['prep:2', 'push:2'], 'primeiro monta, depois avisa'); assert.deepEqual(res.prepared, { total: 2, ready: 2, ai: 1, rules: 1, skipped: 0 });
  order = []; const res2: any = await quiet(() => CR.runWeeklyTask('students', { db: cdb, now: NOW, sendToUsers: async (u: any[]) => { order.push('push:' + u.length); }, sendToUser: async () => {}, prepareQuestions: async () => { throw new Error('IA fora'); } })); assert.deepEqual(order, ['push:2']); assert.equal(res2.prepared, undefined);
  order = []; await CR.runWeeklyTask('reminder', { db: cdb, now: NOW, sendToUsers: async () => {}, sendToUser: async () => {}, prepareQuestions: async () => { order.push('prep'); return {} as any; } }); assert.deepEqual(order, [], 'o lembrete de quarta não remonta nada');
  // ponta a ponta pela rota do cron (sem IA: perguntas por regras)
  process.env.CRON_SECRET = 's3'; db.wq.length = 0; db.histories.length = 0;
  const cr = await cronPOST(new Request('http://x/api/cron/weekly-feedback?task=students', { method: 'POST', headers: { authorization: 'Bearer s3' } })); const cj: any = await cr.json(); assert.equal(cr.status, 200, JSON.stringify(cj)); assert.ok(cj.prepared && cj.prepared.total >= 3 && cj.prepared.ready === cj.prepared.total, JSON.stringify(cj));
  assert.ok(db.wq.some((x: any) => x.userId === 'a1') && db.wq.some((x: any) => x.userId === 'a3'), 'cada aluno pendente ficou com as perguntas prontas'); const wq1 = db.wq.find((x: any) => x.userId === 'a1'); assert.ok(wq1.questions.some((q: any) => q.id === 'training_gap'), 'a1: 0 de 3 treinos -> pergunta o que aconteceu');
  console.log('OK  cron: monta as perguntas (algumas por vez, dentro do tempo) antes do push; push sai mesmo se a montagem falhar; lembrete não remonta');

  // ═════ H. painel do coach com os dados da semana ═════
  let b = await call(boardGET, '/api/admin/weekly-feedback?adminId=c1', 'c1', 'COACH'); assert.equal(b.status, 200, JSON.stringify(b.json));
  const row1 = b.json.rows.find((x: any) => x.studentId === 'a1'); assert.equal(row1.answered, false); assert.equal(row1.questionSource, 'RULES'); assert.equal(row1.workoutsDone, 0); assert.equal(row1.plannedPerWeek, 3, 'plano ativo, não a frequência da anamnese (4)');
  assert.deepEqual(row1.factsView.map((x: any) => x.key), ['training', 'note0', 'diet', 'checkin']); assert.ok(row1.factsView[0].text.startsWith('Treinos: nenhum treino registrado')); assert.equal(row1.factsView[1].text, 'Observação (Supino) · quinta: "Ombro incomodou no final"'); assert.equal(row1.factsView[3].tone, 'bad');
  const row3 = b.json.rows.find((x: any) => x.studentId === 'a3'); assert.equal(row3.plannedPerWeek, 3, 'sem plano: meta da anamnese'); assert.ok(row3.factsView.length >= 1);
  // respondeu: os fatos "congelam" no que foi levantado, mesmo que os registros mudem depois
  db.weekly.push({ id: 'wf-1', userId: 'a1', coachId: 'c1', weekStart: WS, createdAt: '2026-10-05T12:30:00.000Z', coachSeenAt: null, flags: ['LOW_LOGGED', 'CHECKIN_LATE'], score: 6, answers: { effort: 6 }, questions: [], facts: { ...wq1.facts, training: { ...wq1.facts.training, done: 2 } } });
  b = await call(boardGET, '/api/admin/weekly-feedback?adminId=c1', 'c1', 'COACH'); const r1 = b.json.rows.find((x: any) => x.studentId === 'a1'); assert.equal(r1.workoutsDone, 2); assert.equal(r1.attention, true, 'registrou poucos treinos é alerta'); assert.deepEqual(r1.flags, ['LOW_LOGGED', 'CHECKIN_LATE']);
  db.wqDown = true; b = await call(boardGET, '/api/admin/weekly-feedback?adminId=c1', 'c1', 'COACH'); assert.equal(b.status, 200, 'sem a tabela nova o painel continua'); assert.equal(b.json.rows.find((x: any) => x.studentId === 'a1').questionSource, null); db.wqDown = false;
  // ═════ I. IA só pra coach master/Elite + temas da anamnese ═════
  ACC.resetFeedbackAiCache(); db.weekly.length = 0;   // (o Bruno do bloco anterior já tinha respondido)
  db.users.push(
    { id: 'cp', role: 'COACH', accountStatus: 'ACTIVE', coachPlan: 'PERSONAL', name: 'Coach Personal', coachId: null }, { id: 'cn', role: 'COACH', accountStatus: 'ACTIVE', coachPlan: 'NUTRICIONISTA', name: 'Coach Nutri', coachId: null },
    { id: 'ce2', role: 'COACH', accountStatus: 'PAUSED', coachPlan: 'ELITE', name: 'Coach Elite Pausado', coachId: null },
    { id: 'sp', role: 'USER', name: 'Aluno do Personal', coachId: 'cp', createdAt: T('2026-01-01T12:00:00Z'), active: true, accountStatus: 'ACTIVE', dietModule: true, pushToken: null, phone: '(11) 97777-6666', nextCheckInDate: T('2026-10-20T12:00:00Z'), disableCheckIn: false },
    { id: 'sm', role: 'USER', name: 'Aluno do Paulo', coachId: PAULO_ID, createdAt: T('2026-01-01T12:00:00Z'), active: true, accountStatus: 'ACTIVE', dietModule: false, pushToken: null, nextCheckInDate: T('2026-10-20T12:00:00Z'), disableCheckIn: false },
  );
  db.checkins.push({ userId: 'sp', date: T('2026-09-20T12:00:00Z') }, { userId: 'sm', date: T('2026-09-20T12:00:00Z') });
  assert.equal(await ACC.feedbackAiAllowed(prisma, PAULO_ID), true, 'coach master'); assert.equal(await ACC.feedbackAiAllowed(prisma, 'c1'), true, 'plano Elite'); assert.equal(await ACC.feedbackAiAllowed(prisma, 'cp'), false, 'Personal'); assert.equal(await ACC.feedbackAiAllowed(prisma, 'cn'), false, 'Nutricionista');
  assert.equal(await ACC.feedbackAiAllowed(prisma, 'ce2'), false, 'Elite com conta pausada'); assert.equal(await ACC.feedbackAiAllowed(prisma, 'nao-existe'), false); assert.equal(await ACC.feedbackAiAllowed(prisma, null), false);
  assert.deepEqual(await ACC.feedbackAiOptions(prisma, 'c1', { timeoutMs: 1 }), { timeoutMs: 1 }); assert.equal(await ACC.feedbackAiOptions(prisma, 'cp', { timeoutMs: 1 }), false);
  // guarda por 1 min: mudar o plano no banco só vale depois (e reiniciar zera)
  db.users.find((u: any) => u.id === 'cp').coachPlan = 'ELITE'; assert.equal(await ACC.feedbackAiAllowed(prisma, 'cp'), false, 'ainda guardado'); ACC.resetFeedbackAiCache(); assert.equal(await ACC.feedbackAiAllowed(prisma, 'cp'), true, 'depois do prazo vale o novo plano'); db.users.find((u: any) => u.id === 'cp').coachPlan = 'PERSONAL'; ACC.resetFeedbackAiCache();
  // nas rotas: aluno de coach Personal recebe regras (sem chamar a IA); de coach Elite e do master, a IA
  process.env.ANTHROPIC_API_KEY = 'k'; let llm = 0; (globalThis as any).__LLM = async () => { llm++; return { content: [{ type: 'text', text: JSON.stringify({ intro: 'Oi! Vamos conversar sobre a semana? 💜', rewrites: [], follow_ups: [] }) }] }; };
  db.wq.length = 0; let rp = await call(userGET, '/api/user/weekly-feedback?userId=sp', 'sp'); assert.equal(rp.status, 200, JSON.stringify(rp.json)); assert.equal(rp.json.due, true); assert.equal(llm, 0, 'coach Personal: nenhuma chamada de IA'); assert.equal(rp.json.intro, null); assert.equal(db.wq.find((x: any) => x.userId === 'sp').source, 'RULES');
  assert.ok(rp.json.questions.some((q: any) => q.id === 'diet_issue'), 'as perguntas por dados continuam (são código, não IA)');
  rp = await call(userGET, '/api/user/weekly-feedback?userId=sm', 'sm'); assert.equal(llm, 1, 'coach master: IA'); assert.equal(rp.json.intro, 'Oi! Vamos conversar sobre a semana? 💜'); assert.equal(db.wq.find((x: any) => x.userId === 'sm').source, 'AI');
  db.wq.length = 0; llm = 0; rp = await call(userGET, '/api/user/weekly-feedback?userId=a1', 'a1'); assert.equal(llm, 1, 'coach Elite: IA'); assert.equal(db.wq.find((x: any) => x.userId === 'a1').source, 'AI');
  // reforço pelo WhatsApp e cron seguem a mesma regra
  db.wq.length = 0; llm = 0; const wr = await call(waPOST, '/x', 'cp', 'COACH', { studentId: 'sp' }); assert.equal(wr.status, 200, JSON.stringify(wr.json)); assert.equal(llm, 0, 'WhatsApp: coach Personal sem IA'); assert.equal(db.wq.find((x: any) => x.userId === 'sp').source, 'RULES');
  db.wq.length = 0; llm = 0; process.env.CRON_SECRET = 's3'; const crr = await cronPOST(new Request('http://x/api/cron/weekly-feedback?task=students', { method: 'POST', headers: { authorization: 'Bearer s3' } })); const crj: any = await crr.json(); assert.equal(crr.status, 200, JSON.stringify(crj));
  const srcOf = (id: string) => db.wq.find((x: any) => x.userId === id)?.source; assert.equal(srcOf('sp'), 'RULES', 'cron: aluno de coach Personal por regras'); assert.equal(srcOf('sm'), 'AI', 'cron: aluno do master com IA'); assert.equal(srcOf('a1'), 'AI', 'cron: aluno de coach Elite com IA'); assert.equal(crj.prepared.rules >= 1 && crj.prepared.ai >= 2, true, JSON.stringify(crj.prepared));
  delete process.env.ANTHROPIC_API_KEY; delete (globalThis as any).__LLM; db.wq.length = 0;
  // ── temas da anamnese ──
  assert.deepEqual(F.eligibleTopics({ stressLevel: 4, stressEating: true, nightBinge: 'never', pmsSymptoms: ['Inchaço / Retenção'], waterIntake: 'Menos de 1L' }), ['stress', 'eating', 'cycle', 'water']);
  assert.deepEqual(F.eligibleTopics({ stressLevel: '5' }), ['stress'], 'estresse 5 (texto) conta'); assert.deepEqual(F.eligibleTopics({ stressLevel: 3, stressEating: false, nightBinge: 'rarely', pmsSymptoms: ['Sem Sintomas Significativos'], waterIntake: '2 a 2,5L' }), [], 'nada elegível');
  assert.deepEqual(F.eligibleTopics({ nightBinge: 'often' }), ['eating']); assert.deepEqual(F.eligibleTopics({ waterIntake: '1 a 1,5L' }), ['water']); assert.deepEqual(F.eligibleTopics({ pmsSymptoms: [] }), []); assert.deepEqual(F.eligibleTopics(null), []);
  // rodízio: cada tema a cada 2 semanas, máx. 2 por semana, determinístico
  const all = ['stress', 'eating', 'cycle', 'water']; const wk = (n: number) => W.addDays('2026-09-28', 7 * n);
  const week0 = Q.topicsForWeek(wk(0), all), week1 = Q.topicsForWeek(wk(1), all), week2 = Q.topicsForWeek(wk(2), all);
  assert.equal(week0.length, 2); assert.equal(week1.length, 2); assert.deepEqual([...week0, ...week1].sort(), [...all].sort(), 'em 2 semanas passam todos'); assert.deepEqual(week0, week2, 'a cada 2 semanas o mesmo tema volta'); assert.deepEqual(Q.topicsForWeek(wk(0), all), week0, 'determinístico');
  assert.deepEqual(Q.topicsForWeek(wk(0), []), []); assert.equal(Q.topicsForWeek(wk(0), ['stress']).length + Q.topicsForWeek(wk(1), ['stress']).length, 1, 'tema sozinho: 1 vez a cada 2 semanas');
  // nas perguntas: entram antes da nota final, respeitam o teto de extras e validam
  const withTopics = (extra: Partial<F.FactsInput> = {}, w = WS) => Q.buildWeeklyQuestions({ facts: F.computeFacts(base({ weekStart: w, anamnese: { stressLevel: 5, stressEating: true, pmsSymptoms: ['Irritabilidade'], waterIntake: 'Menos de 1L' }, ...extra })) });
  const tw = [withTopics(), withTopics({}, wk(1))]; for (const q of tw) { const tid = ids(q).filter((x) => x.startsWith('topic_')); assert.equal(tid.length, 2, ids(q).join()); assert.equal(ids(q)[ids(q).length - 1], 'effort'); assert.ok(ids(q).indexOf(tid[0]) < ids(q).indexOf('effort')); }
  assert.deepEqual([...ids(tw[0]), ...ids(tw[1])].filter((x) => x.startsWith('topic_')).sort(), ['topic_cycle', 'topic_eating', 'topic_stress', 'topic_water'], 'os 4 temas se alternam');
  const crowded = withTopics({ limitations: ['Joelho'], sleepQuality: 'Ruim', diet: { enabled: true, mealLogs: [], daily: [] } }); const extras = ids(crowded).filter((x) => ['limitation', 'diet', 'diet_issue', 'sleep'].includes(x) || x.startsWith('topic_')); assert.equal(extras.length, 5, 'teto de 5 extras: ' + extras.join()); assert.equal(ids(crowded).filter((x) => x.startsWith('topic_')).length, 1, 'sobrou 1 vaga pros temas');
  const tq = tw[0].find((q) => q.id.startsWith('topic_'))!; assert.equal(tq.kind, 'choice'); assert.ok(tq.options!.length >= 3);
  const valid = W.validateAnswers(tw[0], Object.fromEntries(tw[0].map((q) => [q.id, q.kind === 'scale' ? 7 : q.kind === 'choice' ? q.options![0].value : undefined]).filter(([, v]) => v !== undefined))); assert.equal((valid as any).ok, true, JSON.stringify(valid));
  assert.deepEqual(ids(Q.buildWeeklyQuestions({ facts: F.computeFacts(base({ anamnese: null })) })), ids(Q.buildWeeklyQuestions({ facts: F.computeFacts(base()) })), 'sem anamnese: nada novo');
  // a IA não recebe os temas da anamnese (saúde)
  const cap: any[] = []; const spy = { messages: { create: async (params: any) => { cap.push(params); return { content: [{ type: 'text', text: JSON.stringify({ intro: '', rewrites: [], follow_ups: [] }) }] }; } } };
  const fx = F.computeFacts(base({ anamnese: { stressLevel: 5, pmsSymptoms: ['Irritabilidade'] }, limitations: ['Ombro'] })); await AI.refineWithAI({ name: 'Ana', facts: fx, questions: Q.buildWeeklyQuestions({ facts: fx }), options: { client: spy as any } });
  const sentFacts = JSON.parse(cap[0].messages[0].content).fatos; assert.deepEqual(sentFacts.profile, { limitations: ['Ombro'], poorSleep: false }, 'só limitações e sono vão pra IA'); assert.ok(!JSON.stringify(sentFacts).includes('topics') && !JSON.stringify(sentFacts).includes('stress'));
  console.log('OK  IA do feedback só pra coach master ou plano Elite (cache de 1 min; conta pausada não); parceiros por regras nas rotas, no WhatsApp e no cron; temas da anamnese em rodízio (estresse, comer por ansiedade, TPM, água) sem passar do teto de extras e sem ir pra IA');

  unfreeze();
  console.log('OK  painel do coach: "dados da semana" (treinos x plano, dieta, check-in) em cada aluno, plano ativo no lugar da anamnese, alerta de poucos treinos; continua sem a tabela nova\n\nTODOS OS TESTES DAS PERGUNTAS COM DADOS + IA PASSARAM');
})().catch((e) => { unfreeze(); console.error('FALHOU:', e.stack || e.message); process.exit(1); }).then(() => process.exit(process.exitCode || 0));
