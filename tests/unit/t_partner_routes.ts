import assert from 'assert';
import { POST as approve } from '/home/user/wt-back/app/api/admin/coach-requests/route';
import { POST as partnerPost } from '/home/user/wt-back/app/api/admin/coach-partner/route';
import { state } from './routemocks';

const DAY = 86400000;
const req = (body: any) => ({ json: async () => body, headers: new Map() }) as any;
const seed = (o: any = {}) => { state.users.length = 0; state.updates.length = 0; state.pushes.length = 0; state.users.push({ id: 'c1', role: 'COACH', name: 'Bia Lima', accountStatus: 'PENDING_APPROVAL', coachPlan: 'PERSONAL', coachBillingStatus: 'PENDING', partnerCoach: false, ...o }); return state.users[0]; };
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.message || e)); } };
const days = (d: any) => Math.round((new Date(d).getTime() - Date.now()) / DAY);

(async () => {
  await t('aprovação NORMAL (cadastro pelo site): teste de 7 dias, sem marca de parceiro, sem prazo de oferta', async () => {
    const c = seed(); const r: any = await approve(req({ coachId: 'c1', action: 'APPROVE', coachPlan: 'PERSONAL' }));
    assert.equal(r.status, 200); assert.equal(r.body.partner, false);
    assert.equal(c.accountStatus, 'ACTIVE'); assert.equal(c.coachBillingStatus, 'TRIAL'); assert.equal(days(c.trialEndsAt), 7, 'teste de 7 dias');
    assert.ok(!('partnerCoach' in state.updates[0]) && !('partnerOfferUntil' in state.updates[0]), 'nem toca nas colunas de parceiro');
    assert.equal(c.partnerCoach, false); assert.ok(!c.partnerOfferUntil);
    assert.ok(!state.pushes[0].body.includes('parceiro'), 'a notificação não fala em parceiro');
  });
  await t('aprovação com partner ausente, falso ou "true" em texto: continua 7 dias (só o booleano true vale)', async () => {
    for (const p of [undefined, false, null, 'true', 1, 'sim']) { const c = seed(); await approve(req({ coachId: 'c1', action: 'APPROVE', partner: p })); assert.equal(days(c.trialEndsAt), 7, String(p)); assert.equal(c.partnerCoach, false, String(p)); }
  });
  await t('aprovação COMO PARCEIRO: teste de 30 dias, marca ligada, oferta até 37 dias, aviso fala em parceiro', async () => {
    const c = seed(); const r: any = await approve(req({ coachId: 'c1', action: 'APPROVE', partner: true }));
    assert.equal(r.body.partner, true); assert.equal(c.coachBillingStatus, 'TRIAL'); assert.equal(c.partnerCoach, true); assert.equal(days(c.trialEndsAt), 30); assert.equal(days(c.partnerOfferUntil), 37);
    assert.ok(state.pushes[0].body.includes('parceiro') && state.pushes[0].body.includes('30 dias'));
  });
  await t('recusar continua igual: não mexe em teste nem em parceiro', async () => {
    const c = seed(); await approve(req({ coachId: 'c1', action: 'REJECT', partner: true }));
    assert.equal(c.accountStatus, 'REJECTED'); assert.ok(!c.trialEndsAt); assert.equal(c.partnerCoach, false);
  });
  await t('rota de marcar parceiro (coach que já está no teste de 7 dias): vai para 30 dias; desligar só tira a marca', async () => {
    const c = seed({ accountStatus: 'ACTIVE', coachBillingStatus: 'TRIAL', trialEndsAt: new Date(Date.now() + 2 * DAY) });
    let r: any = await partnerPost(req({ coachId: 'c1', partner: true })); assert.equal(r.status, 200); assert.equal(days(c.trialEndsAt), 30); assert.equal(c.partnerCoach, true); assert.equal(days(c.partnerOfferUntil), 37);
    r = await partnerPost(req({ coachId: 'c1', partner: false })); assert.equal(r.status, 200); assert.equal(c.partnerCoach, false); assert.equal(c.partnerOfferUntil, null);
    r = await partnerPost(req({ coachId: 'c1' })); assert.equal(r.status, 400, 'sem partner true/false: recusa');
    r = await partnerPost(req({ coachId: 'c1', partner: 'true' })); assert.equal(r.status, 400, 'texto não vale');
    const p = seed({ accountStatus: 'ACTIVE', coachBillingStatus: 'ACTIVE' }); r = await partnerPost(req({ coachId: 'c1', partner: true })); assert.equal(r.status, 400); assert.equal(p.partnerCoach, false, 'quem já paga não vira parceiro');
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
