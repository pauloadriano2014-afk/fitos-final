import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as M from '/home/user/fitos-final/lib/monthlyReport';
import { GET } from '/home/user/fitos-final/app/api/monthly-report/route';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const NOW = new Date('2026-10-07T15:00:00Z');   // 12:00 em Brasília
let n = 0;
const H = (iso: string, details: any[], o: any = {}) => ({ id: 'h' + ++n, userId: 's1', date: new Date(iso), duration: 50, rpe: 7, details, ...o });
const D = (exerciseId: string, name: string, weight: number, reps = '10', o: any = {}) => ({ exerciseId, exerciseName: name, setNumber: 1, weight, reps, cardioSeconds: null, cardioKcal: null, ...o });
const rows = (count: number, ...a: [string, string, number, string?, any?]) => Array.from({ length: count }, (_, i) => ({ ...D(...a), setNumber: i + 1 }));
// treino de 1 série qualquer (a regra nova: treino sem nenhuma série gravada não conta)
const any1 = (iso: string, o: any = {}, ex = 'x9') => H(iso, rows(1, ex, 'Qualquer', 20), o);
const inp = (o: any = {}) => ({ now: NOW, days: 30, student: { name: 'Ana', coachId: 'c1', dietModule: false }, histories: [], prevHistories: [], baselineMax: {}, categories: {}, checkins: [], mealLogs: null, daily: null, plannedPerWeek: null, ...o });
const rep = (o: any = {}) => M.computeMonthlyReport(inp(o) as any);

const brtDay = (d: any) => new Date(new Date(d).getTime() - 3 * 3600000).toISOString().slice(0, 10);
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); n = 0; await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 9).join('\n        ')); } };

// ───────────── um mês cheio de dados ─────────────
const cats = { e1: 'Peito', e2: 'Costas', e3: 'Cardio', e4: 'Pernas', e5: 'Braços' };
const richHistories = () => [
  H('2026-09-08T15:00:00Z', [...rows(3, 'e1', 'Supino', 40, '10'), ...rows(2, 'e2', 'Remada', 30, '8-12')], { duration: 50, rpe: 7 }),
  H('2026-09-14T15:00:00Z', rows(3, 'e1', 'Supino', 45, '10'), { duration: 60, rpe: 8 }),
  H('2026-09-15T15:00:00Z', [D('e3', 'Escada', 10, '200', { cardioSeconds: 600, cardioKcal: 120 })], { duration: 40, rpe: 6 }),
  H('2026-10-06T15:00:00Z', rows(4, 'e4', 'Agachamento', 80, '12'), { duration: 70, rpe: 9 }),
  H('2026-10-06T20:00:00Z', rows(2, 'e5', 'Rosca', 15, '12'), { duration: null, rpe: null }),
];
const richPrev = () => [H('2026-09-01T15:00:00Z', rows(3, 'e1', 'Supino', 40, '10')), H('2026-09-03T15:00:00Z', rows(2, 'e2', 'Remada', 30, '10'))];
const richIn = () => inp({ histories: richHistories(), prevHistories: richPrev(), baselineMax: { e1: 40, e2: 30, e4: 70, e5: 15, e3: 5 }, categories: cats, plannedPerWeek: 4,
  student: { name: 'Ana', coachId: 'c1', dietModule: true },
  mealLogs: [...Array(6).fill('SEGUIU'), ...Array(2).fill('SUBSTITUIU'), ...Array(2).fill('PULOU'), ...Array(3).fill('LIVRE')].map((status, i) => ({ date: '2026-09-' + String(10 + (i % 15)), status })),
  daily: ['SIM', 'SIM', 'SIM', 'PARCIAL', 'NAO'].map((adherence, i) => ({ date: '2026-09-2' + i, adherence })),
  checkins: [{ id: 'c2', date: new Date('2026-10-05T12:00:00Z'), weight: 80.9, photoFront: 'f2', photoSide: 's2' }, { id: 'c1', date: new Date('2026-09-09T12:00:00Z'), weight: 82.4, photoFront: 'f1' }] });

