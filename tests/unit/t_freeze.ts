import assert from 'assert';
import prisma from '@/lib/prisma';
import { signAuthToken } from '/home/user/fitos-final/lib/auth';
import { MASTER_IDS } from '/home/user/fitos-final/lib/masterIds';
import { POST } from '/home/user/fitos-final/app/api/admin/freeze/route';
import { parseFreezeBody, planUnfreeze, parseDay, frozenDays, DAY_MS } from '/home/user/fitos-final/lib/freeze';
import { isDueStudentForWeek } from '/home/user/fitos-final/lib/weeklyFeedback';

process.env.ASAAS_API_KEY = 'chave-principal'; process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const realLog = (s: string) => process.stdout.write(s + '\n');
const db: any = (prisma as any).__db; const G: any = globalThis;
const iso = (d: Date) => d.toISOString();
const ago = (days: number) => new Date(Date.now() - days * DAY_MS), ahead = (days: number) => new Date(Date.now() + days * DAY_MS);
const near = (a: any, b: Date, hours = 2) => Math.abs(new Date(a).getTime() - b.getTime()) < hours * 3600000;

// Asaas simulada (só o que o "parar de cobrar" usa)
const calls: string[] = []; const A: any = { subs: {} as any, pays: {} as any };
const ok = (j: any = {}) => ({ ok: true, status: 200, json: async () => j });
G.fetch = async (url: string, init: any = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+\/v3/, ''); const method = init.method || 'GET'; calls.push(method + ' ' + path);
  const u = new URL('http://x' + path); const q = (k: string) => u.searchParams.get(k);
  if (u.pathname === '/customers') return ok({ data: [] });
  if (u.pathname === '/subscriptions' && method === 'GET') return ok({ data: (A.subs[q('customer')!] || []) });
  if (u.pathname === '/payments' && method === 'GET') return ok({ data: (A.pays[q('customer')!] || []).filter((p: any) => p.status === q('status')) });
  let m = /^\/subscriptions\/([^/]+)$/.exec(u.pathname); if (m && method === 'DELETE') { for (const k of Object.keys(A.subs)) A.subs[k] = A.subs[k].filter((s: any) => s.id !== m![1]); return ok({ deleted: true }); }
  m = /^\/payments\/([^/]+)$/.exec(u.pathname); if (m && method === 'DELETE') { for (const k of Object.keys(A.pays)) A.pays[k] = A.pays[k].filter((p: any) => p.id !== m![1]); return ok({ deleted: true }); }
  throw new Error('chamada inesperada: ' + method + ' ' + path);
};
const tok = (id: string, role = 'COACH', coachId: string | null = null) => signAuthToken({ id, role, coachId });
const call = async (body: any, token?: string) => { const r: any = await POST(new Request('http://x/api/admin/freeze', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }) as any); return { status: r.status, json: await r.json() }; };
const S = (id = 'aluno1') => db.user.find((u: any) => u.id === id);
const reset = () => { for (const k of Object.keys(db)) db[k].length = 0; calls.length = 0; A.subs = {}; A.pays = {}; G.__pushes = []; (prisma as any).__tx.calls = 0;
  db.user.push({ id: 'coach1', role: 'COACH', coachAsaasApiKey: null }, { id: 'coach2', role: 'COACH', coachAsaasApiKey: null },
    { id: 'aluno1', role: 'USER', name: 'Teste Um', email: 'a@x.com', cpf: null, coachId: 'coach1', nutritionistId: 'nutri1', asaasCustomerId: 'cus_1', plan: 'PREMIUM', isFinanceActive: true, paymentDueDate: ahead(5), nextCheckInDate: ahead(3), frozenAt: null, frozenUntil: null, frozenReason: null, frozenFinanceWasActive: null, pushToken: 'ExponentPushToken[x]' }); };
