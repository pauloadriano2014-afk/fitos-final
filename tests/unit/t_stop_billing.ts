import assert from 'assert';
import prisma from '@/lib/prisma';
import { signAuthToken } from '/home/user/fitos-final/lib/auth';
import { MASTER_IDS } from '/home/user/fitos-final/lib/masterIds';
import { POST } from '/home/user/fitos-final/app/api/admin/stop-billing/route';

process.env.ASAAS_API_KEY = 'chave-principal'; process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const realLog = (s: string) => process.stdout.write(s + '\n');

const db: any = (prisma as any).__db; const G: any = globalThis;
const calls: { method: string; path: string; key: string }[] = [];
// "Asaas" simulada: clientes, assinaturas e cobranças por cliente
const A: any = { customers: {} as any, subs: {} as any, pays: {} as any, fail: {} as any };
const ok = (j: any = {}) => ({ ok: true, status: 200, json: async () => j });
const err = (status: number, d = 'erro da Asaas') => ({ ok: false, status, json: async () => ({ errors: [{ description: d }] }) });
G.fetch = async (url: string, init: any = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+\/v3/, ''); const method = init.method || 'GET';
  calls.push({ method, path, key: (init.headers || {}).access_token });
  const u = new URL('http://x' + path); const q = (k: string) => u.searchParams.get(k);
  if (A.fail[method + ' ' + u.pathname]) return A.fail[method + ' ' + u.pathname];
  if (u.pathname === '/customers' && method === 'GET') {
    const cpf = q('cpfCnpj'), email = q('email');
    return ok({ data: Object.values(A.customers).filter((c: any) => (cpf && c.cpfCnpj === cpf) || (email && c.email === email)) });
  }
  if (u.pathname === '/subscriptions' && method === 'GET') return ok({ data: (A.subs[q('customer')!] || []).filter((s: any) => s.status === 'ACTIVE') });
  if (u.pathname === '/payments' && method === 'GET') return ok({ data: (A.pays[q('customer')!] || []).filter((p: any) => p.status === q('status')) });
  let m = /^\/subscriptions\/([^/]+)$/.exec(u.pathname);
  if (m && method === 'DELETE') { const id = m[1]; for (const k of Object.keys(A.subs)) A.subs[k] = A.subs[k].filter((s: any) => s.id !== id); return ok({ deleted: true, id }); }
  m = /^\/payments\/([^/]+)$/.exec(u.pathname);
  if (m && method === 'DELETE') { const id = m[1]; let found = false; for (const k of Object.keys(A.pays)) { const n = A.pays[k].length; A.pays[k] = A.pays[k].filter((p: any) => p.id !== id); if (A.pays[k].length < n) found = true; } return found ? ok({ deleted: true }) : err(404, 'Cobrança não encontrada'); }
  m = /^\/checkouts\/([^/]+)\/cancel$/.exec(u.pathname);
  if (m && method === 'POST') return ok({});
  throw new Error('chamada inesperada: ' + method + ' ' + path);
};

const tok = (id: string, role = 'COACH', coachId: string | null = null) => signAuthToken({ id, role, coachId });
const mk = (body: any, token?: string) => new Request('http://x/api/admin/stop-billing', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }) as any;
const call = async (body: any, token?: string) => { const r: any = await POST(mk(body, token)); return { status: r.status, json: await r.json() }; };
const reset = () => { for (const k of Object.keys(db)) db[k].length = 0; calls.length = 0; A.customers = {}; A.subs = {}; A.pays = {}; A.fail = {};
  db.user.push({ id: 'coach1', role: 'COACH', coachAsaasApiKey: null }, { id: 'coach2', role: 'COACH', coachAsaasApiKey: 'chave-do-coach2' },
    { id: 'aluno1', role: 'USER', name: 'Teste Um', email: 'teste1@x.com', cpf: '529.982.247-25', coachId: 'coach1', nutritionistId: 'nutri1', asaasCustomerId: 'cus_app', isFinanceActive: true },
    { id: 'aluno2', role: 'USER', name: 'Aluna Dois', email: 'dois@x.com', cpf: null, coachId: 'coach2', nutritionistId: null, asaasCustomerId: null, isFinanceActive: true });
};
let n = 0, bad = 0;
const t = async (name: string, fn: () => any) => { reset(); try { await fn(); n++; realLog('  ok  ' + name); } catch (e: any) { bad++; realLog('FALHOU ' + name + '\n   ' + (e.stack || e)); } };

