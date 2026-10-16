import assert from 'assert';
import prisma from '@/lib/prisma';
import { signAuthToken } from '@/lib/auth';
import { PAULO_ID } from '@/lib/masterIds';
import {
  BILLING_PLANS, OFFERED_PLAN_KEYS, TIERS, planKey, promoTotal, quotePlan, resolveOfferedPlanKey, tierForStudents, catalogForClient,
  getRecurrenceValue, LAUNCH_PROMO_MAX, LAUNCH_PROMO_PERCENT,
} from '@/config/coachBillingPlans';
import { getPromoState, reservePromo } from '@/lib/launchPromo';
import { POST as createCharge } from '@/app/api/admin/coach-billing/create/route';
import { POST as upgradeCharge } from '@/app/api/admin/coach-billing/create/upgrade/route';
import { POST as webhook } from '@/app/api/payments/webhook/route';
import { GET as getCatalog } from '@/app/api/coach-plans/catalog/route';
import { GET as getPromoAdmin, PATCH as patchPromoAdmin } from '@/app/api/admin/launch-promo/route';

const db: any = prisma;
process.env.ASAAS_WEBHOOK_TOKEN = 'tok';
const tok = (id: string, role = 'COACH') => signAuthToken({ id, role, coachId: null } as any);
const req = (url: string, method: string, token?: string, body?: any) => new Request(`http://x${url}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
const json = async (res: any) => ({ status: res.status, body: await res.json() });

// ─── Asaas simulado ───
const asaas: { path: string; body: any }[] = []; let failPayments = false; let payN = 0;
(globalThis as any).fetch = async (url: string, opts: any) => {
  const path = String(url).replace(/^https?:\/\/[^/]+\/v3/, ''); const body = opts?.body ? JSON.parse(opts.body) : null; asaas.push({ path, body });
  if (path.startsWith('/customers?')) return { json: async () => ({ data: [] }) };
  if (path === '/customers') return { json: async () => ({ id: 'cus_' + (body?.cpfCnpj || 'x') }) };
  if (path === '/payments') { if (failPayments) return { json: async () => ({ errors: [{ description: 'cartão recusado' }] }) }; payN++; return { json: async () => ({ id: `pay_${payN}`, invoiceUrl: `https://asaas/i/${payN}`, pixQrCode: 'qr', pixCopiaECola: 'pix' }) }; }
  return { json: async () => ({}) };
};
const lastPayment = () => asaas.filter((c) => c.path === '/payments').pop()!.body;

