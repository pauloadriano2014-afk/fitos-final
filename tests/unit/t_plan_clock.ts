import assert from 'assert';
import fs from 'fs';
import * as PC from '/home/user/FIT-OS-FRONTEND/src/utils/planClock.js';

const H = 3600 * 1000, D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = new Date('2026-10-15T15:00:00-03:00');
const day = (n: number, hour = 15) => { const d = new Date('2026-10-01T00:00:00-03:00'); d.setDate(d.getDate() + n); d.setHours(hour, 0, 0, 0); return d.getTime(); };
const wk = (id: string, createdAt: number, startDate: number | null, extra: any = {}) => ({ id, name: 'FICHA', createdAt: iso(createdAt), startDate: startDate === null ? null : iso(startDate), archived: false, routine: [{ day: 'A' }], ...extra });

// a lógica ANTIGA da home (cópia do que estava em useHomeData.js), para provar que nada muda quando não há fases
function oldClock(workouts: any[], createdAt: any, now: Date) {
  let startD = new Date(createdAt || new Date());
  const active = (workouts || []).filter((w) => !w.archived).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  let placeholder = true;
  if (active.length > 0) { const cw = active[0]; startD = new Date(cw.startDate); placeholder = cw.name.includes('CONSTRUÇÃO') || !cw.routine || cw.routine.length === 0; }
  startD.setHours(0, 0, 0, 0); const t = new Date(now); t.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((t.getTime() - startD.getTime()) / D);
  return { placeholder, ...(diffDays < 0 ? { daysToStart: Math.abs(diffDays), fichaDaysElapsed: 0 } : { daysToStart: 0, fichaDaysElapsed: diffDays }) };
}
function newClock(workouts: any[], createdAt: any, now: Date) {
  const cycle = PC.planCycle(workouts);
  const { daysToStart, fichaDaysElapsed } = PC.planDayCounts(PC.planStartDate(workouts, createdAt), now);
  return { placeholder: cycle ? PC.isPlaceholderWorkout(cycle.newest) : true, daysToStart, fichaDaysElapsed };
}

// 1) sem fases: igual ao de antes, em muitas combinações (1 treino; treino antigo não arquivado há dias; arquivados; vazio)
let n = 0;
for (const startOff of [-30, -10, -1, 0, 1, 5]) for (const gapDays of [1, 3, 20]) for (const archivedOld of [false, true]) for (const nWork of [0, 1, 2]) for (const placeholder of [false, true]) for (const nowOff of [0, 10, 27, 28, 55, 56, 70]) {
  const ws: any[] = [];
  if (nWork >= 1) ws.push(wk('new', day(startOff, 10), day(startOff), { name: placeholder ? 'FICHA EM CONSTRUÇÃO 🚧' : 'FICHA', routine: placeholder ? [] : [{ day: 'A' }] }));
  if (nWork >= 2) ws.push(wk('old', day(startOff - gapDays, 10), day(startOff - gapDays), { archived: archivedOld }));
  const now = new Date(day(nowOff)); n++;
  assert.deepEqual(newClock(ws, iso(day(-40)), now), oldClock(ws, iso(day(-40)), now), JSON.stringify({ startOff, gapDays, archivedOld, nWork, placeholder, nowOff }));
}
assert.ok(n > 1000, 'combinações: ' + n);