let n = 0, bad = 0;
const t = async (name: string, fn: () => any) => { reset(); try { await fn(); n++; realLog('  ok  ' + name); } catch (e: any) { bad++; realLog('FALHOU ' + name + '\n   ' + (e.stack || e)); } };
const withBilling = () => { A.subs['cus_1'] = [{ id: 'sub_1', value: 5, cycle: 'MONTHLY', nextDueDate: '2026-11-10' }]; A.pays['cus_1'] = [{ id: 'pay_1', value: 5, dueDate: '2026-11-10', status: 'PENDING' }]; db.subscription.push({ id: 's1', userId: 'aluno1', status: 'ACTIVE', asaasSubscriptionId: 'sub_1', asaasCustomerId: 'cus_1' }); db.payment.push({ id: 'p1', userId: 'aluno1', asaasPaymentId: 'pay_1', status: 'PENDING' }); };
const freezeNow = (extra: any = {}) => Object.assign(S(), { frozenAt: ago(14), frozenUntil: ahead(2), frozenReason: 'cirurgia', frozenFinanceWasActive: true, isFinanceActive: false }, extra);

(async () => {
  await t('regras puras: leitura do pedido (ação, data de volta, motivo) e contas de dias', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    assert.equal(parseFreezeBody({}, now).ok, false); assert.equal(parseFreezeBody({ userId: 'x', action: 'PAUSE' }, now).ok, false);
    const a: any = parseFreezeBody({ userId: ' x ', action: 'freeze', until: '2026-11-20', reason: '  cirurgia  ' }, now); assert.ok(a.ok); assert.equal(a.value.userId, 'x'); assert.equal(a.value.action, 'FREEZE'); assert.equal(a.value.reason, 'cirurgia'); assert.equal(a.value.cancelBilling, true); assert.equal(a.value.confirm, false); assert.equal(a.value.until.toISOString(), '2026-11-20T15:00:00.000Z');
    assert.equal((parseFreezeBody({ userId: 'x', action: 'FREEZE', until: 'amanhã' }, now) as any).ok, false); assert.equal((parseFreezeBody({ userId: 'x', action: 'FREEZE', until: '2020-01-01' }, now) as any).ok, false); assert.equal((parseFreezeBody({ userId: 'x', action: 'FREEZE', until: '2030-01-01' }, now) as any).ok, false);
    assert.equal((parseFreezeBody({ userId: 'x', action: 'FREEZE', cancelBilling: false, confirm: true }, now) as any).value.cancelBilling, false); assert.equal((parseFreezeBody({ userId: 'x', action: 'UNFREEZE', until: 'lixo' }, now) as any).ok, true, 'data de volta só vale ao congelar');
    assert.equal((parseFreezeBody({ userId: 'x', action: 'FREEZE', reason: 'x'.repeat(500) }, now) as any).value.reason.length, 200);
    assert.equal(parseDay(''), null); assert.equal(parseDay('xx'), 'invalid'); assert.equal(frozenDays(new Date('2026-10-12T12:00:00Z'), new Date('2026-10-26T20:00:00Z')), 14); assert.equal(frozenDays(new Date('2026-10-26T12:00:00Z'), new Date('2026-10-26T13:00:00Z')), 0); assert.equal(frozenDays(new Date('2026-10-28T12:00:00Z'), new Date('2026-10-26T13:00:00Z')), 0, 'nunca negativo');
  });
  await t('planUnfreeze: empurra o que estava valendo; não empurra treino já vencido, vencimento atrasado, aluno inativo no financeiro nem ficha vencida', () => {
    const now = new Date('2026-10-26T12:00:00Z'); const fa = new Date('2026-10-12T12:00:00Z'); const d = (s: string) => new Date(s + 'T12:00:00Z');
    const p = planUnfreeze({ frozenAt: fa, plan: 'PREMIUM', paymentDueDate: d('2026-10-20'), nextCheckInDate: d('2026-10-15'), frozenFinanceWasActive: true },
      [{ id: 'w1', startDate: d('2026-09-20'), endDate: d('2026-11-01') }, { id: 'w2', startDate: d('2026-08-01'), endDate: d('2026-09-30') }, { id: 'w3', startDate: d('2026-10-01'), endDate: null }, { id: 'w4', startDate: d('2026-07-01'), endDate: d('2026-12-01'), archived: true }], now);
    assert.equal(p.days, 14); assert.deepEqual(p.workouts.map((w) => w.id), ['w1', 'w3'], 'só os que estavam valendo e não arquivados');
    assert.equal(p.workouts[0].endDate!.to.slice(0, 10), '2026-11-15'); assert.equal(p.workouts[0].startDate!.to.slice(0, 10), '2026-10-04'); assert.equal(p.workouts[1].endDate, null);
    assert.equal(p.paymentDueDate!.to.slice(0, 10), '2026-11-03'); assert.equal(p.nextCheckInDate!.to.slice(0, 10), '2026-10-29');
    const late = planUnfreeze({ frozenAt: fa, paymentDueDate: d('2026-10-05'), frozenFinanceWasActive: true }, [], now); assert.equal(late.paymentDueDate, null); assert.ok(late.notes.some((x) => /atrasado/.test(x)));
    const inactive = planUnfreeze({ frozenAt: fa, paymentDueDate: d('2026-10-20'), frozenFinanceWasActive: false }, [], now); assert.equal(inactive.paymentDueDate, null); assert.ok(inactive.notes.some((x) => /inativo/.test(x)));
    const expired = planUnfreeze({ frozenAt: fa, plan: 'PREMIUM' }, [{ id: 'w', startDate: d('2026-08-01'), endDate: d('2026-09-30') }], now); assert.deepEqual(expired.workouts, []); assert.ok(expired.notes.some((x) => /vencido/.test(x)));
    const ficha = planUnfreeze({ frozenAt: fa, plan: 'FICHA_8S' }, [{ id: 'w', startDate: d('2026-07-01'), endDate: null }], now); assert.deepEqual(ficha.workouts, [], 'ficha de 8 semanas vencida não ressuscita'); assert.ok(ficha.notes.some((x) => /ficha/i.test(x)));
    const fichaOk = planUnfreeze({ frozenAt: fa, plan: 'FICHA_8S' }, [{ id: 'w', startDate: d('2026-10-01'), endDate: null }], now); assert.equal(fichaOk.workouts.length, 1, 'ficha no meio continua e anda');
    const short = planUnfreeze({ frozenAt: new Date('2026-10-26T08:00:00Z'), paymentDueDate: d('2026-10-30') }, [{ id: 'w', endDate: d('2026-11-01') }], now); assert.equal(short.days, 0); assert.deepEqual(short.workouts, []); assert.equal(short.paymentDueDate, null);
  });
  await t('feedback da semana e central HOJE: aluno congelado não entra', () => {
    assert.equal(isDueStudentForWeek({ coachId: 'c', role: 'USER', createdAt: '2026-01-01' }, '2026-10-12'), true);
    assert.equal(isDueStudentForWeek({ coachId: 'c', role: 'USER', createdAt: '2026-01-01', frozenAt: new Date() }, '2026-10-12'), false);
  });
  await t('quem pode: sem login 401; o próprio aluno e coach de outro aluno 403; coach dono, nutri e master passam; só aluno; pedido ruim 400; aluno inexistente 404', async () => {
    const b = { userId: 'aluno1', action: 'FREEZE' };
    assert.equal((await call(b)).status, 401); assert.equal((await call(b, tok('aluno1', 'USER', 'coach1'))).status, 403); assert.equal((await call(b, tok('coach2'))).status, 403);
    assert.equal((await call(b, tok('coach1'))).status, 200); assert.equal((await call(b, tok('nutri1'))).status, 200); assert.equal((await call(b, tok(MASTER_IDS[0]))).status, 200);
    assert.equal((await call({ userId: 'coach2', action: 'FREEZE' }, tok('coach1'))).status, 400); assert.equal((await call({ userId: 'x', action: 'FREEZE' }, tok('coach1'))).status, 404);
    assert.equal((await call({ userId: 'aluno1', action: 'PAUSA' }, tok('coach1'))).status, 400); assert.equal((await call('RUIM', tok('coach1'))).status, 400); assert.equal((await call({ userId: 'aluno1', action: 'FREEZE', until: 'lixo' }, tok('coach1'))).status, 400);
  });
  await t('congelar, conferência: lista o que a Asaas cancelaria e NÃO muda nada (nem no aluno, nem na Asaas)', async () => {
    withBilling(); const r = await call({ userId: 'aluno1', action: 'FREEZE', until: '2099-01-01', reason: 'x' }, tok('coach1'));
    assert.equal(r.status, 400, 'volta prevista longe demais');
    const r2 = await call({ userId: 'aluno1', action: 'FREEZE', reason: 'cirurgia' }, tok('coach1')); assert.equal(r2.status, 200); assert.equal(r2.json.dryRun, true); assert.equal(r2.json.billing.found, 2); assert.equal(r2.json.billing.subscriptions[0].id, 'sub_1');
    assert.equal(S().frozenAt, null); assert.equal(S().isFinanceActive, true); assert.ok(!calls.some((c) => c.startsWith('DELETE')), 'nada apagado na Asaas'); assert.equal(db.subscription[0].status, 'ACTIVE');
  });
  await t('congelar, confirmar: marca congelado, tira do financeiro (lembrando como estava) e cancela assinatura e cobrança aberta na Asaas', async () => {
    withBilling(); const r = await call({ userId: 'aluno1', action: 'FREEZE', until: iso(ahead(20)).slice(0, 10), reason: '  cirurgia no joelho ', confirm: true }, tok('coach1'));
    assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.billing.cancelled.subscriptions, 1); assert.equal(r.json.billing.cancelled.payments, 1);
    const s = S(); assert.ok(near(s.frozenAt, new Date(), 1)); assert.equal(s.frozenReason, 'cirurgia no joelho'); assert.ok(s.frozenUntil); assert.equal(s.isFinanceActive, false); assert.equal(s.frozenFinanceWasActive, true);
    assert.equal(db.subscription[0].status, 'CANCELLED'); assert.equal(db.payment.length, 0); assert.ok(calls.includes('DELETE /subscriptions/sub_1') && calls.includes('DELETE /payments/pay_1'));
  });
  await t('congelar sem mexer na Asaas (cancelBilling=false) e aluno que paga por fora: nenhuma chamada à Asaas; funciona igual', async () => {
    withBilling(); let r = await call({ userId: 'aluno1', action: 'FREEZE', confirm: true, cancelBilling: false }, tok('coach1')); assert.equal(r.json.billing, null); assert.equal(calls.length, 0); assert.equal(db.subscription[0].status, 'ACTIVE'); assert.ok(S().frozenAt);
    reset(); r = await call({ userId: 'aluno1', action: 'FREEZE', confirm: true }, tok('coach1')); assert.equal(r.status, 200); assert.equal(r.json.billing.found, 0, 'nada para cancelar (paga por fora)'); assert.ok(S().frozenAt && S().isFinanceActive === false);
  });
  await t('congelar um aluno que já estava inativo no financeiro: lembra "não estava ativo"; congelar duas vezes = 409; descongelar quem não está congelado = 409', async () => {
    S().isFinanceActive = false; let r = await call({ userId: 'aluno1', action: 'FREEZE', confirm: true }, tok('coach1')); assert.equal(r.status, 200); assert.equal(S().frozenFinanceWasActive, false);
    assert.equal((await call({ userId: 'aluno1', action: 'FREEZE', confirm: true }, tok('coach1'))).status, 409);
    reset(); assert.equal((await call({ userId: 'aluno1', action: 'UNFREEZE', confirm: true }, tok('coach1'))).status, 409);
  });
  await t('descongelar, conferência: mostra os dias parados e as datas novas, sem gravar', async () => {
    freezeNow(); db.workout.push({ id: 'w1', userId: 'aluno1', name: 'Treino A', archived: false, startDate: ago(20), endDate: ahead(10) });
    const before = JSON.stringify(db); const r = await call({ userId: 'aluno1', action: 'UNFREEZE' }, tok('coach1'));
    assert.equal(r.status, 200); assert.equal(r.json.dryRun, true); assert.equal(r.json.days, 14); assert.equal(r.json.plan.workouts.length, 1); assert.ok(near(r.json.plan.workouts[0].endDate.to, new Date(ahead(10).getTime() + 14 * DAY_MS), 3)); assert.ok(r.json.plan.paymentDueDate);
    assert.equal(JSON.stringify(db), before, 'a conferência não grava nada'); assert.equal(G.__pushes.length, 0);
  });
  await t('descongelar, confirmar: empurra treino, vencimento e avaliação pelos dias parados, volta ao financeiro, limpa o congelamento e avisa o aluno; tudo numa transação só', async () => {
    const due0 = ahead(5), chk0 = ahead(3); freezeNow({ paymentDueDate: due0, nextCheckInDate: chk0 });
    db.workout.push({ id: 'w1', userId: 'aluno1', name: 'Treino A', archived: false, startDate: ago(20), endDate: ahead(10) }, { id: 'w2', userId: 'aluno1', name: 'Velho', archived: false, startDate: ago(90), endDate: ago(40) }, { id: 'w3', userId: 'aluno1', name: 'Arquivado', archived: true, startDate: ago(90), endDate: ahead(30) });
    const e0 = db.workout[0].endDate, w2 = db.workout[1].endDate, w3 = db.workout[2].endDate;
    const r = await call({ userId: 'aluno1', action: 'UNFREEZE', confirm: true }, tok('coach1')); assert.equal(r.status, 200); assert.equal(r.json.dryRun, false); assert.equal(r.json.financeReactivated, true);
    const s = S(); assert.strictEqual(s.frozenAt, null); assert.strictEqual(s.frozenUntil, null); assert.strictEqual(s.frozenReason, null); assert.strictEqual(s.frozenFinanceWasActive, null); assert.equal(s.isFinanceActive, true);
    assert.equal(new Date(s.paymentDueDate).getTime(), due0.getTime() + 14 * DAY_MS); assert.equal(new Date(s.nextCheckInDate).getTime(), chk0.getTime() + 14 * DAY_MS);
    assert.equal(new Date(db.workout[0].endDate).getTime(), new Date(e0).getTime() + 14 * DAY_MS); assert.equal(db.workout[1].endDate, w2, 'treino já vencido não anda'); assert.equal(db.workout[2].endDate, w3, 'arquivado não anda');
    assert.equal((prisma as any).__tx.calls, 1, 'uma transação só'); assert.equal(G.__pushes.length, 1); assert.ok(/14 dias/.test(G.__pushes[0].body));
    assert.equal((await call({ userId: 'aluno1', action: 'UNFREEZE', confirm: true }, tok('coach1'))).status, 409, 'não dá para descongelar duas vezes (não empurra duas vezes)');
  });
  await t('descongelar aluno que estava inativo no financeiro antes: continua inativo e o vencimento não é mexido', async () => {
    freezeNow({ frozenFinanceWasActive: false }); const due = S().paymentDueDate;
    const r = await call({ userId: 'aluno1', action: 'UNFREEZE', confirm: true }, tok('coach1')); assert.equal(r.status, 200); assert.equal(r.json.financeReactivated, false); assert.equal(S().isFinanceActive, false); assert.equal(S().paymentDueDate, due);
  });
  realLog(`\n${n} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
