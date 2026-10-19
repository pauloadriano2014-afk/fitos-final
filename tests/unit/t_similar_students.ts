import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { pickSwap, nameKey } from '@/lib/exerciseSwap';
import { GET as similarGET } from '/home/user/fitos-final/app/api/insights/similar/route';
import { GET as compareGET } from '/home/user/fitos-final/app/api/insights/compare/route';
import { runIntent, ruleRoute, INTENTS } from '/home/user/fitos-final/lib/coachAssistant';
import {
  objectiveKey, placesOf, jointRisksOf, buildProfile, scoreSimilarity, buildRoutines, nextOrdinal, ordinalWindow, pickRoutine, compareWorkouts,
  findSimilar, loadComparison, readRowDetail, levelFix, MIN_SCORE, MIN_ROUTINE_SESSIONS, MAX_SIMILAR, WEIGHTS,
} from '/home/user/fitos-final/lib/similarStudents';

const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const get = async (fn: any, path: string, as: string | null) => { const headers: any = {}; if (as) headers.authorization = 'Bearer ' + as; const r = await fn(new Request('http://x' + path, { method: 'GET', headers })); return { status: r.status, json: (await r.json().catch(() => null)) as any }; };
const NOW = new Date('2026-10-18T15:00:00Z');
const DAY = 86400000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
let ok = 0; const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { console.log('FALHOU  ' + name + '\n' + String(e?.stack || e).split('\n').slice(0, 5).join('\n')); process.exitCode = 1; } };

const A = (userId: string, o: any = {}) => S.anamnese.push({ id: 'an-' + userId, userId, createdAt: ago(100), objetivo: 'Emagrecimento', nivel: 'Intermediário', frequencia: 4, tempoDisponivel: 60, limitacoes: [], cirurgias: [], equipamentos: ['Academia Completa'], ...o });
const U = (id: string, o: any = {}) => S.user.push({ id, name: id, role: 'USER', coachId: 'cA', active: true, accountStatus: 'ACTIVE', isTestAccount: false, gender: 'Feminino', level: 'Intermediário', insightsMode: null, createdAt: ago(300), startDate: ago(300), email: id + '@x.com', ...o });
/** uma ficha treinada: `n` treinos feitos a partir de `createdDaysAgo` (com workoutId) */
const R = (userId: string, wid: string, createdDaysAgo: number, n: number, o: any = {}) => { S.workout.push({ id: wid, userId, name: 'Ficha ' + wid, createdAt: ago(createdDaysAgo), endDate: null, archived: true, ...o }); for (let i = 0; i < n; i++) S.workoutHistory.push({ id: `h-${wid}-${i}`, userId, name: 'A', date: ago(createdDaysAgo - 1 - i), workoutId: wid }); };
/** aluno-referência com `routines` fichas treinadas (cada uma com 4 treinos), uma a cada 30 dias, a mais antiga primeiro */
const REF = (id: string, routines: number, o: any = {}, an: any = {}, per = 4) => { U(id, o); A(id, an); for (let k = 1; k <= routines; k++) R(id, `${id}-w${k}`, (routines - k + 1) * 30, per); };
const seed = () => { P.__reset(); S.user.push({ id: 'cA', role: 'COACH', coachId: null, insightsIncludeInactive: false }, { id: 'cB', role: 'COACH', coachId: null, insightsIncludeInactive: false }); };
const TARGET = (o: any = {}, an: any = {}) => { U('t', { name: 'Tati', level: 'Intermediário', createdAt: ago(20), startDate: ago(20), ...o }); A('t', { limitacoes: ['Joelho'], ...an }); };
const ids = (r: any) => r.similar.map((s: any) => s.studentId);

