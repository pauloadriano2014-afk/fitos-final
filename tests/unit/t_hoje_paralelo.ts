import assert from 'assert';
import prisma from '@/lib/prisma';
import { buildHoje } from '/home/user/fitos-final/lib/agendaHoje';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

const P = prisma as any; const S = P.__state;
const DAY = 86400000, H = 3600000;
const NOW = new Date('2026-10-27T15:00:00Z');

const seed = () => {
  P.__reset();
  const u = (o: any) => S.user.push({ role: 'USER', active: true, isFinanceActive: true, isTestAccount: false, name: o.id, phone: null, coachId: 'cA', nutritionistId: null, ...o });
  u({ id: 'cA', role: 'COACH', name: 'Coach A', coachId: null });
  u({ id: 's1', name: 'Samara Franco', nextCheckInDate: new Date(NOW.getTime() - 3 * DAY), financeCategory: 'Personal Trainer', contractValue: 300, paymentDueDate: new Date(NOW.getTime() - 2 * DAY) });
  u({ id: 's2', name: 'Bia Costa', paymentClaimStatus: 'PENDING', contractValue: 200 });
  u({ id: 's3', name: 'Tais Lima', frozenAt: new Date(NOW.getTime() - 20 * DAY), frozenUntil: new Date(NOW.getTime() - 1 * DAY) });
  u({ id: 's4', name: 'Nina Nutri', coachId: null, nutritionistId: 'cA' });
  u({ id: 'sx', name: 'Conta Teste', isTestAccount: true });
  S.offlineClient.push({ id: 'o1', name: 'Didio Silva', phone: null, coachId: 'cA', financeCategory: 'Personal Trainer', isFinanceActive: true, contractValue: 400, paymentDueDate: new Date(NOW.getTime() - 1 * DAY) });
  S.weeklyFeedback.push({ id: 'w1', userId: 's1', createdAt: new Date(NOW.getTime() - 3 * DAY), coachSeenAt: null, coachReplyAt: null });
  S.studentAlert.push({ id: 'a1', userId: 's2', type: 'EXERCISE_NOTE', isRead: false, createdAt: new Date(NOW.getTime() - 1 * H) });
  S.checkIn.push({ id: 'c1', userId: 's1', coachFeedback: null, createdAt: new Date(NOW.getTime() - 2 * DAY) });
  S.workout.push({ id: 'wk1', userId: 's1', archived: false, endDate: new Date(NOW.getTime() - 2 * DAY), createdAt: new Date(NOW.getTime() - 30 * DAY) });
  S.workoutShare.push({ id: 'sh1', code: 'abc', trial: true, createdById: 'cA', revokedAt: null, displayName: 'Beto', viewCount: 4, doneCount: 3, createdAt: new Date(NOW.getTime() - 5 * DAY), expiresAt: new Date(NOW.getTime() + 2 * DAY) });
  S.agendaEvent.push({ id: 'ev1', coachId: 'cA', kind: 'PRESENCIAL', status: 'SCHEDULED', studentId: 's1', offlineClientId: null, seriesId: null, title: null, startsAt: new Date(NOW.getTime() - 5 * H), endsAt: new Date(NOW.getTime() - 4 * H), slotAt: new Date(NOW.getTime() - 5 * H), studentResponse: null });
};

// banco "lento": cada consulta demora `ms` e a gente anota quantas estavam em andamento ao mesmo tempo
const slow = (ms: number) => {
  const m = { inFlight: 0, max: 0, calls: 0 };
  const wrapModel = (model: any) => new Proxy(model, { get(t, k) { const f = t[k]; if (typeof f !== 'function') return f; return async (...a: any[]) => { m.calls++; m.inFlight++; m.max = Math.max(m.max, m.inFlight); try { await new Promise((r) => setTimeout(r, ms)); return await f.apply(t, a); } finally { m.inFlight--; } }; } });
  const db = new Proxy(P, { get(t, k: any) { const v = t[k]; return v && typeof v === 'object' && typeof v.findMany === 'function' ? wrapModel(v) : v; } });
  return { db, m };
};
const view = (h: any) => JSON.stringify({ tasks: h.tasks.map((t: any) => [t.key, t.severity, t.type, t.title]), counts: h.counts, un: h.unavailable, agenda: h.agenda.map((e: any) => e.id) });

let fails = 0, passed = 0;
const block = async (name: string, fn: () => Promise<void> | void) => {
  try { seed(); await fn(); passed++; console.log('  ok  ' + name); }
  catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String((e && e.message) || e).split('\n').slice(0, 6).join('\n        ')); }
};