(async () => {
  await t('quem pode: sem login 401; aluno comum e coach de outro aluno 403; coach dono, nutri dele e master passam; só aluno (não coach)', async () => {
    assert.equal((await call({ userId: 'aluno1' })).status, 401);
    assert.equal((await call({ userId: 'aluno1' }, tok('aluno1', 'USER', 'coach1'))).status, 403, 'o próprio aluno não pode');
    assert.equal((await call({ userId: 'aluno1' }, tok('coach2'))).status, 403, 'coach de outro aluno');
    assert.equal((await call({ userId: 'aluno1' }, tok('coach1'))).status, 200);
    assert.equal((await call({ userId: 'aluno1' }, tok('nutri1'))).status, 200);
    assert.equal((await call({ userId: 'aluno1' }, tok(MASTER_IDS[0]))).status, 200, 'master tem passe livre');
    assert.equal((await call({ userId: 'coach2' }, tok('coach1'))).status, 400, 'não serve para cobrança de coach');
    assert.equal((await call({ userId: 'nao-existe' }, tok('coach1'))).status, 404);
    assert.equal((await call({}, tok('coach1'))).status, 400); assert.equal((await call('BAD', tok('coach1'))).status, 400);
  });
  await t('conferir (sem confirm): lista assinatura e cobranças abertas e NÃO cancela nem altera nada', async () => {
    A.subs.cus_app = [{ id: 'sub_1', status: 'ACTIVE', value: 5, cycle: 'MONTHLY', nextDueDate: '2026-11-05', description: 'Teste' }];
    A.pays.cus_app = [{ id: 'pay_1', status: 'PENDING', value: 5, dueDate: '2026-11-05', billingType: 'PIX', subscription: 'sub_1' }, { id: 'pay_2', status: 'OVERDUE', value: 1, dueDate: '2026-10-01', billingType: 'BOLETO' }, { id: 'pay_pago', status: 'RECEIVED', value: 5 }];
    const r = await call({ userId: 'aluno1' }, tok('coach1'));
    assert.equal(r.json.dryRun, true); assert.equal(r.json.found, 3); assert.deepEqual(r.json.subscriptions.map((s: any) => s.id), ['sub_1']); assert.deepEqual(r.json.payments.map((p: any) => p.id).sort(), ['pay_1', 'pay_2']);
    assert.equal(calls.filter((c) => c.method !== 'GET').length, 0, 'só consultou'); assert.equal(db.user.find((u: any) => u.id === 'aluno1').isFinanceActive, true);
  });
  await t('achar o que o app não conhece: cliente criado direto na Asaas é achado pelo CPF (só dígitos) e pelo e-mail', async () => {
    A.customers.x1 = { id: 'cus_painel', cpfCnpj: '52998224725', email: 'outro@x.com' }; A.customers.x2 = { id: 'cus_email', cpfCnpj: '1', email: 'teste1@x.com' };
    A.subs.cus_painel = [{ id: 'sub_manual', status: 'ACTIVE', value: 1, cycle: 'MONTHLY' }]; A.pays.cus_email = [{ id: 'pay_email', status: 'PENDING', value: 2, dueDate: '2026-11-01' }];
    const r = await call({ userId: 'aluno1' }, tok('coach1'));
    assert.deepEqual(r.json.subscriptions.map((s: any) => s.id), ['sub_manual']); assert.deepEqual(r.json.payments.map((p: any) => p.id), ['pay_email']);
    assert.ok(calls.some((c) => c.path.includes('cpfCnpj=52998224725')) && calls.some((c) => c.path.includes('email=teste1%40x.com')));
  });
  await t('confirmar: cancela assinatura e cobranças abertas na Asaas, marca a recorrência local como cancelada, apaga as cobranças locais e deixa o aluno inativo', async () => {
    A.subs.cus_app = [{ id: 'sub_1', status: 'ACTIVE', value: 5 }]; A.pays.cus_app = [{ id: 'pay_1', status: 'PENDING', value: 5 }, { id: 'pay_2', status: 'OVERDUE', value: 1 }];
    db.subscription.push({ id: 's1', userId: 'aluno1', status: 'ACTIVE', asaasSubscriptionId: 'sub_1', asaasCustomerId: 'cus_app', value: 5, cycle: 'MONTHLY', planName: 'Mensal' });
    db.payment.push({ id: 'p1', userId: 'aluno1', status: 'PENDING', asaasPaymentId: 'pay_1', value: 5 }, { id: 'p9', userId: 'aluno1', status: 'RECEIVED', asaasPaymentId: 'pay_antigo', value: 5 });
    const r = await call({ userId: 'aluno1', confirm: true }, tok('coach1'));
    assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.deepEqual(r.json.cancelled, { subscriptions: 1, checkouts: 0, payments: 2 }); assert.deepEqual(r.json.failed, []);
    assert.deepEqual(A.subs.cus_app, []); assert.deepEqual(A.pays.cus_app, []);
    assert.equal(db.subscription[0].status, 'CANCELLED'); assert.deepEqual(db.payment.map((p: any) => p.id), ['p9'], 'só some a cobrança aberta; a já recebida fica no histórico');
    assert.equal(db.user.find((u: any) => u.id === 'aluno1').isFinanceActive, false);
    const order = calls.filter((c) => c.method === 'DELETE').map((c) => c.path); assert.ok(order[0].startsWith('/subscriptions/'), 'assinatura primeiro, para não nascer cobrança nova');
  });
  await t('o que já foi pago nunca é cancelado: só PENDING e OVERDUE entram', async () => {
    A.pays.cus_app = [{ id: 'pay_pago', status: 'RECEIVED', value: 5 }, { id: 'pay_conf', status: 'CONFIRMED', value: 5 }];
    const r = await call({ userId: 'aluno1', confirm: true }, tok('coach1')); assert.equal(r.json.found, 0);
    assert.equal(calls.filter((c) => c.method === 'DELETE').length, 0, 'nenhum DELETE');
  });
  await t('checkout pendente de cartão (ainda sem assinatura) também é cancelado', async () => {
    db.subscription.push({ id: 's2', userId: 'aluno1', status: 'PENDING_CHECKOUT', asaasSubscriptionId: null, asaasCheckoutId: 'chk_1', asaasCustomerId: 'cus_app', value: 5 });
    const r = await call({ userId: 'aluno1', confirm: true }, tok('coach1')); assert.equal(r.json.cancelled.checkouts, 1); assert.ok(calls.some((c) => c.path === '/checkouts/chk_1/cancel')); assert.equal(db.subscription[0].status, 'CANCELLED');
  });
  await t('falha numa cobrança não trava o resto: as outras são canceladas, a que falhou é avisada e o aluno ainda sai do painel', async () => {
    A.pays.cus_app = [{ id: 'pay_a', status: 'PENDING', value: 1 }, { id: 'pay_b', status: 'PENDING', value: 1 }];
    A.fail['DELETE /payments/pay_a'] = err(400, 'Não foi possível cancelar');
    const r = await call({ userId: 'aluno1', confirm: true }, tok('coach1'));
    assert.equal(r.json.ok, false); assert.equal(r.json.cancelled.payments, 1); assert.equal(r.json.failed.length, 1); assert.equal(r.json.failed[0].id, 'pay_a'); assert.ok(r.json.failed[0].error.includes('Não foi possível'));
    assert.deepEqual(A.pays.cus_app.map((p: any) => p.id), ['pay_a']); assert.equal(db.user.find((u: any) => u.id === 'aluno1').isFinanceActive, false);
  });
  await t('404 da Asaas (já sumiu junto com a assinatura) conta como feito, não como falha', async () => {
    db.payment.push({ id: 'p1', userId: 'aluno1', status: 'PENDING', asaasPaymentId: 'pay_fantasma', value: 5 });   // o app guardou, a Asaas não tem mais
    const r = await call({ userId: 'aluno1', confirm: true }, tok('coach1')); assert.equal(r.json.ok, true); assert.equal(r.json.cancelled.payments, 1); assert.deepEqual(r.json.failed, []); assert.equal(db.payment.length, 0);
  });
  await t('busca na Asaas falhou: vira aviso, mas o que o app já sabia ainda é conferido', async () => {
    A.fail['GET /customers'] = err(500); db.subscription.push({ id: 's1', userId: 'aluno1', status: 'ACTIVE', asaasSubscriptionId: 'sub_loc', asaasCustomerId: 'cus_app', value: 5 });
    A.subs.cus_app = [{ id: 'sub_loc', status: 'ACTIVE', value: 5 }];
    const r = await call({ userId: 'aluno1' }, tok('coach1')); assert.ok(r.json.warnings.length >= 1); assert.deepEqual(r.json.subscriptions.map((s: any) => s.id), ['sub_loc']);
  });
  await t('chave da Asaas: usa a do coach dono do aluno quando existe; senão a da conta principal', async () => {
    await call({ userId: 'aluno2' }, tok('coach2')); assert.ok(calls.length === 0 || calls.every((c) => c.key === 'chave-do-coach2'), 'aluno2 sem CPF/cliente/e-mail Asaas: nada a consultar ou só com a chave do coach2');
    calls.length = 0; A.customers.c = { id: 'cus_d', cpfCnpj: '1', email: 'dois@x.com' }; await call({ userId: 'aluno2' }, tok('coach2')); assert.ok(calls.length > 0 && calls.every((c) => c.key === 'chave-do-coach2'));
    calls.length = 0; await call({ userId: 'aluno1' }, tok('coach1')); assert.ok(calls.length > 0 && calls.every((c) => c.key === 'chave-principal'));
  });
  await t('aluno sem nada a cobrar: confirma sem erro e só deixa inativo', async () => {
    const r = await call({ userId: 'aluno1', confirm: true }, tok('coach1')); assert.equal(r.json.ok, true); assert.equal(r.json.found, 0); assert.equal(db.user.find((u: any) => u.id === 'aluno1').isFinanceActive, false);
  });
  realLog(`\n${n} ok, ${bad} falhou`); process.exit(bad ? 1 : 0);
})();
