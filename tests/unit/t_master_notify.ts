import assert from 'assert';
import fs from 'fs';
import { POST as testerPost } from '/home/user/wt-back/app/api/android-tester/route';
import { notifyMasters, coachPaidAlert, notifyMastersCoachPaid, androidTesterAlert, notifyAndroidTester } from '/home/user/wt-back/lib/masterNotify';
import { markCoachPaid } from '/home/user/wt-back/lib/coachPayments';
import { PAULO_EMAIL, ADRI_EMAIL, PAULO_ID, ADRI_ID } from '/home/user/wt-back/lib/masterIds';
import { state } from './mocks3';

let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.stack || e)); } };
const SRC = (p: string) => fs.readFileSync('/home/user/wt-back/' + p, 'utf8');
const DAY = 86400000;
const masters = () => [{ id: PAULO_ID, email: PAULO_EMAIL, role: 'COACH' }, { id: ADRI_ID, email: ADRI_EMAIL, role: 'COACH' }];
const sent: any[] = [];
const rec = async (u: any, title: string, body: string, data?: any) => { sent.push({ to: u.id, title, body, data }); };
// banco de mentirinha só para a conta das vagas de Fundador (getPromoState) e a busca de usuário
const fakeDb = (users: any[], max = 10) => ({
  user: {
    findUnique: async ({ where }: any) => { const u = users.find((x) => (where.id !== undefined ? x.id === where.id : x.email === where.email)); return u ? { ...u } : null; },   // cópia, como o Prisma de verdade
    count: async ({ where }: any) => users.filter((u) => Object.entries(where).every(([k, v]: any) => (v && typeof v === 'object' && 'gt' in v) ? u[k] && new Date(u[k]) > v.gt : (u[k] ?? false) === v)).length,
    update: async ({ where, data }: any) => { Object.assign(users.find((u) => u.id === where.id), data); },
  },
  platformConfig: { upsert: async () => ({ launchPromoMax: max }) },
});
const clientRow = (id: string, o: any = {}) => ({ id, androidTesterEmail: id + '@gmail.com', androidTesterAt: new Date(), androidTesterAddedAt: null, ...o });