(async () => {
  await t('regras puras: objetivo, locais e articulações lidos do texto livre', () => {
    for (const [raw, k] of [['Emagrecimento', 'EMAGRECIMENTO'], ['perder gordura', 'EMAGRECIMENTO'], ['Definição', 'EMAGRECIMENTO'], ['Hipertrofia', 'HIPERTROFIA'], ['Ganho de massa muscular', 'HIPERTROFIA'], ['Saúde e qualidade de vida', 'CONDICIONAMENTO'], ['Condicionamento', 'CONDICIONAMENTO'], ['correr uma maratona', 'OUTRO'], ['', 'OUTRO'], [null, 'OUTRO']] as const) assert.strictEqual(objectiveKey(raw), k, String(raw));
    assert.deepStrictEqual(placesOf(['Academia Completa', 'Em Casa']), ['ACADEMIA', 'CASA']); assert.deepStrictEqual(placesOf(['Academia de Condomínio']), ['CONDOMINIO']); assert.deepStrictEqual(placesOf(null), []);
    assert.deepStrictEqual(jointRisksOf(['Dor no joelho', 'hérnia de disco', 'Manguito rotador']), ['JOELHO', 'LOMBAR', 'OMBRO']); assert.deepStrictEqual(jointRisksOf(['Pressão alta']), []);
    const p = buildProfile({ objetivo: 'Emagrecimento', frequencia: '4', tempoDisponivel: 45, limitacoes: ['Nenhuma', 'Joelho'], cirurgias: ['nenhum'], equipamentos: ['Em Casa'] }, 'INTERMEDIARIO');
    assert.deepStrictEqual([p.freq, p.minutes, p.limits, p.jointRisks, p.env], [4, 45, ['Joelho'], ['JOELHO'], 'EM_CASA']);
    const z = buildProfile(null, 'INICIANTE'); assert.deepStrictEqual([z.freq, z.minutes, z.limits, z.places], [null, null, [], []]);
  });
  await t('semelhança: 100 pontos divididos em objetivo 30, nível 20, frequência 15, local 15, limites 10, tempo 10; motivos em português', () => {
    assert.strictEqual(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
    const base = buildProfile({ objetivo: 'Emagrecimento', frequencia: 4, tempoDisponivel: 60, limitacoes: ['Joelho'], equipamentos: ['Academia Completa'] }, 'INTERMEDIARIO');
    const same = scoreSimilarity(base, base); assert.strictEqual(same.score, 100); assert.ok(same.reasons.some((r) => r.includes('mesmo objetivo')) && same.reasons.some((r) => r.includes('4x por semana')) && same.reasons.some((r) => r.includes('mesma limitação')));
    const other = (o: any, lv: any = 'INTERMEDIARIO') => buildProfile({ objetivo: 'Emagrecimento', frequencia: 4, tempoDisponivel: 60, limitacoes: ['Joelho'], equipamentos: ['Academia Completa'], ...o }, lv);
    assert.strictEqual(scoreSimilarity(base, other({ objetivo: 'Hipertrofia' })).score, 70); assert.strictEqual(scoreSimilarity(base, other({}, 'INICIANTE')).score, 90); assert.strictEqual(scoreSimilarity(base, other({}, 'AVANCADO')).score, 90, 'um degrau de diferença vale metade');
    assert.strictEqual(scoreSimilarity(base, other({ frequencia: 5 })).score, 93, '1x de diferença: metade (7,5 -> arredonda no total)'); assert.strictEqual(scoreSimilarity(base, other({ frequencia: 2 })).score, 85);
    assert.strictEqual(scoreSimilarity(base, other({ equipamentos: ['Em Casa'] })).score, 85); assert.strictEqual(scoreSimilarity(base, other({ equipamentos: ['Academia Completa', 'Em Casa'] })).score, 93);
    assert.strictEqual(scoreSimilarity(base, other({ limitacoes: [] })).score, 90, 'ele tem limitação e a referência não'); assert.strictEqual(scoreSimilarity(other({ limitacoes: [] }), other({ limitacoes: [] })).score, 100, 'nenhum dos dois tem: vale os 10');
    assert.strictEqual(scoreSimilarity(other({ limitacoes: [] }), base).score, 95, 'ele não tem e a referência tem: metade');
    assert.strictEqual(scoreSimilarity(base, other({ tempoDisponivel: 75 })).score, 100); assert.strictEqual(scoreSimilarity(base, other({ tempoDisponivel: 90 })).score, 90, 'tempo parecido = até 15 min de diferença');
    assert.strictEqual(scoreSimilarity(buildProfile({ objetivo: 'correr maratona' }, 'INICIANTE'), buildProfile({ objetivo: 'Correr  Maratona' }, 'INICIANTE')).reasons[0], 'mesmo objetivo (correr maratona)');
  });
  await t('rotinas: só conta como rotina a ficha treinada; treino vai pela ficha (workoutId) ou, sem ele, pela ficha mais nova até aquele dia; ordem pela criação', () => {
    const w = (id: string, d: number, o: any = {}) => ({ id, name: id, createdAt: ago(d), endDate: null, archived: false, ...o });
    const h = (d: number, workoutId: string | null = null) => ({ date: ago(d), workoutId });
    const r = buildRoutines([w('c', 10), w('a', 90), w('b', 50)], [h(89, 'a'), h(88, 'a'), h(87, 'a'), h(80, 'a'), h(49, 'b'), h(48, 'b'), h(9, 'c'), h(8, 'c'), h(7, 'c')]);
    assert.deepStrictEqual(r.map((x) => [x.id, x.sessions, x.ordinal]), [['a', 4, 1], ['b', 2, null], ['c', 3, 2]], 'b teve só 2 treinos: não é rotina, e não gasta número');
    assert.strictEqual(nextOrdinal(r), 3); assert.strictEqual(nextOrdinal([]), 1);
    const legacy = buildRoutines([w('a', 90), w('b', 50)], [h(85), h(84), h(83), h(45), h(44), h(43), h(95)]);
    assert.deepStrictEqual(legacy.map((x) => [x.id, x.sessions]), [['a', 3], ['b', 3]], 'sem workoutId: pela data (o treino de 95 dias atrás, antes de qualquer ficha, não é de ninguém)');
    const crossed = buildRoutines([w('a', 90), w('b', 50)], [h(40, 'a'), h(39, 'a'), h(38, 'a'), h(37, 'b')]);
    assert.deepStrictEqual(crossed.map((x) => [x.id, x.sessions]), [['a', 3], ['b', 1]], 'o workoutId manda: treino de hoje na ficha antiga continua sendo da antiga');
    const edge = buildRoutines([w('a', 90), w('b', 50)], [{ date: ago(50), workoutId: null }]); assert.deepStrictEqual(edge.map((x) => x.sessions), [0, 1], 'treino no mesmo instante em que a ficha foi criada já é dela');
    assert.strictEqual(buildRoutines([w('a', 5)], [h(2, 'apagada')])[0].sessions, 1, 'ficha apagada no histórico cai na ficha vigente pela data');
    assert.strictEqual(MIN_ROUTINE_SESSIONS, 3); assert.deepStrictEqual(buildRoutines(null as any, null as any), []);
    assert.deepStrictEqual(buildRoutines([{ id: 'x', name: 'x', createdAt: 'lixo' } as any], []), []);
  });
  await t('fase da rotina: novo aluno compara com a 1ª–3ª; quem está na rotina k compara com k-1..k+1; escolhe a mais próxima', () => {
    assert.deepStrictEqual(ordinalWindow(1), [1, 3]); assert.deepStrictEqual(ordinalWindow(2), [1, 3]); assert.deepStrictEqual(ordinalWindow(5), [4, 6]);
    const rs = (list: [number, number][]) => list.map(([ordinal, sessions]) => ({ id: 'r' + ordinal, name: 'r' + ordinal, createdAt: new Date(), endDate: null, archived: true, sessions, ordinal }));
    const ten = rs(Array.from({ length: 10 }, (_, i) => [i + 1, 4] as [number, number]));
    let p = pickRoutine(ten, 1); assert.strictEqual(p.best!.ordinal, 1); assert.deepStrictEqual(p.others.map((o) => o.ordinal), [2, 3], 'ninguém da 10ª rotina entra para um aluno novo');
    p = pickRoutine(ten, 5); assert.strictEqual(p.best!.ordinal, 5); assert.deepStrictEqual(p.others.map((o) => o.ordinal).sort(), [4, 6]);
    p = pickRoutine(rs([[4, 3], [6, 9]]), 5); assert.strictEqual(p.best!.ordinal, 6, 'empate na distância: a mais treinada'); assert.strictEqual(pickRoutine(rs([[1, 4], [2, 4]]), 8).best, null);
    assert.strictEqual(pickRoutine(rs([[2, 4]]), 1).best!.ordinal, 2); assert.strictEqual(pickRoutine([], 1).best, null);
  });

  await t('alunos parecidos: só da carteira, do mesmo gênero, ativos/com treino/não teste, na fase certa, ordenados pela nota', async () => {
    seed(); TARGET();
    REF('r1', 10, {}, { limitacoes: ['Joelho'] }, 3);                          // perfil igual, 10 rotinas: para a Tati (nova) vale a 1ª
    REF('r2', 3, { level: 'Iniciante', startDate: ago(60), createdAt: ago(60) }, { objetivo: 'Hipertrofia', frequencia: 2, nivel: 'Iniciante', limitacoes: [] });   // pouco parecida
    REF('m1', 5, { gender: 'Masculino', name: 'Homem' });                     // perfil igual, mas homem
    REF('o1', 5, { coachId: 'cB', name: 'De outro coach' });                  // outro coach
    REF('x1', 5, { isTestAccount: true });                                    // conta de teste
    REF('p1', 1, {}); S.workoutHistory.splice(S.workoutHistory.findIndex((h: any) => h.userId === 'p1'), 2);    // 2 treinos só: fora das análises
    REF('g1', 5, { gender: null });                                           // sem gênero
    REF('i1', 5, { active: false });                                          // inativo
    REF('r3', 6, {}, { limitacoes: ['Joelho'], frequencia: 5 });              // parecida com leve diferença
    const r = await findSimilar(P, 'cA', 't', NOW);
    assert.strictEqual(r.ok, true); assert.deepStrictEqual(ids(r), ['r1', 'r3'], 'r2 fica abaixo da nota mínima');
    assert.deepStrictEqual(r.similar.map((s: any) => s.score), [100, 93]); assert.ok(r.similar[0].reasons.includes('mesmo nível (Intermediário)'));
    assert.strictEqual(r.similar[0].routine.ordinal, 1, 'aluna nova: rotina 1, não a 10ª'); assert.deepStrictEqual(r.similar[0].others.map((o) => o.ordinal), [2, 3]);
    assert.deepStrictEqual([r.target!.nextOrdinal, r.target!.routinesDone, r.target!.window], [1, 0, [1, 3]]); assert.strictEqual(r.target!.gender, 'Feminino'); assert.strictEqual(r.target!.level.level, 'INTERMEDIARIO'); assert.deepStrictEqual(r.target!.limits, ['Joelho']);
    assert.strictEqual(r.pool.considered, 3, 'r1, r2 e r3 (as outras estão fora das análises ou são de outro gênero/coach)'); assert.strictEqual(r.pool.belowScore, 1); assert.strictEqual(r.pool.withoutRoutine, 0);
    assert.ok(MIN_SCORE === 40 && MAX_SIMILAR === 5);
    assert.ok(JSON.stringify(r).indexOf('@x.com') < 0, 'não vaza e-mail');
  });
  await t('alunos parecidos: quem está na 5ª rotina compara com as 4ª–6ª; referência sem rotina nessa fase é contada à parte; limite de 5', async () => {
    seed(); TARGET(); for (let k = 1; k <= 4; k++) R('t', 't-w' + k, (5 - k) * 30 + 10, 4);   // a Tati já treinou 4 rotinas -> entra na 5ª
    REF('a', 10); REF('b', 6); REF('c', 3);   // c só tem 3 rotinas: nada entre a 4ª e a 6ª
    const r = await findSimilar(P, 'cA', 't', NOW);
    assert.deepStrictEqual([r.target!.nextOrdinal, r.target!.window], [5, [4, 6]]);
    assert.deepStrictEqual(ids(r).sort(), ['a', 'b']); assert.strictEqual(r.similar.find((s) => s.studentId === 'a')!.routine.ordinal, 5); assert.strictEqual(r.similar.find((s) => s.studentId === 'b')!.routine.ordinal, 5);
    assert.strictEqual(r.pool.withoutRoutine, 1);
    seed(); TARGET(); for (let i = 0; i < 8; i++) REF('z' + i, 4, { name: 'Z' + i }); const many = await findSimilar(P, 'cA', 't', NOW); assert.strictEqual(many.similar.length, MAX_SIMILAR);
  });
  await t('alunos parecidos: casos de borda (destino sem gênero, de outro coach, inexistente, sem ninguém)', async () => {
    seed(); TARGET({ gender: null }); REF('a', 4); let r = await findSimilar(P, 'cA', 't', NOW); assert.deepStrictEqual([r.ok, r.reason, r.similar.length], [false, 'SEM_GENERO', 0]);
    seed(); TARGET({ coachId: 'cB' }); REF('a', 4); r = await findSimilar(P, 'cA', 't', NOW); assert.deepStrictEqual([r.ok, r.reason], [false, 'NAO_ENCONTRADO']);
    r = await findSimilar(P, 'cA', 'nada', NOW); assert.strictEqual(r.reason, 'NAO_ENCONTRADO');
    seed(); TARGET(); r = await findSimilar(P, 'cA', 't', NOW); assert.deepStrictEqual([r.ok, r.similar.length, r.pool.considered], [true, 0, 0]);
    seed(); TARGET(); REF('a', 4); S.user.find((u: any) => u.id === 'a').insightsMode = 'EXCLUDE'; r = await findSimilar(P, 'cA', 't', NOW); assert.strictEqual(r.similar.length, 0, 'tirada das análises pelo coach: não entra');
    seed(); TARGET({ isTestAccount: true }); REF('a', 4); r = await findSimilar(P, 'cA', 't', NOW); assert.strictEqual(r.ok, true, 'o destino pode ser qualquer aluno da carteira');
    seed(); TARGET(); REF('a', 4); const noAn = S.anamnese.findIndex((x: any) => x.userId === 'a'); S.anamnese.splice(noAn, 1); r = await findSimilar(P, 'cA', 't', NOW); assert.ok(Array.isArray(r.similar), 'referência sem anamnese não quebra');
  });

  const EX = (id: string, o: any = {}) => S.exercise.push({ id, name: 'Ex ' + id, category: 'PEITO', tags: {}, environments: ['ACADEMIA_PADRAO'], ...o });
  const WE = (workoutId: string, exerciseId: string, day: string, order: number, o: any = {}) => S.workoutExercise.push({ id: `we-${workoutId}-${day}-${order}`, workoutId, exerciseId, day, order, sets: 3, reps: '12', restTime: 60, technique: null, notes: null, substitutes: [], substituteId: null, ...o });
  await t('comparação: marca aparelho que falta, articulação com limitação e local diferente; troca disponível; resumo e "o que mudar"', () => {
    const rows = (list: any[]) => list.map((o, i) => ({ exerciseId: o.id, name: o.name || 'E' + o.id, category: o.cat || 'PEITO', sets: o.sets ?? 3, reps: '12', restTime: 60, technique: o.tech ?? null, notes: null, order: i, day: o.day || 'A', substitutes: o.subs || [], tags: o.tags, environments: o.env }));
    const c = compareWorkouts(rows([
      { id: '1', tags: {}, env: ['ACADEMIA_PADRAO'] }, { id: '2', name: 'Leg Press', cat: 'PERNA', tags: { jointRisk: ['joelho'] }, env: ['UNIVERSAL'] },
      { id: '3', name: 'Crucifixo', subs: ['9', '1'], env: ['ACADEMIA'] }, { id: '4', day: 'B', name: 'Flexão', env: ['EM_CASA'], tech: 'DROPSET', sets: 4 }, { id: '5', day: 'B', env: [], tech: 'normal', cat: 'COSTAS' },
    ]), { unavailable: new Set(['3', '1']), jointRisks: ['JOELHO'], env: 'ACADEMIA_PADRAO' });
    const ex = (id: string) => c.days.flatMap((d) => d.exercises).find((e) => e.exerciseId === id)!;
    assert.deepStrictEqual(ex('1').flags, ['SEM_APARELHO']); assert.deepStrictEqual(ex('2').flags, ['LIMITACAO']); assert.ok(ex('2').detail[0].includes('joelho')); assert.deepStrictEqual(ex('3').flags, ['SEM_APARELHO']);
    assert.deepStrictEqual(ex('4').flags, ['AMBIENTE']); assert.deepStrictEqual(ex('5').flags, [], 'sem ambiente marcado serve em qualquer lugar'); assert.strictEqual(ex('5').technique, null, '"normal" não conta como técnica');
    assert.strictEqual(ex('3').hasSwap, true, 'tem uma opção de troca que o aluno tem'); assert.strictEqual(ex('1').hasSwap, false); assert.strictEqual(ex('5').ok, true);
    assert.deepStrictEqual(c.days.map((d) => d.day), ['A', 'B']); assert.deepStrictEqual(c.days[0].byCategory, [{ category: 'PEITO', count: 2 }, { category: 'PERNA', count: 1 }]);
    assert.deepStrictEqual({ ...c.summary, techniques: c.summary.techniques }, { daysCount: 2, exercises: 5, usable: 1, flagged: 4, avgSets: 3.2, techniques: [{ name: 'DROPSET', count: 1 }], flags: { SEM_APARELHO: 2, LIMITACAO: 1, AMBIENTE: 1, NIVEL: 0 } });
    assert.deepStrictEqual(c.toChange.map((x) => [x.day, x.name]), [['A', 'E1'], ['A', 'Leg Press'], ['A', 'Crucifixo'], ['B', 'Flexão']]);
    assert.strictEqual(compareWorkouts(rows([{ id: '1', subs: ['9'] }]), { unavailable: new Set(['1', '9']), jointRisks: [], env: 'ACADEMIA_PADRAO' }).days[0].exercises[0].hasSwap, false, 'a única troca também é um aparelho que ele não tem');
    assert.strictEqual(compareWorkouts([{ ...rows([{ id: '7', tags: { jointRisk: ['OMBRO'] } }])[0], substitutes: ['1'] }], { unavailable: new Set(), jointRisks: ['JOELHO'], env: 'ACADEMIA_PADRAO' }).summary.flagged, 0, 'risco em outra articulação não conta');
    assert.deepStrictEqual(compareWorkouts([], { unavailable: new Set(), jointRisks: [], env: 'X' }).summary, { daysCount: 0, exercises: 0, usable: 0, flagged: 0, avgSets: 0, techniques: [], flags: { SEM_APARELHO: 0, LIMITACAO: 0, AMBIENTE: 0, NIVEL: 0 } });
    assert.strictEqual(compareWorkouts(rows([{ id: '8', env: ['ACADEMIA'] }]), { unavailable: new Set(), jointRisks: [], env: 'EM_CASA' }).summary.flagged, 1);
  });
  await t('linha do exercício: o JSON do Montar treino vira séries por série, técnica limpa e observação — nunca texto cru na tela nem na IA', () => {
    const J = (o: any) => JSON.stringify(o);
    const piramide = readRowDetail({ category: 'COSTAS', sets: 1, reps: '15', restTime: 45, technique: J({ t: 'NORMAL', b: [{ sets: '1', reps: '15', restTime: '45', technique: 'NORMAL' }, { sets: '1', reps: '12', restTime: '45', technique: 'NORMAL' }, { sets: '2', reps: '10', restTime: '45', technique: 'NORMAL' }, { sets: '1', reps: '8', restTime: '45', technique: 'DROPSET' }], o: '' }) });
    assert.deepStrictEqual(piramide, { sets: 5, reps: '15', restTime: 45, technique: 'DROPSET', series: 'S1 15 · S2 12 · S3–4 10 · S5 8 DROPSET', note: null });
    const bi = readRowDetail({ category: 'BICEPS', sets: 3, reps: '10', restTime: 45, technique: J({ t: 'BISET', b: [{ sets: '3', reps: '10 a 15', restTime: '45', technique: 'BISET' }], o: '10 segundin de descanso hen' }) });
    assert.strictEqual(bi.technique, 'BISET'); assert.strictEqual(bi.series, 'S1–3 10 a 15', 'bi-set não vira etiqueta em cada série'); assert.strictEqual(bi.note, '10 segundin de descanso hen'); assert.strictEqual(bi.sets, 3);
    const cardio = readRowDetail({ category: 'CARDIO', sets: 1, reps: '400', restTime: 0, technique: J({ t: 'Moderada', b: [{ sets: '30', reps: '400', restTime: '0', technique: 'Moderada' }], o: '' }) });
    assert.strictEqual(cardio.series, '', 'cardio não vira "30× 400"'); assert.strictEqual(cardio.technique, 'Moderada'); assert.strictEqual(cardio.sets, 1);
    assert.deepStrictEqual(readRowDetail({ category: 'PEITO', sets: 4, reps: '10', restTime: 60, technique: 'DROPSET', notes: 'devagar' }), { sets: 4, reps: '10', restTime: 60, technique: 'DROPSET', series: '', note: 'devagar' }, 'técnica em texto simples continua valendo');
    for (const t of [null, '', 'normal', 'NORMAL', '{lixo', J({ t: 'NORMAL', b: [] }), J({ b: 'x' })]) { const d = readRowDetail({ category: 'PEITO', sets: 3, reps: '12', restTime: 60, technique: t as any }); assert.strictEqual(d.technique, null, String(t)); assert.strictEqual(d.sets, 3); assert.strictEqual(d.reps, '12'); assert.ok(!d.series.includes('{')); }
    assert.strictEqual(readRowDetail({ technique: J({ t: 'NORMAL', b: [{ sets: '1', reps: '', technique: '' }] }) }).series, 'S1 ?');
    assert.strictEqual(readRowDetail({ technique: J({ o: 'x'.repeat(300) }) }).note!.length, 140);
    const rows = [{ exerciseId: 'a', name: 'Remada', category: 'COSTAS', sets: 1, reps: '15', restTime: 45, technique: J({ t: 'NORMAL', b: [{ sets: '1', reps: '15', technique: 'NORMAL' }, { sets: '1', reps: '8', technique: 'DROPSET' }] }), notes: null, order: 0, day: 'A', substitutes: [] }, { exerciseId: 'b', name: 'Rosca', category: 'BICEPS', sets: 3, reps: '10', restTime: 45, technique: J({ t: 'BISET', b: [{ sets: '3', reps: '10', technique: 'BISET' }] }), notes: null, order: 1, day: 'A', substitutes: [] }];
    const c = compareWorkouts(rows as any, { unavailable: new Set(), jointRisks: [], env: 'X' }); assert.deepStrictEqual(c.summary.techniques, [{ name: 'BISET', count: 1 }, { name: 'DROPSET', count: 1 }]); assert.ok(!JSON.stringify(c).includes('"t":'), 'nada de JSON cru na resposta'); assert.strictEqual(c.days[0].exercises[0].series, 'S1 15 · S2 8 DROPSET'); assert.strictEqual(c.summary.avgSets, 2.5);
  });
  await t('comparação lida do banco: usa o aparelho que ESTE aluno não tem, a limitação dele e o local dele; mostra a rotina atual dele lado a lado', async () => {
    seed(); TARGET({}, { equipamentos: ['Academia de Condomínio'] }); REF('s', 3);
    EX('e1', { name: 'Supino', environments: ['UNIVERSAL'] }); EX('e2', { name: 'Leg Press', category: 'PERNA', tags: { jointRisk: ['JOELHO'] }, environments: ['UNIVERSAL'] }); EX('e3', { name: 'Voador', environments: ['ACADEMIA_PADRAO'] }); EX('e4', { name: 'Remada', category: 'COSTAS', environments: ['CONDOMINIO'] });
    WE('s-w1', 'e1', 'A', 0, { technique: 'DROPSET' }); WE('s-w1', 'e2', 'A', 1); WE('s-w1', 'e3', 'B', 0); WE('s-w1', 'e4', 'B', 1);
    S.workout.push({ id: 't-atual', userId: 't', name: 'Atual', createdAt: ago(5), endDate: null, archived: false }); WE('t-atual', 'e4', 'A', 0); WE('t-atual', 'e1', 'A', 1);
    S.equipmentReport.push({ id: 'er1', userId: 't', exerciseId: 'e1', exerciseName: 'Supino', status: 'OPEN' }, { id: 'er2', userId: 't', exerciseId: 'e4', exerciseName: 'Remada', status: 'DISMISSED' });
    S.workout.push({ id: 't-nova-arquivada', userId: 't', name: 'Arquivada', createdAt: ago(1), endDate: null, archived: true }); WE('t-nova-arquivada', 'e3', 'Z', 0);
    const r: any = await loadComparison(P, 'cA', 't', 's', 's-w1');
    assert.strictEqual(r.ok, true); const flat = r.comparison.days.flatMap((d: any) => d.exercises); const f = (id: string) => flat.find((e: any) => e.exerciseId === id).flags;
    assert.deepStrictEqual(f('e1'), ['SEM_APARELHO']); assert.deepStrictEqual(f('e2'), ['LIMITACAO']); assert.deepStrictEqual(f('e3'), ['AMBIENTE'], 'Voador é de academia padrão e ele treina no condomínio'); assert.deepStrictEqual(f('e4'), [], 'aviso já encerrado (não é mais "não tem") não conta');
    assert.strictEqual(r.comparison.summary.techniques[0].name, 'DROPSET'); assert.strictEqual(r.source.routine.ordinal, 1); assert.strictEqual(r.source.routine.sessions, 4); assert.strictEqual(r.source.name, 's');
    assert.deepStrictEqual(r.target.current.map((d: any) => [d.day, d.exercises.length]), [['A', 2]], 'a rotina atual dele, só a estrutura'); assert.deepStrictEqual(r.target.current[0].exercises[0].flags, []);
    assert.deepStrictEqual(r.target.limits, ['Joelho']); assert.deepStrictEqual(r.target.places, ['CONDOMINIO']);
  });
  await t('comparação lida do banco: o NÍVEL real do aluno de destino decide o que é "avançado demais" (iniciante marca dropset; intermediário não)', async () => {
    const run = async (level: string, startDays: number) => { seed(); TARGET({ level, createdAt: ago(startDays), startDate: ago(startDays) }, {}); REF('s', 3); EX('e1', { name: 'Supino', environments: ['UNIVERSAL'] }); EX('e2', { name: 'Barra fixa', category: 'COSTAS', environments: ['UNIVERSAL'] }); WE('s-w1', 'e1', 'A', 0, { technique: 'DROPSET' }); WE('s-w1', 'e2', 'A', 1); const r: any = await loadComparison(P, 'cA', 't', 's', 's-w1'); return r; };
    let r = await run('Iniciante', 10); assert.deepStrictEqual(r.comparison.days[0].exercises.map((e: any) => e.flags), [['NIVEL'], ['NIVEL']]); assert.strictEqual(r.target.level.level, 'INICIANTE'); assert.ok(r.comparison.toChange[0].why[0].includes('dropset'));
    r = await run('Intermediário', 400); assert.deepStrictEqual(r.comparison.days[0].exercises.map((e: any) => e.flags), [[], []], 'intermediário aguenta dropset e barra fixa'); assert.strictEqual(r.target.level.level, 'INTERMEDIARIO');
  });
  const LX = (id: string, name: string, target: string, o: any = {}) => ({ id, name, category: o.cat || 'Tríceps', subCategory: o.sub ?? 'Geral', videoUrl: o.video ?? null, environments: o.env || ['UNIVERSAL'], tags: { target, mechanic: o.mech || 'ISOLADO', equipment: o.eq || 'LIVRE', jointRisk: o.risk || [] } });
  const CTX = (o: any = {}) => ({ unavailable: new Set<string>(), jointRisks: [] as string[], env: 'ACADEMIA_PADRAO', level: 'INTERMEDIARIO' as any, usedNames: new Set<string>(), envOk: (e: any) => { const l = (e || []).map((x: string) => x.toUpperCase()); return !l.length || l.includes('UNIVERSAL') || l.includes(o.env || 'ACADEMIA_PADRAO'); }, levelIssues: (n: string, t: any, lv: any) => (lv === 'INICIANTE' && /barra fixa/i.test(n) ? ['complexo'] : []), ...o });
  await t('troca automática: mesmo músculo, serve ao local, à limitação e ao nível; nunca repete nem o que o aluno não tem; prefere o mesmo movimento e, em condomínio, o que usa menos aparelho', () => {
    const orig = LX('o', 'Tríceps banco máquina', 'TRICEPS', { eq: 'MAQUINA', env: ['GETGYM'] });
    const pool = [LX('a', 'Tríceps corda na polia', 'TRICEPS', { eq: 'POLIA', env: ['ACADEMIA_PADRAO', 'CONDOMINIO'] }), LX('b', 'Tríceps francês com halter', 'TRICEPS', { eq: 'HALTER', env: ['UNIVERSAL'], video: 'v' }), LX('c', 'Supino fechado', 'PEITO', { cat: 'Peito' }), LX('d', 'Tríceps na máquina GETGYM', 'TRICEPS', { eq: 'MAQUINA', env: ['GETGYM'] }), LX('o', 'Tríceps banco máquina', 'TRICEPS'), LX('e', 'Tríceps banco máquina ', 'TRICEPS')];
    assert.strictEqual(pickSwap(orig, pool, CTX({ env: 'CONDOMINIO' }))!.name, 'Tríceps francês com halter', 'condomínio: halter antes de polia'); assert.deepStrictEqual(Object.keys(pickSwap(orig, pool, CTX())!), ['id', 'name', 'videoUrl', 'category', 'subCategory']);
    assert.strictEqual(pickSwap(orig, pool, CTX({ usedNames: new Set([nameKey('Tríceps francês com halter')]) }))!.name, 'Tríceps corda na polia', 'já está na rotina: pula'); assert.strictEqual(pickSwap(orig, pool, CTX({ unavailable: new Set(['b', 'a']) })), null, 'o aluno disse que não tem os dois e os outros não são do mesmo músculo ou local');
    assert.strictEqual(pickSwap(orig, [LX('x', 'Tríceps testa', 'TRICEPS', { risk: ['COTOVELO'] })], CTX({ jointRisks: ['COTOVELO'] })), null, 'limitação'); assert.strictEqual(pickSwap(orig, [LX('x', 'Tríceps no cross', 'TRICEPS', { env: ['SMARTFIT'] })], CTX()), null, 'outro local'); assert.strictEqual(pickSwap(orig, [LX('x', 'Barra fixa fechada', 'TRICEPS')], CTX({ level: 'INICIANTE' })), null, 'pede mais nível');
    assert.strictEqual(pickSwap(orig, [LX('x', 'Tríceps A', 'TRICEPS', { mech: 'COMPOSTO' }), LX('y', 'Tríceps B', 'TRICEPS', { mech: 'ISOLADO' })], CTX())!.name, 'Tríceps B', 'mesmo movimento (isolado) vence'); assert.strictEqual(pickSwap(LX('o2', 'Remada', 'COSTAS', { cat: 'Costas' }), [LX('z', 'Elevação lateral', 'OMBRO', { cat: 'Costas' })], CTX()), null, 'outro músculo nunca');
    assert.strictEqual(pickSwap({ id: 'n', name: 'Sem tag', category: 'Abdômen' }, [{ id: 'm', name: 'Prancha', category: 'Abdômen', environments: [] }, { id: 'k', name: 'Perna', category: 'Pernas' }] as any, CTX())!.name, 'Prancha', 'sem tag de músculo: mesma categoria'); assert.strictEqual(pickSwap(orig, [], CTX()), null); assert.strictEqual(pickSwap(orig, null as any, CTX()), null);
    assert.deepStrictEqual(levelFix('Barra fixa', 'DROPSET + BISET', 'INICIANTE'), { techs: ['DROPSET'], complex: true }); assert.deepStrictEqual(levelFix('Supino', 'DROPSET', undefined), { techs: [], complex: false });
  });
  await t('comparação com troca: o que não serve ganha `swapTo`; exercício bom não; duas trocas nunca repetem o mesmo; vem o id da linha e o que corrigir', () => {
    const row = (id: string, ex: string, name: string, o: any = {}) => ({ id, exerciseId: ex, name, category: 'Tríceps', subCategory: 'Geral', sets: 3, reps: '12', restTime: 60, technique: o.tech ?? null, notes: null, order: o.order ?? 0, day: 'A', substitutes: [], tags: { target: 'TRICEPS', mechanic: 'ISOLADO', equipment: 'MAQUINA', jointRisk: [] }, environments: o.env || ['GETGYM'] });
    const pool = [LX('p1', 'Tríceps francês com halter', 'TRICEPS', { eq: 'HALTER' }), LX('p2', 'Tríceps corda na polia', 'TRICEPS', { eq: 'POLIA', env: ['ACADEMIA_PADRAO'] })];
    const c = compareWorkouts([row('r1', 'x1', 'Tríceps A máquina'), row('r2', 'x2', 'Tríceps B máquina', { order: 1 }), row('r3', 'x3', 'Tríceps C máquina', { order: 2 }), row('r4', 'x4', 'Tríceps livre', { order: 3, env: ['UNIVERSAL'], tech: 'DROPSET' })] as any, { unavailable: new Set(), jointRisks: [], env: 'ACADEMIA_PADRAO', level: 'INICIANTE', pool });
    const ex = c.days[0].exercises; assert.deepStrictEqual(ex.map((e) => e.rowId), ['r1', 'r2', 'r3', 'r4']); assert.deepStrictEqual(ex.map((e) => e.flags), [['AMBIENTE'], ['AMBIENTE'], ['AMBIENTE'], ['NIVEL']]);
    assert.deepStrictEqual(ex.slice(0, 3).map((e) => e.swapTo && e.swapTo.id), ['p2', 'p1', null], 'cada troca usa um exercício diferente; acabou a biblioteca, fica sem troca'); assert.strictEqual(ex[3].swapTo, null, 'só a técnica: não troca, tira a técnica'); assert.deepStrictEqual(ex[3].fix, { techs: ['DROPSET'], complex: false }); assert.strictEqual(ex[0].fix, null);
    assert.ok(ex.every((e) => 'swapTo' in e)); const none = compareWorkouts([row('r1', 'x1', 'Tríceps A máquina')] as any, { unavailable: new Set(), jointRisks: [], env: 'ACADEMIA_PADRAO' }).days[0].exercises[0]; assert.strictEqual(none.swapTo, null, 'sem biblioteca: sem troca');
  });
  await t('comparação do banco: a troca sai da biblioteca que o coach enxerga (parceiro não vê "só o Paulo vê") e respeita o local do aluno', async () => {
    const run = async (coach: string) => { seed(); S.user.push({ id: 'cP', role: 'COACH', coachId: null }); TARGET({ coachId: coach, level: 'Iniciante', createdAt: ago(10), startDate: ago(10) }, { equipamentos: ['Academia de Condomínio'], limitacoes: [] }); U('s', { coachId: coach }); A('s'); R('s', 's-w1', 90, 4);
      S.exercise.push({ id: 'o1', name: 'Tríceps banco máquina', category: 'Tríceps', subCategory: 'Geral', tags: { target: 'TRICEPS', mechanic: 'ISOLADO', equipment: 'MAQUINA', jointRisk: [] }, environments: ['GETGYM'], coachId: null, hiddenFromCoaches: false },
        { id: 'k1', name: 'Tríceps francês com halter', category: 'Tríceps', subCategory: 'Geral', tags: { target: 'TRICEPS', mechanic: 'ISOLADO', equipment: 'HALTER', jointRisk: [] }, environments: ['UNIVERSAL'], coachId: 'cP', hiddenFromCoaches: true },
        { id: 'k2', name: 'Tríceps corda na polia', category: 'Tríceps', subCategory: 'Geral', tags: { target: 'TRICEPS', mechanic: 'ISOLADO', equipment: 'POLIA', jointRisk: [] }, environments: ['ACADEMIA_PADRAO', 'CONDOMINIO'], coachId: null, hiddenFromCoaches: false },
        { id: 'k3', name: 'Tríceps no cross SMARTFIT', category: 'Tríceps', subCategory: 'Geral', tags: { target: 'TRICEPS', mechanic: 'ISOLADO', equipment: 'POLIA', jointRisk: [] }, environments: ['SMARTFIT'], coachId: null, hiddenFromCoaches: false });
      WE('s-w1', 'o1', 'A', 0, { id: 'row-1' }); const r: any = await loadComparison(P, coach, 't', 's', 's-w1'); return r.comparison.days[0].exercises[0]; };
    let e = await run('cA'); assert.deepStrictEqual(e.flags, ['AMBIENTE']); assert.strictEqual(e.rowId, 'row-1'); assert.strictEqual(e.swapTo.name, 'Tríceps corda na polia', 'parceiro não enxerga o halter escondido; o de outro local também não serve');
  });
  await t('comparação: só da carteira, mesmo gênero, ficha tem que ser da referência', async () => {
    seed(); TARGET(); REF('s', 3); REF('h', 3, { gender: 'Masculino' }); REF('o', 3, { coachId: 'cB' }); REF('n', 3, { gender: null }); U('t2', { name: 'Outra' }); A('t2'); R('t2', 't2-w1', 20, 4);
    const run = (src: string, w: string, tg = 't') => loadComparison(P, 'cA', tg, src, w);
    assert.strictEqual((await run('s', 's-w1')).ok, true);
    assert.strictEqual((await run('h', 'h-w1')).reason, 'GENERO_DIFERENTE'); assert.strictEqual((await run('o', 'o-w1')).reason, 'NAO_ENCONTRADO'); assert.strictEqual((await run('n', 'n-w1')).reason, 'SEM_GENERO');
    assert.strictEqual((await run('s', 't2-w1')).reason, 'SEM_ROTINA', 'ficha de outro aluno com o id da referência'); assert.strictEqual((await run('s', 'nada')).reason, 'SEM_ROTINA');
    assert.strictEqual((await run('t', 's-w1')).reason, 'NAO_ENCONTRADO', 'comparar com ele mesmo'); assert.strictEqual((await run('s', 's-w1', 'nada')).reason, 'NAO_ENCONTRADO');
    S.workout.push({ id: 'vazia', userId: 's', name: 'Vazia', createdAt: ago(1), archived: false }); const e: any = await run('s', 'vazia'); assert.deepStrictEqual([e.ok, e.comparison.summary.exercises, e.target.current], [true, 0, null]);
  });

  await t('rotas: login, só coach, parâmetros, carteira, gênero (422) e formato da resposta', async () => {
    seed(); TARGET(); REF('s', 3); REF('h', 3, { gender: 'Masculino' }); REF('o', 3, { coachId: 'cB' }); EX('e1'); WE('s-w1', 'e1', 'A', 0);
    assert.strictEqual((await get(similarGET, '/api/insights/similar?studentId=t', null)).status, 401); assert.strictEqual((await get(similarGET, '/api/insights/similar?studentId=t', tok('s', 'USER'))).status, 403);
    assert.strictEqual((await get(similarGET, '/api/insights/similar', tok('cA'))).status, 400); assert.strictEqual((await get(similarGET, '/api/insights/similar?studentId=o', tok('cA'))).status, 404, 'aluno de outro coach');
    let r = await get(similarGET, '/api/insights/similar?studentId=t', tok('cA')); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.json.similar.map((s: any) => s.studentId), ['s']); assert.strictEqual(r.json.similar[0].routine.id, 's-w1');
    assert.strictEqual((await get(similarGET, '/api/insights/similar?studentId=t', tok('cB'))).status, 404, 'outro coach não enxerga');
    S.user.find((u: any) => u.id === 't').gender = null; r = await get(similarGET, '/api/insights/similar?studentId=t', tok('cA')); assert.deepStrictEqual([r.status, r.json.ok, r.json.reason], [200, false, 'SEM_GENERO']); S.user.find((u: any) => u.id === 't').gender = 'Feminino';
    const url = (o: any) => '/api/insights/compare?' + Object.entries({ targetId: 't', sourceId: 's', workoutId: 's-w1', ...o }).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`).join('&');
    assert.strictEqual((await get(compareGET, url({}), null)).status, 401); assert.strictEqual((await get(compareGET, url({}), tok('s', 'USER'))).status, 403); assert.strictEqual((await get(compareGET, url({ workoutId: null }), tok('cA'))).status, 400);
    r = await get(compareGET, url({}), tok('cA')); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.comparison.summary.exercises, 1); assert.strictEqual(r.json.source.studentId, 's');
    r = await get(compareGET, url({ sourceId: 'h', workoutId: 'h-w1' }), tok('cA')); assert.deepStrictEqual([r.status, r.json.code], [422, 'GENERO_DIFERENTE']);
    assert.strictEqual((await get(compareGET, url({ sourceId: 'o', workoutId: 'o-w1' }), tok('cA'))).status, 404); assert.strictEqual((await get(compareGET, url({}), tok('cB'))).status, 404);
    S.failOn.workout = { message: 'caiu' }; assert.strictEqual((await get(compareGET, url({}), tok('cA'))).status, 500); assert.strictEqual((await get(similarGET, '/api/insights/similar?studentId=t', tok('cA'))).status, 500);
  });
  await t('assistente falado: "alunos parecidos com a Tati" acha o aluno pelo nome, lista com nota e rotina, e pede desempate quando há dois', async () => {
    assert.ok((INTENTS as readonly string[]).includes('ALUNOS_PARECIDOS'));
    for (const [q, who] of [['alunos parecidos com a Tati', 'Tati'], ['quais alunas parecidas com a Maria Souza', 'Maria Souza'], ['me mostra treinos semelhantes ao do Samuel', null], ['rotinas similares para a Ana', 'Ana'], ['parecidos com o João', 'Joao'], ['analise o treino da Tatiana Souza', 'Tatiana Souza'], ['analisar a rotina do Pedro', 'Pedro'], ['analisa as fichas da Ana', 'Ana']] as const) {
      const r = ruleRoute(q, {}); if (who) { assert.strictEqual(r.intent, 'ALUNOS_PARECIDOS', q); assert.strictEqual(r.params.aluno_falado, who, q); }
    }
    assert.notStrictEqual(ruleRoute('quem está sem treinar há 10 dias', {}).intent, 'ALUNOS_PARECIDOS'); assert.notStrictEqual(ruleRoute('analise os treinos vencendo', {}).intent, 'ALUNOS_PARECIDOS'); assert.strictEqual(ruleRoute('resumo da Tati', {}).intent, 'RESUMO_ALUNO');
    seed(); TARGET({ name: 'Tati Souza' }); REF('r1', 4, { name: 'Ana Lima' }, { limitacoes: ['Joelho'] }, 3); REF('r3', 4, { name: 'Bia Costa' }, { limitacoes: ['Joelho'], frequencia: 5 });
    const a: any = await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', { aluno_falado: 'Tati' }, { now: NOW });
    assert.strictEqual(a.intent, 'ALUNOS_PARECIDOS'); assert.strictEqual(a.total, 2); assert.deepStrictEqual(a.items.map((i: any) => i.id), ['r1', 'r3']); assert.match(a.items[0].detail, /^100% parecido · rotina 1 \(3 treinos\) · mesmo objetivo/);
    assert.match(a.spoken, /Para Tati Souza, 2 alunos parecidos \(comparando as rotinas 1 a 3\): Ana, 100% e Bia, 93%\. Toque em um para comparar e, se quiser, analisar com a IA\./); assert.strictEqual(a.similar.targetId, 't'); assert.strictEqual(a.similar.items[0].routine.id, 'r1-w1'); assert.strictEqual(a.similar.nextOrdinal, 1); assert.deepStrictEqual(a.similar.window, [1, 3]);
    seed(); TARGET({ name: 'Maria Silva' }); U('t2', { name: 'Maria Santos' }); A('t2'); REF('r1', 3);
    const amb: any = await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', { aluno_falado: 'Maria' }, { now: NOW }); assert.strictEqual(amb.title, 'Qual aluno?'); assert.deepStrictEqual(amb.ambiguous.map((x: any) => x.id).sort(), ['t', 't2']); assert.match(amb.items[0].detail, /alunos parecidos/);
    const follow: any = await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', {}, { now: NOW, studentId: 't2' }); assert.strictEqual(follow.similar.targetId, 't2', 'seguimento do "qual aluno?" já traz o id');
    assert.match((await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', {}, { now: NOW }) as any).spoken, /Parecidos com qual aluno/); assert.match((await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', { aluno_falado: 'Zzz' }, { now: NOW }) as any).spoken, /Não encontrei nenhum aluno chamado Zzz/);
    assert.match((await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', {}, { now: NOW, studentId: 'outro' }) as any).spoken, /Não encontrei esse aluno/);
    S.user.find((u: any) => u.id === 't').gender = null; assert.match((await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', {}, { now: NOW, studentId: 't' }) as any).spoken, /sem o gênero no cadastro/);
    seed(); TARGET(); const none: any = await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', {}, { now: NOW, studentId: 't' }); assert.deepStrictEqual([none.total, none.similar], [0, undefined]); assert.match(none.spoken, /Ainda não há outros alunos do mesmo gênero/);
    seed(); TARGET(); for (let k = 1; k <= 4; k++) R('t', 't-w' + k, (5 - k) * 30 + 10, 4); REF('r1', 2); const late: any = await runIntent(P, 'cA', 'ALUNOS_PARECIDOS', {}, { now: NOW, studentId: 't' }); assert.match(late.spoken, /nenhum já chegou nas rotinas 4 a 6/);
  });
  console.log(ok + ' blocos ok');
})();
