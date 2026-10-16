import assert from 'assert';
import { getPromoState, isEligibleForPromo, isPartnerOfferOpen, partnerTrialDates, setPartnerCoach, reservePromoOrExtra, confirmPromo, releasePromo, reservePromo, PARTNER_TRIAL_DAYS, PARTNER_OFFER_EXTRA_DAYS } from '/home/user/wt-back/lib/launchPromo';

// ---- banco falso mínimo (só o que launchPromo usa), com where de verdade: igualdade, {gt}, {not}, OR, AND
const DAY = 86400000;
const mk = () => {
  const users: any[] = []; const cfg: any = { id: 'singleton', launchPromoUsed: 0, launchPromoMax: 2 };
  const eq = (row: any, k: string, v: any): boolean => {
    if (k === 'OR') return (v as any[]).some((w) => m(row, w));
    if (k === 'AND') return (v as any[]).every((w) => m(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('gt' in v) return row[k] != null && new Date(row[k]).getTime() > new Date(v.gt).getTime();
      if ('not' in v) return row[k] !== v.not;
      if ('in' in v) return v.in.includes(row[k]);
    }
    return (row[k] ?? (typeof v === 'boolean' ? false : null)) === v;
  };
  const m = (row: any, where: any): boolean => Object.entries(where || {}).every(([k, v]) => eq(row, k, v));
  const db: any = {
    users, cfg,
    platformConfig: { upsert: async () => cfg, update: async ({ data }: any) => Object.assign(cfg, data) },
    user: {
      count: async ({ where }: any) => users.filter((u) => m(u, where)).length,
      findUnique: async ({ where }: any) => users.find((u) => u.id === where.id) ?? null,
      update: async ({ where, data }: any) => { const u = users.find((x) => x.id === where.id); Object.assign(u, data); return u; },
      updateMany: async ({ where, data }: any) => { const r = users.filter((u) => m(u, where)); r.forEach((u) => Object.assign(u, data)); return { count: r.length }; },
    },
    $transaction: async (fn: any) => fn(db),
  };
  return db;
};
const add = (db: any, o: any) => { db.users.push({ role: 'COACH', accountStatus: 'ACTIVE', coachBillingStatus: 'TRIAL', isLaunchPromo: false, launchPromoExtra: false, partnerCoach: false, ...o }); return o.id; };
const notMaster = () => false;
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.message || e)); } };
const NOW = new Date('2026-10-20T12:00:00Z');

