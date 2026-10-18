import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { buildStudentLoads, raiseFromChoque, SERIES_LIMIT, RAISE_MAX_DAYS } from '@/lib/studentLoads';
import { suggestLoad, sessionsOf } from '@/lib/loadSuggest';
import { GET as loadsGET } from '/home/user/fitos-final/app/api/student-loads/route';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'USER') => jwt.sign({ id, role, coachId: null }, SECRET);
const NOW = new Date('2026-10-18T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86400000);
const row = (n: number, phase: string | null, exs: Record<string, number[]>, extra: any = {}) => ({ date: day(n), loadPhase: phase, ...(extra.mult ? { intensityApplied: extra.mult } : {}), details: Object.entries(exs).flatMap(([id, ws]) => ws.map((w, i) => ({ exerciseId: id, exerciseName: 'Ex ' + id, setNumber: i + 1, weight: w, perSide: !!extra.perSide, effort: extra.effort ?? null, ...(extra.cardio ? { cardioSeconds: 600 } : {}) }))) });
let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => { try { P.__reset(); P.__addUser({ id: 'c1', role: 'COACH' }); P.__addUser({ id: 'c2', role: 'COACH' }); P.__addUser({ id: 's1', name: 'Ana', coachId: 'c1' }); await fn(); passed++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 3).join(' // ')); } };
const get = async (as: string, qs: string) => { const r = await loadsGET(new Request('http://x/api/student-loads?' + qs, { headers: { authorization: 'Bearer ' + tok(as, as.startsWith('c') ? 'COACH' : 'USER') } })); return { status: r.status, json: await r.json().catch(() => null) }; };
(async () => {
  await block('referências por fase: o treino MAIS RECENTE de cada fase; deload/choque mostram o que o aluno de fato levantou (base × multiplicador)', () => {
    // o app grava a carga "equivalente à base" (32 / 0,8 = 40): a real é a gravada × o multiplicador do treino
    const h = [row(-1, 'DELOAD', { e1: [40, 40] }, { mult: 0.8 }), row(-4, 'CHOQUE', { e1: [40, 40, 36] }, { mult: 1.1 }), row(-8, 'NORMAL', { e1: [40, 40] }), row(-15, null, { e1: [38, 38] })];
    const l = buildStudentLoads(h as any, { now: NOW }).e1;
    assert.deepStrictEqual([l.refs.NORMAL!.top, l.refs.DELOAD!.top, l.refs.CHOQUE!.top], [40, 32, 44], 'normal = 40 (o de -8 dias, não o antigo de 38); deload real 32; choque real 44');
    assert.deepStrictEqual(l.refs.CHOQUE!.sets.map((s) => s.weight), [44, 44, 39.6], 'cada série multiplicada e arredondada em 1 casa'); assert.deepStrictEqual([l.refs.DELOAD!.baseTop, l.refs.CHOQUE!.baseTop, l.refs.NORMAL!.baseTop], [40, 40, 40], 'baseTop = o que o histórico guarda');
    assert.deepStrictEqual([l.refs.DELOAD!.multiplier, l.refs.CHOQUE!.multiplier, l.refs.NORMAL!.multiplier], [0.8, 1.1, 1]); assert.strictEqual(l.refs.NORMAL!.date, day(-8).toISOString()); assert.strictEqual(l.name, 'Ex e1');
    assert.strictEqual(buildStudentLoads([row(-3, null, { e1: [20] })] as any, { now: NOW }).e1.refs.NORMAL!.top, 20, 'sem a coluna = normal');
    assert.strictEqual(buildStudentLoads([row(-3, 'DELOAD', { e1: [40] })] as any, { now: NOW }).e1.refs.DELOAD!.top, 40, 'fase sem multiplicador gravado: fica como está (nunca inventa número)');
    assert.strictEqual(buildStudentLoads([row(-3, 'NORMAL', { e1: [40] }, { mult: 0.8 })] as any, { now: NOW }).e1.refs.NORMAL!.top, 40, 'multiplicador em treino normal é ignorado');
    assert.ok(!l.refs.NORMAL!.perSide); const ps = buildStudentLoads([row(-2, 'CHOQUE', { e1: [40, 40] }, { perSide: true, mult: 1.1 })] as any, { now: NOW }).e1.refs.CHOQUE!; assert.ok(ps.perSide && ps.top === 44, 'cada lado preservado e multiplicado');
  });
  await block('série do gráfico: até 8 treinos, do mais velho para o mais novo, cada ponto com a fase', () => {
    const h = Array.from({ length: 12 }, (_, i) => row(-(i + 1), i === 2 ? 'CHOQUE' : i === 0 ? 'DELOAD' : 'NORMAL', { e1: [40 + i] }, i === 2 ? { mult: 1.5 } : i === 0 ? { mult: 0.5 } : {}));
    const l = buildStudentLoads(h as any, { now: NOW }).e1;
    assert.strictEqual(SERIES_LIMIT, 8); assert.strictEqual(l.series.length, 8);
    assert.deepStrictEqual(l.series.map((p) => p.top), [47, 46, 45, 44, 43, 63, 41, 20], 'os 8 mais novos, do mais velho para o mais novo; deload (40×0,5=20) e choque (42×1,5=63) mostram a carga real');
    assert.deepStrictEqual(l.series.map((p) => p.phase), ['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'CHOQUE', 'NORMAL', 'DELOAD']);
  });
  await block('exercícios: só cardio ou sem carga não aparecem; onlyIds limita; vazio devolve vazio', () => {
    const h = [row(-1, null, { e1: [40], e2: [0], e3: [30] }), row(-2, null, { e4: [10] }, { cardio: true })];
    assert.deepStrictEqual(Object.keys(buildStudentLoads(h as any, { now: NOW })).sort(), ['e1', 'e3']);
    assert.deepStrictEqual(Object.keys(buildStudentLoads(h as any, { now: NOW, onlyIds: ['e3'] })), ['e3']);
    assert.deepStrictEqual(buildStudentLoads([], { now: NOW }), {}); assert.deepStrictEqual(buildStudentLoads(null as any, { now: NOW }), {});
  });
  await block('sugestão: é a mesma do aluno (só treinos normais) e pode ser desligada', () => {
    const h = [row(-1, 'DELOAD', { e1: [40] }, { mult: 0.8 }), row(-8, null, { e1: [40, 40] }), row(-15, 'NORMAL', { e1: [40, 40] })];
    const l = buildStudentLoads(h as any, { now: NOW }).e1;
    assert.deepStrictEqual(l.suggestion, suggestLoad(sessionsOf(h as any, 'e1'), { now: NOW })); assert.strictEqual(l.suggestion!.action, 'UP');
    assert.strictEqual(buildStudentLoads(h as any, { now: NOW, suggest: false }).e1.suggestion, null);
    assert.strictEqual(buildStudentLoads(h as any, { now: NOW, step: 5 }).e1.suggestion!.step, 5, 'salto do coach respeitado');
  });
  await block('subir a base depois do choque: só se o aluno levantou, de fato, mais que a carga normal; foi recente e não foi "pesado"', () => {
    const base = (h: any[]) => buildStudentLoads(h as any, { now: NOW }).e1.raiseBase;
    // choque de ×1,15 sobre base 40: o aluno levantou 46 (gravado como 40 na base)
    assert.deepStrictEqual(base([row(-4, 'CHOQUE', { e1: [40, 40] }, { mult: 1.15 }), row(-10, 'NORMAL', { e1: [40, 40] })]), { to: 46, from: 40, perSide: false, date: day(-4).toISOString() });
    assert.strictEqual(base([row(-4, 'CHOQUE', { e1: [40] }, { mult: 1 }), row(-10, 'NORMAL', { e1: [40] })]), null, 'choque sem aumento real: nada a subir');
    assert.strictEqual(base([row(-4, 'CHOQUE', { e1: [30] }, { mult: 1.1 }), row(-10, 'NORMAL', { e1: [40] })]), null, 'o aluno ficou abaixo da carga normal');
    assert.strictEqual(base([row(-4, 'CHOQUE', { e1: [40] }, { mult: 1.15, effort: 'PESADO' }), row(-10, 'NORMAL', { e1: [40] })]), null, 'achou pesado demais: não sugere subir');
    assert.ok(base([row(-4, 'CHOQUE', { e1: [40] }, { mult: 1.1, effort: 'FACIL' })]), 'sem treino normal: base = 0, sugere');
    assert.strictEqual(base([row(-(RAISE_MAX_DAYS + 1), 'CHOQUE', { e1: [40] }, { mult: 1.15 }), row(-60, 'NORMAL', { e1: [40] })]), null, 'choque velho demais');
    assert.ok(base([row(-RAISE_MAX_DAYS, 'CHOQUE', { e1: [40] }, { mult: 1.15 }), row(-60, 'NORMAL', { e1: [40] })]), 'no limite ainda vale');
    assert.strictEqual(base([row(-4, 'DELOAD', { e1: [40] }, { mult: 0.8 }), row(-10, 'NORMAL', { e1: [40] })]), null, 'deload nunca sugere subir');
    assert.strictEqual(raiseFromChoque({}, NOW), null);
    assert.strictEqual(raiseFromChoque({ CHOQUE: { date: day(2).toISOString(), top: 50, baseTop: 45, sets: [], perSide: false, effort: null, multiplier: 1.1 } }, NOW), null, 'data no futuro: ignora');
  });
  await block('nome do exercício: vale o mais recente (se o coach renomeou, aparece o nome novo)', () => {
    const h = [row(-1, null, { e1: [40] }), row(-8, null, { e1: [40] })]; (h[0].details as any)[0].exerciseName = 'Supino novo'; (h[1].details as any)[0].exerciseName = 'Supino velho';
    assert.strictEqual(buildStudentLoads(h as any, { now: NOW }).e1.name, 'Supino novo');
  });
  await block('rota: o coach do aluno e o master leem; outro coach, sem login, sem userId e aluno inexistente são barrados', async () => {
    S.histories.push({ id: 'h1', userId: 's1', ...row(-3, 'NORMAL', { e1: [40], e2: [20] }) }); S.histories.push({ id: 'h2', userId: 's1', ...row(-1, 'DELOAD', { e1: [40] }, { mult: 0.8 }) });
    const ok = await get('c1', 'userId=s1'); assert.strictEqual(ok.status, 200); assert.deepStrictEqual(Object.keys(ok.json.exercises).sort(), ['e1', 'e2']); assert.strictEqual(ok.json.exercises.e1.refs.NORMAL.top, 40); assert.strictEqual(ok.json.exercises.e1.refs.DELOAD.top, 32, 'a rota devolve a carga real do deload'); assert.strictEqual(ok.json.loadSuggestEnabled, true);
    assert.deepStrictEqual(Object.keys((await get('c1', 'userId=s1&exerciseIds=e2')).json.exercises), ['e2'], 'exerciseIds filtra');
    assert.strictEqual((await get('c2', 'userId=s1')).status, 403, 'outro coach não vê');
    assert.strictEqual((await get('s1', 'userId=s1')).status, 200, 'o próprio aluno pode ver');
    assert.strictEqual((await get('c1', '')).status, 400); assert.strictEqual((await get('c1', 'userId=nao-existe')).status, 404);
    assert.strictEqual((await get('c1', 'userId=s1&exerciseIds=' + [...Array.from({ length: 200 }, (_, i) => 'x' + i), 'e1'].join(','))).json.exercises.e1, undefined, 'no máximo 200 exerciseIds por pedido (o 201º é ignorado)');
    S.users.get('s1').loadSuggestOff = true; S.histories.push({ id: 'h3', userId: 's1', ...row(-9, null, { e1: [40, 40] }) });
    const off = await get('c1', 'userId=s1'); assert.strictEqual(off.json.loadSuggestEnabled, false); assert.strictEqual(off.json.exercises.e1.suggestion, null, 'sugestão desligada para o aluno: não manda sugestão');
    const noAuth = await loadsGET(new Request('http://x/api/student-loads?userId=s1')); assert.strictEqual(noAuth.status, 401);
  });
  console.log(`\n${fails ? 'FALHOU' : 'OK'}: ${passed} blocos ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
