// prisma/seed-app-review-coaches.js
//
// Cria (ou reseta) os 3 coaches de demonstração pedidos por Paulo pra reforçar
// a resposta da Apple (rejeição 30 set 2026, Guideline 2.1 + 3.1.1): um coach
// em cada plano (Personal / Nutricionista / Elite).
//
// Os três nascem já ATIVOS (pulam a fila de aprovação) mas com a assinatura
// VENCIDA (coachBillingStatus:'OVERDUE', coachBillingEnd 5 dias atrás) -- ao
// logar, cada um cai direto na tela de bloqueio real do app (CoachBlockedScreen),
// não uma simulação. Isso também derruba automaticamente o aviso de "coach
// pausado" pros alunos vinculados a eles (ver seed-app-review-students.js).
//
// O coach ELITE é o indicado pro campo de "conta demo" da App Review
// Information (Guideline 2.1 pede especificamente uma conta com assinatura
// expirada) por ser o plano mais completo (treino + dieta + financeiro).
//
// Como rodar (dentro da pasta do backend):
//   node prisma/seed-app-review-coaches.js
//
// Seguro rodar de novo (upsert) -- roda de novo se quiser resetar a senha ou
// a data de vencimento.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

// 🔑 Mesma senha pros 3 -- troque aqui se quiser outra antes de rodar.
const PASSWORD = 'EliteFitReview2026!';

const COACHES = [
  {
    key: 'PERSONAL',
    email: 'coach.personal@elitefitapp.com.br',
    name: 'Coach Personal (Revisão)',
    coachPlan: 'PERSONAL',
    coachBillingPlan: 'PERSONAL_MONTHLY',
  },
  {
    key: 'NUTRICIONISTA',
    email: 'coach.nutri@elitefitapp.com.br',
    name: 'Coach Nutri (Revisão)',
    coachPlan: 'NUTRICIONISTA',
    coachBillingPlan: 'NUTRI_MONTHLY',
  },
  {
    key: 'ELITE',
    email: 'coach.elite@elitefitapp.com.br',
    name: 'Coach Elite (Revisão)',
    coachPlan: 'ELITE',
    coachBillingPlan: 'ELITE_MONTHLY',
  },
];

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  const billingEnd = new Date();
  billingEnd.setDate(billingEnd.getDate() - 5); // venceu há 5 dias

  console.log('');
  for (const c of COACHES) {
    const coach = await prisma.user.upsert({
      where: { email: c.email },
      update: {
        password: hashedPassword,
        active: true,
        accountStatus: 'ACTIVE',
        coachPlan: c.coachPlan,
        coachBillingStatus: 'OVERDUE',
        coachBillingPlan: c.coachBillingPlan,
        coachBillingEnd: billingEnd,
      },
      create: {
        email: c.email,
        password: hashedPassword,
        name: c.name,
        role: 'COACH',
        isTestAccount: true,
        accountStatus: 'ACTIVE', // pula PENDING_APPROVAL
        coachPlan: c.coachPlan,
        coachBillingStatus: 'OVERDUE',
        coachBillingPlan: c.coachBillingPlan,
        coachBillingEnd: billingEnd,
        inviteCode: `REV-${c.key}-${randomUUID().slice(0, 6).toUpperCase()}`,
        onboardingCompleted: true,
      },
    });
    console.log(`✅ Coach ${c.key.padEnd(14)} ${c.email}  (userId ${coach.id}) — assinatura vencida em ${billingEnd.toLocaleDateString('pt-BR')}, cai na tela de bloqueio ao logar`);
  }

  console.log('\nSenha (os 3 coaches):', PASSWORD);
  console.log('\n👉 Indicado pro campo de conta demo da App Review Information (Guideline 2.1):');
  console.log('   coach.elite@elitefitapp.com.br /', PASSWORD, '\n');
}

main()
  .catch((e) => {
    console.error('Erro ao criar coaches de revisão:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
