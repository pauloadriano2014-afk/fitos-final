import assert from 'assert';
import prisma from '@/lib/prisma';
import { POST } from '@/app/api/auth/register/route';
const created: any[] = (prisma as any).__created;
const post = async (body: any) => { const res: any = await POST({ json: async () => body } as any); return { status: res.status, body: await res.json() }; };
const aluno = (plan?: string) => ({ accountType: 'STUDENT', name: 'Bia', email: `b${Math.random()}@x.com`, password: 'Senha123', cpf: '52998224725', phone: '41999990000', inviteCode: 'PATEAM', ...(plan ? { plan } : {}) });
(async () => {
  for (const plan of ['FICHA_8S', 'CHALLENGE_21']) {
    const r = await post(aluno(plan)); assert.equal(r.status, 201); assert.equal(created.at(-1).plan, plan); assert.equal(created.at(-1).anamnesePendente, true, plan + ': nasce com a anamnese pendente (o plano só nasce depois dela)');
    assert.equal(r.body.user.anamnesePendente, true, 'o app recebe o campo no cadastro');
  }
  for (const plan of ['ELITE', 'PERFORMANCE', 'LOW_COST', undefined]) {
    await post(aluno(plan as any)); assert.equal(created.at(-1).anamnesePendente, undefined, `${plan}: cadastro dos outros planos não muda`);
  }
  assert.equal(created.at(-1).plan, 'PREMIUM', 'sem plano continua PREMIUM');
  console.log('OK  cadastro: só FICHA_8S e CHALLENGE_21 nascem com anamnese pendente');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