(async () => {
  await t('notifyMasters: avisa os dois masters (por e-mail), pula quem não existe e uma falha não impede o outro', async () => {
    sent.length = 0; const n = await notifyMasters(fakeDb(masters()), 'T', 'B', { type: 'x' }, undefined, rec); assert.equal(n, 2); assert.deepEqual(sent.map((s) => s.to).sort(), [ADRI_ID, PAULO_ID].sort()); assert.equal(sent[0].data.type, 'x');
    sent.length = 0; assert.equal(await notifyMasters(fakeDb([masters()[0]]), 'T', 'B', {}, undefined, rec), 1, 'sem a Adri cadastrada: só o Paulo'); assert.equal(sent[0].to, PAULO_ID);
    sent.length = 0; assert.equal(await notifyMasters(fakeDb(masters()), 'T', 'B', {}, [PAULO_EMAIL], rec), 1, 'lista própria de destinatários'); assert.equal(sent[0].to, PAULO_ID);
    let calls = 0; const failFirst = async (u: any, ...r: any[]) => { calls += 1; if (calls === 1) throw new Error('boom'); sent.push({ to: u.id }); }; sent.length = 0; const n2 = await notifyMasters(fakeDb(masters()), 'T', 'B', {}, undefined, failFirst as any); assert.equal(n2, 1, 'a falha do primeiro não derruba o segundo'); assert.equal(sent.length, 1);
    assert.equal(await notifyMasters({ user: { findUnique: async () => { throw new Error('db'); } } }, 'T', 'B', {}, undefined, rec), 0, 'banco fora: não lança');
  });
  await t('texto do aviso de pagamento: coach comum, Fundador (quantas vagas restam), vaga extra de parceiro, nome/valor ausentes', () => {
    let a = coachPaidAlert({ name: 'Ana Souza', planLabel: 'Elite Growth Trimestral', value: 235 }); assert.equal(a.title, '💰 Coach pagou!'); assert.equal(a.body, 'Ana Souza pagou o plano Elite Growth Trimestral (R$ 235,00).');
    a = coachPaidAlert({ name: 'Ana', planLabel: 'X', value: 78.5, founder: 'FUNDADOR', promo: { max: 10, available: 7 } }); assert.equal(a.title, '🏅 Vaga de Fundador ocupada!'); assert.equal(a.body, 'Ana pagou o plano X (R$ 78,50). Restam 7 de 10 vagas de Fundador.');
    a = coachPaidAlert({ name: 'Ana', planLabel: 'X', value: 1, founder: 'FUNDADOR', promo: { max: 10, available: 0 } }); assert.ok(a.body.endsWith('As vagas de Fundador acabaram.') && !a.body.includes('Restam'));
    a = coachPaidAlert({ name: 'Ana', planLabel: 'X', founder: 'FUNDADOR', promo: null }); assert.equal(a.body, 'Ana pagou o plano X.', 'sem a conta das vagas: não inventa número');
    a = coachPaidAlert({ name: 'Bia', planLabel: 'X', value: 50, founder: 'EXTRA' }); assert.equal(a.title, '🤝 Parceiro pagou!'); assert.ok(a.body.includes('não conta nas vagas de Fundador'));
    a = coachPaidAlert({}); assert.equal(a.body, 'Um coach pagou a mensalidade.'); a = coachPaidAlert({ name: '   ', value: 0 }); assert.equal(a.body, 'Um coach pagou a mensalidade.'); a = coachPaidAlert({ name: 'Cid', value: NaN as any }); assert.equal(a.body, 'Cid pagou a mensalidade.');
  });
  await t('1º pagamento do coach avisa Paulo E Adri; renovação, time master e falha de banco não avisam', async () => {
    const users = [...masters(), { id: 'c1', name: 'Ana Souza', role: 'COACH' }]; sent.length = 0;
    assert.equal(await notifyMastersCoachPaid(fakeDb(users), 'c1', { firstPayment: true, planLabel: 'Personal Start Mensal', value: 69 }, rec), true); assert.equal(sent.length, 2); assert.ok(sent.every((s) => s.title === '💰 Coach pagou!' && s.body === 'Ana Souza pagou o plano Personal Start Mensal (R$ 69,00).' && s.data.type === 'coach_paid' && s.data.coachId === 'c1'));
    sent.length = 0; assert.equal(await notifyMastersCoachPaid(fakeDb(users), 'c1', { firstPayment: false, planLabel: 'X', value: 69 }, rec), false); assert.equal(sent.length, 0, 'renovação automática: sem aviso');
    assert.equal(await notifyMastersCoachPaid(fakeDb(users), PAULO_ID, { firstPayment: true, value: 69 }, rec), false); assert.equal(await notifyMastersCoachPaid(fakeDb(users), ADRI_ID, { firstPayment: true, value: 69 }, rec), false); assert.equal(sent.length, 0, 'o próprio time master não gera aviso');
    assert.equal(await notifyMastersCoachPaid({ user: { findUnique: async () => { throw new Error('db'); } } }, 'c1', { firstPayment: true }, rec), false, 'banco fora: não lança');
  });
  await t('vaga de Fundador: o aviso diz quantas restam (usadas contadas no banco) e a vaga extra de parceiro não conta', async () => {
    const used = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'f' + i, isLaunchPromo: true, launchPromoExtra: false, role: 'COACH' }));
    let users: any[] = [...masters(), ...used(3), { id: 'c1', name: 'Ana', role: 'COACH', isLaunchPromo: true, launchPromoExtra: false }]; sent.length = 0;
    await notifyMastersCoachPaid(fakeDb(users, 10), 'c1', { firstPayment: true, planLabel: 'Elite Start Anual', value: 235 }, rec); assert.equal(sent[0].title, '🏅 Vaga de Fundador ocupada!'); assert.ok(sent[0].body.includes('Restam 6 de 10 vagas de Fundador'), sent[0].body);
  });
  await t('Fundador: com 10 de 10 ocupadas avisa que acabaram; com limite de 20 conta certo; vaga extra de parceiro avisa à parte', async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'f' + i, isLaunchPromo: true, launchPromoExtra: false, role: 'COACH' }));
    let users: any[] = [...masters(), ...mk(9), { id: 'c1', name: 'Ana', role: 'COACH', isLaunchPromo: true, launchPromoExtra: false }]; sent.length = 0;
    await notifyMastersCoachPaid(fakeDb(users, 10), 'c1', { firstPayment: true, planLabel: 'P', value: 10 }, rec); assert.ok(sent[0].body.endsWith('As vagas de Fundador acabaram.'), sent[0].body);
    users = [...masters(), ...mk(5), { id: 'c1', name: 'Ana', role: 'COACH', isLaunchPromo: true, launchPromoExtra: false }]; sent.length = 0;
    await notifyMastersCoachPaid(fakeDb(users, 20), 'c1', { firstPayment: true, planLabel: 'P', value: 10 }, rec); assert.ok(sent[0].body.includes('Restam 14 de 20 vagas de Fundador'), sent[0].body);
    users = [...masters(), ...mk(2), { id: 'c2', name: 'Bia', role: 'COACH', isLaunchPromo: true, launchPromoExtra: true }]; sent.length = 0;
    await notifyMastersCoachPaid(fakeDb(users, 10), 'c2', { firstPayment: true, planLabel: 'P', value: 10 }, rec); assert.equal(sent[0].title, '🤝 Parceiro pagou!'); assert.ok(!sent[0].body.includes('Restam'));
  });
  await t('markCoachPaid devolve se foi o 1º pagamento (e só o 1º)', async () => {
    const users: any[] = [{ id: 'c1', coachFirstPaidAt: null }]; const db: any = fakeDb(users);
    let r = await markCoachPaid(db, 'c1', { paidValue: 50, promoConfirmed: false }); assert.deepEqual(r, { firstPayment: true }); assert.ok(users[0].coachFirstPaidAt);
    r = await markCoachPaid(db, 'c1', { paidValue: 50, promoConfirmed: false }); assert.deepEqual(r, { firstPayment: false }, 'o segundo pagamento já não é o primeiro');
  });
  await t('texto do aviso do teste Android: contagem, quanto falta e meta batida', () => {
    let a = androidTesterAlert(4, false); assert.equal(a.title, '🤖 Novo testador no Android'); assert.ok(a.body.includes('Agora são 4 de 12 (faltam 8)') && a.body.includes('1 vez por dia') && a.body.includes('TESTADORES ANDROID'));
    a = androidTesterAlert(11, false); assert.ok(a.body.includes('Agora são 11 de 12 (faltam 1)'));
    a = androidTesterAlert(12, true); assert.equal(a.title, '🎉 Meta do teste Android batida!'); assert.ok(a.body.includes('12 e-mails diferentes') && a.body.includes('Play Console'));
  });
  await t('teste Android: 1 aviso por dia (o 1º chega; os outros do mesmo dia não); depois de 24 h volta a avisar', async () => {
    const now = new Date('2026-10-18T12:00:00Z'); const db = fakeDb(masters());
    let rows = [clientRow('a', { androidTesterAt: now })]; sent.length = 0; assert.equal(await notifyAndroidTester(db, 'a', rows, now, rec), 'DAILY'); assert.equal(sent.length, 1); assert.equal(sent[0].to, PAULO_ID, 'só o Paulo'); assert.equal(sent[0].data.type, 'android_tester'); assert.ok(sent[0].body.includes('Agora são 1 de 12'));
    rows = [clientRow('a', { androidTesterAt: new Date(now.getTime() - 3600000) }), clientRow('b', { androidTesterAt: now })]; sent.length = 0; assert.equal(await notifyAndroidTester(db, 'b', rows, now, rec), null, 'outro e-mail na última hora: sem aviso'); assert.equal(sent.length, 0);
    rows = [clientRow('a', { androidTesterAt: new Date(now.getTime() - 23 * 3600000) }), clientRow('b', { androidTesterAt: now })]; assert.equal(await notifyAndroidTester(db, 'b', rows, now, rec), null, '23 h atrás: ainda é o mesmo dia');
    rows = [clientRow('a', { androidTesterAt: new Date(now.getTime() - 25 * 3600000) }), clientRow('b', { androidTesterAt: now })]; sent.length = 0; assert.equal(await notifyAndroidTester(db, 'b', rows, now, rec), 'DAILY'); assert.ok(sent[0].body.includes('Agora são 2 de 12 (faltam 10)'), '25 h atrás: avisa de novo');
  });
  await t('teste Android: bater a meta de 12 e-mails diferentes SEMPRE avisa (mesmo com outro e-mail hoje) e só uma vez', async () => {
    const now = new Date('2026-10-18T12:00:00Z'); const db = fakeDb(masters());
    const eleven = Array.from({ length: 11 }, (_, i) => clientRow('u' + i, { androidTesterAt: new Date(now.getTime() - 60000) }));
    sent.length = 0; assert.equal(await notifyAndroidTester(db, 'novo', [...eleven, clientRow('novo', { androidTesterAt: now })], now, rec), 'GOAL'); assert.equal(sent[0].title, '🎉 Meta do teste Android batida!');
    sent.length = 0; assert.equal(await notifyAndroidTester(db, 'novo2', [...eleven, clientRow('novo', { androidTesterAt: new Date(now.getTime() - 5000) }), clientRow('novo2', { androidTesterAt: now })], now, rec), null, 'o 13º, no mesmo dia: já bateu a meta antes, não avisa de novo');
    const twelveDup = [...eleven, clientRow('x', { androidTesterEmail: 'u0@gmail.com' })]; sent.length = 0; assert.equal(await notifyAndroidTester(db, 'x', twelveDup, now, rec), null, '12 pessoas mas só 11 e-mails diferentes: não é a meta');
  });
  await t('rota do aluno: e-mail novo avisa o Paulo (só ele), trocar também, repetir o mesmo não, 2º aluno no mesmo dia não', async () => {
    const req = (user: any, body: any) => ({ __user: user, json: async () => body, headers: new Map() }) as any;
    const U = (id: string) => ({ id, name: id, email: id + '@x.com', role: 'USER', androidTesterEmail: null, androidTesterAt: null, androidTesterAddedAt: null });
    state.users.length = 0; state.pushes.length = 0; state.failPush = false; state.users.push(...masters(), U('a'), U('b'));
    let r: any = await testerPost(req({ id: 'a', role: 'USER' }, { email: 'a@gmail.com' })); assert.equal(r.status, 200); assert.equal(state.pushes.length, 1); assert.equal(state.pushes[0].to, PAULO_ID); assert.ok(state.pushes[0].body.includes('Agora são 1 de 12'));
    r = await testerPost(req({ id: 'a', role: 'USER' }, { email: 'a@gmail.com' })); assert.equal(r.body.changed, false); assert.equal(state.pushes.length, 1, 'mesmo e-mail: sem aviso');
    r = await testerPost(req({ id: 'b', role: 'USER' }, { email: 'b@gmail.com' })); assert.equal(r.status, 200); assert.equal(state.pushes.length, 1, '2º aluno no mesmo dia: sem aviso novo');
    state.users.find((u: any) => u.id === 'a').androidTesterAt = new Date(Date.now() - 2 * DAY); state.users.find((u: any) => u.id === 'b').androidTesterAt = new Date(Date.now() - 2 * DAY);
    r = await testerPost(req({ id: 'b', role: 'USER' }, { email: 'outro@gmail.com' })); assert.equal(r.body.changed, true); assert.equal(state.pushes.length, 2, 'trocou o e-mail depois de 2 dias: avisa de novo'); assert.ok(state.pushes[1].body.includes('Agora são 2 de 12'));
    r = await testerPost(req({ id: 'a', role: 'USER' }, { email: 'abc' })); assert.equal(r.status, 400); assert.equal(state.pushes.length, 2, 'e-mail inválido não avisa');
  });
  await t('rota do aluno: falha no aviso (push fora do ar ou sem master cadastrado) NÃO atrapalha o aluno', async () => {
    const req = (user: any, body: any) => ({ __user: user, json: async () => body, headers: new Map() }) as any;
    state.users.length = 0; state.pushes.length = 0; state.failPush = true; state.users.push(...masters(), { id: 'a', role: 'USER', androidTesterEmail: null, androidTesterAt: null, androidTesterAddedAt: null });
    let r: any = await testerPost(req({ id: 'a', role: 'USER' }, { email: 'a@gmail.com' })); assert.equal(r.status, 200); assert.equal(state.users.find((u: any) => u.id === 'a').androidTesterEmail, 'a@gmail.com', 'o e-mail foi salvo'); assert.equal(state.pushes.length, 0);
    state.failPush = false; state.users.length = 0; state.users.push({ id: 'a', role: 'USER', androidTesterEmail: null, androidTesterAt: null, androidTesterAddedAt: null });
    r = await testerPost(req({ id: 'a', role: 'USER' }, { email: 'a@gmail.com' })); assert.equal(r.status, 200, 'sem o Paulo cadastrado também funciona');
  });
  await t('fiação: cadastro de coach avisa os dois masters; o webhook avisa nos 3 caminhos do 1º pagamento; a rota do Android avisa só quando o e-mail é novo', () => {
    const reg = SRC('app/api/auth/register/route.ts'); assert.ok(reg.includes("import { notifyMasters } from '@/lib/masterNotify';") && reg.includes('await notifyMasters(prisma, title, bodyText, data);') && !reg.includes('where: { email: PAULO_EMAIL },\n            select: { id: true, pushToken'), 'cadastro: usa o aviso para os dois masters');
    const wh = SRC('app/api/payments/webhook/route.ts'); assert.equal((wh.match(/await notifyMastersCoachPaid\(/g) || []).length, 3, 'webhook: 3 caminhos'); assert.equal((wh.match(/const paid = await markCoachPaid\(/g) || []).length, 3); assert.ok((wh.match(/firstPayment: paid\.firstPayment/g) || []).length === 3);
    const rt = SRC('app/api/android-tester/route.ts'); assert.ok(rt.includes('if (!same) {') && rt.includes('await notifyAndroidTester(prisma, auth.user.id, rows);') && rt.includes("console.error('[android-tester aviso]'"), 'rota: só se mudou, e a falha vai para o log');
    assert.ok(SRC('lib/masterIds.ts').includes("PAULO_EMAIL = 'paulo_adriano2014@live.com'") && SRC('lib/masterIds.ts').includes("ADRI_EMAIL = 'adri.personal@hotmail.com'"));
  });
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