(async () => {
  await t('datas do parceiro: teste de 30 dias e oferta até 7 dias depois', () => {
    assert.equal(PARTNER_TRIAL_DAYS, 30); assert.equal(PARTNER_OFFER_EXTRA_DAYS, 7);
    const d = partnerTrialDates(NOW);
    assert.equal(d.trialEndsAt.getTime(), NOW.getTime() + 30 * DAY); assert.equal(d.partnerOfferUntil.getTime(), NOW.getTime() + 37 * DAY);
  });
  await t('oferta aberta: só parceiro dentro do prazo (inclusive no último instante); sem marca, sem prazo ou vencida = fechada', () => {
    const until = new Date(NOW.getTime() + 37 * DAY);
    assert.equal(isPartnerOfferOpen({ partnerCoach: true, partnerOfferUntil: until }, NOW), true);
    assert.equal(isPartnerOfferOpen({ partnerCoach: true, partnerOfferUntil: NOW }, NOW), true, 'no último instante ainda vale');
    assert.equal(isPartnerOfferOpen({ partnerCoach: true, partnerOfferUntil: new Date(NOW.getTime() - 1) }, NOW), false);
    assert.equal(isPartnerOfferOpen({ partnerCoach: false, partnerOfferUntil: until }, NOW), false);
    assert.equal(isPartnerOfferOpen({ partnerCoach: true, partnerOfferUntil: null }, NOW), false);
    assert.equal(isPartnerOfferOpen({ partnerCoach: true, partnerOfferUntil: 'lixo' as any }, NOW), false);
    assert.equal(isPartnerOfferOpen(null, NOW), false);
  });
  await t('marcar parceiro: teste vai para 30 dias, oferta +7, status TRIAL (reabre quem estava com o teste de 7 dias vencido)', async () => {
    const db = mk(); add(db, { id: 'p1', coachBillingStatus: 'PENDING', trialEndsAt: new Date(NOW.getTime() - 3 * DAY) });
    const r: any = await setPartnerCoach(db, 'p1', true, notMaster, NOW);
    assert.equal(r.ok, true); const u = db.users[0];
    assert.equal(u.partnerCoach, true); assert.equal(u.coachBillingStatus, 'TRIAL');
    assert.equal(new Date(u.trialEndsAt).getTime(), NOW.getTime() + 30 * DAY); assert.equal(new Date(u.partnerOfferUntil).getTime(), NOW.getTime() + 37 * DAY);
  });
  await t('marcar parceiro é recusado: coach que já pagou/está ativo/cancelado/já é fundador, pendente de aprovação, master e quem não existe', async () => {
    const db = mk();
    add(db, { id: 'a', coachBillingStatus: 'ACTIVE' }); add(db, { id: 'b', coachFirstPaidAt: NOW }); add(db, { id: 'c', coachBillingStatus: 'CANCELLED' }); add(db, { id: 'd', isLaunchPromo: true });
    add(db, { id: 'e', accountStatus: 'PENDING_APPROVAL' }); add(db, { id: 'm' }); db.users.push({ id: 's', role: 'STUDENT', accountStatus: 'ACTIVE', coachBillingStatus: 'TRIAL' });
    for (const id of ['a', 'b', 'c', 'd', 'e']) { const r: any = await setPartnerCoach(db, id, true, notMaster, NOW); assert.equal(r.ok, false, id); assert.ok(r.error, id); assert.equal(db.users.find((u: any) => u.id === id).partnerCoach, false, id); }
    assert.equal(((await setPartnerCoach(db, 'm', true, (id) => id === 'm', NOW)) as any).ok, false, 'master');
    assert.equal(((await setPartnerCoach(db, 'zzz', true, notMaster, NOW)) as any).ok, false); assert.equal(((await setPartnerCoach(db, 's', true, notMaster, NOW)) as any).ok, false, 'aluno não é coach'); assert.equal(((await setPartnerCoach(db, '', true, notMaster, NOW)) as any).ok, false);
  });
  await t('desmarcar parceiro: tira a marca e o prazo, mas não mexe no fim do teste', async () => {
    const db = mk(); add(db, { id: 'p', partnerCoach: true, partnerOfferUntil: new Date(NOW.getTime() + DAY), trialEndsAt: new Date(NOW.getTime() + 5 * DAY) });
    assert.equal(((await setPartnerCoach(db, 'p', false, notMaster, NOW)) as any).ok, true); const u = db.users[0];
    assert.equal(u.partnerCoach, false); assert.equal(u.partnerOfferUntil, null); assert.equal(new Date(u.trialEndsAt).getTime(), NOW.getTime() + 5 * DAY);
  });
  await t('VAGA EXTRA: parceiro usa a oferta mesmo com as vagas de fundador ESGOTADAS, e não ocupa vaga', async () => {
    const db = mk(); db.cfg.launchPromoMax = 2;
    add(db, { id: 'f1', isLaunchPromo: true, launchPromoStatus: 'CONFIRMED' }); add(db, { id: 'f2', isLaunchPromo: true, launchPromoStatus: 'CONFIRMED' });
    add(db, { id: 'p', partnerCoach: true, partnerOfferUntil: new Date(NOW.getTime() + 20 * DAY) }); add(db, { id: 'n' });
    let st = await getPromoState(db, NOW); assert.equal(st.available, 0);
    assert.equal(await reservePromo(db, 'n', NOW), false, 'coach comum fica sem vaga');
    const p = db.users.find((u: any) => u.id === 'p');
    assert.equal(isEligibleForPromo(p, notMaster), true);
    assert.equal(await reservePromoOrExtra(db, p, NOW), 'EXTRA');
    assert.equal(p.launchPromoStatus ?? null, null, 'não reserva vaga de fundador');
    st = await getPromoState(db, NOW); assert.equal(st.reserved, 0); assert.equal(st.available, 0);
    await confirmPromo(db, 'p');
    assert.equal(p.isLaunchPromo, true, 'vira Fundador (recursos)'); assert.equal(p.launchPromoExtra, true); assert.equal(p.launchPromoStatus, 'EXTRA');
    st = await getPromoState(db, NOW); assert.equal(st.used, 2, 'extra NÃO entra nas usadas'); assert.equal(st.available, 0);
  });
  await t('vários parceiros fechando não consomem as vagas de fundador: coach comum ainda reserva a sua', async () => {
    const db = mk(); db.cfg.launchPromoMax = 2;
    for (const id of ['p1', 'p2', 'p3']) add(db, { id, partnerCoach: true, partnerOfferUntil: new Date(NOW.getTime() + DAY) });
    add(db, { id: 'n' });
    for (const id of ['p1', 'p2', 'p3']) { const u = db.users.find((x: any) => x.id === id); assert.equal(await reservePromoOrExtra(db, u, NOW), 'EXTRA'); await confirmPromo(db, id); }
    let st = await getPromoState(db, NOW); assert.equal(st.used, 0); assert.equal(st.available, 2);
    assert.equal(await reservePromo(db, 'n', NOW), true); st = await getPromoState(db, NOW); assert.equal(st.reserved, 1); assert.equal(st.available, 1);
  });
  await t('parceiro com a oferta VENCIDA volta a ser coach comum: sem vaga livre não recebe, com vaga livre usa a de fundador (e conta)', async () => {
    const db = mk(); db.cfg.launchPromoMax = 1;
    add(db, { id: 'p', partnerCoach: true, partnerOfferUntil: new Date(NOW.getTime() - DAY) });
    const p = db.users[0];
    assert.equal(await reservePromoOrExtra(db, p, NOW), 'FUNDADOR'); assert.equal(p.launchPromoStatus, 'RESERVED');
    await confirmPromo(db, 'p');
    assert.equal(p.launchPromoExtra, false, 'fundador de verdade, não extra'); assert.equal(p.launchPromoStatus, 'CONFIRMED');
    const st = await getPromoState(db, NOW); assert.equal(st.used, 1); assert.equal(st.available, 0);
    const db2 = mk(); db2.cfg.launchPromoMax = 0; add(db2, { id: 'q', partnerCoach: true, partnerOfferUntil: new Date(NOW.getTime() - DAY) });
    assert.equal(await reservePromoOrExtra(db2, db2.users[0], NOW), false);
  });
  await t('parceiro que já tinha reserva de fundador aberta: usa a extra e a reserva é solta (a vaga volta)', async () => {
    const db = mk(); db.cfg.launchPromoMax = 1;
    add(db, { id: 'p', partnerCoach: true, partnerOfferUntil: new Date(NOW.getTime() + DAY), launchPromoStatus: 'RESERVED', launchPromoReservedUntil: new Date(NOW.getTime() + DAY) });
    assert.equal((await getPromoState(db, NOW)).available, 0);
    assert.equal(await reservePromoOrExtra(db, db.users[0], NOW), 'EXTRA');
    assert.equal(db.users[0].launchPromoStatus, null); assert.equal((await getPromoState(db, NOW)).available, 1);
    await confirmPromo(db, 'p'); assert.equal(db.users[0].launchPromoExtra, true);
  });
  await t('confirmar duas vezes (webhook repetido) não troca extra por fundador nem o contrário', async () => {
    const db = mk(); add(db, { id: 'p', partnerCoach: true, partnerOfferUntil: new Date(NOW.getTime() + DAY) }); add(db, { id: 'f', partnerCoach: true, launchPromoStatus: 'RESERVED', launchPromoReservedUntil: new Date(NOW.getTime() + DAY) }); add(db, { id: 'n' });
    for (let i = 0; i < 2; i++) for (const id of ['p', 'f', 'n']) await confirmPromo(db, id);
    const g = (id: string) => db.users.find((u: any) => u.id === id);
    assert.equal(g('p').launchPromoExtra, true); assert.equal(g('p').launchPromoStatus, 'EXTRA');
    assert.equal(g('f').launchPromoExtra, false); assert.equal(g('f').launchPromoStatus, 'CONFIRMED');
    assert.equal(g('n').launchPromoExtra, false); assert.equal(g('n').launchPromoStatus, 'CONFIRMED');
  });
  await t('fundador antigo (sem a coluna nova, valor vazio) continua contando nas vagas', async () => {
    const db = mk(); db.users.push({ id: 'old', role: 'COACH', isLaunchPromo: true, launchPromoStatus: null });   // linha de antes da mudança: launchPromoExtra ausente
    db.users.push({ id: 'x', role: 'COACH', isLaunchPromo: true, launchPromoExtra: true, launchPromoStatus: 'EXTRA' });
    assert.equal((await getPromoState(db, NOW)).used, 1);
  });
  await t('estorno/apagar a cobrança promocional devolve a vaga e limpa o extra', async () => {
    const db = mk(); add(db, { id: 'p', partnerCoach: true, isLaunchPromo: true, launchPromoExtra: true, launchPromoStatus: 'EXTRA' });
    await releasePromo(db, 'p'); const u = db.users[0]; assert.equal(u.isLaunchPromo, false); assert.equal(u.launchPromoExtra, false); assert.equal(u.launchPromoStatus, null);
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
