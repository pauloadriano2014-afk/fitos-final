// prisma/seed-review-coach-account.ts
//
// Igual ao seed-review-account.ts (conta de Aluno de revisão), só que pro
// OUTRO tipo de conta que o ELITE FIT tem: Coach. A Apple pede credencial
// separada por tipo de conta quando o app tem mais de um — por isso essa
// conta é separada da sua conta pessoal (Paulo/Adri), só pra revisor.
//
// Essa conta já vem com uma aluna de demonstração vinculada (com treino e
// dieta reais já montados), pra o revisor logar como coach e já ver a lista
// de alunos com conteúdo, sem precisar montar nada na hora.
//
// Como rodar (uma vez, na sua máquina, dentro da pasta do backend):
//   npx ts-node prisma/seed-review-coach-account.ts
//
// Rode de novo sempre que quiser resetar a senha ou reativar essa conta —
// é seguro rodar várias vezes (upsert). Isso NÃO apaga nem recria o treino/
// dieta da aluna de demonstração; só garante que o login e o status da
// conta do coach e da aluna estejam OK.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 🔑 Credenciais que vão pro formulário de revisão da App Store / Play
// Console (tipo de conta: Coach). Troque a senha aqui se quiser outra antes
// de rodar.
const COACH_EMAIL = 'coach.revisor@elitefitapp.com.br';
const COACH_PASSWORD = 'RevisorEliteFitCoach2026!';

// Aluna de demonstração já vinculada a essa conta de coach (não precisa
// logar com ela — ela só existe pra aparecer na lista de alunos do coach
// de revisão, já com treino e dieta prontos).
const STUDENT_EMAIL = 'aluno.revisor@elitefitapp.com.br';
const STUDENT_PASSWORD = 'RevisorEliteFitAluno2026!';

async function main() {
  const hashedCoachPassword = await bcrypt.hash(COACH_PASSWORD, 10);

  const reviewCoach = await prisma.user.upsert({
    where: { email: COACH_EMAIL },
    update: {
      password: hashedCoachPassword,
      active: true,
      accountStatus: 'ACTIVE',
      coachBillingStatus: 'ACTIVE', // 🔒 evita cair na tela de "conta bloqueada" por cobrança
    },
    create: {
      email: COACH_EMAIL,
      password: hashedCoachPassword,
      name: 'Coach Demonstração (Revisão)',
      role: 'COACH',
      coachPlan: 'ELITE',       // libera treino + dieta pro coach de revisão
      coachBillingStatus: 'ACTIVE',
      isTestAccount: true,
      plan: 'PERFORMANCE',
      active: true,
      accountStatus: 'ACTIVE', // pula a fila de aprovação de novo coach
      onboardingCompleted: true,
      gender: 'Masculino',
      birthDate: '1990-01-01',
      cpf: '00000000000',
    },
  });

  const hashedStudentPassword = await bcrypt.hash(STUDENT_PASSWORD, 10);

  const reviewStudent = await prisma.user.upsert({
    where: { email: STUDENT_EMAIL },
    update: {
      password: hashedStudentPassword,
      active: true,
      accountStatus: 'ACTIVE',
      coachId: reviewCoach.id,
    },
    create: {
      email: STUDENT_EMAIL,
      password: hashedStudentPassword,
      name: 'Aluno Demonstração (Revisão)',
      role: 'USER',
      coachId: reviewCoach.id,
      isTestAccount: true,
      plan: 'ELITE',
      studentModules: 'AMBOS',
      dietModule: true,
      runningModule: false,
      active: true,
      accountStatus: 'ACTIVE',
      onboardingCompleted: true,
      gender: 'Feminino',
      birthDate: '1998-05-10',
      goal: 'Hipertrofia',
    },
  });

  console.log('\n✅ Conta de revisão (Coach) pronta:');
  console.log('   E-mail:', COACH_EMAIL);
  console.log('   Senha :', COACH_PASSWORD);
  console.log('   userId:', reviewCoach.id);
  console.log('\n✅ Aluna de demonstração vinculada:');
  console.log('   E-mail:', STUDENT_EMAIL);
  console.log('   userId:', reviewStudent.id);
  console.log('\nSe essa aluna ainda não tiver treino/dieta (ex: primeira vez rodando este');
  console.log('script do zero, sem ter passado pelo processo que a equipe de suporte usou),');
  console.log('monte um treino e uma dieta de exemplo pra ela pelo painel do coach, igual');
  console.log('faria com qualquer aluno novo — assim o revisor não cai em tela vazia.\n');
}

main()
  .catch((e) => {
    console.error('Erro ao criar conta de revisão (Coach):', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
