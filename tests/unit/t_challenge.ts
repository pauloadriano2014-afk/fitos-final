import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as C from '/home/user/fitos-final/lib/challenge21';
import { loadChallenge } from '/home/user/fitos-final/lib/challenge21Data';
import { runChallengeMorning } from '/home/user/fitos-final/lib/challengeCron';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
import { GET as challengeGET } from '/home/user/fitos-final/app/api/challenge21/route';
import { POST as checkPOST } from '/home/user/fitos-final/app/api/challenge21/check/route';
import { GET as cronGET } from '/home/user/fitos-final/app/api/cron/weekly-feedback/route';

const db: any = (prisma as any).__db; const G: any = globalThis;
const P70 = { waterMl: 2500 };
const quiet = async <T,>(fn: () => Promise<T>) => { const w = console.warn, e = console.error; console.warn = console.error = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; } };
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, 'dev-only-troque-isso-configurando-JWT_SECRET-no-env');
const call = async (fn: any, as: string | null, role: string, { url = 'http://x/api/challenge21', method = 'GET', body }: any = {}) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + tok(as, role);
  const r = await fn(new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined })); let j: any = null; try { j = await r.json(); } catch {} return { status: r.status, json: j };
};

(async () => {
  // ═════ 1) datas (dia de Brasília) ═════
  assert.equal(C.brtDate(new Date('2026-10-15T02:59:59Z')), '2026-10-14', '23h59 de Brasília ainda é o dia 14'); assert.equal(C.brtDate(new Date('2026-10-15T03:00:00Z')), '2026-10-15', 'meia-noite de Brasília vira o dia 15');
  assert.equal(C.brtDate(Date.parse('2026-01-01T00:00:00Z')), '2025-12-31'); assert.equal(C.brtDate(new Date('2026-12-31T23:59:59Z')), '2026-12-31');
  assert.equal(C.addDays('2026-10-30', 3), '2026-11-02'); assert.equal(C.addDays('2026-12-30', 3), '2027-01-02'); assert.equal(C.addDays('2028-02-28', 1), '2028-02-29', 'ano bissexto'); assert.equal(C.addDays('2026-10-15', -15), '2026-09-30'); assert.equal(C.addDays('2026-10-15', 0), '2026-10-15');
  assert.equal(C.diffDays('2026-10-01', '2026-10-15'), 14); assert.equal(C.diffDays('2026-10-15', '2026-10-01'), -14); assert.equal(C.diffDays('2026-12-25', '2027-01-05'), 11); assert.equal(C.diffDays('2026-03-01', '2026-03-01'), 0);
  for (const ok of ['2026-10-15', '2028-02-29']) assert.equal(C.isDate(ok), true, ok); for (const bad of ['2026-13-01', '2026-02-30x', '15/10/2026', '', null, undefined, 20261015, '2026-1-5']) assert.equal(C.isDate(bad as any), false, String(bad));
  const [r0, r1] = C.brtDayRange('2026-10-15'); assert.equal(r0.toISOString(), '2026-10-15T03:00:00.000Z'); assert.equal(r1.toISOString(), '2026-10-16T03:00:00.000Z');
  assert.equal(C.dayIndexOf('2026-10-10', '2026-10-09'), 0, 'antes do início'); assert.equal(C.dayIndexOf('2026-10-10', '2026-10-10'), 1); assert.equal(C.dayIndexOf('2026-10-10', '2026-10-30'), 21); assert.equal(C.dayIndexOf('2026-10-10', '2026-10-31'), 22, 'depois do dia 21'); assert.equal(C.dayIndexOf('2026-10-10', '2027-05-01'), 22);
  for (const [d, w] of [[1, 1], [7, 1], [8, 2], [14, 2], [15, 3], [21, 3]] as const) assert.equal(C.weekOf(d), w, 'dia ' + d);

  // ═════ 2) os 21 desafios e as missões ═════
  assert.equal(C.DAILY_CHALLENGES.length, 21); assert.equal(new Set(C.DAILY_CHALLENGES.map((c) => c.title)).size, 21, 'um desafio diferente por dia'); assert.ok(C.DAILY_CHALLENGES.every((c) => c.title.length > 3 && c.hint.length > 20));
  assert.ok(C.DAILY_CHALLENGES[0].title.includes('partida') && C.DAILY_CHALLENGES[20].hint.includes('check-in'), 'primeiro e último dia têm o papel certo'); for (const d of [8, 15]) assert.ok(/Pese|pese/.test(C.DAILY_CHALLENGES[d - 1].hint), `dia ${d}: pesagem`);
  assert.equal(C.challengeOf(0).title, C.DAILY_CHALLENGES[0].title); assert.equal(C.challengeOf(99).title, C.DAILY_CHALLENGES[20].title); assert.equal(C.challengeOf(5).title, C.DAILY_CHALLENGES[4].title);
  assert.ok(!C.DAILY_CHALLENGES.some((c) => /jejum prolongado|laxante|diurético|sauna|suplemento/i.test(c.title + c.hint)), 'nada de promessa perigosa');
  assert.equal(C.waterTargetMl(60), 2000); assert.equal(C.waterTargetMl(70), 2500); assert.equal(C.waterTargetMl(80), 2750); assert.equal(C.waterTargetMl(120), 4000, 'teto de 4 L'); assert.equal(C.waterTargetMl(40), 2000, 'piso de 2 L'); assert.equal(C.waterTargetMl('72,5'), 2500); assert.equal(C.waterTargetMl(undefined), 2500); assert.equal(C.waterTargetMl(0), 2500); assert.equal(C.waterTargetMl('abc'), 2500); assert.equal(C.waterTargetMl(null), 2500);
  const m1 = C.missionsFor(1, P70), m8 = C.missionsFor(8, P70), m15 = C.missionsFor(15, P70);
  assert.deepEqual(m1.map((m) => m.id), ['agua', 'dieta', 'movimento', 'sono', 'desafio', 'treino']); assert.deepEqual(m8.map((m) => m.id), ['agua', 'dieta', 'movimento', 'sono', 'acucar', 'desafio', 'treino']); assert.deepEqual(m15.map((m) => m.id), ['agua', 'dieta', 'movimento', 'sono', 'acucar', 'proteina', 'desafio', 'treino']);
  assert.deepEqual([m1, m8, m15].map((l) => l.filter((m) => m.required).length), [5, 6, 7], 'uma missão nova por semana'); assert.ok(m1.every((m) => m.id !== 'treino' || !m.required), 'treino é bônus');
  assert.ok(m1[0].label.includes('2,5 L') && C.missionsFor(1, { waterMl: 2000 })[0].label.includes('2 L') && C.missionsFor(1, { waterMl: 2750 })[0].label.includes('2,8 L'), 'meta de água no texto');
  assert.ok(m1[2].label.includes('6.000') && m8[2].label.includes('8.000') && m15[2].label.includes('10.000'), 'passos sobem por semana'); assert.ok(m1[2].hint!.includes('30 minutos') && m15[2].hint!.includes('45 minutos'));
  assert.ok(m1.find((m) => m.id === 'desafio')!.label.includes(C.DAILY_CHALLENGES[0].title) && C.missionsFor(9, P70).find((m) => m.id === 'desafio')!.label.includes(C.DAILY_CHALLENGES[8].title));
  assert.ok(m1.find((m) => m.id === 'desafio')!.points === 20 && m1.find((m) => m.id === 'treino')!.points === 30 && m1.find((m) => m.id === 'agua')!.points === 10);
  assert.deepEqual(m1.filter((m) => m.autoCapable).map((m) => m.id), ['agua', 'dieta', 'treino']); assert.equal(m1.find((m) => m.id === 'treino')!.manualAllowed, false, 'treino não se marca à mão'); assert.ok(m1.filter((m) => m.id !== 'treino').every((m) => m.manualAllowed));

  // ═════ 3) o que está feito (à mão ou sozinho) e a nota do dia ═════
  const rd = (manual: string[], auto: any = {}, day = 1) => C.resolveDay(day, P70, manual, auto);
  const by = (l: any[], id: string) => l.find((m) => m.id === id);
  assert.equal(by(rd([]), 'agua').done, false); assert.equal(by(rd([], { waterMl: 2499 }), 'agua').done, false, 'um ml a menos não conta'); assert.equal(by(rd([], { waterMl: 2500 }), 'agua').done, true); assert.equal(by(rd([], { waterMl: 2500 }), 'agua').auto, true); assert.equal(by(rd([], { waterMl: 9000 }), 'agua').done, true);
  assert.equal(by(rd(['agua']), 'agua').done, true); assert.equal(by(rd(['agua']), 'agua').auto, false, 'marcou à mão: não é automática');
  for (const [v, ok] of [['SIM', true], ['sim', true], ['PARCIAL', false], ['NAO', false], [null, false], [undefined, false], ['', false]] as const) assert.equal(by(rd([], { dietAdherence: v as any }), 'dieta').done, ok, String(v));
  assert.equal(by(rd([], { workout: true }), 'treino').done, true); assert.equal(by(rd([], { workout: true }), 'treino').auto, true); assert.equal(by(rd(['treino']), 'treino').done, false, 'marcar treino à mão não vale'); assert.equal(by(rd([]), 'treino').done, false);
  assert.equal(by(rd(['nao-existe', 'sono']), 'sono').done, true); assert.equal(rd(['nao-existe']).filter((m) => m.done).length, 0, 'id desconhecido é ignorado'); assert.equal(by(rd(['acucar']), 'acucar'), undefined, 'missão da semana 2 não existe no dia 1');
  const sc = (n: number, day = 1, extra: any[] = []) => C.scoreDay(C.resolveDay(day, P70, ['agua', 'dieta', 'movimento', 'sono', 'acucar', 'proteina', 'desafio'].filter((id) => by(C.missionsFor(day, P70), id)).slice(0, n).concat(extra), {}));
  let s = sc(0); assert.deepEqual([s.done, s.total, s.points, s.full, s.valid], [0, 5, 0, false, false]);
  s = sc(3); assert.deepEqual([s.done, s.valid], [3, false], '3 de 5 = 60%: não vale'); s = sc(4); assert.deepEqual([s.done, s.valid, s.full], [4, true, false], '4 de 5 = 80%: vale'); assert.equal(s.points, 40); // agua+dieta+movimento+sono
  s = sc(5); assert.deepEqual([s.full, s.points], [true, 10 + 10 + 10 + 10 + 20 + C.FULL_DAY_BONUS], 'dia cheio: soma + bônus de 10'); assert.equal(s.ratio, 1);
  s = C.scoreDay(C.resolveDay(1, P70, ['agua', 'dieta', 'movimento', 'sono', 'desafio'], { workout: true })); assert.equal(s.points, 60 + 10 + 30, 'treino soma 30 e não conta como obrigatória'); assert.equal(s.total, 5);
  s = C.scoreDay(C.resolveDay(1, P70, [], { workout: true })); assert.deepEqual([s.done, s.valid, s.points], [0, false, 30], 'só treinar não cumpre o dia');
  const w2 = (n: number) => C.scoreDay(C.resolveDay(8, P70, ['agua', 'dieta', 'movimento', 'sono', 'acucar', 'desafio'].slice(0, n), {})); assert.equal(w2(5).valid, true, '5 de 6 = 83%'); assert.equal(w2(4).valid, false, '4 de 6 = 67%'); assert.equal(w2(6).full, true);
  const w3 = (n: number) => C.scoreDay(C.resolveDay(15, P70, ['agua', 'dieta', 'movimento', 'sono', 'acucar', 'proteina', 'desafio'].slice(0, n), {})); assert.equal(w3(5).valid, true, '5 de 7 = 71%'); assert.equal(w3(4).valid, false, '4 de 7 = 57%'); assert.equal(w3(7).full, true);
  assert.deepEqual(C.scoreDay([]), { done: 0, total: 0, ratio: 0, points: 0, full: false, valid: false });

  // ═════ 4) resumo do desafio: calendário, sequência, pontos ═════
  const start = '2026-10-01'; const dayDate = (d: number) => C.addDays(start, d - 1);
  const ALL5 = ['agua', 'dieta', 'movimento', 'sono', 'desafio']; const ALL6 = [...ALL5, 'acucar'];
  const sum = (today: string, manual: Record<string, string[]> = {}, auto: Record<string, any> = {}) => C.summarize({ startDate: start, today, profile: P70, manualByDate: manual, autoByDate: auto, weeklyWorkouts: 4 });
  // dia 1 sem nada
  let S = sum(dayDate(1)); assert.equal(S.state, 'ACTIVE'); assert.equal(S.dayIndex, 1); assert.equal(S.streak, 0); assert.equal(S.points, 0); assert.equal(S.days.length, 21); assert.equal(S.days[0].status, 'TODAY'); assert.ok(S.days.slice(1).every((d) => d.status === 'FUTURE')); assert.equal(S.today!.dayIndex, 1); assert.equal(S.today!.missions.length, 6); assert.equal(S.week, 1); assert.equal(S.endDate, dayDate(21)); assert.equal(S.weeklyWorkoutsGoal, 4);
  // ontem: o app deixa ajustar (sono), então o resumo traz as missões de ontem; no dia 1 não existe ontem, depois do fim também não
  assert.equal(S.yesterday, null, 'dia 1: sem ontem'); S = sum(dayDate(2), { [dayDate(1)]: ['agua', 'dieta'] }, { [dayDate(1)]: { workout: true } }); assert.equal(S.yesterday!.date, dayDate(1)); assert.equal(S.yesterday!.dayIndex, 1); assert.equal(S.yesterday!.score.done, 2); assert.equal(S.yesterday!.missions.find((m: any) => m.id === 'agua')!.done, true); assert.equal(S.yesterday!.missions.find((m: any) => m.id === 'treino')!.auto, true); assert.equal(S.today!.dayIndex, 2);
  S = sum(dayDate(9), {}, {}); assert.equal(S.yesterday!.dayIndex, 8); assert.equal(S.yesterday!.missions.some((m: any) => m.id === 'acucar'), true, 'ontem (dia 8) já tinha a missão da semana 2'); S = sum(dayDate(8), {}, {}); assert.equal(S.yesterday!.missions.some((m: any) => m.id === 'acucar'), false, 'ontem (dia 7) ainda não tinha');
  assert.equal(sum(C.addDays(start, 21), {}, {}).yesterday, null, 'depois do desafio não há o que ajustar'); assert.equal(sum(C.addDays(start, -2), {}, {}).yesterday, null, 'antes de começar também não');
  // dia 10: histórico variado
  const manual: Record<string, string[]> = {
    [dayDate(1)]: ALL5, [dayDate(2)]: ALL5, [dayDate(3)]: ['agua', 'dieta', 'movimento', 'sono'], [dayDate(4)]: ['agua'], [dayDate(5)]: [],
    [dayDate(6)]: ALL5, [dayDate(7)]: ALL5, [dayDate(8)]: ALL6, [dayDate(9)]: ['agua', 'dieta', 'movimento', 'sono', 'acucar'], [dayDate(10)]: ['agua', 'dieta'],
  };
  const auto: Record<string, any> = { [dayDate(1)]: { workout: true }, [dayDate(6)]: { workout: true }, [dayDate(8)]: { workout: true }, [dayDate(9)]: { workout: true }, [dayDate(10)]: { workout: true } };
  S = sum(dayDate(10), manual, auto);
  assert.deepEqual(S.days.slice(0, 10).map((d) => d.status), ['FULL', 'FULL', 'VALID', 'PARTIAL', 'MISSED', 'FULL', 'FULL', 'FULL', 'VALID', 'TODAY']);
  assert.equal(S.validDays, 7, 'dias 1,2,3,6,7,8,9 cumpridos (o dia 10 em andamento tem 2 de 6)');
  assert.equal(S.fullDays, 5, 'dias cheios: 1, 2, 6, 7 e 8'); assert.equal(S.bestStreak, 4, 'melhor sequência: dias 6 a 9 (a dos dias 1 a 3 foi de 3)');
  assert.equal(S.streak, 4, 'dias 6,7,8,9 seguidos; hoje em andamento não quebra');
  assert.equal(S.points, S.days.reduce((a, d) => a + d.points, 0), 'pontos = soma dos dias'); assert.equal(S.week, 2); assert.equal(S.weekTheme.title, 'SEMANA 2 · CONSTÂNCIA'); assert.equal(S.today!.missions.length, 7);
  assert.deepEqual(S.milestones.map((m) => m.reached), [true, false, false], '7 dias cumpridos alcançado'); assert.equal(S.workoutsThisWeek, 3, 'treinos na semana 2 (dias 8,9,10)');
  // a melhor sequência pode ter ficado para trás: 5 cumpridos, 1 perdido, 1 cumprido, hoje em andamento
  const mBest: Record<string, string[]> = {}; for (const dd of [1, 2, 3, 4, 5, 7]) mBest[dayDate(dd)] = ALL5;
  S = sum(dayDate(8), mBest, {}); assert.equal(S.bestStreak, 5, 'a melhor sequência foi a de 5 dias'); assert.equal(S.streak, 1, 'a atual é só o dia 7 (o dia 6 foi perdido)'); assert.equal(S.validDays, 6);
  // hoje já cumprido entra na sequência
  S = sum(dayDate(10), { ...manual, [dayDate(10)]: ALL6 }, auto); assert.equal(S.streak, 5, 'hoje cumprido soma na sequência'); assert.equal(S.days[9].status, 'TODAY');
  // dia passado perdido zera
  assert.equal(sum(dayDate(6), manual, auto).streak, 1, 'dia 5 foi perdido (zera); dia 6 cumprido recomeça em 1'); assert.equal(sum(dayDate(5), manual, auto).streak, 0, 'dia 5 vazio e em andamento, dia 4 falhou');
  assert.equal(sum(dayDate(4), manual, auto).streak, 3, 'dias 1,2,3 cumpridos; hoje (4) em andamento não quebra'); assert.equal(sum(dayDate(7), manual, auto).streak, 2);
  // ainda não começou
  S = sum(C.addDays(start, -3)); assert.equal(S.state, 'WAITING'); assert.equal(S.dayIndex, 0); assert.equal(S.daysToStart, 3); assert.equal(S.today, null); assert.ok(S.days.every((d) => d.status === 'FUTURE')); assert.equal(S.points, 0);
  // terminou
  const fullAll: Record<string, string[]> = {}; for (let d = 1; d <= 21; d++) fullAll[dayDate(d)] = C.missionsFor(d, P70).filter((m) => m.required).map((m) => m.id);
  S = sum(C.addDays(start, 25), fullAll, {}); assert.equal(S.state, 'FINISHED'); assert.equal(S.dayIndex, 22); assert.equal(S.today, null); assert.equal(S.days.length, 21); assert.ok(S.days.every((d) => d.status === 'FULL')); assert.equal(S.validDays, 21); assert.equal(S.streak, 21); assert.equal(S.bestStreak, 21); assert.deepEqual(S.milestones.map((m) => m.reached), [true, true, true]); assert.equal(S.fullDays, 21);
  S = sum(C.addDays(start, 25), {}, {}); assert.equal(S.streak, 0); assert.ok(S.days.every((d) => d.status === 'MISSED')); assert.equal(S.validDays, 0);
  S = sum(dayDate(21), fullAll, {}); assert.equal(S.state, 'ACTIVE'); assert.equal(S.dayIndex, 21); assert.equal(S.week, 3); assert.equal(S.streak, 21); assert.equal(S.days[20].status, 'TODAY'); assert.equal(S.today!.missions.length, 8);
  // treino fora do período não entra na semana
  S = sum(dayDate(3), {}, { [dayDate(5)]: { workout: true } }); assert.equal(S.workoutsThisWeek, 0, 'treino de um dia que ainda não chegou não conta');
  // pontos: treino e bônus
  S = sum(dayDate(1), { [dayDate(1)]: ALL5 }, { [dayDate(1)]: { workout: true } }); assert.equal(S.points, 60 + 10 + 30);
  assert.ok(C.canToggle(5, P70, 'agua') && C.canToggle(5, P70, 'desafio') && !C.canToggle(5, P70, 'treino') && !C.canToggle(5, P70, 'nada') && !C.canToggle(0, P70, 'agua') && !C.canToggle(22, P70, 'agua') && !C.canToggle(5, P70, 'proteina') && C.canToggle(15, P70, 'proteina'), 'quais missões se marcam à mão');
  assert.deepEqual(C.editableDates('2026-10-15'), ['2026-10-15', '2026-10-14']);

  // ═════ 5) quando começa o desafio ═════
  const wkt = (o: any = {}) => ({ name: 'DESAFIO 21 DIAS', createdAt: '2026-10-01T15:00:00Z', startDate: '2026-10-01T15:00:00Z', archived: false, exerciseCount: 12, ...o });
  assert.equal(C.challengeStartDate([wkt()]), '2026-10-01'); assert.equal(C.challengeStartDate([wkt({ startDate: '2026-10-02T02:00:00Z' })]), '2026-10-01', 'meia-noite UTC ainda é dia 1 em Brasília'); assert.equal(C.challengeStartDate([wkt({ startDate: '2026-10-02T03:30:00Z' })]), '2026-10-02');
  assert.equal(C.challengeStartDate([]), null); assert.equal(C.challengeStartDate(undefined as any), null); assert.equal(C.challengeStartDate([wkt({ name: 'DESAFIO EM CONSTRUÇÃO 🚧' })]), null, 'o "em construção" não começa o desafio'); assert.equal(C.challengeStartDate([wkt({ archived: true })]), null); assert.equal(C.challengeStartDate([wkt({ exerciseCount: 0 })]), null, 'treino sem exercícios não conta');
  assert.equal(C.challengeStartDate([wkt({ name: 'FICHA EM CONSTRUCAO' }), wkt({ createdAt: '2026-10-03T12:00:00Z', startDate: '2026-10-03T12:00:00Z' })]), '2026-10-03', 'vale o treino de verdade que entrou depois do em construção');
  assert.equal(C.challengeStartDate([wkt({ createdAt: '2026-09-20T12:00:00Z', startDate: '2026-09-20T12:00:00Z' }), wkt()]), '2026-10-01', 'treino antigo (outro ciclo) não puxa o início');
  assert.equal(C.challengeStartDate([wkt({ createdAt: '2026-10-01T15:00:05Z', startDate: '2026-10-29T15:00:00Z' }), wkt()]), '2026-10-01', 'fases criadas juntas: vale a primeira');
  assert.equal(C.challengeStartDate([wkt({ createdAt: null })]), '2026-10-01', 'sem createdAt: o único treino ainda vale'); assert.equal(C.challengeStartDate([wkt({ startDate: null })]), '2026-10-01', 'sem data de início: dia em que foi criado'); assert.equal(C.challengeStartDate([wkt({ startDate: null, createdAt: null })]), null);
  // ═════ 6) lembretes ═════
  assert.deepEqual(C.reminderText(1, 'morning'), { title: '🔥 Dia 1 de 21', body: `Desafio de hoje: ${C.DAILY_CHALLENGES[0].title}. Abra o app e confira suas missões.` }); assert.ok(C.reminderText(21, 'morning')!.title.includes('Último dia') && C.reminderText(21, 'morning')!.body.includes('check-in'));
  assert.equal(C.reminderText(0, 'morning'), null); assert.equal(C.reminderText(22, 'morning'), null); assert.equal(C.reminderText(5, 'evening', 0), null); assert.ok(C.reminderText(5, 'evening', 1)!.title.includes('1 missão ') || C.reminderText(5, 'evening', 1)!.title.endsWith('1 missão hoje')); assert.ok(C.reminderText(5, 'evening', 3)!.title.includes('3 missões'));
  console.log('OK  regras do desafio de 21 dias: datas, 21 desafios, missões por semana, nota do dia, sequência, pontos, início e lembretes');

  // ═════ 7) carregador (junta o que o aluno marcou com o que o app registrou) ═════
  const BRT = (d: Date) => C.brtDate(d); const now0 = new Date(); const todayBRT = BRT(now0);
  const seed = (plan = 'CHALLENGE_21', startOffset = 3, peso = 80) => {
    for (const k of Object.keys(db)) db[k].length = 0; G.__pushes = [];
    const startAt = new Date(now0.getTime() - startOffset * 86400000);
    db.user.push({ id: PAULO_ID, role: 'ADMIN', email: 'p@x.com' }, { id: 'ch', role: 'USER', plan, coachId: PAULO_ID, name: 'Bia', pushToken: 'ExponentPushToken[abc]', active: true }, { id: 'out', role: 'USER', plan, coachId: 'outro', name: 'Outra' }, { id: 'el', role: 'USER', plan: 'ELITE', coachId: PAULO_ID, name: 'Elite' });
    db.anamnese.push({ id: 'a1', userId: 'ch', peso, frequencia: 4, createdAt: new Date() });
    db.workout.push({ id: 'w1', userId: 'ch', name: 'DESAFIO 21 DIAS', archived: false, createdAt: startAt, startDate: startAt });
    // a semana do desafio: 4 abas de musculação (A-D) e 2 só de cardio (E-F)
    for (const [id, cat] of [['s1', 'Musculação'], ['s2', 'Musculação'], ['s3', 'Musculação'], ['s4', 'Musculação'], ['c1', 'Cardio'], ['c2', 'Cardio']]) db.exercise.push({ id, category: cat, tags: {} });
    ([['A', 's1'], ['A', 'c1'], ['B', 's2'], ['B', 'c1'], ['C', 's3'], ['C', 'c1'], ['D', 's4'], ['D', 'c2'], ['E', 'c1'], ['E', 'c2'], ['F', 'c2']] as const).forEach(([day, ex], i) => db.workoutExercise.push({ id: 'e' + i, workoutId: 'w1', day, exerciseId: ex, order: i }));
    return startAt;
  };
  let L: any = await loadChallenge(prisma, 'fantasma'); assert.deepEqual(L, { enabled: false, reason: 'PLANO' });
  seed('ELITE'); L = await loadChallenge(prisma, 'ch'); assert.equal(L.enabled, false, 'outro plano não tem desafio');
  seed(); db.workout.length = 0; L = await loadChallenge(prisma, 'ch'); assert.deepEqual(L, { enabled: true, state: 'PREPARING' }, 'sem treino ainda: preparando');
  seed(); db.workout[0].name = 'DESAFIO EM CONSTRUÇÃO 🚧'; L = await loadChallenge(prisma, 'ch'); assert.equal(L.state, 'PREPARING', 'só o "em construção": preparando'); seed(); db.workoutExercise.length = 0; assert.equal((await loadChallenge(prisma, 'ch')).state, 'PREPARING', 'treino vazio: preparando');
  let startAt = seed('CHALLENGE_21', 3, 80); L = await loadChallenge(prisma, 'ch'); assert.equal(L.state, 'ACTIVE'); assert.equal(L.summary.dayIndex, 4); assert.equal(L.summary.startDate, BRT(startAt)); assert.equal(L.waterMl, 2750, 'meta de água pelo peso da anamnese (80 kg)'); assert.equal(L.summary.weeklyWorkoutsGoal, 6, '4 treinos + 2 dias de cardio por semana');
  assert.equal(L.summary.today.date, todayBRT); assert.equal(L.summary.today.missions.find((m: any) => m.id === 'agua').label.includes('2,8 L'), true);
  // sinais automáticos
  const d = (n: number) => C.addDays(BRT(startAt), n - 1);
  db.dailyCheckin.push({ studentId: 'ch', date: d(2), water_ml: 2750, dietAdherence: 'SIM' }, { studentId: 'ch', date: d(3), water_ml: 1000, dietAdherence: 'PARCIAL' }, { studentId: 'outro', date: d(3), water_ml: 9999, dietAdherence: 'SIM' });
  const at = (day: string, h: number, m = 0) => new Date(C.brtDayRange(day)[0].getTime() + (h * 60 + m) * 60000);
  db.workoutHistory.push({ userId: 'ch', date: at(d(1), 23, 30) }, { userId: 'ch', date: at(d(3), 0, 30) }, { userId: 'outro', date: at(d(2), 10) });
  db.challengeCheckin.push({ userId: 'ch', date: d(2), done: ['movimento'] }, { userId: 'outro', date: d(2), done: ['sono', 'desafio', 'agua'] }, { userId: 'outro', date: d(3), done: ['sono', 'desafio'] });
  L = await loadChallenge(prisma, 'ch'); const day = (n: number) => L.summary.days[n - 1];
  assert.equal(day(2).done, 3, 'dia 2: água e dieta sozinhas + movimento à mão (marcações de outro aluno não entram)'); assert.equal(day(3).done, 1, 'dia 3 (cardio): 1 litro e "parcial" não contam; só o cardio do dia, que veio do treino finalizado'); assert.equal(day(3).total, 6, 'dia de cardio tem 6 missões obrigatórias (as 5 de sempre + o cardio)'); assert.equal(day(1).points, 30, 'dia 1: treino às 23h30 de Brasília conta no dia 1'); assert.equal(day(3).points, 30, 'dia 3: treino às 0h30 de Brasília conta no dia 3, não no 2');
  assert.equal(day(2).points, 10 + 10 + 10, 'dia 2 não pegou o treino do dia 3 nem dados de outro aluno');
  assert.equal(L.summary.workoutsThisWeek, 2); assert.equal(L.summary.state, 'ACTIVE');
  // aguardando / terminado
  seed('CHALLENGE_21', -2); L = await loadChallenge(prisma, 'ch'); assert.equal(L.state, 'WAITING'); assert.equal(L.summary.daysToStart, 2); seed('CHALLENGE_21', 30); L = await loadChallenge(prisma, 'ch'); assert.equal(L.state, 'FINISHED'); assert.equal(L.summary.today, null);
  // data dentro de 2 fases: início na primeira
  seed('CHALLENGE_21', 5); db.workout.push({ id: 'w2', userId: 'ch', name: 'F2', archived: false, createdAt: new Date(db.workout[0].createdAt.getTime() + 5000), startDate: new Date(now0.getTime() + 20 * 86400000) }); db.workoutExercise.push({ id: 'e2', workoutId: 'w2', exerciseId: 's1', day: 'A' }); L = await loadChallenge(prisma, 'ch'); assert.equal(L.summary.dayIndex, 6, 'início na primeira fase, não na segunda');
  console.log('OK  carregador: junta marcação manual com treino, água e dieta do app, por dia de Brasília e só do aluno certo');

  // ═════ 8) rotas ═════
  startAt = seed('CHALLENGE_21', 3, 70); const url = (q = '') => ({ url: 'http://x/api/challenge21' + q, method: 'GET' });
  assert.equal((await call(challengeGET, null, 'USER', url())).status, 401); assert.equal((await call(challengeGET, 'el', 'USER', url('?userId=ch'))).status, 403, 'outro aluno'); assert.equal((await call(challengeGET, 'ch', 'USER', url('?userId=fantasma'))).status, 404);
  assert.equal((await call(challengeGET, 'parceiro', 'COACH', url('?userId=ch'))).status, 403, 'coach de outro time');
  let g = await call(challengeGET, 'ch', 'USER', url()); assert.equal(g.status, 200); assert.equal(g.json.state, 'ACTIVE'); assert.equal(g.json.summary.dayIndex, 4); assert.equal((await call(challengeGET, PAULO_ID, 'ADMIN', url('?userId=ch'))).json.summary.dayIndex, 4, 'coach master vê o aluno');
  assert.equal((await call(challengeGET, 'el', 'USER', url())).json.enabled, false);
  const check = (body: any, as = 'ch') => call(checkPOST, as, 'USER', { method: 'POST', url: 'http://x/api/challenge21/check', body });
  assert.equal((await call(checkPOST, null, 'USER', { method: 'POST', body: { missionId: 'agua', done: true } })).status, 401);
  let c = await check({ missionId: 'agua', done: true }); assert.equal(c.status, 200); assert.equal(c.json.summary.today.missions.find((m: any) => m.id === 'agua').done, true); assert.equal(db.challengeCheckin.length, 1); assert.deepEqual(db.challengeCheckin[0].done, ['agua']); assert.equal(db.challengeCheckin[0].date, todayBRT);
  c = await check({ missionId: 'agua', done: true }); assert.deepEqual(db.challengeCheckin[0].done, ['agua'], 'marcar de novo não duplica'); assert.equal(db.challengeCheckin.length, 1);
  c = await check({ missionId: 'sono', done: true }); assert.deepEqual(db.challengeCheckin[0].done, ['agua', 'sono']); assert.equal(c.json.summary.today.score.done, 2);
  c = await check({ missionId: 'agua', done: false }); assert.deepEqual(db.challengeCheckin[0].done, ['sono'], 'desmarcar tira só essa'); c = await check({ missionId: 'sono', done: false }); assert.deepEqual(db.challengeCheckin[0].done, []);
  const before = db.challengeCheckin.length; c = await check({ missionId: 'desafio', done: false }); assert.equal(c.status, 200); assert.equal(db.challengeCheckin.length, before, 'desmarcar o que nunca foi marcado não cria linha');
  c = await check({ missionId: 'sono', done: 'sim' }); assert.equal(c.status, 200); assert.deepEqual(db.challengeCheckin[0].done, [], 'só done=true de verdade marca (texto "sim" não)'); c = await check({ missionId: 'sono' }); assert.deepEqual(db.challengeCheckin[0].done, [], 'sem done: não marca');
  c = await check({ missionId: 'sono', done: true }); c = await check({ missionId: 'sono' }); assert.deepEqual(db.challengeCheckin[0].done, [], 'sem done desmarca');
  const yest = C.addDays(todayBRT, -1); c = await check({ missionId: 'sono', done: true, date: yest }); assert.equal(c.status, 200, 'ontem pode (o sono se sabe de manhã)'); assert.ok(db.challengeCheckin.some((r: any) => r.date === yest && r.done.includes('sono')));
  assert.equal((await check({ missionId: 'sono', done: true, date: C.addDays(todayBRT, -2) })).status, 400, 'anteontem não'); assert.equal((await check({ missionId: 'sono', done: true, date: C.addDays(todayBRT, 1) })).status, 400, 'amanhã não'); assert.equal((await check({ missionId: 'sono', done: true, date: 'ontem' })).status, 400); assert.equal((await check({ missionId: 'sono', done: true, date: '2026-13-45' })).status, 400);
  assert.equal((await check({ missionId: 'treino', done: true })).status, 400, 'treino não se marca à mão'); assert.equal((await check({ missionId: 'nada', done: true })).status, 400); assert.equal((await check({ missionId: 'proteina', done: true })).status, 400, 'missão da semana 3 no dia 4'); assert.equal((await check({ done: true })).status, 400);
  assert.equal((await check({ missionId: 'agua', done: true, userId: 'ch' }, 'el')).status, 403, 'não marca no desafio de outro aluno'); assert.equal((await check({ missionId: 'agua', done: true, userId: 'fantasma' })).status, 404); assert.equal((await check({ missionId: 'agua', done: true })).status, 200);
  const calls0 = db.challengeCheckin.length; assert.equal((await call(checkPOST, 'el', 'USER', { method: 'POST', body: { missionId: 'agua', done: true } })).status, 400, 'aluno de outro plano'); assert.equal(db.challengeCheckin.length, calls0);
  // desmarcar sem nunca ter marcado não cria linha vazia
  seed('CHALLENGE_21', 3); c = await check({ missionId: 'agua', done: false }); assert.equal(c.status, 200); assert.equal(db.challengeCheckin.length, 0, 'sem linha antes, sem linha depois');
  // a missão vale para o DIA marcado, não para hoje: no dia 8 a de açúcar existe hoje mas não existia ontem (dia 7)
  seed('CHALLENGE_21', 7); assert.equal((await check({ missionId: 'acucar', done: true, date: C.addDays(todayBRT, -1) })).status, 400, 'ontem (dia 7) não tinha a missão da semana 2'); assert.equal((await check({ missionId: 'acucar', done: true })).status, 200, 'hoje (dia 8) tem');
  seed('CHALLENGE_21', -2); assert.equal((await check({ missionId: 'agua', done: true })).status, 400, 'antes de começar'); seed(); db.workout.length = 0; assert.equal((await check({ missionId: 'agua', done: true })).status, 400, 'plano ainda sendo preparado');
  seed('CHALLENGE_21', 30); assert.equal((await check({ missionId: 'agua', done: true })).status, 400, 'depois dos 21 dias');
  // o sinal automático aparece pela rota
  startAt = seed('CHALLENGE_21', 0, 70); db.dailyCheckin.push({ studentId: 'ch', date: todayBRT, water_ml: 2500, dietAdherence: 'SIM' }); g = await call(challengeGET, 'ch', 'USER', url()); const tm = g.json.summary.today.missions; assert.equal(tm.find((m: any) => m.id === 'agua').auto, true); assert.equal(tm.find((m: any) => m.id === 'dieta').auto, true);
  // tabela ainda não criada (deploy antes do db push)
  const orig = (prisma as any).challengeCheckin.findMany; (prisma as any).challengeCheckin.findMany = async () => { throw Object.assign(new Error('The table `public.ChallengeCheckin` does not exist'), { code: 'P2021' }); };
  const miss = await quiet(() => call(challengeGET, 'ch', 'USER', url())); assert.equal(miss.status, 503); assert.ok(/db push/.test(miss.json.error));
  (prisma as any).challengeCheckin.findMany = async () => { throw Object.assign(new Error('relation missing'), { code: 'P2021' }); };
  assert.equal((await quiet(() => call(challengeGET, 'ch', 'USER', url()))).status, 503, 'só pelo código P2021'); (prisma as any).challengeCheckin.findMany = async () => { throw new Error('banco caiu'); };
  assert.equal((await quiet(() => call(challengeGET, 'ch', 'USER', url()))).status, 500, 'outro erro é 500, não 503'); (prisma as any).challengeCheckin.findMany = orig;
  console.log('OK  rotas do desafio: ler, marcar/desmarcar, só hoje e ontem, só manuais, acesso por aluno, tabela ausente');

  // ═════ 9) lembrete diário ═════
  seed(); const sent: any[] = []; const send = async (u: any, title: string, body: string, data: any) => { if (u.id === 'falha') throw new Error('push fora'); sent.push({ to: u.id, title, body, data }); };
  const mk = (id: string, daysAgo: number | null, extra: any = {}) => { db.user.push({ id, role: 'USER', plan: 'CHALLENGE_21', active: true, pushToken: 't', ...extra }); if (daysAgo !== null) { const s = new Date(now0.getTime() - daysAgo * 86400000); db.workout.push({ id: 'w-' + id, userId: id, name: 'DESAFIO 21 DIAS', archived: false, createdAt: s, startDate: s }); db.workoutExercise.push({ id: 'e-' + id, workoutId: 'w-' + id }); } };
  db.user.length = 0; db.workout.length = 0; db.workoutExercise.length = 0;
  mk('d1', 0); mk('d5', 4); mk('d21', 20); mk('d22', 21); mk('d40', 39); mk('semtreino', null); mk('falha', 2); mk('inativo', 3, { active: false }); db.user.push({ id: 'elite', role: 'USER', plan: 'ELITE', active: true }, { id: 'coach', role: 'ADMIN', plan: 'CHALLENGE_21', active: true }); db.workout.push({ id: 'ph', userId: 'semplaceholder', name: 'DESAFIO EM CONSTRUÇÃO 🚧', archived: false, createdAt: new Date(), startDate: new Date() }); db.user.push({ id: 'semplaceholder', role: 'USER', plan: 'CHALLENGE_21', active: true });
  const rep = await quiet(() => runChallengeMorning({ db: prisma, sendToUser: send, now: now0 }));
  assert.equal(rep.candidates, 8, 'só aluno ativo do plano do desafio (sem inativo, sem outro plano, sem coach)'); assert.equal(rep.sent, 3); assert.equal(rep.errors, 1); assert.equal(rep.skipped, 4, 'dia 22, dia 40, sem treino e treino em construção');
  assert.deepEqual(sent.map((s) => s.to).sort(), ['d1', 'd21', 'd5']); const m = Object.fromEntries(sent.map((s) => [s.to, s])); assert.equal(m.d1.title, '🔥 Dia 1 de 21'); assert.equal(m.d5.title, '🔥 Dia 5 de 21'); assert.ok(m.d5.body.includes(C.DAILY_CHALLENGES[4].title)); assert.ok(m.d21.title.includes('Último dia')); assert.equal(m.d1.data.type, 'challenge_daily');
  assert.deepEqual(await runChallengeMorning({ db: { user: { findMany: async () => [] } }, sendToUser: send }), { candidates: 0, sent: 0, skipped: 0, errors: 0 });
  // rota do cron
  process.env.CRON_SECRET = 'segredo'; const cron = (q: string, auth?: string) => cronGET(new Request('http://x/api/cron/weekly-feedback' + q, { headers: auth ? { authorization: 'Bearer ' + auth } : {} }));
  assert.equal((await cron('?task=challenge')).status, 401); assert.equal((await cron('?task=nada', 'segredo')).status, 400); assert.equal((await cron('?task=challenge', 'errado')).status, 401);
  seed(); db.user.length = 0; db.workout.length = 0; mk('c1', 2); G.__pushes = []; const cr = await quiet(() => cron('?task=challenge', 'segredo')); const cj: any = await cr.json(); assert.equal(cr.status, 200); assert.equal(cj.ok, true); assert.equal(cj.challenge.sent, 1); assert.equal(cj.challenge.candidates, 1); assert.equal(G.__pushes.length, 1); assert.equal(G.__pushes[0].data.type, 'challenge_daily'); assert.ok(G.__pushes[0].title.includes('Dia 3 de 21'));
  // modo auto (o agendamento diário que já existe): o lembrete do desafio vai junto, e não depende do feedback semanal dar certo
  const RealDate = Date; const nextWeekday = (wd: number) => { const d = new RealDate(); d.setUTCHours(15, 0, 0, 0); while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() + 1); return d.getTime(); };
  const withClock = async (fixed: number, fn: () => Promise<any>) => { class Fixed extends RealDate { constructor(...a: any[]) { if (a.length === 0) super(fixed); else super(...(a as [any])); } static now() { return fixed; } } (globalThis as any).Date = Fixed; try { return await fn(); } finally { (globalThis as any).Date = RealDate; } };
  const seedAt = (fixed: number) => { seed(); db.user.length = 0; db.workout.length = 0; db.workoutExercise.length = 0; db.user.push({ id: 'a1', role: 'USER', plan: 'CHALLENGE_21', active: true, pushToken: 't' }); const s = new RealDate(fixed - 4 * 86400000); db.workout.push({ id: 'wa1', userId: 'a1', name: 'DESAFIO 21 DIAS', archived: false, createdAt: s, startDate: s }); db.workoutExercise.push({ id: 'ea1', workoutId: 'wa1' }); G.__pushes = []; };
  const thu = nextWeekday(4); seedAt(thu);
  const ra = await withClock(thu, () => quiet(() => cron('?task=auto', 'segredo'))); const ja: any = await ra.json();
  assert.equal(ra.status, 200); assert.equal(ja.ok, true); assert.equal(ja.skipped, true, 'quinta: sem tarefa do feedback semanal'); assert.equal(ja.challenge.sent, 1, 'mas o lembrete do desafio sai'); assert.ok(G.__pushes[0].title.includes('Dia 5 de 21'), G.__pushes[0].title);
  const mon = nextWeekday(1); seedAt(mon); const origFM = (prisma as any).user.findMany; (prisma as any).user.findMany = async (a: any) => { if (!a?.where?.plan) throw new Error('feedback semanal fora do ar'); return origFM(a); };
  const rm = await withClock(mon, () => quiet(() => cron('?task=auto', 'segredo'))); (prisma as any).user.findMany = origFM;
  assert.ok(rm.status >= 500, 'segunda: o feedback semanal falhou (simulado)'); assert.equal(G.__pushes.filter((p: any) => p.data.type === 'challenge_daily').length, 1, 'e o lembrete do desafio saiu mesmo assim');
  seedAt(thu); const rs = await withClock(thu, () => quiet(() => cron('?task=students', 'segredo'))); assert.equal(G.__pushes.filter((p: any) => p.data.type === 'challenge_daily').length, 0, 'tarefas do feedback semanal não disparam o lembrete do desafio'); void rs;
  delete process.env.CRON_SECRET;
  console.log('OK  lembrete diário: dia certo para cada aluno, só alunos do desafio ativos no período, falha de um não derruba os outros, rota do cron');

  // ═════ 10) a semana do desafio: treino / cardio / descanso ═════
  { const T = (tab: string) => ({ type: 'TREINO', tab }), K = (tab: string) => ({ type: 'CARDIO', tab }), R = { type: 'DESCANSO' };
    assert.deepEqual(C.weekPattern(['A', 'B', 'C', 'D'], ['E', 'F']), [T('A'), T('B'), K('E'), T('C'), T('D'), K('F'), R], '4 treinos, 2 de cardio, 1 de descanso: a semana de 7 dias');
    assert.deepEqual(C.weekPattern(['A', 'B', 'C'], ['D', 'E']), [T('A'), T('B'), K('D'), T('C'), K('E'), R]); assert.deepEqual(C.weekPattern(['A', 'B', 'C', 'D', 'E', 'F'], []), [T('A'), T('B'), T('C'), T('D'), T('E'), T('F'), R]);
    assert.deepEqual(C.weekPattern(['A'], []), [T('A'), R]); assert.deepEqual(C.weekPattern([], ['E']), [K('E'), R]); assert.deepEqual(C.weekPattern([], []), [R]); assert.deepEqual(C.weekPattern(['A', 'B', 'C', 'D', 'E'], ['F', 'G', 'H']), [T('A'), T('B'), K('F'), T('C'), T('D'), K('G'), T('E'), K('H'), R], 'cardio sobrando entra depois de cada dupla');
    const WK = C.weekPattern(['A', 'B', 'C', 'D'], ['E', 'F']) as any[];
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 21].map((d) => C.patternDayOf(WK, d).type[0] + (C.patternDayOf(WK, d).tab || '')), ['TA', 'TB', 'CE', 'TC', 'TD', 'CF', 'D', 'TA', 'D', 'TA', 'D'], 'a semana repete'); assert.equal(C.patternDayOf(WK, 0).tab, 'A', 'dia 0 vira o primeiro');
    assert.equal(C.dayLabel(T('B') as any), 'Treino B + cardio'); assert.equal(C.dayLabel(K('E') as any), 'Dia de cardio (E)'); assert.equal(C.dayLabel(R as any), 'Dia de descanso'); assert.equal(C.dayLabel(null), ''); assert.equal(C.dayLabel(undefined), '');
    assert.equal(C.dayShortLabel(T('B') as any), 'Treino B'); assert.equal(C.dayShortLabel(K('E') as any), 'Cardio'); assert.equal(C.dayShortLabel(R as any), 'Descanso'); assert.equal(C.dayShortLabel(null), '');
    assert.equal(C.REST_DAY_RULES.length, 5); assert.ok(C.REST_DAY_RULES.some((r) => /água/.test(r)) && C.REST_DAY_RULES.some((r) => /cardápio/.test(r)) && C.REST_DAY_RULES.some((r) => /alongamento/.test(r)) && C.REST_DAY_RULES.some((r) => /Durma/.test(r)), 'regras de dieta, água, movimento e sono');
    assert.ok(C.REST_DAY_RULES.some((r) => /20 a 30 minutos/.test(r) && /10 minutos de alongamento/.test(r)) && C.REST_DAY_RULES.some((r) => /7 horas/.test(r)), 'números das regras de descanso');
    const mvR = C.missionsFor(7, P70, R as any).find((m) => m.id === 'movimento')!; assert.deepEqual([mvR.label, mvR.required, mvR.autoCapable, mvR.manualAllowed], ['Caminhar de leve 20 a 30 minutos', true, false, true]); assert.ok(mvR.hint!.includes('10 minutos de alongamento'));
    assert.deepEqual(C.missionsFor(7, P70, R as any).filter((m) => m.autoCapable).map((m) => m.id), ['agua', 'dieta'], 'no descanso só água e dieta podem vir sozinhas');
    // missões por tipo de dia
    const ids = (d: number, pd: any) => C.missionsFor(d, P70, pd).map((m) => m.id);
    assert.deepEqual(ids(1, T('A')), ['agua', 'dieta', 'movimento', 'sono', 'desafio', 'treino']); assert.deepEqual(ids(1, K('E')), ['agua', 'dieta', 'movimento', 'sono', 'desafio', 'treino']); assert.deepEqual(ids(7, R), ['agua', 'dieta', 'movimento', 'sono', 'desafio'], 'descanso: sem treino'); assert.deepEqual(ids(9, T('A')), ['agua', 'dieta', 'movimento', 'sono', 'acucar', 'desafio', 'treino']); assert.deepEqual(ids(16, R), ['agua', 'dieta', 'movimento', 'sono', 'acucar', 'proteina', 'desafio'], 'semanas 2 e 3 também no descanso');
    const tr = C.missionsFor(1, P70, T('A') as any).find((m) => m.id === 'treino')!; assert.deepEqual([tr.label, tr.required, tr.manualAllowed, tr.autoCapable, tr.points, tr.kind], ['Treino A + cardio', true, false, true, 30, 'workout']);
    assert.equal(C.missionsFor(1, P70, K('E') as any).find((m) => m.id === 'treino')!.label, 'Cardio do dia (aba E)');
    const mvRest = C.missionsFor(7, P70, R as any).find((m) => m.id === 'movimento')!; assert.ok(mvRest.label.includes('leve') && mvRest.hint!.includes('alongamento') && !mvRest.label.includes('passos'), 'descanso: caminhada leve, não 6.000 passos'); assert.ok(C.missionsFor(1, P70, T('A') as any).find((m) => m.id === 'movimento')!.label.includes('6.000'));
    assert.equal(C.missionsFor(7, P70, R as any).find((m) => m.id === 'dieta')!.label, 'Seguir o cardápio do dia de descanso'); assert.equal(C.missionsFor(1, P70, T('A') as any).find((m) => m.id === 'dieta')!.label, 'Seguir o cardápio do dia'); assert.equal(C.missionsFor(1, P70).find((m) => m.id === 'dieta')!.label, 'Seguir o plano alimentar', 'sem agenda: como antes');
    assert.equal(C.missionsFor(1, P70).find((m) => m.id === 'treino')!.required, false, 'sem agenda o treino segue sendo bônus'); assert.deepEqual(C.missionsFor(1, P70, null).map((m) => m.id), ['agua', 'dieta', 'movimento', 'sono', 'desafio', 'treino']);
    // o dia só vale com o treino do dia (6 obrigatórias, 70% = 5)
    const req = (d: number, pd: any, manual: string[], auto: any = {}) => C.scoreDay(C.resolveDay(d, P70, manual, auto, pd));
    const five = ['agua', 'dieta', 'movimento', 'sono', 'desafio'];
    let sc = req(1, T('A'), five); assert.equal(sc.total, 6); assert.equal(sc.done, 5); assert.equal(sc.valid, true, '5 de 6 vale'); assert.equal(sc.full, false, 'sem o treino não é dia completo');
    sc = req(1, T('A'), five, { workout: true }); assert.equal(sc.full, true); assert.equal(sc.points, 10 + 10 + 10 + 10 + 20 + 30 + C.FULL_DAY_BONUS);
    sc = req(1, T('A'), ['agua', 'dieta', 'movimento', 'sono'], {}); assert.equal(sc.valid, false, '4 de 6 não vale (66%)'); sc = req(1, T('A'), ['agua', 'dieta', 'movimento'], { workout: true }); assert.equal(sc.done, 4); assert.equal(sc.valid, false); sc = req(1, T('A'), ['agua', 'dieta', 'movimento', 'sono'], { workout: true }); assert.equal(sc.valid, true);
    sc = req(7, R, five); assert.equal(sc.total, 5); assert.equal(sc.full, true, 'descanso completo sem treino'); assert.equal(sc.points, 10 + 10 + 10 + 10 + 20 + C.FULL_DAY_BONUS, 'pontos do descanso completo'); assert.equal(req(7, R, five, { workout: true }).points, req(7, R, five).points, 'treinar no descanso não dá ponto (não existe a missão)');
    assert.equal(C.resolveDay(1, P70, ['treino'], {}, T('A') as any).find((m) => m.id === 'treino')!.done, false, 'o treino não se marca à mão'); assert.equal(C.resolveDay(1, P70, [], { workout: true }, T('A') as any).find((m) => m.id === 'treino')!.auto, true);
    assert.equal(C.resolveDay(1, P70, [], { dietAdherence: 'sim' }, T('A') as any).find((m) => m.id === 'dieta')!.auto, true, 'a dieta segue podendo vir do check-in da dieta');
    // resumo com semana
    const st = '2026-10-01'; const sum = (today: string, pattern: any = WK, extra: any = {}) => C.summarize({ startDate: st, today, profile: P70, manualByDate: {}, autoByDate: {}, pattern, ...extra });
    let sm = sum('2026-10-01'); assert.deepEqual(sm.schedule!.days.map((d) => d.label), ['Treino A', 'Treino B', 'Cardio', 'Treino C', 'Treino D', 'Cardio', 'Descanso']); assert.deepEqual(sm.schedule!.days[2], { type: 'CARDIO', tab: 'E', label: 'Cardio' }); assert.deepEqual(sm.schedule!.days[6], { type: 'DESCANSO', label: 'Descanso' });
    assert.deepEqual([sm.today!.type, sm.today!.tab, sm.today!.label, sm.today!.rules], ['TREINO', 'A', 'Treino A + cardio', []]); assert.equal(sm.yesterday, null);
    sm = sum('2026-10-03'); assert.deepEqual([sm.today!.type, sm.today!.tab, sm.today!.label], ['CARDIO', 'E', 'Dia de cardio (E)']); assert.deepEqual([sm.yesterday!.type, sm.yesterday!.tab], ['TREINO', 'B'], 'ontem também tem tipo');
    sm = sum('2026-10-07'); assert.deepEqual([sm.today!.type, sm.today!.tab, sm.today!.label], ['DESCANSO', null, 'Dia de descanso']); assert.deepEqual(sm.today!.rules, C.REST_DAY_RULES, 'regras do descanso vêm no resumo'); assert.ok(!sm.today!.missions.some((m) => m.id === 'treino'));
    assert.deepEqual(sm.days.slice(0, 8).map((d) => d.type), ['TREINO', 'TREINO', 'CARDIO', 'TREINO', 'TREINO', 'CARDIO', 'DESCANSO', 'TREINO'], 'cada dia do calendário sabe o seu tipo'); assert.equal(sm.days[20].type, 'DESCANSO', 'inclusive os que ainda não chegaram'); assert.equal(sm.days[10].status, 'FUTURE');
    assert.deepEqual(sm.days[10], { dayIndex: 11, date: '2026-10-11', status: 'FUTURE', done: 0, total: 0, points: 0, full: false, valid: false, type: 'TREINO' }, 'dia futuro: tudo zerado, só o tipo da semana');
    sm = sum('2026-10-01', null); assert.equal(sm.schedule, null); assert.deepEqual([sm.today!.type, sm.today!.tab, sm.today!.label, sm.today!.rules], [null, null, '', []]); assert.ok(sm.days.every((d) => d.type === undefined), 'sem semana, nada de tipo'); assert.equal(sum('2026-10-01', []).schedule, null, 'semana vazia = sem semana');
    assert.equal(sum('2026-10-01', WK, { weeklyWorkouts: 6 }).weeklyWorkoutsGoal, 6);
    // marcar à mão: o treino nunca; no descanso a caminhada leve sim
    assert.equal(C.canToggle(1, P70, 'treino', T('A') as any), false); assert.equal(C.canToggle(3, P70, 'treino', K('E') as any), false); assert.equal(C.canToggle(7, P70, 'treino', R as any), false, 'nem existe'); assert.equal(C.canToggle(7, P70, 'movimento', R as any), true); assert.equal(C.canToggle(1, P70, 'sono', T('A') as any), true); assert.equal(C.canToggle(7, P70, 'proteina', R as any), false, 'proteína só na semana 3');
    // o carregador monta a semana a partir das abas do treino do aluno
    const sched = async () => ((await loadChallenge(prisma, 'ch')) as any).summary.schedule?.days.map((d: any) => d.label);
    startAt = seed('CHALLENGE_21', 6, 70); L = await loadChallenge(prisma, 'ch'); assert.deepEqual(L.summary.schedule.days.map((d: any) => d.label), ['Treino A', 'Treino B', 'Cardio', 'Treino C', 'Treino D', 'Cardio', 'Descanso']); assert.equal(L.summary.today.type, 'DESCANSO', 'dia 7 é o descanso'); assert.equal(L.summary.today.rules.length, 5); assert.equal(L.summary.weeklyWorkoutsGoal, 6);
    assert.equal(L.summary.days.find((d: any) => d.dayIndex === 3).type, 'CARDIO');
    seed('CHALLENGE_21', 0, 70); db.workoutExercise.length = 0; db.exercise.length = 0; db.exercise.push({ id: 's1', category: 'Musculação' }, { id: 'c1', category: 'Cardio' }); ([['A', 's1'], ['B', 's1'], ['C', 's1']] as const).forEach(([day, ex], i) => db.workoutExercise.push({ id: 'k' + i, workoutId: 'w1', day, exerciseId: ex, order: i }));
    assert.deepEqual(await sched(), ['Treino A', 'Treino B', 'Treino C', 'Descanso'], '3 abas de musculação: semana de 4 dias'); assert.equal(((await loadChallenge(prisma, 'ch')) as any).summary.weeklyWorkoutsGoal, 5, 'meta por semana de 7 dias: 3 treinos em 4 dias = 5 (arredondado)');
    seed('CHALLENGE_21', 0, 70); db.workoutExercise.length = 0; db.workoutExercise.push({ id: 'k0', workoutId: 'w1', day: 'A', exerciseId: 'c1', order: 0 }); assert.equal(await sched(), undefined, 'só cardio: sem semana (o desafio funciona como antes)'); L = await loadChallenge(prisma, 'ch'); assert.equal(L.summary.today.type, null); assert.equal(L.summary.weeklyWorkoutsGoal, 4, 'e a meta volta a ser a frequência da anamnese');
    seed('CHALLENGE_21', 0, 70); db.exercise.length = 0; db.workoutExercise.length = 0; db.workoutExercise.push({ id: 'k0', workoutId: 'w1', day: 'A', exerciseId: 'sumiu', order: 0 }, { id: 'k1', workoutId: 'w1', exerciseId: 'sumiu2', order: 1 }); assert.deepEqual(await sched(), ['Treino A', 'Descanso'], 'exercício que não está na biblioteca conta como musculação; sem aba, vira A');
    seed('CHALLENGE_21', 0, 70); db.exercise.length = 0; db.workoutExercise.length = 0; db.exercise.push({ id: 'm', category: 'Musculação', tags: { target: 'CARDIO' } }, { id: 'r', category: 'Musculação', tags: {} }); db.workoutExercise.push({ id: 'k0', workoutId: 'w1', day: 'A', exerciseId: 'r', order: 0 }, { id: 'k1', workoutId: 'w1', day: 'B', exerciseId: 'm', order: 1 }); assert.deepEqual(await sched(), ['Treino A', 'Cardio', 'Descanso'], 'cardio pelo target da biblioteca, mesmo com outra categoria');
    seed('CHALLENGE_21', 0, 70); db.workoutExercise.length = 0; db.exercise.length = 0; db.exercise.push({ id: 's1', category: 'Musculação' }, { id: 's2', category: 'Musculação' }); db.workoutExercise.push({ id: 'k0', workoutId: 'w1', day: ' A ', exerciseId: 's1', order: 1 }, { id: 'k1', workoutId: 'w1', day: 'B', exerciseId: 's2', order: 0 }, { id: 'k2', workoutId: 'w1', day: 'A', exerciseId: 's2', order: 2 }); assert.deepEqual(await sched(), ['Treino B', 'Treino A', 'Descanso'], 'as abas seguem a ordem em que aparecem; espaço no nome da aba é ignorado');
    seed('CHALLENGE_21', 3, 70); db.workout.push({ id: 'w-vazio', userId: 'ch', name: 'DESAFIO 21 DIAS', archived: false, createdAt: new Date(db.workout[0].createdAt.getTime() + 3000), startDate: db.workout[0].startDate }); assert.equal((await sched())!.length, 7, 'treino mais novo SEM exercício não vale: a semana vem do anterior');
    seed('CHALLENGE_21', 3, 70); { const P: any = prisma, o = { w: P.workout.findMany, we: P.workoutExercise.findMany, ex: P.exercise.findMany }; const seen: any = {};
      P.workout.findMany = async (a: any) => { seen.w = a; return o.w(a); }; P.workoutExercise.findMany = async (a: any) => { seen.we = a; return o.we(a); }; P.exercise.findMany = async (a: any) => { seen.ex = a; return o.ex(a); };
      try { await loadChallenge(prisma, 'ch'); } finally { P.workout.findMany = o.w; P.workoutExercise.findMany = o.we; P.exercise.findMany = o.ex; }
      assert.deepEqual(seen.w.select, { id: true, name: true, startDate: true, createdAt: true, archived: true, _count: { select: { exercises: true } } }, 'treinos: conta os exercícios de cada um'); assert.deepEqual(seen.we.select, { day: true, exerciseId: true, order: true }); assert.deepEqual(seen.we.orderBy, { order: 'asc' }); assert.deepEqual(seen.ex.select, { id: true, category: true, tags: true }); assert.equal(seen.we.where.workoutId, 'w1'); }
    seed('CHALLENGE_21', 3, 70); { const P: any = prisma, o = P.workoutExercise.findMany; P.workoutExercise.findMany = async () => undefined; try { assert.equal(await sched(), undefined, 'banco sem resposta: sem semana, sem quebrar'); } finally { P.workoutExercise.findMany = o; } }
    // treino mais novo manda; o antigo e o "em construção" não entram
    seed('CHALLENGE_21', 3, 70); db.workout.push({ id: 'w-new', userId: 'ch', name: 'DESAFIO 21 DIAS', archived: false, createdAt: new Date(db.workout[0].createdAt.getTime() + 1000), startDate: db.workout[0].startDate }); db.workoutExercise.push({ id: 'n0', workoutId: 'w-new', day: 'A', exerciseId: 's1', order: 0 }); db.workout.push({ id: 'w-ph', userId: 'ch', name: 'EM CONSTRUÇÃO', archived: false, createdAt: new Date(db.workout[0].createdAt.getTime() + 2000), startDate: db.workout[0].startDate }); db.workoutExercise.push({ id: 'p0', workoutId: 'w-ph', day: 'A', exerciseId: 's1', order: 0 });
    assert.deepEqual(await sched(), ['Treino A', 'Descanso'], 'vale o treino real mais novo');
    seed('CHALLENGE_21', 3, 70); db.workout.push({ id: 'w-ph2', userId: 'ch', name: 'DESAFIO EM CONSTRUÇÃO 🚧', archived: false, createdAt: new Date(db.workout[0].createdAt.getTime() + 2000), startDate: db.workout[0].startDate }); db.workoutExercise.push({ id: 'p1', workoutId: 'w-ph2', day: 'A', exerciseId: 's1', order: 0 }); assert.equal((await sched())!.length, 7, 'o "em construção" não vira a semana');
    // rota de marcar com a semana
    startAt = seed('CHALLENGE_21', 6, 70); // dia 7 = descanso
    assert.equal((await check({ missionId: 'treino', done: true })).status, 400, 'o treino do dia não se marca à mão'); let r7 = await check({ missionId: 'movimento', done: true }); assert.equal(r7.status, 200); assert.equal(r7.json.summary.today.type, 'DESCANSO'); assert.deepEqual(db.challengeCheckin[0].done, ['movimento']);
    startAt = seed('CHALLENGE_21', 3, 70); assert.equal((await check({ missionId: 'treino', done: true })).status, 400); assert.equal((await check({ missionId: 'sono', done: true })).status, 200);
    startAt = seed('CHALLENGE_21', 3, 70); db.workoutExercise.length = 0; db.exercise.length = 0; db.workoutExercise.push({ id: 'q', workoutId: 'w1', day: 'A', exerciseId: 'c1', order: 0 }); db.exercise.push({ id: 'c1', category: 'Cardio' }); assert.equal((await check({ missionId: 'treino', done: true })).status, 400, 'sem semana: o treino bônus também não se marca à mão');
  }
  console.log('OK  semana do desafio: 4 treinos + 2 cardios + descanso, missões por tipo de dia, dia só vale com o treino do dia, regras do descanso, semana montada pelas abas do treino');
})().catch((e) => { console.log('FALHOU', e && e.stack || e); process.exit(1); });
