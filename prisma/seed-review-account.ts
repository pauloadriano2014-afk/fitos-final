// prisma/seed-review-account.ts
//
// Cria (ou atualiza) UMA conta de aluno "de mentirinha" com login real, pra
// dar pros revisores da Apple/Google durante a avaliação do app na loja.
// Diferente do "aluno-teste" do impersonate (que só funciona por dentro do
// app do coach, sem senha de verdade), esse aqui loga normal pela tela de
// Login com e-mail + senha, igual qualquer aluno real.
//
// Como rodar (uma vez, na sua máquina, dentro da pasta do backend):
//   npx ts-node prisma/seed-review-account.ts
//
// Rode de novo sempre que quiser resetar a senha ou os dados dessa conta —
// é seguro rodar várias vezes (upsert).
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 🔑 Credenciais que vão pro formulário de revisão da App Store / Play
// Console. Troque a senha aqui se quiser outra antes de rodar.
const REVIEW_EMAIL = 'revisor.elitefit@review.com';
const REVIEW_PASSWORD = 'RevisorEliteFit2026!';

// ⚠️ Troque pelo seu próprio id de coach (o mesmo que aparece em
// MASTER_IDS / lib/masterIds.ts) pra essa conta de teste aparecer vinculada
// a você e você conseguir montar treino/dieta pra ela normalmente.
const COACH_ID = '3c82f763-66b4-48da-836e-16817d4f57c0'; // Paulo

async function main() {
  const hashedPassword = await bcrypt.hash(REVIEW_PASSWORD, 10);

  const reviewUser = await prisma.user.upsert({
    where: { email: REVIEW_EMAIL },
    update: {
      password: hashedPassword,
      active: true,
      accountStatus: 'ACTIVE',
    },
    create: {
      email: REVIEW_EMAIL,
      password: hashedPassword,
      name: 'Conta de Revisão',
      role: 'USER',
      coachId: COACH_ID,
      isTestAccount: true,
      plan: 'ELITE',
      studentModules: 'AMBOS',
      dietModule: true,
      runningModule: false,
      active: true,
      accountStatus: 'ACTIVE',
      onboardingCompleted: true, // pula a Anamnese/onboarding inicial
      gender: 'Masculino',
      birthDate: '1995-01-01',
      goal: 'Hipertrofia',
    },
  });

  console.log('\n✅ Conta de revisão pronta:');
  console.log('   E-mail:', REVIEW_EMAIL);
  console.log('   Senha :', REVIEW_PASSWORD);
  console.log('   userId:', reviewUser.id);
  console.log('\nPróximo passo (fazer no seu app de coach, como faria com qualquer aluno novo):');
  console.log('  1. Abrir esse aluno ("Conta de Revisão") na sua lista de alunos.');
  console.log('  2. Montar/atribuir um treino de exemplo.');
  console.log('  3. Montar/atribuir uma dieta de exemplo.');
  console.log('  4. Se tiver um Desafio ativo, inscrever essa conta nele.');
  console.log('Assim o revisor loga e já vê o app com conteúdo, sem telas vazias.\n');
}

main()
  .catch((e) => {
    console.error('Erro ao criar conta de revisão:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
