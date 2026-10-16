import assert from 'assert';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import * as CF from '/home/user/fitos-final/lib/coachFeatures';
import { markCoachPaid } from '/home/user/fitos-final/lib/coachPayments';
import { checkAllowance } from '/home/user/fitos-final/lib/execVideo';
import { GET as GET_ME } from '/home/user/fitos-final/app/api/coach-features/route';
import { GET as GET_ADM, PUT as PUT_ADM } from '/home/user/fitos-final/app/api/admin/coach-features/route';
import { POST as POST_REQ } from '/home/user/fitos-final/app/api/exec-video/request/route';
import { PUT as PUT_POL } from '/home/user/fitos-final/app/api/exec-video/policy/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';
const P = prisma as any; const S = P.__state;
const SECRET = 'dev-only-troque-isso-configurando-JWT_SECRET-no-env';
const tok = (id: string, role = 'COACH') => jwt.sign({ id, role, coachId: null }, SECRET);
const call = async (fn: any, url: string, as: string | null, init: any = {}) => {
  const headers: any = { 'content-type': 'application/json' }; if (as) headers.authorization = 'Bearer ' + as;
  const r = await fn(new Request('http://x' + url, { ...init, headers }));
  return { status: r.status, json: await r.json().catch(() => null) };
};
const put = (o: any) => ({ method: 'PUT', body: JSON.stringify(o) }); const post = (o: any) => ({ method: 'POST', body: JSON.stringify(o) });
const master = tok(PAULO_ID, 'ADMIN'), coachTok = tok('c1'), alunoTok = tok('s1', 'USER');
let fails = 0, ok = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { P.__reset(); try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { fails++; console.log('  FALHOU  ' + name + '\n        ' + String(e && e.message || e).split('\n').slice(0, 6).join('\n        ')); } };
const coach = (id: string, extra: any = {}) => S.user.push({ id, role: 'COACH', name: 'Coach ' + id, email: id + '@x.com', accountStatus: 'ACTIVE', coachBillingStatus: 'ACTIVE', isLaunchPromo: false, ...extra });
const feat = (coachId: string, feature = 'execVideo', extra: any = {}) => S.coachFeature.push({ id: 'f' + Math.random(), coachId, feature, reason: 'MANUAL', grantedAt: new Date(), revokedAt: null, revokedReason: null, ...extra });
const on = async (id: string, f: any = 'execVideo') => (await CF.resolveCoachFeatures(P, id))[f as CF.FeatureKey].on;