(async () => {
  await block('texto puro: dias pedidos, repetições prescritas e números em português', () => {
    assert.deepStrictEqual([30, '14', '7', 92, '92', 6, 93, 0, -5, 'x', '', null, undefined, '30,4', 10.6].map(M.cleanDays), [30, 14, 7, 92, 92, 30, 30, 30, 30, 30, 30, 30, 30, 30, 11]);
    assert.deepStrictEqual(['12', '8-12', '8 - 12', '12-8', '6-7', '10/8/6', 'falha', '', null, undefined, '15 cada lado', '0', '999', '3x12'].map(M.repsCount), [12, 10, 10, 10, 7, 10, 10, 10, 10, 10, 15, 10, 10, 3]);
    assert.deepStrictEqual(['14,6', '14.4', ' 20 '].map(M.cleanDays), [15, 14, 20], 'vírgula decimal e arredondamento');
    assert.deepStrictEqual([M.fmtInt(0), M.fmtInt(999), M.fmtInt(1000), M.fmtInt(1234567), M.fmtInt(12.6)], ['0', '999', '1.000', '1.234.567', '13']);
    assert.deepStrictEqual([M.fmtDec(2), M.fmtDec(1.25), M.fmtDec(80.94), M.fmtDec(0)], ['2', '1,3', '80,9', '0']);
  });

  await block('treino: vezes, dias, semanas, médias, plano, esforço e comparação com o período anterior', () => {
    const r = M.computeMonthlyReport(richIn() as any);
    assert.deepStrictEqual([r.v, r.empty, r.period], [1, false, { start: '2026-09-08', end: '2026-10-07', days: 30, weeks: 5, label: '08/09 a 07/10' }]);
    const t = r.training;
    assert.deepStrictEqual([t.sessions, t.trainedDays, t.perWeek, t.activeWeeks, t.avgPerWeek], [5, 4, [2, 1, 0, 0, 2], 3, 1.2]);
    assert.deepStrictEqual([t.plannedPerWeek, t.adherencePct, t.totalMinutes, t.avgMinutes, t.avgRpe], [4, 29, 220, 55, 7.5]);
    assert.deepStrictEqual([t.prevSessions, t.sessionsDelta], [2, 3]);
    assert.deepStrictEqual([r.student.name, r.student.coachId], ['Ana', 'c1']);
  });

  await block('treino: casos de borda (plano, semanas, datas fora da faixa, sem comparação)', () => {
    const one = [H('2026-10-07T15:00:00Z', rows(1, 'e1', 'Supino', 40))];
    assert.strictEqual(rep({ histories: one, plannedPerWeek: null }).training.adherencePct, null);
    assert.strictEqual(rep({ histories: one, plannedPerWeek: 0 }).training.adherencePct, null);
    const neg = rep({ histories: one, plannedPerWeek: -2 }).training; assert.deepStrictEqual([neg.plannedPerWeek, neg.adherencePct], [null, null], 'plano negativo (dado ruim) = sem plano');
    assert.strictEqual(rep({ histories: one, plannedPerWeek: 1 }).training.adherencePct, 23, '1 treino em 4,3 semanas com plano de 1 por semana');
    const many = Array.from({ length: 40 }, (_, i) => H(`2026-09-${String(8 + (i % 20)).padStart(2, '0')}T15:00:00Z`, rows(1, 'e1', 'Supino', 40)));
    assert.strictEqual(rep({ histories: many, plannedPerWeek: 3 }).training.adherencePct, 100, 'nunca passa de 100%');
    assert.deepStrictEqual(rep({ histories: one }).training.sessionsDelta, null, 'sem período anterior não há comparação');
    const odd = rep({ histories: [H('2026-08-01T15:00:00Z', rows(1, 'e1', 'Supino', 40)), H('2026-11-01T15:00:00Z', rows(1, 'e1', 'Supino', 40))] });
    assert.deepStrictEqual(odd.training.perWeek, [1, 0, 0, 0, 1], 'data antes do início cai na 1ª semana; depois do fim, na última');
    const w1 = rep({ days: 7, histories: one }); assert.deepStrictEqual([w1.period.weeks, w1.training.perWeek, w1.period.start], [1, [1], '2026-10-01']);
    assert.strictEqual(w1.highlights[0].text, 'Treinou 1 vez em 1 semana (média de 1 por semana)');
    assert.deepStrictEqual([rep({ histories: [any1('2026-10-07T15:00:00Z', { duration: 0, rpe: 0 })] }).training].map((t) => [t.avgMinutes, t.avgRpe, t.totalMinutes]), [[null, null, 0]]);
    const sameDay = rep({ histories: [any1('2026-10-07T13:00:00Z', {}, 'x1'), any1('2026-10-07T20:00:00Z', {}, 'x2')] }); assert.deepStrictEqual([sameDay.training.sessions, sameDay.training.trainedDays], [2, 1]);
    const night = rep({ histories: [any1('2026-10-07T01:30:00Z')] }); assert.strictEqual(night.training.perWeek[4], 1, '01:30 UTC ainda é 22:30 do dia 6 em Brasília (mesma semana)');
  });

  await block('volume: kg x repetições prescritas, comparação, sem cardio/mobilidade; séries contadas', () => {
    const r = M.computeMonthlyReport(richIn() as any);
    assert.deepStrictEqual(r.volume, { totalKg: 7350, prevKg: 1800, changePct: 308, sets: 14 });
    const v = M.volumeOf([H('2026-10-01T15:00:00Z', [D('e1', 'Supino', 100, '10'), D('e1', 'Supino', 0, '10'), D('e3', 'Esteira', 30, '30'), D('e7', 'Mob', 5, '10'), D('e8', 'Escada', 10, '1', { cardioSeconds: 60 }), D('e8', 'Escada', 10, '1', { cardioKcal: 9 }), D('e9', 'X', 50, '10')])], { e1: 'Peito', e3: 'Cardio', e7: 'Mobilidade', e9: 'Alongamento' });
    assert.deepStrictEqual(v, { kg: 1000, sets: 2 }, 'só força: série com 0 kg conta como série, mas não soma kg');
    assert.deepStrictEqual(['0-10', '10-300', '0-0', '300-0'].map(M.repsCount), [10, 10, 10, 10], 'faixa com uma ponta fora do limite usa só a ponta válida (e nunca vira NaN)');
    assert.deepStrictEqual(M.volumeOf([H('2026-10-01T15:00:00Z', [D('e1', 'Supino', -20, '10'), D('e1', 'Supino', 50, '10')])], {}), { kg: 500, sets: 2 }, 'carga negativa (dado ruim) conta a série mas não subtrai do volume');
    assert.deepStrictEqual(M.volumeOf([], {}), { kg: 0, sets: 0 }); assert.deepStrictEqual(M.volumeOf([{ date: new Date() } as any], {}), { kg: 0, sets: 0 });
    assert.strictEqual(rep({ histories: richHistories(), categories: cats }).volume.changePct, null, 'sem período anterior: sem porcentagem');
    assert.strictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', rows(1, 'e1', 'Supino', 50, '10'))], prevHistories: [H('2026-09-01T15:00:00Z', rows(1, 'e1', 'Supino', 100, '10'))] }).volume.changePct, -50);
    assert.strictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('e1', 'S', 10, '10', { weight: '12.5' as any })])] }).volume.totalKg, 125, 'carga em texto numérico');
    assert.strictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('e1', 'S', 'abc' as any, '10')])] }).volume.totalKg, 0);
    assert.strictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('e1', 'S', 12.5, '9')])] }).volume.totalKg, 113, 'volume em kg inteiros (112,5 vira 113)');
    assert.deepStrictEqual(M.volumeOf([H('2026-10-01T15:00:00Z', [D('a', 'A', 30, '10'), D('b', 'B', 30, '10')])], { a: 'Aeróbico', b: 'Aerobico' }), { kg: 0, sets: 0 }, 'aeróbico (com ou sem acento) não é força');
  });

  await block('recordes: só a carga do período MAIOR que todo o histórico anterior; exercício novo não conta; no máximo 5, maiores ganhos primeiro', () => {
    const r = M.computeMonthlyReport(richIn() as any);
    assert.deepStrictEqual(r.records, [{ exerciseId: 'e4', name: 'Agachamento', from: 70, to: 80, gain: 10 }, { exerciseId: 'e1', name: 'Supino', from: 40, to: 45, gain: 5 }], 'remada empatou (30), rosca empatou (15), escada é cardio');
    const h = [H('2026-10-01T15:00:00Z', [D('a', 'A', 50), D('b', 'B', 50.005), D('c', 'C', 51), D('d', 'D', 0), D('e', 'E', 80), D('f', 'F', 52), D('g', 'G', 53), D('h', 'H', 54), D('i', 'I', 55), D('c', 'C', 40)])];
    const rr = rep({ histories: h, baselineMax: { a: 0, b: 50, c: 50, d: 10, f: 50, g: 50, h: 50, i: 50 }, categories: {} }).records;
    assert.deepStrictEqual(rr.map((x) => [x.name, x.gain]), [['I', 5], ['H', 4], ['G', 3], ['F', 2], ['C', 1]], 'A sem base (0) e E sem base não contam; B subiu só 0,005; D com 0 kg não conta; máximo de 5');
    const seven = 'ABCDEFG'.split('').map((g, i) => D('r' + g, 'Ex ' + g, 60 + i));
    const bases: any = {}; 'ABCDEFG'.split('').forEach((g) => { bases['r' + g] = 50; });
    const lim = rep({ histories: [H('2026-10-01T15:00:00Z', seven)], baselineMax: bases }).records; assert.deepStrictEqual(lim.map((x) => x.name), ['Ex G', 'Ex F', 'Ex E', 'Ex D', 'Ex C'], '7 recordes: só os 5 maiores ganhos');
    assert.deepStrictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('b', 'B', 50.005)])], baselineMax: { b: 50 } }).records, [], 'subir 0,005 kg não é recorde');
    assert.deepStrictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('b', 'B', 50.01)])], baselineMax: { b: 50 } }).records, [], 'subir exatamente 0,01 kg ainda não é recorde');
    assert.strictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('b', 'B', 50.02)])], baselineMax: { b: 50 } }).records.length, 1, 'acima de 0,01 kg já é');
    const ties = rep({ histories: [H('2026-10-01T15:00:00Z', [D('x', 'Zebra', 60), D('y', 'Abdominal', 60)])], baselineMax: { x: 50, y: 50 } }).records.map((x) => x.name);
    assert.deepStrictEqual(ties, ['Abdominal', 'Zebra'], 'mesmo ganho: ordem alfabética');
    assert.strictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('x', '  ', 60)])], baselineMax: { x: 50 } }).records[0].name, 'Exercício', 'sem nome');
    assert.deepStrictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('x', 'Esteira', 60)])], baselineMax: { x: 10 }, categories: { x: 'Cardio' } }).records, [], 'cardio nunca é recorde');
    assert.deepStrictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('x', 'Mob', 60)])], baselineMax: { x: 10 }, categories: { x: 'Mobilidade' } }).records, []);
    const best = rep({ histories: [H('2026-10-01T15:00:00Z', [D('x', 'Supino', 55)]), H('2026-10-03T15:00:00Z', [D('x', 'Supino', 60)]), H('2026-10-05T15:00:00Z', [D('x', 'Supino', 58)])], baselineMax: { x: 50 } }).records;
    assert.deepStrictEqual([best.length, best[0].to, best[0].gain], [1, 60, 10], 'vale a MAIOR carga do período');
  });

  await block('músculos: séries por categoria (só força), maiores primeiro, no máximo 6; sem categoria fica de fora', () => {
    const r = M.computeMonthlyReport(richIn() as any);
    assert.deepStrictEqual(r.muscles, [{ group: 'Peito', sets: 6 }, { group: 'Pernas', sets: 4 }, { group: 'Braços', sets: 2 }, { group: 'Costas', sets: 2 }]);
    const c: any = {}; const d: any[] = []; 'ABCDEFGH'.split('').forEach((g, i) => { c['x' + g] = 'Grupo ' + g; d.push(...rows(i + 1, 'x' + g, 'Ex ' + g, 10)); });
    const big = rep({ histories: [H('2026-10-01T15:00:00Z', d)], categories: c }).muscles; assert.deepStrictEqual(big.map((x) => x.group), ['Grupo H', 'Grupo G', 'Grupo F', 'Grupo E', 'Grupo D', 'Grupo C']);
    const none = rep({ histories: [H('2026-10-01T15:00:00Z', [D('q', 'Sem grupo', 10), D('r', 'Em branco', 10)])], categories: { r: '   ' } }); assert.deepStrictEqual(none.muscles, []); assert.strictEqual(none.volume.sets, 2, 'a série conta no volume, só não aparece em músculos');
    assert.deepStrictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('q', 'E', 10)])], categories: { q: 'Mobilidade' } }).muscles, []);
    assert.deepStrictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', [D('q', 'E', 10)])], categories: { q: 'Alongamento' } }).muscles, []);
  });

  await block('cardio: tempo e calorias reais; cardio antigo usa os minutos do campo de carga; conta só os treinos com cardio', () => {
    const r = M.computeMonthlyReport(richIn() as any);
    assert.deepStrictEqual(r.cardio, { sessions: 1, minutes: 10, kcal: 120 });
    const legacy = rep({ histories: [H('2026-10-01T15:00:00Z', [D('e3', 'Esteira', 20, '200')]), H('2026-10-02T15:00:00Z', [D('e3', 'Esteira', 25, '200')])], categories: { e3: 'Cardio' } });
    assert.deepStrictEqual(legacy.cardio, { sessions: 2, minutes: 45, kcal: 0 }); assert.strictEqual(legacy.highlights.find((h) => h.key === 'cardio')!.text, 'Cardio: 45 min');
    const aerob = rep({ histories: [H('2026-10-01T15:00:00Z', [D('z', 'Bike', 15, '1')])], categories: { z: 'Aeróbico' } }); assert.deepStrictEqual(aerob.cardio, { sessions: 1, minutes: 15, kcal: 0 }, 'categoria "Aeróbico" também é cardio antigo');
    const exact = rep({ histories: [H('2026-10-01T15:00:00Z', [D('e3', 'Esteira', 99, '1', { cardioSeconds: 750, cardioKcal: 180 })])], categories: { e3: 'Cardio' } }); assert.deepStrictEqual(exact.cardio, { sessions: 1, minutes: 13, kcal: 180 }, 'o tempo exato vale mais que o campo de carga');
    const kcalOnly = rep({ histories: [H('2026-10-01T15:00:00Z', [D('z', 'Bike', 40, '1', { cardioKcal: 300 })])] }); assert.deepStrictEqual(kcalOnly.cardio, { sessions: 1, minutes: 0, kcal: 300 }, 'sem categoria e sem tempo: o campo de carga não vira minutos');
    assert.deepStrictEqual(rep({ histories: [H('2026-10-01T15:00:00Z', rows(3, 'e1', 'Supino', 40))], categories: { e1: 'Peito' } }).cardio, { sessions: 0, minutes: 0, kcal: 0 });
    assert.ok(!rep({ histories: [H('2026-10-01T15:00:00Z', rows(1, 'e1', 'Supino', 40))] }).highlights.some((h) => h.key === 'cardio'));
  });

  await block('dieta: refeições seguidas/substituídas contra as puladas (livre não conta); só com o módulo; sem registro = nada', () => {
    const r = M.computeMonthlyReport(richIn() as any);
    assert.deepStrictEqual(r.diet, { meals: 13, followed: 6, substituted: 2, skipped: 2, free: 3, followedPct: 80, dayYes: 3, dayPartial: 1, dayNo: 1 });
    const ml = (...s: string[]) => s.map((status, i) => ({ date: '2026-09-1' + (i % 9), status }));
    assert.strictEqual(rep({ student: { dietModule: false }, mealLogs: ml('SEGUIU', 'SEGUIU'), histories: [any1('2026-10-01T15:00:00Z')] }).diet, null, 'módulo desligado');
    assert.strictEqual(rep({ student: { dietModule: true }, mealLogs: null, daily: null }).diet, null, 'consulta auxiliar falhou');
    assert.strictEqual(rep({ student: { dietModule: true }, mealLogs: [], daily: [] }).diet, null, 'nada registrado');
    const onlyFree = rep({ student: { dietModule: true }, mealLogs: ml('LIVRE', 'LIVRE', 'LIVRE') }).diet!; assert.deepStrictEqual([onlyFree.meals, onlyFree.followedPct], [3, null]);
    const dailyOnly = rep({ student: { dietModule: true }, mealLogs: [], daily: [{ date: '2026-09-10', adherence: 'sim' }, { date: '2026-09-11', adherence: null }] }).diet!; assert.deepStrictEqual([dailyOnly.meals, dailyOnly.dayYes, dailyOnly.followedPct], [0, 1, null], 'só o fim do dia também vale; "sim" em minúscula');
    const hl = (m: any) => rep({ student: { dietModule: true }, histories: [any1('2026-10-01T15:00:00Z')], mealLogs: m }).highlights.find((h) => h.key === 'diet');
    assert.strictEqual(hl(ml('SEGUIU', 'SEGUIU', 'SEGUIU', 'SEGUIU', 'PULOU'))!.text, 'Dieta: seguiu 80% das refeições registradas'); assert.strictEqual(hl(ml('SEGUIU', 'SEGUIU', 'SEGUIU', 'SEGUIU', 'PULOU'))!.tone, 'good');
    assert.strictEqual(hl(ml('SEGUIU', 'SEGUIU', 'SEGUIU', 'SEGUIU')), undefined, 'menos de 5 refeições: não vira destaque');
    assert.strictEqual(hl(ml('SEGUIU', 'PULOU', 'PULOU', 'PULOU', 'PULOU'))!.tone, 'warn'); assert.strictEqual(hl(ml('SEGUIU', 'SEGUIU', 'SEGUIU', 'PULOU', 'PULOU'))!.tone, 'neutral');
    assert.strictEqual(hl(ml('SEGUIU', 'SEGUIU', 'SEGUIU', 'PULOU', 'PULOU', 'PULOU'))!.tone, 'neutral', 'exatamente 50% ainda é neutro');
    assert.strictEqual(hl(ml('SEGUIU', 'SEGUIU', 'PULOU', 'PULOU', 'PULOU', 'PULOU'))!.tone, 'warn', '33% é atenção');
    assert.strictEqual(hl(ml('SEGUIU', 'SEGUIU', 'SEGUIU', 'SEGUIU', 'LIVRE')), undefined, 'refeição livre não conta para o mínimo de 5');
  });

  await block('corpo: peso do primeiro ao último check-in do período; fotos de antes e depois só com 2 ou mais', () => {
    const r = M.computeMonthlyReport(richIn() as any);
    assert.deepStrictEqual(r.body, { weightStart: 82.4, weightEnd: 80.9, delta: -1.5, checkIns: 2, before: { date: '2026-09-09', front: 'f1', side: null, back: null }, after: { date: '2026-10-05', front: 'f2', side: 's2', back: null } });
    const one = rep({ checkins: [{ date: new Date('2026-10-01T12:00:00Z'), weight: 80, photoFront: 'a' }] }).body; assert.deepStrictEqual([one.weightStart, one.weightEnd, one.delta, one.before, one.after, one.checkIns], [null, null, null, null, null, 1]);
    const lateP = rep({ checkins: [{ date: new Date('2026-09-10T12:00:00Z'), weight: 80 }, { date: new Date('2026-09-20T12:00:00Z'), weight: 79, photoFront: 'b' }, { date: new Date('2026-10-01T12:00:00Z'), weight: 78, photoFront: 'c' }] }).body; assert.deepStrictEqual([lateP.before!.front, lateP.after!.front], ['b', 'c'], 'o antes é a primeira foto de verdade, mesmo que o 1º check-in não tenha foto');
    const noPhoto = rep({ checkins: [{ date: new Date('2026-09-10T12:00:00Z'), weight: 80 }, { date: new Date('2026-10-01T12:00:00Z'), weight: 81.25 }] }).body; assert.deepStrictEqual([noPhoto.delta, noPhoto.before, noPhoto.after], [1.3, null, null]);
    const zero = rep({ checkins: [{ date: new Date('2026-09-10T12:00:00Z'), weight: 0, photoFront: 'a' }, { date: new Date('2026-10-01T12:00:00Z'), weight: 80, photoBack: 'b' }] }).body; assert.deepStrictEqual([zero.weightStart, zero.before!.front, zero.after!.back], [null, 'a', 'b'], 'peso 0 é ignorado; a foto continua valendo');
    const mixed = rep({ checkins: [{ date: new Date('2026-09-10T12:00:00Z'), weight: 80, photoFront: 'a' }, { date: new Date('2026-09-20T12:00:00Z'), weight: 79 }, { date: new Date('2026-10-01T12:00:00Z'), weight: 78, photoSide: 'c' }] }).body; assert.deepStrictEqual([mixed.weightStart, mixed.weightEnd, mixed.before!.front, mixed.after!.side, mixed.checkIns], [80, 78, 'a', 'c', 3], 'o check-in do meio sem foto não atrapalha');
  });

  await block('frases do relatório: exatamente o que o aluno lê (números do código, nunca da IA)', () => {
    const r = M.computeMonthlyReport(richIn() as any);
    assert.deepStrictEqual(r.highlights.map((h) => [h.key, h.icon, h.tone, h.text]), [
      ['training', 'dumbbell', 'warn', 'Treinou 5 vezes em 5 semanas (média de 1,2 por semana) · 29% do plano'],
      ['records', 'trophy-outline', 'good', '2 recordes de carga: Agachamento 70 → 80 kg · Supino 40 → 45 kg'],
      ['volume', 'weight-lifter', 'good', 'Volume de treino (estimado): 7,4 toneladas (+308% em relação ao período anterior)'],
      ['cardio', 'heart-pulse', 'neutral', 'Cardio: 10 min · 120 kcal'],
      ['diet', 'food-apple-outline', 'good', 'Dieta: seguiu 80% das refeições registradas'],
      ['body', 'scale-bathroom', 'neutral', 'Peso: 82,4 → 80,9 kg (−1,5 kg)'],
    ]);
    const e = rep({}); assert.deepStrictEqual([e.empty, e.highlights], [true, [{ key: 'training', icon: 'dumbbell', text: 'Nenhum treino registrado neste período.', tone: 'warn' }]]);
    assert.deepStrictEqual([e.records, e.muscles, e.diet, e.cardio.minutes, e.volume.totalKg], [[], [], null, 0, 0]);
    const txt = (o: any) => rep(o).highlights.map((h) => h.text);
    const one = [H('2026-10-01T15:00:00Z', rows(1, 'e1', 'Supino', 50, '10'))];
    assert.strictEqual(txt({ histories: one })[0], 'Treinou 1 vez em 5 semanas (média de 0,2 por semana)');
    assert.ok(txt({ histories: one, plannedPerWeek: 1 })[0].endsWith('· 23% do plano')); assert.strictEqual(rep({ histories: one, plannedPerWeek: 1 }).highlights[0].tone, 'warn');
    const tone = (pp: number, hs = Array.from({ length: 4 }, (_, i) => any1(`2026-09-${10 + i}T15:00:00Z`))) => rep({ histories: hs, plannedPerWeek: pp }).highlights[0].tone;
    assert.deepStrictEqual([tone(1), tone(1.5), tone(2)], ['good', 'neutral', 'warn'], '4 treinos: 93% (bom), 62% (neutro), 47% (atenção)');
    const toneW = (planned: number, count: number) => rep({ days: 7, histories: Array.from({ length: count }, (_, i) => any1(`2026-10-0${1 + i}T15:00:00Z`)), plannedPerWeek: planned }).highlights[0].tone;
    assert.deepStrictEqual([toneW(5, 4), toneW(2, 1), toneW(3, 1), toneW(10, 5), toneW(10, 8)], ['good', 'neutral', 'warn', 'neutral', 'good'], '80% já é bom; 50% ainda é neutro; 33% é atenção');
    assert.strictEqual(rep({ histories: one }).highlights[0].tone, 'neutral', 'sem plano conhecido: neutro');
    assert.strictEqual(txt({ histories: one })[1], 'Volume de treino (estimado): 500 kg', 'abaixo de 1 tonelada fica em kg');
    assert.strictEqual(txt({ histories: [H('2026-10-01T15:00:00Z', rows(1, 'e1', 'S', 500, '10'))] })[1], 'Volume de treino (estimado): 5 toneladas');
    assert.strictEqual(txt({ histories: [H('2026-10-01T15:00:00Z', rows(1, 'e1', 'S', 100, '10'))] })[1], 'Volume de treino (estimado): 1 tonelada', 'singular com exatamente 1 tonelada');
    assert.strictEqual(txt({ histories: [H('2026-10-01T15:00:00Z', rows(1, 'e1', 'S', 99, '10'))] })[1], 'Volume de treino (estimado): 990 kg', '990 kg ainda é em kg');
    assert.strictEqual(txt({ histories: [H('2026-10-01T15:00:00Z', rows(3, 'e1', 'S', 120, '10'))] })[1], 'Volume de treino (estimado): 3,6 toneladas');
    assert.strictEqual(txt({ histories: [H('2026-10-01T15:00:00Z', rows(1, 'e1', 'S', 1234, '10'))] })[1], 'Volume de treino (estimado): 12,3 toneladas');
    const neg = rep({ histories: one, prevHistories: [H('2026-09-01T15:00:00Z', rows(1, 'e1', 'Supino', 100, '10'))] }).highlights.find((h) => h.key === 'volume')!; assert.deepStrictEqual([neg.text, neg.tone], ['Volume de treino (estimado): 500 kg (−50% em relação ao período anterior)', 'warn']);
    assert.strictEqual(txt({ histories: [H('2026-10-01T15:00:00Z', [D('x', 'Leve', 1, '1')])] })[1], 'Volume de treino (estimado): 1 kg', 'qualquer volume maior que zero aparece');
    const same0 = rep({ histories: one, prevHistories: [H('2026-09-01T15:00:00Z', rows(1, 'e1', 'Supino', 50, '10'))] }).highlights.find((h) => h.key === 'volume')!; assert.deepStrictEqual([same0.text, same0.tone], ['Volume de treino (estimado): 500 kg (igual ao período anterior)', 'good']);
    const up = rep({ histories: one, prevHistories: [H('2026-09-01T15:00:00Z', rows(1, 'e1', 'Supino', 40, '10'))] }).highlights.find((h) => h.key === 'volume')!; assert.deepStrictEqual([up.text, up.tone], ['Volume de treino (estimado): 500 kg (+25% em relação ao período anterior)', 'good']);
    const zeroLoad = rep({ histories: [H('2026-10-01T15:00:00Z', [D('x', 'Flexão', 0)])] }); assert.ok(!zeroLoad.highlights.some((h) => h.key === 'volume'), 'sem carga: sem volume');
    const rec1 = rep({ histories: [H('2026-10-01T15:00:00Z', [D('x', 'Supino', 52.5)])], baselineMax: { x: 50 } }).highlights.find((h) => h.key === 'records')!; assert.strictEqual(rec1.text, '1 recorde de carga: Supino 50 → 52,5 kg');
    const rec3 = rep({ histories: [H('2026-10-01T15:00:00Z', [D('a', 'A', 11), D('b', 'B', 12), D('c', 'C', 13)])], baselineMax: { a: 10, b: 10, c: 10 } }).highlights.find((h) => h.key === 'records')!; assert.strictEqual(rec3.text, '3 recordes de carga: C 10 → 13 kg · B 10 → 12 kg e mais');
    const gain = rep({ histories: one, checkins: [{ date: new Date('2026-09-10T12:00:00Z'), weight: 70 }, { date: new Date('2026-10-01T12:00:00Z'), weight: 71.2 }] }).highlights.find((h) => h.key === 'body')!.text; assert.strictEqual(gain, 'Peso: 70 → 71,2 kg (+1,2 kg)');
    const same = rep({ histories: one, checkins: [{ date: new Date('2026-09-10T12:00:00Z'), weight: 70 }, { date: new Date('2026-10-01T12:00:00Z'), weight: 70 }] }).highlights.find((h) => h.key === 'body')!.text; assert.strictEqual(same, 'Peso: 70 → 70 kg (0 kg)');
    assert.strictEqual(M.buildHighlights(rep({ histories: one })).length, rep({ histories: one }).highlights.length);
  });

  // ───────────── carregamento do banco ─────────────
  const seed = () => {
    P.__addUser({ id: 'c1', role: 'COACH' }); P.__addUser({ id: 'c2', role: 'COACH' });
    P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1', dietModule: true, monthlyReportOn: true }); P.__addUser({ id: 's2', name: 'Bia', coachId: 'c2' });
    S.exercises.push({ id: 'e1', category: 'Peito' }, { id: 'e3', category: 'Cardio' });
  };
  const load = (o: any = {}) => M.loadMonthlyReport(P, { id: 's1', name: 'Ana Souza', coachId: 'c1', dietModule: true }, { now: NOW, ...o });

  await block('banco: o período vai do começo do dia 08/09 ao fim do dia 07/10 em Brasília (a 1 s do limite muda de lado)', async () => {
    seed();
    S.histories.push(
      H('2026-08-09T02:59:59Z', rows(1, 'e1', 'Supino', 60)),                 // antes do período anterior: só entra na base dos recordes
      H('2026-08-09T03:00:00Z', rows(1, 'e1', 'Supino', 50)),                 // 1º instante do período anterior
      H('2026-09-08T02:59:59Z', rows(1, 'e1', 'Supino', 40)),                 // 23:59:59 do dia 07/09 em Brasília: período anterior
      H('2026-09-08T03:00:00Z', rows(1, 'e1', 'Supino', 70)),                 // 00:00:00 de 08/09: 1º instante do período
      H('2026-10-08T02:59:59Z', rows(1, 'e1', 'Supino', 30)),                 // 23:59:59 de 07/10: último instante
      H('2026-10-08T03:00:00Z', rows(1, 'e1', 'Supino', 99)),                 // 00:00 de 08/10: amanhã, fora
      H('2026-09-20T15:00:00Z', rows(1, 'e1', 'Supino', 500), { userId: 's2' }),   // outro aluno
    );
    const r = await load();
    assert.deepStrictEqual([r.training.sessions, r.training.prevSessions], [2, 2]);
    assert.deepStrictEqual(r.records, [{ exerciseId: 'e1', name: 'Supino', from: 60, to: 70, gain: 10 }], 'a base é a maior carga de TUDO que veio antes do dia 08/09 (60 kg), do outro aluno nada');
    assert.deepStrictEqual([r.volume.totalKg, r.volume.prevKg], [(70 + 30) * 10, (50 + 40) * 10]);
    assert.deepStrictEqual([r.period.start, r.period.end], ['2026-09-08', '2026-10-07']);
    const week = await load({ days: 7 }); assert.deepStrictEqual([week.period.start, week.training.sessions, week.training.prevSessions], ['2026-10-01', 1, 0]);
    const clamp = await load({ days: 'lixo' }); assert.strictEqual(clamp.period.days, 30);
  });

  await block('banco: cardio antigo só do período anterior também é reconhecido (minutos não viram "volume" na comparação)', async () => {
    seed();
    S.histories.push(H('2026-08-20T15:00:00Z', [D('e3', 'Esteira', 20, '200')]), H('2026-09-20T15:00:00Z', rows(1, 'e1', 'Supino', 40)));
    const r = await load(); assert.deepStrictEqual([r.volume.totalKg, r.volume.prevKg, r.volume.changePct, r.training.prevSessions], [400, 0, null, 1], 'o cardio do período anterior não conta como carga');
  });

  await block('banco: músculos e cardio vêm das categorias dos exercícios; sem exercícios nem consulta de categoria', async () => {
    seed();
    S.histories.push(H('2026-09-20T15:00:00Z', [...rows(2, 'e1', 'Supino', 40), D('e3', 'Escada', 5, '1', { cardioSeconds: 1200, cardioKcal: 150 })]));
    const r = await load(); assert.deepStrictEqual([r.muscles, r.cardio], [[{ group: 'Peito', sets: 2 }], { sessions: 1, minutes: 20, kcal: 150 }]);
    P.__reset(); seed(); S.fail = {}; const e = await load(); assert.strictEqual(e.empty, true); assert.ok(!S.calls.includes('exercise'), 'sem treino no período, nem busca as categorias');
  });

  await block('banco: plano por semana (dias distintos do plano ativo), dieta e check-ins do período', async () => {
    seed();
    S.histories.push(H('2026-09-20T15:00:00Z', rows(1, 'e1', 'Supino', 40)));
    S.workouts.push(
      { id: 'w1', userId: 's1', archived: false, startDate: null, endDate: null, createdAt: new Date('2026-08-01T12:00:00Z'), alternateSlot: null, exercises: ['A', 'A', 'B', 'C', 'OFF', 'Descanso 1', '', null].map((day) => ({ day, exerciseId: 'e1' })) },
      { id: 'w2', userId: 's1', archived: false, startDate: null, endDate: new Date('2026-09-01T12:00:00Z'), createdAt: new Date('2026-07-01T12:00:00Z'), alternateSlot: null, exercises: ['D', 'E'].map((day) => ({ day, exerciseId: 'e1' })) },
      { id: 'w3', userId: 's1', archived: true, startDate: null, endDate: null, createdAt: new Date('2026-07-01T12:00:00Z'), alternateSlot: null, exercises: [{ day: 'F', exerciseId: 'e1' }] },
    );
    S.mealLogs.push(...['SEGUIU', 'SEGUIU', 'PULOU'].map((status, i) => ({ userId: 's1', date: '2026-09-2' + i, status })), { userId: 's1', date: '2026-09-08', status: 'LIVRE' }, { userId: 's1', date: '2026-10-07', status: 'SUBSTITUIU' }, { userId: 's1', date: '2026-09-07', status: 'PULOU' }, { userId: 's1', date: '2026-10-08', status: 'PULOU' }, { userId: 's2', date: '2026-09-20', status: 'PULOU' });
    S.daily.push({ studentId: 's1', date: '2026-09-21', dietAdherence: 'SIM' }, { studentId: 's1', date: '2026-09-08', dietAdherence: 'PARCIAL' }, { studentId: 's1', date: '2026-10-07', dietAdherence: 'SIM' }, { studentId: 's1', date: '2026-09-06', dietAdherence: 'NAO' }, { studentId: 's2', date: '2026-09-21', dietAdherence: 'NAO' });
    S.checkins.push({ id: 'k1', userId: 's1', date: new Date('2026-09-09T12:00:00Z'), weight: 80, photoFront: 'a' }, { id: 'k2', userId: 's1', date: new Date('2026-10-06T12:00:00Z'), weight: 79, photoFront: 'b' }, { id: 'k3', userId: 's1', date: new Date('2026-08-01T12:00:00Z'), weight: 90, photoFront: 'z' }, { id: 'k4', userId: 's1', date: new Date('2026-10-08T03:00:00Z'), weight: 60, photoFront: 'amanha' }, { id: 'k5', userId: 's2', date: new Date('2026-10-01T12:00:00Z'), weight: 50, photoFront: 'outro' });
    const r = await load();
    assert.strictEqual(r.training.plannedPerWeek, 3, 'dias A, B e C (OFF, descanso e vazio não contam; a ficha vencida e a arquivada ficam de fora)');
    assert.deepStrictEqual([r.diet!.meals, r.diet!.followed, r.diet!.substituted, r.diet!.free, r.diet!.skipped, r.diet!.dayYes, r.diet!.dayPartial, r.diet!.dayNo], [5, 2, 1, 1, 1, 2, 1, 0], 'só o que está nas datas do período (inclusive o primeiro e o último dia) e é do aluno');
    assert.deepStrictEqual([r.body.weightStart, r.body.weightEnd, r.body.before!.front, r.body.after!.front, r.body.checkIns], [80, 79, 'a', 'b', 2], 'check-in de amanhã, de antes do período e de outro aluno ficam de fora');
    P.__state.users.get('s1').dietModule = false; const noDiet = await M.loadMonthlyReport(P, { id: 's1', name: 'A', coachId: 'c1', dietModule: false }, { now: NOW }); assert.strictEqual(noDiet.diet, null);
    S.calls.length = 0; await M.loadMonthlyReport(P, { id: 's1', name: 'A', coachId: 'c1', dietModule: false }, { now: NOW });
    assert.ok(!S.calls.includes('dietMealLog') && !S.calls.includes('dailyCheckin'), 'módulo de dieta desligado: nem consulta a dieta');
    S.calls.length = 0; await M.loadMonthlyReport(P, { id: 's1', name: 'A', coachId: 'c1', dietModule: true }, { now: NOW }); assert.ok(S.calls.includes('dietMealLog') && S.calls.includes('dailyCheckin'));
  });

  await block('banco: consulta auxiliar que falha deixa só aquela parte de fora; consulta principal que falha derruba (nunca "0 treinos" por erro)', async () => {
    seed(); S.histories.push(H('2026-09-20T15:00:00Z', rows(1, 'e1', 'Supino', 40))); S.checkins.push({ id: 'k', userId: 's1', date: new Date('2026-09-21T12:00:00Z'), weight: 80, photoFront: 'a' }); S.workouts.push({ id: 'w1', userId: 's1', archived: false, createdAt: new Date('2026-08-01T12:00:00Z'), alternateSlot: null, exercises: [{ day: 'A', exerciseId: 'e1' }] }); S.mealLogs.push({ userId: 's1', date: '2026-09-20', status: 'SEGUIU' });
    S.fail = { checkIn: true, dietMealLog: true, dailyCheckin: true, workout: true };
    const r = await load(); assert.deepStrictEqual([r.training.sessions, r.body.checkIns, r.diet, r.training.plannedPerWeek, r.training.adherencePct], [1, 0, null, null, null]);
    for (const k of ['workoutHistory', 'exerciseHistory', 'exercise']) { S.fail = { [k]: true }; await assert.rejects(() => load(), new RegExp(k), 'falha em ' + k); }
  });

  // ───────────── treinos repetidos e tempo do treino (8 out 2026) ─────────────
  // exercícios x1..xN com 3 séries cada (para montar treinos com mais ou menos exercícios em comum)
  const exs = (from: number, to: number, w = 20) => { const out: any[] = []; for (let i = from; i <= to; i++) out.push(...rows(3, 'x' + i, 'Ex ' + i, w, '10')); return out; };

  await block('repetidos: o mesmo treino gravado várias vezes no mesmo instante conta UMA vez (o caso real: 10 toques em "finalizar")', () => {
    const burst = Array.from({ length: 10 }, (_, i) => H(`2026-09-16T19:13:46.${String(780 + i * 20)}Z`, exs(1, 4, 30), { duration: 80 }));
    const r = rep({ histories: [H('2026-09-16T17:10:57Z', exs(5, 10, 10), { duration: 23 }), ...burst] });
    assert.strictEqual(r.training.sessions, 2, 'o treino da tarde + UM treino da rajada');
    assert.strictEqual(r.volume.sets, 6 * 3 + 4 * 3, 'séries contadas uma vez só');
    assert.strictEqual(r.volume.totalKg, 6 * 3 * 10 * 10 + 4 * 3 * 30 * 10, 'volume sem inflar');
    assert.strictEqual(r.training.trainedDays, 1);
    const only = rep({ histories: burst }); assert.deepStrictEqual([only.training.sessions, only.training.avgPerWeek, only.empty], [1, 0.2, false]);
  });

  await block('repetidos: treinos diferentes no mesmo dia (outros exercícios) continuam contando separados', () => {
    const r = rep({ histories: [H('2026-09-09T14:13:00Z', exs(1, 5)), H('2026-09-09T19:53:00Z', exs(6, 9))] });
    assert.deepStrictEqual([r.training.sessions, r.training.trainedDays], [2, 1]);
    const three = rep({ histories: [H('2026-09-09T14:00:00Z', exs(1, 5)), H('2026-09-09T16:00:00Z', exs(6, 9)), H('2026-09-09T20:00:00Z', exs(10, 12))] });
    assert.strictEqual(three.training.sessions, 3);
  });

  await block('repetidos: mesma letra/nome do dia no mesmo dia = um treino só; letras diferentes = dois, mesmo com os mesmos exercícios', () => {
    const a = rep({ histories: [H('2026-10-01T14:48:00Z', exs(1, 4), { day: 'PERNAS¹' }), H('2026-10-01T16:32:00Z', exs(20, 22), { day: ' pernas¹ ' })] });
    assert.strictEqual(a.training.sessions, 1, 'a mesma letra no mesmo dia vale como repetição (a mesma regra do feedback da semana), ignorando caixa e espaços');
    assert.strictEqual(a.volume.sets, 12, 'fica o mais completo (4 exercícios, não 3)');
    const b = rep({ histories: [H('2026-10-01T14:48:00Z', exs(1, 4), { day: 'PERNAS¹' }), H('2026-10-01T16:32:00Z', exs(1, 4), { day: 'PERNAS²' })] });
    assert.strictEqual(b.training.sessions, 2, 'duas letras diferentes são dois treinos');
    const c = rep({ histories: [H('2026-10-01T14:48:00Z', exs(1, 4), { day: 'A' }), H('2026-10-02T14:48:00Z', exs(1, 4), { day: 'A' })] });
    assert.strictEqual(c.training.sessions, 2, 'a mesma letra em dias diferentes são dois treinos');
  });

  await block('repetidos: sem letra, vale a sobreposição de exercícios (80% ou mais é o mesmo treino; menos disso são dois)', () => {
    const base19 = exs(1, 19), base18 = exs(1, 18);
    assert.strictEqual(rep({ histories: [H('2026-09-09T14:13:00Z', base19), H('2026-09-09T19:53:00Z', base18)] }).training.sessions, 1, '18 de 19 = 95%');
    const r = rep({ histories: [H('2026-09-09T14:13:00Z', base19), H('2026-09-09T19:53:00Z', base18)] }); assert.strictEqual(r.volume.sets, 19 * 3, 'ficou o treino com 19 exercícios');
    // 4 em 5 = 80% (limite): igual; 3 em 4 e 1 a mais (3/5 = 60%): diferente
    assert.strictEqual(rep({ histories: [H('2026-09-09T14:00:00Z', exs(1, 5)), H('2026-09-09T19:00:00Z', exs(1, 4))] }).training.sessions, 1, '4 em 5 = 80% (no limite) é o mesmo treino');
    assert.strictEqual(rep({ histories: [H('2026-09-09T14:00:00Z', exs(1, 5)), H('2026-09-09T19:00:00Z', exs(1, 3))] }).training.sessions, 2, '3 em 5 = 60% são dois treinos');
    assert.strictEqual(rep({ histories: [H('2026-09-09T14:00:00Z', exs(1, 20)), H('2026-09-09T19:00:00Z', exs(1, 15))] }).training.sessions, 2, '15 em 20 = 75%: na dúvida, não junta');
    // um com letra e outro sem: decide pelos exercícios
    assert.strictEqual(rep({ histories: [H('2026-09-09T14:00:00Z', exs(1, 4), { day: 'A' }), H('2026-09-09T19:00:00Z', exs(1, 4))] }).training.sessions, 1);
    assert.strictEqual(rep({ histories: [H('2026-09-09T14:00:00Z', exs(1, 4), { day: 'A' }), H('2026-09-09T19:00:00Z', exs(5, 8))] }).training.sessions, 2);
  });

  await block('repetidos: a terceira cópia é comparada com a cópia que FICOU (a mais completa), não com a descartada', () => {
    // A = x1..x5; B = x1..x6 (5/6 = 83%: mesmo treino, e B é mais completo e fica); C = x2..x6 (x1..x5: 4/6 = 67% não casaria; x1..x6: 5/6 casa)
    assert.strictEqual(rep({ histories: [H('2026-09-09T14:00:00Z', exs(1, 5)), H('2026-09-09T15:00:00Z', exs(1, 6)), H('2026-09-09T16:00:00Z', exs(2, 6))] }).training.sessions, 1);
    assert.strictEqual(rep({ histories: [H('2026-09-09T14:00:00Z', exs(1, 5)), H('2026-09-09T16:00:00Z', exs(2, 6))] }).training.sessions, 2, 'sem a cópia do meio, A e C são treinos diferentes (4 em 6)');
  });

  await block('repetidos: o mesmo treino em dias diferentes conta cada um (e o dia é o de Brasília, não o de Greenwich)', () => {
    assert.strictEqual(rep({ histories: [H('2026-09-10T15:00:00Z', exs(1, 4)), H('2026-09-11T15:00:00Z', exs(1, 4))] }).training.sessions, 2);
    // 01:30 UTC de 07/10 ainda é 22:30 de 06/10 em Brasília; 15:00 UTC é meio-dia de 07/10: dias diferentes
    assert.strictEqual(rep({ histories: [H('2026-10-07T01:30:00Z', exs(1, 4)), H('2026-10-07T15:00:00Z', exs(1, 4))] }).training.sessions, 2);
    // 23:00 UTC e 01:00 UTC do dia seguinte são o MESMO dia em Brasília (20:00 e 22:00 de 06/10)
    assert.strictEqual(rep({ histories: [H('2026-10-06T23:00:00Z', exs(1, 4)), H('2026-10-07T01:00:00Z', exs(1, 4))] }).training.sessions, 1);
  });

  await block('repetidos: treino sem nenhuma série gravada não conta (registro vazio do app antigo); só vazios = relatório vazio', () => {
    const r = rep({ histories: [H('2026-09-04T17:44:00Z', [], { duration: 3187 }), H('2026-09-14T17:27:00Z', [], { duration: 11438 }), H('2026-10-01T08:49:00Z', [], { duration: 1, day: 'OMBROS' }), H('2026-10-01T08:48:00Z', exs(1, 3), { day: 'PERNAS¹' })] });
    assert.strictEqual(r.training.sessions, 1);
    const none = rep({ histories: [H('2026-09-14T17:27:00Z', [], { duration: 11438 }), H('2026-09-14T17:28:00Z', null as any)] });
    assert.deepStrictEqual([none.empty, none.training.sessions, none.highlights.map((h) => h.text)], [true, 0, ['Nenhum treino registrado neste período.']]);
  });

  await block('repetidos: o período anterior também é desduplicado (a comparação não sai torta) e a lista de entrada não é alterada', () => {
    const cur = [H('2026-10-01T15:00:00Z', exs(1, 4))];
    const prev = [H('2026-09-06T15:00:00Z', exs(5, 8)), ...Array.from({ length: 4 }, (_, i) => H(`2026-09-05T15:00:0${i}Z`, exs(1, 4)))];   // fora de ordem de propósito
    const copy = JSON.stringify(prev);
    const r = rep({ histories: cur, prevHistories: prev });
    assert.deepStrictEqual([r.training.prevSessions, r.training.sessionsDelta], [2, -1], '4 cópias + 1 treino = 2 treinos no período anterior');
    assert.strictEqual(JSON.stringify(prev), copy, 'não mexe nos dados recebidos');
    assert.deepStrictEqual([M.dedupeHistories(null as any), M.dedupeHistories(undefined as any), M.dedupeHistories([])], [[], [], []]);
    const order = M.dedupeHistories([H('2026-09-12T15:00:00Z', exs(1, 4)), H('2026-09-10T15:00:00Z', exs(5, 8))] as any); assert.deepStrictEqual(order.map((h: any) => brtDay(h.date)), ['2026-09-10', '2026-09-12'], 'devolve em ordem de data');
    const fuller = M.dedupeHistories([{ ...H('2026-09-12T15:00:00Z', exs(1, 4).slice(0, 10)), id: 'poor' }, { ...H('2026-09-12T15:00:01Z', exs(1, 4)), id: 'rich' }] as any); assert.deepStrictEqual(fuller.map((h: any) => h.id), ['rich']);
    const tie = M.dedupeHistories([{ ...H('2026-09-12T15:00:00Z', exs(1, 4)), id: 'first' }, { ...H('2026-09-12T15:00:01Z', exs(1, 4)), id: 'second' }] as any); assert.deepStrictEqual(tie.map((h: any) => h.id), ['first'], 'empate: fica o primeiro');
  });

  await block('repetidos: recordes e músculos não dobram com cópias', () => {
    const d = (w: number) => rows(3, 'e1', 'Supino', w, '10');
    const copies = Array.from({ length: 5 }, (_, i) => H(`2026-10-01T15:00:0${i}Z`, d(60)));
    const r = rep({ histories: copies, baselineMax: { e1: 50 }, categories: { e1: 'Peito' } });
    assert.deepStrictEqual(r.records, [{ exerciseId: 'e1', name: 'Supino', from: 50, to: 60, gain: 10 }]);
    assert.deepStrictEqual(r.muscles, [{ group: 'Peito', sets: 3 }], 'séries do músculo contadas uma vez');
  });

  await block('tempo do treino: só entra na média o que é plausível (10 a 180 min) e com pelo menos 3 treinos com tempo; lixo do app antigo fica de fora', () => {
    const t = (ds: Array<number | null>) => rep({ histories: ds.map((d, i) => H(`2026-09-1${i}T15:00:00Z`, exs(1, 3), { duration: d })) }).training;
    // o caso real: 80, 108, 82, 71 minutos + lixo (15.270, 11.438, 2.682, 551)
    const real = t([80, 15270, 108, 11438, 82, 2682, 71, 551]); assert.deepStrictEqual([real.avgMinutes, real.totalMinutes, real.sessions], [85, 341, 8]);
    assert.deepStrictEqual([t([10, 10, 10]).avgMinutes, t([9, 10, 10, 10]).avgMinutes, t([180, 180, 180]).avgMinutes, t([181, 10, 10, 10]).avgMinutes], [10, 10, 180, 10], 'limites: 10 e 180 entram; 9 e 181 não');
    assert.deepStrictEqual([t([60, 60]).avgMinutes, t([60, 60]).totalMinutes], [null, 0], 'só 2 tempos: sem média (engana)');
    assert.deepStrictEqual([t([60, 60, 60]).avgMinutes, t([60, 60, 60]).totalMinutes], [60, 180]);
    assert.deepStrictEqual([t([0, null, -5, 60, 61, 62]).avgMinutes], [61], 'zero, vazio e negativo são ignorados');
    assert.strictEqual(t([15270, 11438, 2682, 551]).avgMinutes, null, 'só lixo: sem tempo médio (antes saía "1.476 min")');
  });

  await block('banco: a letra do dia (`day`) é lida do banco e a rajada de cópias vira um treino só pela rota inteira', async () => {
    seed();
    for (let i = 0; i < 10; i++) S.histories.push(H(`2026-09-16T19:13:46.${String(780 + i * 20)}Z`, rows(2, 'e1', 'Supino', 40), { day: 'PERNAS¹', duration: 80 }));
    S.histories.push(H('2026-09-16T17:10:57Z', rows(1, 'e1', 'Supino', 30), { day: 'OMBROS', duration: 1388 }), H('2026-09-14T17:27:29Z', [], { duration: 11438 }));
    const r = await load(); assert.deepStrictEqual([r.training.sessions, r.training.trainedDays, r.volume.sets], [2, 1, 3], 'rajada = 1, ombros = 1, o vazio não conta');
    const noDay = M.dedupeHistories([H('2026-09-16T19:13:46Z', rows(1, 'e1', 'S', 1), { day: undefined }), H('2026-09-16T19:13:47Z', rows(1, 'e1', 'S', 1), { day: null })] as any); assert.strictEqual(noDay.length, 1);
  });

  // ───────────── rota ─────────────
  const get = async (q: string, as: string | null) => { const h: any = {}; if (as) h.authorization = 'Bearer ' + tok(as, as.startsWith('c') ? 'COACH' : 'USER'); const r = await GET(new Request('http://x/api/monthly-report?' + q, { headers: h })); return { status: r.status, json: await r.json() }; };

  await block('rota: o próprio aluno e o coach dele veem; outro coach, outro aluno e sem login não; aluno inexistente e sem userId', async () => {
    seed(); S.histories.push(H(new Date(Date.now() - 2 * 86400000).toISOString(), rows(1, 'e1', 'Supino', 40)));
    const a = await get('userId=s1', 's1'); assert.strictEqual(a.status, 200); assert.deepStrictEqual([a.json.v, a.json.student, a.json.period.days, a.json.training.sessions], [1, { name: 'Ana Souza', coachId: 'c1' }, 30, 1]);
    assert.strictEqual((await get('userId=s1', 'c1')).status, 200);
    assert.strictEqual((await get('userId=s1', 'c2')).status, 403); assert.strictEqual((await get('userId=s1', 's2')).status, 403); assert.strictEqual((await get('userId=s1', null)).status, 401);
    assert.strictEqual((await get('userId=nope', 'c1')).status, 404); assert.strictEqual((await get('days=30', 'c1')).status, 400);
    assert.strictEqual((await get('userId=s1&days=14', 's1')).json.period.days, 14); assert.strictEqual((await get('userId=s1&days=9999', 's1')).json.period.days, 30); assert.strictEqual((await get('userId=s1&days=abc', 's1')).json.period.days, 30);
    S.mealLogs.push(...['SEGUIU', 'SEGUIU', 'SEGUIU', 'SEGUIU', 'PULOU'].map((status, i) => ({ userId: 's1', date: new Date(Date.now() - i * 3600000).toISOString().slice(0, 10), status })));
    const withDiet = await get('userId=s1', 's1'); assert.ok(withDiet.json.diet && withDiet.json.diet.meals >= 1, 'aluno com módulo de dieta: a dieta entra no relatório pela rota');
    S.fail = { workoutHistory: true }; const bad = await get('userId=s1', 's1'); assert.strictEqual(bad.status, 500); assert.ok(String(bad.json.error).includes('Não foi possível'), 'mensagem amigável, sem vazar o erro interno'); assert.ok(!JSON.stringify(bad.json).includes('simulada'));
  });

  await block('liberação: o ALUNO só vê o relatório dele depois que o coach liga (monthlyReportOn); coach, master e a lista de quem pode ver não mudam', async () => {
    seed(); const PAULO = '3c82f763-66b4-48da-836e-16817d4f57c0'; P.__addUser({ id: PAULO, role: 'COACH', name: 'Paulo' });
    S.histories.push(H(new Date(Date.now() - 2 * 86400000).toISOString(), rows(1, 'e1', 'Supino', 40)));
    const off = (v: any) => { P.__addUser({ id: 's1', name: 'Ana Souza', coachId: 'c1', dietModule: true, monthlyReportOn: v }); };
    for (const v of [false, undefined, null, 'true', 1, 'yes']) {
      off(v); const r = await get('userId=s1', 's1');
      assert.strictEqual(r.status, 403, 'aluno com monthlyReportOn=' + String(v) + ' não passa'); assert.deepStrictEqual([r.json.code, r.json.error], ['NOT_RELEASED', 'O relatório do mês ainda não foi liberado pelo seu coach.']);
      assert.ok(!('training' in r.json), 'nenhum dado do relatório vaza na recusa');
    }
    off(true); const on = await get('userId=s1', 's1'); assert.strictEqual(on.status, 200); assert.strictEqual(on.json.training.sessions, 1);
    off(false);
    assert.strictEqual((await get('userId=s1', 'c1')).status, 200, 'o coach do aluno vê mesmo sem liberar');
    assert.strictEqual((await get('userId=s1', PAULO)).status, 200, 'o master vê mesmo sem liberar');
    assert.strictEqual((await get('userId=s1', 'c2')).status, 403); assert.strictEqual((await get('userId=s1', 's2')).status, 403);
    assert.strictEqual((await get('userId=s1', null)).status, 401);
    const c2 = await get('userId=s1', 'c2'); assert.ok(!('code' in c2.json), 'quem não tem acesso continua com a recusa de acesso, não com a de liberação');
    P.__addUser({ id: PAULO, role: 'COACH', name: 'Paulo', monthlyReportOn: false }); S.histories.push(H(new Date(Date.now() - 86400000).toISOString(), rows(1, 'e1', 'Supino', 40), { userId: PAULO }));
    assert.strictEqual((await get('userId=' + PAULO, PAULO)).status, 200, 'o master vê o próprio relatório sem liberar');
    off(false); S.fail = { workoutHistory: true }; assert.strictEqual((await get('userId=s1', 's1')).status, 403, 'a recusa vem antes de qualquer consulta pesada'); S.fail = {};
  });

  console.log(`\nTOTAL ${passed} ok, ${fails} falhas`);
  process.exit(fails ? 1 : 0);
})();
