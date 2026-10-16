import assert from 'assert';
import prisma from '@/lib/prisma';
import { POST } from '@/app/api/auth/register/route';
const created: any[] = (prisma as any).__created;
const post = async (body: any) => { const res: any = await POST({ json: async () => body } as any); return { status: res.status, body: await res.json() }; };
const coach = (extra: any) => ({ accountType: 'COACH', name: 'Ana', email: `a${Math.random()}@x.com`, password: 'Senha123', cpf: '52998224725', phone: '41999990000', ...extra });
(async () => {
  let r = await post(coach({ coachPlan: 'ELITE' })); assert.equal(r.status, 201); assert.equal(created.at(-1).coachPlan, 'ELITE'); assert.equal(created.at(-1).coachRequestInfo.coachPlan, 'ELITE');
  r = await post(coach({ plan: 'NUTRICIONISTA' })); assert.equal(r.status, 201); assert.equal(created.at(-1).coachPlan, 'NUTRICIONISTA', 'app antigo: só `plan` agora vale');
  r = await post(coach({ plan: 'ELITE', coachPlan: 'PERSONAL' })); assert.equal(created.at(-1).coachPlan, 'PERSONAL', '`coachPlan` explícito tem prioridade');
  r = await post(coach({})); assert.equal(created.at(-1).coachPlan, 'PERSONAL', 'sem nada: PERSONAL como antes');
  r = await post(coach({ plan: 'PREMIUM' })); assert.equal(created.at(-1).coachPlan, 'PERSONAL', 'plano que não é de coach cai no padrão');
  r = await post(coach({ plan: 'ADMIN' })); assert.equal(created.at(-1).coachPlan, 'PERSONAL');
  assert.equal(created.at(-1).role, 'COACH'); assert.equal(created.at(-1).accountStatus, 'PENDING_APPROVAL');
  console.log('OK  cadastro de coach no backend: `coachPlan` ou `plan` definem o plano; valor inválido vira PERSONAL; continua PENDING_APPROVAL');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