const reset = (max = 10) => { (db.__reset as any)(); db.__state.config = { id: 'singleton', launchPromoUsed: 0, launchPromoMax: max }; };
const addCoach = (id: string, extra: any = {}) => db.__addUser({ id, coachPlan: 'PERSONAL', ...extra });
const charge = async (id: string, plan: string, o: { as?: string; customValue?: number } = {}) => json(await createCharge(req('/api/admin/coach-billing/create', 'POST', tok(o.as || id, o.as === PAULO_ID ? 'ADMIN' : 'COACH'), { coachId: id, billingPlan: plan, paymentMethod: 'UNDEFINED', ...(o.customValue !== undefined ? { customValue: o.customValue } : {}) })));
const hook = async (event: string, payment: any) => json(await webhook(new Request('http://x/api/payments/webhook', { method: 'POST', headers: { 'asaas-access-token': 'tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ event, payment }) })));
const user = (id: string) => db.__state.users.get(id);
const confirm = async (id: string, plan: string, value: number, promo = false, event = 'PAYMENT_CONFIRMED') => hook(event, { id: 'pay_x', value, externalReference: `coach:${id}:${plan}${promo ? ':promo' : ''}` });

(async () => {
  // ═════ A) CATÁLOGO ═════
  // o degrau GROWTH reproduz EXATAMENTE o catálogo de antes (coach que já tem plano continua igual)
  const legacy: Record<string, [number, number]> = {
    PERSONAL_MONTHLY: [97, 97], PERSONAL_QUARTERLY: [273, 91], PERSONAL_SEMIANNUAL: [510, 85], PERSONAL_ANNUAL: [948, 79],
    NUTRI_MONTHLY: [97, 97], NUTRI_QUARTERLY: [273, 91], NUTRI_SEMIANNUAL: [510, 85], NUTRI_ANNUAL: [948, 79],
    ELITE_MONTHLY: [147, 147], ELITE_QUARTERLY: [414, 138], ELITE_SEMIANNUAL: [774, 129], ELITE_ANNUAL: [1428, 119],
  };
  for (const [k, [total, monthly]] of Object.entries(legacy)) { assert.equal(BILLING_PLANS[k].totalPrice, total, k); assert.equal(BILLING_PLANS[k].monthlyPrice, monthly, k); assert.equal(BILLING_PLANS[k].tier, 'GROWTH'); }
  assert.equal(BILLING_PLANS.PERSONAL_MONTHLY.label, 'Personal Mensal'); assert.equal(BILLING_PLANS.ELITE_ANNUAL.label, 'Elite Anual');
  // os outros degraus (os números que o Paulo aprovou)
  const t = (k: string) => BILLING_PLANS[k].totalPrice;
  assert.deepEqual([t('PERSONAL_START_MONTHLY'), t('PERSONAL_START_QUARTERLY'), t('PERSONAL_START_SEMIANNUAL'), t('PERSONAL_START_ANNUAL')], [69, 195, 366, 672]);
  assert.deepEqual([t('PERSONAL_SCALE_MONTHLY'), t('PERSONAL_SCALE_QUARTERLY'), t('PERSONAL_SCALE_SEMIANNUAL'), t('PERSONAL_SCALE_ANNUAL')], [147, 414, 774, 1428]);
  assert.deepEqual([t('PERSONAL_UNLIMITED_MONTHLY'), t('PERSONAL_UNLIMITED_QUARTERLY'), t('PERSONAL_UNLIMITED_SEMIANNUAL'), t('PERSONAL_UNLIMITED_ANNUAL')], [197, 555, 1038, 1920]);
  assert.deepEqual([t('ELITE_START_MONTHLY'), t('ELITE_START_ANNUAL'), t('ELITE_SCALE_MONTHLY'), t('ELITE_UNLIMITED_MONTHLY'), t('ELITE_UNLIMITED_ANNUAL')], [119, 1152, 197, 247, 2400]);
  assert.equal(t('NUTRI_START_QUARTERLY'), 195); assert.equal(planKey('NUTRICIONISTA', 'GROWTH', 'ANNUAL'), 'NUTRI_ANNUAL'); assert.equal(planKey('NUTRICIONISTA', 'SCALE', 'ANNUAL'), 'NUTRI_SCALE_ANNUAL');
  assert.equal(OFFERED_PLAN_KEYS.length, 48); assert.ok(OFFERED_PLAN_KEYS.every((k) => !BILLING_PLANS[k].legacy));
  // o ciclo mais longo nunca fica mais caro por mês, e o degrau de cima nunca fica mais barato
  for (const type of ['PERSONAL', 'NUTRICIONISTA', 'ELITE'] as const) for (const tier of Object.keys(TIERS) as any[]) { const m = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'].map((c) => BILLING_PLANS[planKey(type, tier, c as any)].monthlyPrice); assert.ok(m.every((v, i) => i === 0 || v < m[i - 1]), `${type} ${tier} ciclos decrescentes ${m}`); }
  // promoção: 30% só no trimestral/semestral/anual
  assert.deepEqual(['PERSONAL_QUARTERLY', 'PERSONAL_SEMIANNUAL', 'PERSONAL_ANNUAL', 'ELITE_QUARTERLY', 'ELITE_SEMIANNUAL', 'ELITE_ANNUAL'].map((k) => promoTotal(BILLING_PLANS[k])), [191, 357, 664, 290, 542, 1000]);
  assert.equal(promoTotal(BILLING_PLANS.PERSONAL_MONTHLY), null); assert.equal(promoTotal(BILLING_PLANS.PERSONAL_LAUNCH), null);
  assert.equal(LAUNCH_PROMO_PERCENT, 30); assert.equal(LAUNCH_PROMO_MAX, 10);
  assert.deepEqual([quotePlan('PERSONAL_ANNUAL', { promo: true })!.value, quotePlan('PERSONAL_ANNUAL')!.value, quotePlan('PERSONAL_MONTHLY', { promo: true })!.value], [664, 948, 97]);
  assert.equal(resolveOfferedPlanKey('PERSONAL_LAUNCH'), 'PERSONAL_QUARTERLY'); assert.equal(resolveOfferedPlanKey('NUTRI_LAUNCH'), 'NUTRI_QUARTERLY'); assert.equal(resolveOfferedPlanKey('ELITE_LAUNCH'), 'ELITE_QUARTERLY'); assert.equal(resolveOfferedPlanKey('ELITE_SCALE_ANNUAL'), 'ELITE_SCALE_ANNUAL');
  assert.deepEqual([0, 25, 26, 50, 51, 150, 151, 900].map(tierForStudents), ['START', 'START', 'GROWTH', 'GROWTH', 'SCALE', 'SCALE', 'UNLIMITED', 'UNLIMITED']);
  assert.equal(catalogForClient().plans.length, 48); assert.equal(catalogForClient().plans.find((p) => p.key === 'ELITE_ANNUAL')!.promoTotal, 1000);
  assert.equal(getRecurrenceValue(273), 245.7);
  console.log('OK  catálogo: Growth idêntico ao de antes; degraus e ciclos com os números aprovados; promoção 30% só em ciclos longos; plano antigo vira o normal');

  // ═════ B) PROMOÇÃO PONTA A PONTA ═════
  reset(); addCoach('c1'); addCoach('c2'); addCoach('c3', { coachPlan: 'ELITE' });
  // 1ª cobrança TRIMESTRAL de coach novo: preço promocional, vaga RESERVADA (ainda não usada)
  let r = await charge('c1', 'PERSONAL_QUARTERLY'); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.value, 191); assert.deepEqual(r.body.promo, { applied: true, percent: 30, regularValue: 273 });
  assert.equal(lastPayment().value, 191); assert.equal(lastPayment().externalReference, 'coach:c1:PERSONAL_QUARTERLY:promo'); assert.ok(/Lançamento -30%/.test(lastPayment().description));
  assert.equal(user('c1').launchPromoStatus, 'RESERVED'); assert.equal(user('c1').isLaunchPromo, false, 'vaga ainda NÃO usada');
  let st = await getPromoState(db); assert.deepEqual([st.used, st.reserved, st.available], [0, 1, 9]);
  // MENSAL nunca tem promoção; valor especial combinado na mão também não
  r = await charge('c2', 'PERSONAL_MONTHLY'); assert.equal(r.body.value, 97); assert.equal(r.body.promo.applied, false); assert.ok(!/promo/.test(lastPayment().externalReference)); assert.equal(user('c2').launchPromoStatus, undefined);
  r = await charge('c2', 'PERSONAL_ANNUAL', { customValue: 500 }); assert.equal(r.body.value, 500); assert.equal(r.body.promo.applied, false);
  // master gerando para o coach: promoção vale para o coach-alvo
  r = await charge('c3', 'ELITE_SEMIANNUAL', { as: PAULO_ID }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.value, 542); assert.equal(r.body.promo.applied, true);
  // outros degraus também participam (degrau Start anual: 672 -> 470)
  addCoach('c4'); r = await charge('c4', 'PERSONAL_START_ANNUAL'); assert.equal(r.body.value, 470); assert.equal(user('c4').coachBillingPlan, 'PERSONAL_START_ANNUAL');
  console.log('OK  promoção: 1ª cobrança de ciclo longo sai com 30% e RESERVA a vaga; mensal e valor especial ficam sem promoção; vale para qualquer degrau');

  // pagamento CONFIRMADO: a vaga vira usada, registra 1º pagamento e valor pago; RECEIVED repetido é idempotente
  r = await confirm('c1', 'PERSONAL_QUARTERLY', 191, true); assert.equal(r.status, 200);
  assert.equal(user('c1').isLaunchPromo, true); assert.equal(user('c1').launchPromoStatus, 'CONFIRMED'); assert.equal(user('c1').coachBillingStatus, 'ACTIVE'); assert.equal(user('c1').coachBillingPaidValue, 191); assert.ok(user('c1').coachFirstPaidAt); assert.equal(user('c1').coachBillingPlan, 'PERSONAL_QUARTERLY');
  const firstPaid = String(user('c1').coachFirstPaidAt); await confirm('c1', 'PERSONAL_QUARTERLY', 191, true, 'PAYMENT_RECEIVED');
  st = await getPromoState(db); assert.equal(st.used, 1); assert.equal(String(user('c1').coachFirstPaidAt), firstPaid);
  // renovação do MESMO coach: preço normal (a promoção é só do 1º período)
  r = await charge('c1', 'PERSONAL_QUARTERLY'); assert.equal(r.body.value, 273); assert.equal(r.body.promo.applied, false);
  console.log('OK  vaga só é usada quando o pagamento é CONFIRMADO (e uma vez só); renovação volta ao preço normal');

  // coach que já era ativo/atrasado/cancelado antes (sem 1º pagamento registrado) NÃO é "novo": sem promoção
  for (const s of ['ACTIVE', 'OVERDUE', 'CANCELLED']) { addCoach('old_' + s, { coachBillingStatus: s }); r = await charge('old_' + s, 'PERSONAL_ANNUAL'); assert.equal(r.body.value, 948, s); }
  // quem JÁ PAGOU (mesmo sem promoção) não é mais "novo": mensal pago -> trimestral gerado (status volta a PENDING) -> anual NÃO leva a promoção
  addCoach('p1'); await charge('p1', 'PERSONAL_MONTHLY'); await confirm('p1', 'PERSONAL_MONTHLY', 97);
  r = await charge('p1', 'PERSONAL_QUARTERLY'); assert.equal(r.body.value, 273); assert.equal(user('p1').coachBillingStatus, 'PENDING');
  r = await charge('p1', 'PERSONAL_ANNUAL'); assert.equal(r.body.value, 948, 'já pagou antes: sem promoção'); assert.equal(user('p1').launchPromoStatus, undefined);
  console.log('OK  coach que já estava ativo/atrasado/cancelado, ou que já pagou algum período, não recebe a promoção');

  // limite de 10 e reservas que expiram
  reset(10); for (let i = 1; i <= 11; i++) addCoach('k' + i);
  for (let i = 1; i <= 10; i++) { r = await charge('k' + i, 'PERSONAL_ANNUAL'); assert.equal(r.body.value, 664, 'k' + i); }
  st = await getPromoState(db); assert.deepEqual([st.used, st.reserved, st.available], [0, 10, 0], 'reservas seguram vagas');
  r = await charge('k11', 'PERSONAL_ANNUAL'); assert.equal(r.body.value, 948, 'sem vaga: preço normal'); assert.equal(r.body.promo.applied, false);
  for (const i of [1, 2, 3]) await confirm('k' + i, 'PERSONAL_ANNUAL', 664, true);
  st = await getPromoState(db); assert.deepEqual([st.used, st.reserved, st.available], [3, 7, 0]);
  user('k4').launchPromoReservedUntil = new Date(Date.now() - 1000);        // k4 nunca pagou: a reserva venceu e a vaga volta
  st = await getPromoState(db); assert.deepEqual([st.used, st.reserved, st.available], [3, 6, 1]);
  r = await charge('k11', 'PERSONAL_ANNUAL'); assert.equal(r.body.value, 664, 'vaga devolvida pela reserva vencida');
  // quem já tem reserva válida pode gerar de novo sem ocupar outra vaga
  const before = (await getPromoState(db)).reserved; r = await charge('k11', 'PERSONAL_ANNUAL'); assert.equal(r.body.value, 664); assert.equal((await getPromoState(db)).reserved, before);
  console.log('OK  limite de 10: reservas seguram vagas, reserva vencida devolve, quem já reservou não ocupa outra');

  // concorrência: 2 coaches pedem a ÚLTIMA vaga ao mesmo tempo -> só um leva (a trava de linha é o que garante)
  reset(1); addCoach('r1'); addCoach('r2');
  const both = await Promise.all([charge('r1', 'PERSONAL_ANNUAL'), charge('r2', 'PERSONAL_ANNUAL')]);
  assert.deepEqual(both.map((x) => x.body.value).sort(), [664, 948], 'exatamente um leva a promoção: ' + JSON.stringify(both.map((x) => x.body.value)));
  console.log('OK  concorrência: dois pedidos simultâneos pela última vaga -> só um recebe o preço promocional');

  // Asaas recusa a cobrança promocional: a reserva é solta
  reset(); addCoach('f1'); failPayments = true; r = await charge('f1', 'PERSONAL_ANNUAL'); failPayments = false;
  assert.equal(r.status, 500); assert.equal(user('f1').launchPromoStatus, null, 'reserva solta'); assert.deepEqual([(await getPromoState(db)).reserved], [0]);
  console.log('OK  falha no Asaas solta a reserva (vaga não fica presa)');

  // plano antigo (*_LAUNCH) pedido por app antigo: vira o trimestral normal (que, se elegível, já entra na promoção nova)
  reset(); addCoach('l1'); r = await charge('l1', 'PERSONAL_LAUNCH'); assert.equal(r.body.billingPlan, 'PERSONAL_QUARTERLY'); assert.equal(r.body.value, 191);
  addCoach('l2', { coachBillingStatus: 'ACTIVE' }); r = await charge('l2', 'ELITE_LAUNCH'); assert.equal(r.body.billingPlan, 'ELITE_QUARTERLY'); assert.equal(r.body.value, 414);
  // cobrança promocional apagada/estornada devolve a vaga
  reset(); addCoach('d1'); await charge('d1', 'PERSONAL_ANNUAL'); await confirm('d1', 'PERSONAL_ANNUAL', 664, true); assert.equal((await getPromoState(db)).used, 1);
  await hook('PAYMENT_REFUNDED', { id: 'pay_x', externalReference: 'coach:d1:PERSONAL_ANNUAL:promo' }); assert.equal(user('d1').isLaunchPromo, false); assert.equal(user('d1').coachBillingStatus, 'CANCELLED'); assert.equal((await getPromoState(db)).used, 0);
  console.log('OK  plano antigo vira o normal; estorno da cobrança promocional devolve a vaga');

  // ═════ C) UPGRADE: crédito sobre o que foi PAGO ═════
  reset(); const DAY = 86400000; const start = new Date(Date.now() - 30 * DAY); const end = new Date(start.getTime() + 365 * DAY);
  addCoach('u1', { coachBillingStatus: 'ACTIVE', coachBillingPlan: 'PERSONAL_ANNUAL', coachBillingStart: start, coachBillingEnd: end, coachAsaasId: 'cus_u1', coachBillingPaidValue: 664, isLaunchPromo: true, coachFirstPaidAt: start });
  addCoach('u2', { coachBillingStatus: 'ACTIVE', coachBillingPlan: 'PERSONAL_ANNUAL', coachBillingStart: start, coachBillingEnd: end, coachAsaasId: 'cus_u2' });   // sem valor pago registrado (coach de antes)
  const up = async (id: string, plan: string, dryRun = true) => json(await upgradeCharge(req('/api/admin/coach-billing/create/upgrade', 'POST', tok(id), { coachId: id, newBillingPlan: plan, dryRun })));
  const a = await up('u1', 'ELITE_ANNUAL'), b = await up('u2', 'ELITE_ANNUAL'); assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(b.status, 200);
  const remaining = a.body.daysRemaining; assert.ok(remaining >= 334 && remaining <= 336, 'dias restantes ' + remaining);
  assert.equal(a.body.credit, Math.round((664 / 365) * remaining * 100) / 100, 'crédito pelo valor PAGO (664), não pelo preço cheio');
  assert.equal(b.body.credit, Math.round((948 / 365) * remaining * 100) / 100, 'sem valor pago registrado: preço do plano, como sempre');
  assert.ok(a.body.credit < b.body.credit && a.body.chargeValue > b.body.chargeValue);
  // regras de "para baixo": mudar só o ciclo pode; degrau ou tipo mais barato não (no self-service)
  assert.equal((await up('u2', 'PERSONAL_MONTHLY')).status, 200, 'trocar só o ciclo pode');
  addCoach('u4', { coachBillingStatus: 'ACTIVE', coachBillingPlan: 'PERSONAL_MONTHLY', coachBillingStart: new Date(Date.now() - 10 * DAY), coachBillingEnd: new Date(Date.now() + 20 * DAY), coachAsaasId: 'cus_u4' });
  assert.equal((await up('u4', 'PERSONAL_ANNUAL')).status, 200, 'mensal -> anual (mensalidade equivalente menor) não é "para baixo"');
  assert.equal((await up('u2', 'PERSONAL_START_ANNUAL')).status, 400, 'degrau mais barato não'); assert.equal((await up('u2', 'NUTRI_ANNUAL')).status, 200, 'mesmo valor-base: pode');
  addCoach('u3', { coachBillingStatus: 'ACTIVE', coachPlan: 'ELITE', coachBillingPlan: 'ELITE_ANNUAL', coachBillingStart: start, coachBillingEnd: end, coachAsaasId: 'cus_u3' });
  assert.equal((await up('u3', 'PERSONAL_ANNUAL')).status, 400, 'Elite -> Personal não'); assert.equal((await up('u3', 'ELITE_SCALE_ANNUAL')).status, 200, 'subir de degrau pode');
  // upgrade de promoção antiga vira o normal; e o upgrade NÃO devolve a vaga de quem entrou na promoção
  const real = await up('u1', 'ELITE_ANNUAL', false); assert.equal(real.status, 200, JSON.stringify(real.body)); assert.equal(user('u1').isLaunchPromo, true, 'upgrade não mexe na vaga usada');
  await hook('PAYMENT_CONFIRMED', { id: 'pay_up', value: real.body.chargeValue, externalReference: `coach:u1:upgrade:ELITE_ANNUAL` });
  assert.equal(user('u1').coachBillingPaidValue, BILLING_PLANS.ELITE_ANNUAL.totalPrice, 'no upgrade o período novo vale o preço cheio (crédito + diferença)'); assert.equal(user('u1').isLaunchPromo, true);
  console.log('OK  upgrade: crédito pelo valor realmente pago; só o ciclo pode mudar; degrau/tipo mais barato é bloqueado; vaga usada não é devolvida');

  // ═════ D) CARTÃO RECORRENTE: 1º pagamento registrado, sem promoção ═════
  reset(); addCoach('s1');
  db.__state.subs.set('sub1', { id: 'sub1', userId: 's1', planName: 'PERSONAL_QUARTERLY', value: 245.7, status: 'PENDING_CHECKOUT', billingType: 'CREDIT_CARD', asaasCheckoutId: 'chk1' });
  r = await json(await webhook(new Request('http://x/api/payments/webhook', { method: 'POST', headers: { 'asaas-access-token': 'tok', 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'CHECKOUT_PAID', id: 'chk1', externalReference: 'coach-recorrencia:s1:PERSONAL_QUARTERLY' }) })));
  assert.equal(r.status, 200); assert.equal(user('s1').coachBillingStatus, 'ACTIVE'); assert.equal(user('s1').coachBillingPaidValue, 245.7); assert.ok(user('s1').coachFirstPaidAt); assert.equal(user('s1').isLaunchPromo, false);
  r = await charge('s1', 'PERSONAL_ANNUAL'); assert.equal(r.body.value, 948, 'quem já pagou pelo cartão não é "novo"');
  console.log('OK  cartão recorrente: registra o 1º pagamento e o valor pago; promoção não se aplica depois');

  // ═════ E) ROTAS: catálogo público e painel do master ═════
  reset(10); addCoach('e1'); addCoach('e2'); await charge('e1', 'PERSONAL_ANNUAL'); await confirm('e1', 'PERSONAL_ANNUAL', 664, true); await charge('e2', 'PERSONAL_QUARTERLY');
  let c = await json(await getCatalog(req('/api/coach-plans/catalog', 'GET')));
  assert.equal(c.status, 200); assert.equal(c.body.plans.length, 48); assert.deepEqual([c.body.promo.percent, c.body.promo.max, c.body.promo.slotsLeft, c.body.promo.active], [30, 10, 8, true]); assert.equal(c.body.promo.eligible, undefined, 'sem login não diz se é elegível');
  addCoach('e3'); c = await json(await getCatalog(req('/api/coach-plans/catalog', 'GET', tok('e3')))); assert.equal(c.body.promo.eligible, true);
  c = await json(await getCatalog(req('/api/coach-plans/catalog', 'GET', tok('e1')))); assert.equal(c.body.promo.eligible, false, 'já usou a promoção');
  c = await json(await getCatalog(req('/api/coach-plans/catalog', 'GET', tok(PAULO_ID, 'ADMIN')))); assert.equal(c.body.promo.eligible, undefined);
  db.__state.config.launchPromoMax = 8; c = await json(await getCatalog(req('/api/coach-plans/catalog', 'GET'))); assert.deepEqual([c.body.promo.slotsLeft, c.body.promo.active], [6, true]);
  db.__state.config.launchPromoMax = 2; c = await json(await getCatalog(req('/api/coach-plans/catalog', 'GET', tok('e3')))); assert.deepEqual([c.body.promo.slotsLeft, c.body.promo.active, c.body.promo.eligible], [0, false, false], 'sem vaga: ninguém é elegível');
  // painel do master
  db.__state.config.launchPromoMax = 10;
  let g = await json(await getPromoAdmin(req('/api/admin/launch-promo', 'GET', tok(PAULO_ID, 'ADMIN')))); assert.equal(g.status, 200); assert.deepEqual([g.body.max, g.body.used, g.body.reserved, g.body.available], [10, 1, 1, 8]); assert.deepEqual(g.body.coaches.map((x: any) => [x.id, x.status]).sort(), [['e1', 'USADA'], ['e2', 'RESERVADA']]);
  assert.equal((await json(await getPromoAdmin(req('/api/admin/launch-promo', 'GET', tok('e1'))))).status, 403, 'coach não vê'); assert.equal((await json(await getPromoAdmin(req('/api/admin/launch-promo', 'GET')))).status, 401);
  let p = await json(await patchPromoAdmin(req('/api/admin/launch-promo', 'PATCH', tok(PAULO_ID, 'ADMIN'), { max: 25 }))); assert.equal(p.status, 200); assert.deepEqual([p.body.max, p.body.available], [25, 23]);
  for (const bad of [-1, 'abc', 5000, null, '', true, 2.5, [] as any]) assert.equal((await json(await patchPromoAdmin(req('/api/admin/launch-promo', 'PATCH', tok(PAULO_ID, 'ADMIN'), { max: bad })))).status, 400, 'limite inválido ' + bad);
  assert.equal((await json(await patchPromoAdmin(req('/api/admin/launch-promo', 'PATCH', tok('e1'), { max: 99 })))).status, 403); assert.equal(db.__state.config.launchPromoMax, 25);
  p = await json(await patchPromoAdmin(req('/api/admin/launch-promo', 'PATCH', tok(PAULO_ID, 'ADMIN'), { max: 0 }))); assert.deepEqual([p.status, p.body.available], [200, 0]);
  console.log('OK  rotas: catálogo público (vagas e elegibilidade) e painel do master (ver, aumentar o limite; coach não acessa; valores inválidos recusados)');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
