import assert from 'assert';
import { computeStudentLimit, studentLimitFor, NEAR_FRACTION } from '/home/user/fitos-final/lib/coachStudentLimit';
import { db } from './mocks';
import { GET as limitGet } from '/home/user/fitos-final/app/api/coach-plans/limit/route';
import { PAULO_ID } from '/home/user/fitos-final/lib/masterIds';

let ok = 0, bad = 0;
const t = async (name: string, fn: () => any) => { try { await fn(); ok++; console.log('  ok  ' + name); } catch (e: any) { bad++; console.log('FALHOU ' + name + '\n   ' + (e.message || e)); } };
const C = (planKey: string | null, count: number, billingStatus: string | null = 'ACTIVE') => computeStudentLimit({ planKey, billingStatus, count });
const seed = (n: number, extra: any = {}) => {
  db.users.length = 0;
  db.users.push({ id: 'c1', role: 'COACH', accountStatus: 'ACTIVE', coachBillingPlan: 'PERSONAL_START_MONTHLY', coachBillingStatus: 'ACTIVE', ...extra });
  for (let i = 0; i < n; i++) db.users.push({ id: 'a' + i, role: 'USER', coachId: 'c1', accountStatus: 'ACTIVE' });
};
const call = (auth: any, q = '') => { const r: any = { url: 'http://x/api/coach-plans/limit' + q }; r.__auth = auth; return limitGet(r) as any; };

(async () => {
  await t('Start (25): 20 = OK, 23 = perto (90%), 25 = perto, 26 = passou e precisa do Growth', () => {
    assert.equal(C('PERSONAL_START_MONTHLY', 20).level, 'OK');
    assert.equal(C('PERSONAL_START_MONTHLY', 22).level, 'OK');   // 22 < ceil(22.5)=23
    assert.equal(C('PERSONAL_START_MONTHLY', 23).level, 'NEAR');
    assert.equal(C('PERSONAL_START_MONTHLY', 25).level, 'NEAR');
    const o = C('PERSONAL_START_MONTHLY', 26);
    assert.equal(o.level, 'OVER'); assert.equal(o.max, 25); assert.equal(o.tier, 'START'); assert.equal(o.neededTier, 'GROWTH'); assert.equal(o.neededTierLabel, 'Growth'); assert.equal(o.neededMax, 50);
  });
  await t('passou muito: sugere o degrau que cabe (Scale para 120, Ilimitado para 400)', () => {
    assert.equal(C('PERSONAL_START_MONTHLY', 120).neededTier, 'SCALE');
    const u = C('ELITE_MONTHLY', 400); // ELITE_MONTHLY = Growth (chave antiga, sem o degrau na chave)
    assert.equal(u.tier, 'GROWTH'); assert.equal(u.level, 'OVER'); assert.equal(u.neededTier, 'UNLIMITED'); assert.equal(u.neededMax, null);
  });
  await t('plano Ilimitado nunca avisa; plano desconhecido ou vazio = sem aviso', () => {
    const u = C('PERSONAL_UNLIMITED_ANNUAL', 5000); assert.equal(u.level, 'OK'); assert.equal(u.max, null);
    assert.equal(C('INVENTADO', 100).level, 'NONE'); assert.equal(C('', 100).level, 'NONE'); assert.equal(C(null, 100).level, 'NONE');
  });
  await t('só avisa quem tem plano PAGO e em dia: teste grátis, pendente, vencido e cancelado ficam sem aviso', () => {
    for (const s of ['TRIAL', 'PENDING', 'OVERDUE', 'CANCELLED', null, undefined as any]) assert.equal(computeStudentLimit({ planKey: 'PERSONAL_START_MONTHLY', billingStatus: s, count: 80 }).level, 'NONE', String(s));
    assert.equal(C('PERSONAL_START_MONTHLY', 80, 'active').level, 'OVER');   // caixa não importa
  });
  await t('plano antigo de lançamento (*_LAUNCH) é tratado como o degrau Growth (50)', () => {
    const r = C('PERSONAL_LAUNCH', 51); assert.equal(r.max, 50); assert.equal(r.level, 'OVER');
  });
  await t('contagem: só aluno (role USER) ATIVO daquele coach; excluído, pendente, de outro coach e coach ficam de fora', async () => {
    seed(24);
    db.users.push({ id: 'del', role: 'USER', coachId: 'c1', accountStatus: 'DELETED' }, { id: 'pen', role: 'USER', coachId: 'c1', accountStatus: 'PENDING_APPROVAL' },
                  { id: 'out', role: 'USER', coachId: 'c2', accountStatus: 'ACTIVE' }, { id: 'c2', role: 'COACH', coachId: 'c1', accountStatus: 'ACTIVE' });
    const s = await studentLimitFor(db_prisma(), 'c1'); assert.equal(s.count, 24); assert.equal(s.level, 'NEAR');
  });
  await t('rota: o coach lê o dele; aluno e sem login não leem; master com ?coachId= lê o de outro; master sem limite', async () => {
    seed(30);
    let r = await call({ id: 'c1', role: 'COACH' }); assert.equal(r.status, 200); assert.equal(r.body.level, 'OVER'); assert.equal(r.body.count, 30); assert.equal(r.body.neededTier, 'GROWTH');
    r = await call(null); assert.equal(r.status, 401);
    r = await call({ id: 'a1', role: 'USER' }); assert.equal(r.body.level, 'NONE');
    r = await call({ id: 'a1', role: 'USER' }, '?coachId=c1'); assert.equal(r.body.level, 'NONE');   // aluno não consegue olhar outro coach
    r = await call({ id: 'c2', role: 'COACH' }, '?coachId=c1'); assert.equal(r.body.count, 0);        // coach pedindo outro: continua lendo o PRÓPRIO
    r = await call({ id: PAULO_ID, role: 'COACH' }, '?coachId=c1'); assert.equal(r.body.level, 'OVER');
    // time master com plano e alunos de sobra no banco: continua sem aviso (a regra vem da rota, não da falta de dados)
    db.users.push({ id: PAULO_ID, role: 'COACH', accountStatus: 'ACTIVE', coachBillingPlan: 'PERSONAL_START_MONTHLY', coachBillingStatus: 'ACTIVE' });
    for (let i = 0; i < 40; i++) db.users.push({ id: 'p' + i, role: 'USER', coachId: PAULO_ID, accountStatus: 'ACTIVE' });
    r = await call({ id: PAULO_ID, role: 'COACH' }); assert.equal(r.body.level, 'NONE'); assert.equal(r.body.count, 0);
    r = await call({ id: PAULO_ID, role: 'COACH' }, '?coachId=' + PAULO_ID); assert.equal(r.body.level, 'NONE', 'nem pedindo o do próprio master');
  });
  await t('NEAR_FRACTION é 90%', () => assert.equal(NEAR_FRACTION, 0.9));
  console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad ? 1 : 0);
})();
import prismaMock from './mocks';
function db_prisma() { return prismaMock; }