// 2) ficha periodizada: a fase 2 (mais nova, começa no dia 29) NÃO pode atrasar o relógio
const p1 = wk('f1', day(0, 10), day(0), { name: 'FICHA 8 SEMANAS · Fase 1' }), p2 = wk('f2', day(0, 10) + 5000, day(28), { name: 'FICHA 8 SEMANAS · Fase 2' });
for (const [off, expDays] of [[0, 0], [1, 1], [10, 10], [27, 27], [28, 28], [40, 40], [55, 55], [56, 56]] as const) {
  const c = newClock([p1, p2], iso(day(-1)), new Date(day(off)));
  assert.equal(c.daysToStart, 0, `dia ${off}: não está "aguardando data"`); assert.equal(c.fichaDaysElapsed, expDays, `dia ${off}: dias corridos desde o início da fase 1`); assert.equal(c.placeholder, false);
  const o = oldClock([p1, p2], iso(day(-1)), new Date(day(off))); if (off < 28) assert.ok(o.daysToStart > 0, 'a lógica antiga errava aqui (home "aguardando data" na fase 1)');
}
assert.deepEqual(PC.planCycle([p1, p2])!.cycle.map((w: any) => w.id).sort(), ['f1', 'f2']); assert.equal(PC.planCycle([p1, p2])!.newest.id, 'f2');
assert.equal(+PC.planStartDate([p2, p1], null), day(0), 'a ordem da lista não importa');
// as duas fases no futuro: espera pelo início da primeira
const fut1 = wk('a', day(0), day(5)), fut2 = wk('b', day(0) + 1000, day(33)); const cw = newClock([fut1, fut2], null, new Date(day(2))); assert.equal(cw.daysToStart, 3); assert.equal(cw.fichaDaysElapsed, 0);
// treino de OUTRO ciclo, criado dias antes e não arquivado, não entra (vale só o ciclo do mais novo)
const oldCycle = wk('velho', day(-20, 10), day(-20)); const mixed = PC.planCycle([oldCycle, p1, p2])!; assert.deepEqual(mixed.cycle.map((w: any) => w.id).sort(), ['f1', 'f2']); assert.equal(+mixed.startDate!, day(0));
// janela de 6h: 5h59 entra, 6h01 não
const edgeIn = wk('in', day(0, 10) - 6 * H + 1000, day(-3)), edgeOut = wk('out', day(0, 10) - 6 * H - 1000, day(-3)); const base = wk('base', day(0, 10), day(0));
assert.ok(PC.planCycle([base, edgeIn])!.cycle.some((w: any) => w.id === 'in')); assert.ok(!PC.planCycle([base, edgeOut])!.cycle.some((w: any) => w.id === 'out'));
assert.equal(PC.CYCLE_WINDOW_MS, 6 * H);
// 3) dados incompletos
assert.equal(PC.planCycle([]), null); assert.equal(PC.planCycle(undefined as any), null); assert.equal(PC.planCycle([wk('x', day(0), day(0), { archived: true })]), null, 'só arquivados = nenhum ciclo');
const noStart = [wk('s', day(0), null)]; assert.equal(PC.planCycle(noStart)!.startDate, null); assert.equal(+PC.planStartDate(noStart, iso(day(-4))), day(-4), 'sem startDate: dia do cadastro (a lógica antiga caía em 1970)'); assert.ok(newClock(noStart, iso(day(-4)), new Date(day(0))).fichaDaysElapsed === 4);
assert.equal(+PC.planStartDate([], iso(day(-7))), day(-7)); assert.ok(Math.abs(+PC.planStartDate([], undefined) - Date.now()) < 5000, 'sem nada: hoje');
const noCreated = [{ id: 'n1', name: 'F', startDate: iso(day(-2)), routine: [1] }, { id: 'n2', name: 'F', startDate: iso(day(-1)), routine: [1] }]; assert.ok(PC.planCycle(noCreated), 'createdAt ausente não quebra'); assert.equal(+PC.planStartDate(noCreated, null), day(-2), 'sem createdAt: vale o primeiro treino (o ciclo nunca fica sem o mais novo)'); assert.equal(PC.planCycle(noCreated)!.cycle.length, 1);
// 4) placeholder
assert.equal(PC.isPlaceholderWorkout(null), true); assert.equal(PC.isPlaceholderWorkout({ name: 'FICHA EM CONSTRUÇÃO 🚧', routine: [1] }), true); assert.equal(PC.isPlaceholderWorkout({ name: 'DESAFIO', routine: [] }), true); assert.equal(PC.isPlaceholderWorkout({ name: 'DESAFIO' }), true); assert.equal(PC.isPlaceholderWorkout({ name: 'DESAFIO', routine: [1] }), false);
// 5) contagem por dia do calendário (hora do dia não conta)
assert.deepEqual(PC.planDayCounts(new Date(day(5, 23)), new Date(day(2, 1))), { daysToStart: 3, fichaDaysElapsed: 0 }); assert.deepEqual(PC.planDayCounts(new Date(day(0, 1)), new Date(day(0, 23))), { daysToStart: 0, fichaDaysElapsed: 0 }); assert.deepEqual(PC.planDayCounts(new Date(day(0, 23)), new Date(day(1, 1))), { daysToStart: 0, fichaDaysElapsed: 1 });
// 6) fiação na home
const hook = fs.readFileSync('/home/user/FIT-OS-FRONTEND/src/hooks/useHomeData.js', 'utf8');
assert.ok(/import \{ planCycle, planStartDate, planDayCounts, isPlaceholderWorkout \} from '..\/utils\/planClock';/.test(hook) && /const cycle = planCycle\(fetchedUser\.workouts\);/.test(hook) && /planStartDate\(fetchedUser\.workouts, fetchedUser\.createdAt\)/.test(hook) && /planDayCounts\(startD\)/.test(hook) && /setIsFichaPlaceholder\(cycle \? isPlaceholderWorkout\(cycle\.newest\) : true\)/.test(hook) && /setDaysToStart\(dts\);\s*setFichaDaysElapsed\(fde\);/.test(hook), 'a home usa o relógio por ciclo');
console.log('OK  relógio do plano: fase 2 não atrasa a home; sem fases é idêntico ao de antes (' + n + ' combinações); dados incompletos tratados');
