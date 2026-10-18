import assert from 'assert';
import fs from 'fs';
import { POST as register } from '/home/user/wt-back/app/api/auth/register/route';
import { POST as approve } from '/home/user/wt-back/app/api/admin/coach-requests/route';
import { state } from './routemocks';

const DAY = 86400000;
const req = (body: any) => ({ json: async () => body, headers: new Map() }) as any;
const reset = () => { state.users.length = 0; state.updates.length = 0; state.pushes.length = 0; state.creates = []; state.users.push({ id: 'master', email: 'paulo_adriano2014@live.com', role: 'COACH' }); };
const coachBody = (o: any = {}) => ({ accountType: 'COACH', name: 'Bia Lima', email: 'bia@x.com', password: 'abc12345', phone: '11999990000', cpf: '12345678901', instagram: '@bia', coachPlan: 'PERSONAL', platform: 'web', ...o });
let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };
const days = (d: any) => Math.round((new Date(d).getTime() - Date.now()) / DAY);

(async () => {
  await t('cadastro de coach NORMAL: sem marca de convite e sem falar em parceiro no aviso', async () => {
    reset(); const r: any = await register(req(coachBody())); assert.equal(r.status, 201);
    const c = state.users.find((u: any) => u.email === 'bia@x.com'); assert.equal(c.accountStatus, 'PENDING_APPROVAL');
    assert.ok(!('partnerInvite' in c.coachRequestInfo), 'sem marca'); assert.ok(!state.pushes[0].body.includes('CONVITE'));
  });
  await t('cadastro pelo CONVITE DE PARCEIRO: marca só na pista (coachRequestInfo) e o aviso ao master fala do convite', async () => {
    reset(); const r: any = await register(req(coachBody({ partnerInvite: true }))); assert.equal(r.status, 201);
    const c = state.users.find((u: any) => u.email === 'bia@x.com');
    assert.equal(c.coachRequestInfo.partnerInvite, true); assert.equal(c.accountStatus, 'PENDING_APPROVAL');
    assert.equal(c.coachRequestInfo.platform, 'web', 'o resto do pedido continua igual'); assert.equal(c.coachRequestInfo.coachPlan, 'PERSONAL');
    assert.ok(state.pushes[0].body.includes('CONVITE DE PARCEIRO'), state.pushes[0].body);
  });
  await t('o convite NÃO dá nada sozinho: sem parceiro, sem teste e sem vaga extra até o master aprovar', async () => {
    reset(); await register(req(coachBody({ partnerInvite: true }))); const c = state.users.find((u: any) => u.email === 'bia@x.com');
    assert.ok(!c.partnerCoach, 'não é parceiro'); assert.ok(!c.trialEndsAt, 'sem teste'); assert.ok(!c.partnerOfferUntil, 'sem oferta'); assert.ok(!c.launchPromoExtra && !c.isLaunchPromo, 'sem vaga');
    assert.equal(c.role, 'COACH'); assert.equal(c.accountStatus, 'PENDING_APPROVAL', 'continua pendente');
  });
  await t('só true, 1, "true" e "1" contam como convite; o resto é ignorado', async () => {
    for (const yes of [true, 1, 'true', '1']) { reset(); await register(req(coachBody({ partnerInvite: yes }))); assert.equal(state.users.find((u: any) => u.email === 'bia@x.com').coachRequestInfo.partnerInvite, true, String(yes)); }
    for (const no of [false, 0, 'false', '0', 'sim', 'yes', null, undefined, 2, {}, []]) { reset(); await register(req(coachBody({ partnerInvite: no }))); assert.ok(!('partnerInvite' in state.users.find((u: any) => u.email === 'bia@x.com').coachRequestInfo), String(no)); }
  });
  await t('aprovar um cadastro que veio por convite SEM ligar parceiro: continua teste normal de 7 dias (a marca é só uma pista)', async () => {
    reset(); await register(req(coachBody({ partnerInvite: true }))); const c = state.users.find((u: any) => u.email === 'bia@x.com');
    const r: any = await approve(req({ coachId: c.id, action: 'APPROVE', coachPlan: 'PERSONAL' })); assert.equal(r.status, 200); assert.equal(r.body.partner, false);
    assert.equal(days(c.trialEndsAt), 7); assert.ok(!c.partnerCoach);
  });
  await t('aprovar o mesmo cadastro COM partner:true: 30 dias e a vaga extra (o fluxo de sempre)', async () => {
    reset(); await register(req(coachBody({ partnerInvite: true }))); const c = state.users.find((u: any) => u.email === 'bia@x.com');
    const r: any = await approve(req({ coachId: c.id, action: 'APPROVE', coachPlan: 'PERSONAL', partner: true })); assert.equal(r.body.partner, true);
    assert.equal(days(c.trialEndsAt), 30); assert.equal(c.partnerCoach, true); assert.equal(days(c.partnerOfferUntil), 37);
  });
  await t('coach novo avisa o Paulo E a Adri (e se a Adri não estiver cadastrada, só o Paulo)', async () => {
    reset(); state.users.push({ id: 'adri', email: 'adri.personal@hotmail.com', role: 'COACH' }); const r: any = await register(req(coachBody())); assert.equal(r.status, 201);
    assert.equal(state.pushes.length, 2, 'dois avisos'); assert.ok(state.pushes.every((p: any) => p.title === '🎯 Novo Coach quer entrar!' && p.body.includes('Bia Lima')), JSON.stringify(state.pushes));
    reset(); await register(req(coachBody({ email: 'cid@x.com' }))); assert.equal(state.pushes.length, 1, 'só o Paulo cadastrado: 1 aviso');
    reset(); state.users.length = 0; const r2: any = await register(req(coachBody({ email: 'dani@x.com' }))); assert.equal(r2.status, 201, 'sem nenhum master cadastrado o cadastro continua funcionando'); assert.equal(state.pushes.length, 0);
  });
  await t('as listas do master devolvem coachRequestInfo (é de lá que a etiqueta e a aba PARCEIROS leem o convite)', async () => {
    for (const f of ['coach-requests', 'coaches']) { const s = fs.readFileSync(`/home/user/wt-back/app/api/admin/${f}/route.ts`, 'utf8'); assert.ok(/coachRequestInfo:\s*true/.test(s), f); }
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
