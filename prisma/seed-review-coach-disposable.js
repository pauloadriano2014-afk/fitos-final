// prisma/seed-review-coach-disposable.js
//
// Versão em JS puro (sem ts-node) do seed-review-coach-disposable.ts —
// mesma lógica, só que roda direto com "node", pra evitar o bug de
// incompatibilidade do ts-node com versões recentes do Node.js.
//
// Cria (ou reseta) UMA conta de COACH descartável, já ATIVA e sem nenhum
// aluno vinculado — pra gravar o fluxo de exclusão de conta (Guideline 2.1
// da Apple) sem precisar passar pelo cadastro normal + aprovação manual.
//
// Como rodar (dentro da pasta do backend):
//   node prisma/seed-review-coach-disposable.js
//
// Importante: essa conta não pode ter nenhum aluno vinculado (coachId
// apontando pra ela) na hora de gravar a exclusão — coach com aluno ativo
// cai no fluxo de "pedido pendente" em vez de excluir na hora. Como essa
// conta nasce sempre sem aluno nenhum, não precisa se preocupar com isso,
// só não crie um aluno de teste vinculado a ela antes de gravar.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

// 🔑 Mesmas credenciais que já estão no texto de resposta pra Apple —
// troque aqui só se quiser gerar uma senha nova.
const DISPOSABLE_EMAIL = 'gravacao.exclusao.coach@elitefitapp.com.br';
const DISPOSABLE_PASSWORD = 'GravacaoExclusaoCoach2026!';

async function main() {
  const hashedPassword = await bcrypt.hash(DISPOSABLE_PASSWORD, 10);

  // Data de fim de trial bem no futuro, só pra garantir que nenhuma
  // trava de "trial expirado" atrapalhe a gravação.
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  const coach = await prisma.user.upsert({
    where: { email: DISPOSABLE_EMAIL },
    update: {
      password: hashedPassword,
      active: true,
      accountStatus: 'ACTIVE', // pula PENDING_APPROVAL
      coachBillingStatus: 'TRIAL',
      trialEndsAt,
    },
    create: {
      email: DISPOSABLE_EMAIL,
      password: hashedPassword,
      name: 'Coach Descartável (Revisão)',
      role: 'COACH',
      isTestAccount: true,
      accountStatus: 'ACTIVE', // já nasce aprovado, sem passar pela fila de coach-requests
      coachPlan: 'ELITE',
      coachBillingStatus: 'TRIAL',
      trialEndsAt,
      inviteCode: `REVCOACH-${randomUUID().slice(0, 8).toUpperCase()}`,
      onboardingCompleted: true, // pula onboarding inicial do coach
    },
  });

  console.log('\n✅ Coach descartável pronto pra gravação:');
  console.log('   E-mail:', DISPOSABLE_EMAIL);
  console.log('   Senha :', DISPOSABLE_PASSWORD);
  console.log('   userId:', coach.id);
  console.log('\n⚠️  Não vincule nenhum aluno a esse coach antes de gravar a exclusão —');
  console.log('    com aluno ativo, a exclusão vira "pedido pendente" em vez de imediata.\n');
}

main()
  .catch((e) => {
    console.error('Erro ao criar coach descartável:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