(async () => {
  await block('o resultado é o mesmo com o banco rápido e com o banco lento (as fontes terminam fora de ordem, a lista não muda)', async () => {
    const a: any = await buildHoje(P, 'cA', NOW);
    const { db } = slow(8); const b: any = await buildHoje(db, 'cA', NOW);
    assert.strictEqual(view(b), view(a));
    const types = a.tasks.map((t: any) => t.type);
    for (const t of ['presenca', 'semanal', 'obs', 'avaliacao', 'checkin', 'treino', 'descongelar', 'paguei', 'cobranca', 'teste_resultado']) assert.ok(types.includes(t), 'faltou ' + t + ' em ' + types.join(','));
    assert.ok(!a.tasks.some((t: any) => t.person && t.person.id === 'sx'), 'conta de teste não gera pendência');
  });
  await block('as consultas saem juntas: muitas em andamento ao mesmo tempo e o total é bem menor que a soma', async () => {
    const MS = 20; const { db, m } = slow(MS);
    const t0 = Date.now(); await buildHoje(db, 'cA', NOW); const took = Date.now() - t0;
    if (process.env.SHOW_TIMES) console.log('MEDIDA hoje: ' + m.calls + ' consultas de ' + MS + 'ms, demorou ' + took + 'ms (em fila: ' + m.calls * MS + 'ms), máx. simultâneas ' + m.max);
    assert.ok(m.calls >= 15, 'consultas feitas: ' + m.calls);
    assert.ok(m.max >= 6, 'no máximo ' + m.max + ' ao mesmo tempo (esperado 6 ou mais)');
    assert.ok(took < (m.calls * MS) / 2.5, `demorou ${took}ms para ${m.calls} consultas de ${MS}ms (em fila seriam ~${m.calls * MS}ms)`);
  });
  await block('empate de urgência segue a ordem das fontes de sempre (cobrança "já paguei" antes do teste grátis), mesmo se a de baixo responder primeiro', async () => {
    const order = async (db: any) => (await buildHoje(db, 'cA', NOW) as any).tasks.map((t: any) => t.type);
    const base = await order(P); const i = base.indexOf('paguei'), j = base.indexOf('teste_resultado');
    assert.ok(i >= 0 && j > i, base.join(','));
    // teste grátis responde antes (cobrança fica lenta): a ordem final não pode mudar
    const lagged = new Proxy(P, { get(t, k: any) { const v = t[k]; if (k !== 'offlineClient' && k !== 'user') return v; return new Proxy(v, { get(tt, kk) { const f = tt[kk]; return typeof f === 'function' ? async (...a: any[]) => { await new Promise((r) => setTimeout(r, 30)); return f.apply(tt, a); } : f; } }); } });
    assert.deepStrictEqual(await order(lagged), base);
  });
  await block('uma fonte fora do ar não derruba as outras e os avisos saem na ordem de sempre', async () => {
    S.failOn.weeklyFeedback = { message: 'does not exist', code: 'P2021' };
    S.failOn.studentAlert = { message: 'does not exist', code: 'P2021' };
    S.failOn.checkIn = { message: 'does not exist', code: 'P2021' };
    S.failOn.workout = { message: 'does not exist', code: 'P2021' };
    const { db } = slow(5); const h: any = await buildHoje(db, 'cA', NOW);
    assert.deepStrictEqual(h.unavailable.filter((x: string) => ['feedback da semana', 'observações', 'avaliações', 'treinos'].includes(x)), ['feedback da semana', 'observações', 'avaliações', 'treinos']);
    assert.ok(!h.tasks.some((t: any) => ['semanal', 'obs', 'avaliacao', 'treino'].includes(t.type)));
    assert.ok(h.tasks.some((t: any) => t.type === 'cobranca') && h.tasks.some((t: any) => t.type === 'presenca'), 'as outras fontes seguem');
    S.failOn = {}; S.failOn.offlineClient = { message: 'does not exist', code: 'P2021' };
    const h2: any = await buildHoje(P, 'cA', NOW);
    assert.ok(h2.unavailable.includes('clientes do financeiro') && !h2.tasks.some((t: any) => t.person && t.person.kind === 'offline'), 'sem os clientes do financeiro: some só a cobrança deles');
    assert.ok(h2.tasks.some((t: any) => t.type === 'cobranca' && t.person.id === 's1'), 'a dos alunos continua');
  });
  await block('coach sem alunos nem nada: lista vazia, sem erro', async () => {
    P.__reset(); S.user.push({ id: 'cZ', role: 'COACH', name: 'Z', active: true, coachId: null });
    const h: any = await buildHoje(slow(2).db, 'cZ', NOW);
    assert.deepStrictEqual([h.tasks.length, h.agenda.length, h.counts.late + h.counts.today + h.counts.soon + h.counts.info], [0, 0, 0]);
  });
  console.log(`\n${passed} ok, ${fails} falhou`); process.exit(fails ? 1 : 0);
})();