(async () => {
  await t('regras: sem linha nenhuma, ninguém tem; master sempre tem', async () => {
    coach('c1');
    assert.strictEqual(await on('c1'), false); assert.strictEqual(await on('c1', 'notasVoz'), false);
    const m = await CF.resolveCoachFeatures(P, PAULO_ID, { isMaster: true }); assert.deepStrictEqual([m.execVideo.on, m.notasVoz.on, m.execVideo.source], [true, true, 'MASTER']);
    assert.deepStrictEqual((await CF.resolveCoachFeatures(P, null)).execVideo.on, false);
  });
  await t('concessão do master liga só aquele recurso, só para aquele coach', async () => {
    coach('c1'); coach('c2');
    await CF.setCoachFeature(P, { coachId: 'c1', feature: 'notasVoz', enabled: true, by: PAULO_ID });
    assert.strictEqual(await on('c1', 'notasVoz'), true); assert.strictEqual(await on('c1', 'execVideo'), false); assert.strictEqual(await on('c2', 'notasVoz'), false);
    assert.strictEqual((await CF.resolveCoachFeatures(P, 'c1')).notasVoz.source, 'GRANT');
  });
  await t('acesso bloqueado/atrasado/cancelado: perde na hora e NÃO volta ao renovar', async () => {
    for (const bad of [{ coachBillingStatus: 'OVERDUE' }, { coachBillingStatus: 'CANCELLED' }, { accountStatus: 'REJECTED' }]) {
      P.__reset(); coach('c1'); feat('c1'); feat('c1', 'notasVoz');
      assert.strictEqual(await on('c1'), true);
      Object.assign(S.user[0], bad);
      assert.strictEqual(await on('c1'), false, JSON.stringify(bad));
      assert.ok(S.coachFeature.every((r: any) => r.revokedAt && r.revokedReason === 'ACESSO_BLOQUEADO'), 'ficou revogado no banco');
      Object.assign(S.user[0], { accountStatus: 'ACTIVE', coachBillingStatus: 'ACTIVE' });   // renovou / foi desbloqueado
      assert.strictEqual(await on('c1'), false, 'renovar não religa'); assert.strictEqual(await on('c1', 'notasVoz'), false);
    }
  });
  await t('o master religa depois: ligar de novo apaga a revogação', async () => {
    coach('c1'); feat('c1', 'execVideo', { revokedAt: new Date(), revokedReason: 'ACESSO_BLOQUEADO' });
    assert.strictEqual(await on('c1'), false);
    await CF.setCoachFeature(P, { coachId: 'c1', feature: 'execVideo', enabled: true, by: PAULO_ID });
    assert.strictEqual(await on('c1'), true); assert.strictEqual(S.coachFeature.length, 1); assert.strictEqual(S.coachFeature[0].revokedAt, null);
  });
  await t('o master desliga: fica revogado com motivo MASTER', async () => {
    coach('c1'); feat('c1');
    await CF.setCoachFeature(P, { coachId: 'c1', feature: 'execVideo', enabled: false, by: PAULO_ID });
    assert.strictEqual(await on('c1'), false); assert.strictEqual(S.coachFeature[0].revokedReason, 'MASTER');
  });
  await t('chave geral: vale para todos; desligar volta ao que cada um tem; revogados individuais não atrapalham', async () => {
    coach('c1'); coach('c2', { coachBillingStatus: 'OVERDUE' });
    await P.featureGlobal.upsert({ where: { feature: 'execVideo' }, create: { feature: 'execVideo', enabled: true }, update: { enabled: true } });
    assert.strictEqual(await on('c1'), true); assert.strictEqual((await CF.resolveCoachFeatures(P, 'c1')).execVideo.source, 'GLOBAL'); assert.strictEqual(await on('c1', 'notasVoz'), false);
    await P.featureGlobal.upsert({ where: { feature: 'execVideo' }, create: { feature: 'execVideo', enabled: false }, update: { enabled: false } });
    assert.strictEqual(await on('c1'), false);
  });
  await t('Fundador: concede os dois recursos uma vez; reenvio e quem perdeu não ganham de novo', async () => {
    coach('c1');
    assert.deepStrictEqual(await CF.grantFounderFeatures(P, 'c1'), ['execVideo', 'notasVoz']); assert.strictEqual(S.coachFeature.length, 2); assert.ok(S.coachFeature.every((r: any) => r.reason === 'FUNDADOR' && r.grantedBy === 'system'));
    assert.deepStrictEqual(await CF.grantFounderFeatures(P, 'c1'), [], 'reenvio do webhook');
    await CF.revokeCoachFeatures(P, 'c1', 'ACESSO_BLOQUEADO');
    assert.deepStrictEqual(await CF.grantFounderFeatures(P, 'c1'), [], 'quem perdeu não ganha sozinho'); assert.strictEqual(await on('c1'), false);
  });
  await t('pagamento da promoção confirmado => Fundador entra com os recursos; pagamento normal não', async () => {
    coach('c1'); coach('c2');
    await markCoachPaid(P, 'c1', { paidValue: 100, promoConfirmed: true });
    assert.strictEqual(await on('c1'), true); assert.strictEqual(await on('c1', 'notasVoz'), true); assert.strictEqual(S.user[0].isLaunchPromo, true);
    await markCoachPaid(P, 'c2', { paidValue: 100, promoConfirmed: false });
    assert.strictEqual(await on('c2'), false);
    await markCoachPaid(P, 'c1', { paidValue: 100, promoConfirmed: true });   // webhook repetido
    assert.strictEqual(S.coachFeature.filter((r: any) => r.coachId === 'c1').length, 2);
  });
  await t('falha ao conceder/revogar nunca derruba o pagamento nem o webhook', async () => {
    coach('c1'); S.failOn.coachFeature = { message: 'banco fora', code: 'P1001' };
    await markCoachPaid(P, 'c1', { paidValue: 100, promoConfirmed: true });   // não pode lançar
    assert.strictEqual(S.user[0].isLaunchPromo, true);
    await CF.revokeCoachFeaturesSafe(P, 'c1', 'ACESSO_BLOQUEADO');
  });
  await t('tabelas ainda não criadas (antes do db push): tudo responde "sem recurso", sem quebrar', async () => {
    coach('c1'); S.failOn.coachFeature = { message: 'relation "CoachFeature" does not exist', code: 'P2021' }; S.failOn.featureGlobal = { message: 'does not exist', code: 'P2021' };
    assert.strictEqual(await on('c1'), false); assert.strictEqual((await CF.revokeCoachFeatures(P, 'c1', 'MASTER')), 0); assert.deepStrictEqual(await CF.grantFounderFeatures(P, 'c1'), []);
    assert.strictEqual((await CF.resolveCoachFeatures(P, PAULO_ID, { isMaster: true })).execVideo.on, true);
  });
  await t('Fundadores que já existem: libera só quem está com acesso em dia e nunca teve linha', async () => {
    coach('a', { isLaunchPromo: true }); coach('b', { isLaunchPromo: true, coachBillingStatus: 'OVERDUE' }); coach('c', { isLaunchPromo: false }); coach('d', { isLaunchPromo: true });
    feat('d', 'execVideo', { revokedAt: new Date(), revokedReason: 'MASTER' }); feat('d', 'notasVoz', { revokedAt: new Date(), revokedReason: 'MASTER' });
    const r = await CF.grantExistingFounders(P, PAULO_ID); assert.deepStrictEqual(r, { coaches: 1, grants: 2 });
    assert.strictEqual(await on('a'), true); assert.strictEqual(await on('b'), false); assert.strictEqual(await on('c'), false); assert.strictEqual(await on('d'), false);
  });

  // ── vídeo de execução respeita a chave ──
  const seedStudent = () => { S.user.push({ id: 's1', role: 'USER', name: 'Samuel', coachId: 'c1' }); S.videoPolicy.push({ coachId: 'c1', studentId: '*', enabled: true, monthlyLimit: null }); };
  await t('envio do aluno: sem a chave do coach não envia (nem a pedido); com a chave envia', async () => {
    coach('c1'); seedStudent(); S.videoRequest.push({ id: 'r1', userId: 's1', coachId: 'c1', exerciseId: null, exerciseName: 'qualquer', status: 'OPEN' });
    let a = await checkAllowance(P, { studentId: 's1', coachId: 'c1' }); assert.strictEqual(a.canUpload, false); assert.ok(/não está disponível/.test(a.reason || ''));
    feat('c1'); a = await checkAllowance(P, { studentId: 's1', coachId: 'c1' }); assert.strictEqual(a.canUpload, true);
    Object.assign(S.user[0], { coachBillingStatus: 'OVERDUE' }); a = await checkAllowance(P, { studentId: 's1', coachId: 'c1' }); assert.strictEqual(a.canUpload, false, 'coach atrasado: o aluno também perde');
  });
  await t('coach master (Paulo/Adri) e chave geral não dependem de concessão', async () => {
    S.user.push({ id: 's1', role: 'USER', name: 'Samuel', coachId: PAULO_ID }); S.videoPolicy.push({ coachId: PAULO_ID, studentId: '*', enabled: true, monthlyLimit: null });
    assert.strictEqual((await checkAllowance(P, { studentId: 's1', coachId: PAULO_ID })).canUpload, true);
  });
  await t('pedir vídeo e liberar envio: coach sem a chave toma 403 "locked"; com a chave passa', async () => {
    coach('c1'); seedStudent(); S.user.push({ id: 'cX', role: 'COACH' });
    let r = await call(POST_REQ, '/api/exec-video/request', coachTok, post({ studentId: 's1', exerciseName: 'Supino' })); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.locked, true);
    r = await call(PUT_POL, '/api/exec-video/policy', coachTok, put({ studentId: '*', enabled: true })); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.locked, true);
    feat('c1'); r = await call(POST_REQ, '/api/exec-video/request', coachTok, post({ studentId: 's1', exerciseName: 'Supino' })); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    r = await call(PUT_POL, '/api/exec-video/policy', coachTok, put({ studentId: '*', enabled: true, monthlyLimit: 5 })); assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  // ── rotas ──
  await t('GET /api/coach-features: coach vê os dele; aluno vê o do coach; sem login 401', async () => {
    coach('c1'); seedStudent(); feat('c1', 'notasVoz');
    assert.strictEqual((await call(GET_ME, '/api/coach-features', null)).status, 401);
    let r = await call(GET_ME, '/api/coach-features', coachTok); assert.deepStrictEqual(r.json.features, { execVideo: false, notasVoz: true, perguntasVoz: false }); assert.strictEqual(r.json.isMaster, false);
    r = await call(GET_ME, '/api/coach-features', alunoTok); assert.deepStrictEqual(r.json.features, { execVideo: false, notasVoz: false, perguntasVoz: false });
    feat('c1', 'execVideo'); r = await call(GET_ME, '/api/coach-features', alunoTok); assert.deepStrictEqual(r.json.features, { execVideo: true, notasVoz: false, perguntasVoz: false });
    r = await call(GET_ME, '/api/coach-features', master); assert.deepStrictEqual(r.json.features, { execVideo: true, notasVoz: true, perguntasVoz: true }); assert.strictEqual(r.json.isMaster, true);
  });
  await t('admin: só o master; lista coaches com estado; liga/desliga por coach e geral; valida entrada', async () => {
    coach('c1', { isLaunchPromo: true }); coach('c2', { coachBillingStatus: 'OVERDUE' });
    for (const who of [null, coachTok, alunoTok]) { assert.ok([401, 403].includes((await call(GET_ADM, '/api/admin/coach-features', who)).status)); assert.ok([401, 403].includes((await call(PUT_ADM, '/api/admin/coach-features', who, put({ coachId: 'c1', feature: 'execVideo', enabled: true }))).status)); }
    let r = await call(PUT_ADM, '/api/admin/coach-features', master, put({ coachId: 'c1', feature: 'execVideo', enabled: true })); assert.strictEqual(r.status, 200);
    r = await call(PUT_ADM, '/api/admin/coach-features', master, put({ coachId: 'c2', feature: 'execVideo', enabled: true })); assert.strictEqual(r.status, 200);
    r = await call(GET_ADM, '/api/admin/coach-features', master); const byId: any = Object.fromEntries(r.json.coaches.map((c: any) => [c.id, c]));
    assert.strictEqual(byId.c1.features.execVideo.on, true); assert.strictEqual(byId.c1.isLaunchPromo, true); assert.strictEqual(byId.c2.features.execVideo.grant, true); assert.strictEqual(byId.c2.features.execVideo.on, false, 'concedido, mas sem acesso em dia'); assert.strictEqual(byId.c2.standing, false);
    r = await call(PUT_ADM, '/api/admin/coach-features', master, put({ global: true, feature: 'notasVoz', enabled: true })); assert.deepStrictEqual(r.json.global, { execVideo: false, notasVoz: true, perguntasVoz: false });
    assert.strictEqual(await on('c2', 'notasVoz'), true);
    r = await call(PUT_ADM, '/api/admin/coach-features', master, put({ coachId: 'c1', feature: 'execVideo', enabled: false })); assert.strictEqual(S.coachFeature.find((x: any) => x.coachId === 'c1').revokedReason, 'MASTER');
    assert.strictEqual((await call(PUT_ADM, '/api/admin/coach-features', master, put({ coachId: 'c1', feature: 'lixo', enabled: true }))).status, 400);
    assert.strictEqual((await call(PUT_ADM, '/api/admin/coach-features', master, put({ coachId: 'c1', feature: 'execVideo', enabled: 'sim' }))).status, 400);
    assert.strictEqual((await call(PUT_ADM, '/api/admin/coach-features', master, put({ coachId: 'nao', feature: 'execVideo', enabled: true }))).status, 404);
    assert.strictEqual((await call(PUT_ADM, '/api/admin/coach-features', master, put({ coachId: 's1', feature: 'execVideo', enabled: true }))).status, 404);
    r = await call(PUT_ADM, '/api/admin/coach-features', master, put({ action: 'GRANT_FOUNDERS' })); assert.strictEqual(r.status, 200); assert.strictEqual(typeof r.json.coaches, 'number');
  });
  await t('admin sem as tabelas (antes do db push): 503 com aviso claro', async () => {
    S.failOn.featureGlobal = { message: 'does not exist', code: 'P2021' };
    const r = await call(GET_ADM, '/api/admin/coach-features', master); assert.strictEqual(r.status, 200, 'GET sem tabela devolve vazio');
    const w = await call(PUT_ADM, '/api/admin/coach-features', master, put({ global: true, feature: 'execVideo', enabled: true })); assert.strictEqual(w.status, 503); assert.strictEqual(w.json.unavailable, true);
  });
  console.log(`\n${ok} ok, ${fails} falharam`); process.exit(fails ? 1 : 0);
})();
