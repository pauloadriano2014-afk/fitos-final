// prisma/seed-review-student-disposable.ts
//
// Cria (ou reseta) UMA conta de ALUNO descartável, vinculada ao coach de
// revisão parceiro (coach.revisor@elitefitapp.com.br) em vez do seu coachId
// master — assim o app mostra a marca/logo genérica do coach parceiro
// (a que qualquer coach real veria), e não a logo pessoal do PA ELITE TEAM.
// Só serve pra gravar o fluxo de exclusão de conta (lado Aluno) do
// Guideline 2.1 da Apple.
//
// Como rodar (uma vez, na sua máquina, dentro da pasta do backend):
//   npx ts-node prisma/seed-review-student-disposable.ts
//
// Seguro rodar de novo (upsert) — recria a conta do zero se já tiver sido
// excluída antes.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 🔑 Mesmas credenciais que já estão no texto de resposta pra Apple.
const DISPOSABLE_EMAIL = 'gravacao.exclusao@elitefitapp.com.br';
const DISPOSABLE_PASSWORD = 'GravacaoExclusao2026!';

// Vincula ao coach de revisão parceiro (não ao seu próprio coachId), pra
// pegar a marca/logo genérica dele em vez da sua pessoal.
const PARTNER_COACH_EMAIL = 'coach.revisor@elitefitapp.com.br';

async function main() {
  const partnerCoach = await prisma.user.findUnique({
    where: { email: PARTNER_COACH_EMAIL },
    select: { id: true, name: true },
  });

  if (!partnerCoach) {
    throw new Error(
      `Coach parceiro "${PARTNER_COACH_EMAIL}" não encontrado. Rode o seed dele primeiro (ou confirme o e-mail).`
    );
  }

  const hashedPassword = await bcrypt.hash(DISPOSABLE_PASSWORD, 10);

  const student = await prisma.user.upsert({
    where: { email: DISPOSABLE_EMAIL },
    update: {
      password: hashedPassword,
      active: true,
      accountStatus: 'ACTIVE',
      coachId: partnerCoach.id,
    } as any,
    create: {
      email: DISPOSABLE_EMAIL,
      password: hashedPassword,
      name: 'Aluno Descartável (Revisão)',
      role: 'USER',
      coachId: partnerCoach.id,
      isTestAccount: true,
      plan: 'ELITE',
      studentModules: 'AMBOS',
      dietModule: true,
      active: true,
      accountStatus: 'ACTIVE',
      onboardingCompleted: true, // pula Anamnese/onboarding inicial
      gender: 'Masculino',
      birthDate: '1995-01-01',
      goal: 'Hipertrofia',
    } as any,
  });

  console.log('\n✅ Aluno descartável pronto pra gravação:');
  console.log('   E-mail :', DISPOSABLE_EMAIL);
  console.log('   Senha  :', DISPOSABLE_PASSWORD);
  console.log('   userId :', student.id);
  console.log('   Coach  :', partnerCoach.name, `(${PARTNER_COACH_EMAIL})`);
  console.log('\nAssim a logo/marca que aparece pro aluno é a do coach parceiro, não a sua pessoal.\n');
}

main()
  .catch((e) => {
    console.error('Erro ao criar aluno descartável:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
