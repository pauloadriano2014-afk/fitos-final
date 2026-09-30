// prisma/seed-app-review-students.js
//
// Cria (ou reseta) os 3 alunos de demonstração vinculados aos 3 coaches de
// revisão -- RODE seed-app-review-coaches.js ANTES desse.
//
//   aluno.personal@elitefitapp.com.br  -> só TREINO
//   aluno.nutri@elitefitapp.com.br     -> só DIETA
//   aluno.elite@elitefitapp.com.br     -> TREINO + DIETA
//
// Isso espelha de propósito a trava real de aba por plano do coach (App.js,
// 28 set 2026: coachHasDiet/coachHasTreinos + studentModules) -- não é uma
// simulação, é o mesmo caminho que qualquer aluno real percorre.
//
// Como o coach de cada um está com a assinatura vencida (OVERDUE, ver
// seed-app-review-coaches.js), ao logar esses alunos veem automaticamente o
// aviso de "coach pausado" (LoginScreen.js, @coach_paused) -- o equivalente,
// do lado do aluno, à tela de bloqueio do coach.
//
// Clona um treino e uma dieta JÁ EXISTENTES de algum aluno real (não de
// teste) do banco, pra esses alunos não caírem em tela vazia pro revisor.
//
// Como rodar (dentro da pasta do backend, depois do seed dos coaches):
//   node prisma/seed-app-review-students.js
//
// Seguro rodar de novo (upsert) -- só clona treino/dieta se o aluno ainda
// não tiver nenhum.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// 🔑 Mesma senha pros 3 -- troque aqui se quiser outra antes de rodar.
const PASSWORD = 'EliteFitReview2026!';

const STUDENTS = [
  {
    key: 'PERSONAL',
    email: 'aluno.personal@elitefitapp.com.br',
    name: 'Aluno Personal (Revisão)',
    coachEmail: 'coach.personal@elitefitapp.com.br',
    studentModules: 'TREINO',
    dietModule: false,
    cloneWorkout: true,
    cloneDiet: false,
  },
  {
    key: 'NUTRI',
    email: 'aluno.nutri@elitefitapp.com.br',
    name: 'Aluno Nutri (Revisão)',
    coachEmail: 'coach.nutri@elitefitapp.com.br',
    studentModules: 'DIETA',
    dietModule: true,
    cloneWorkout: false,
    cloneDiet: true,
  },
  {
    key: 'ELITE',
    email: 'aluno.elite@elitefitapp.com.br',
    name: 'Aluno Elite (Revisão)',
    coachEmail: 'coach.elite@elitefitapp.com.br',
    studentModules: 'AMBOS',
    dietModule: true,
    cloneWorkout: true,
    cloneDiet: true,
  },
];

// Pega o treino ativo mais recente de QUALQUER aluno real (não de teste), só
// pra clonar a estrutura (exercícios já cadastrados, não duplica Exercise).
async function findSampleWorkout() {
  return prisma.workout.findFirst({
    where: { archived: false, user: { isTestAccount: false } },
    orderBy: { createdAt: 'desc' },
    include: { exercises: true },
  });
}

async function findSampleDiet() {
  return prisma.diet.findFirst({
    where: { isActive: true, isStrategy: false, user: { isTestAccount: false } },
    orderBy: { createdAt: 'desc' },
    include: { meals: { include: { items: true } } },
  });
}

async function cloneWorkoutFor(userId, sample) {
  if (!sample) return;
  await prisma.workout.create({
    data: {
      name: sample.name,
      goal: sample.goal,
      level: sample.level,
      workoutModel: sample.workoutModel,
      userId,
      exercises: {
        create: sample.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          substituteId: ex.substituteId,
          substitutes: ex.substitutes,
          restTime: ex.restTime,
          title: ex.title,
          sets: ex.sets,
          reps: ex.reps,
          notes: ex.notes,
          technique: ex.technique,
          day: ex.day,
          order: ex.order,
        })),
      },
    },
  });
}

async function cloneDietFor(userId, sample) {
  if (!sample) return;
  await prisma.diet.create({
    data: {
      userId,
      name: sample.name,
      goal: sample.goal,
      totalKcal: sample.totalKcal,
      totalProtein: sample.totalProtein,
      totalCarbs: sample.totalCarbs,
      totalFats: sample.totalFats,
      waterIntake: sample.waterIntake,
      freeMeal: sample.freeMeal,
      generalNotes: sample.generalNotes,
      meals: {
        create: sample.meals.map((m) => ({
          name: m.name,
          time: m.time,
          order: m.order,
          notes: m.notes,
          dayType: m.dayType,
          isMainVersion: m.isMainVersion,
          items: {
            create: m.items.map((it) => ({
              name: it.name,
              amount: it.amount,
              unit: it.unit,
              protein: it.protein,
              carbs: it.carbs,
              fats: it.fats,
              calories: it.calories,
            })),
          },
        })),
      },
    },
  });
}

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const sampleWorkout = await findSampleWorkout();
  const sampleDiet = await findSampleDiet();

  if (!sampleWorkout) console.log('⚠️  Nenhum treino real encontrado pra clonar — alunos ficam sem treino de exemplo.');
  if (!sampleDiet) console.log('⚠️  Nenhuma dieta real encontrada pra clonar — alunos ficam sem dieta de exemplo.');

  console.log('');
  for (const s of STUDENTS) {
    const coach = await prisma.user.findUnique({ where: { email: s.coachEmail }, select: { id: true } });
    if (!coach) {
      throw new Error(`Coach ${s.coachEmail} não encontrado — rode node prisma/seed-app-review-coaches.js primeiro.`);
    }

    const student = await prisma.user.upsert({
      where: { email: s.email },
      update: {
        password: hashedPassword,
        active: true,
        accountStatus: 'ACTIVE',
        coachId: coach.id,
        studentModules: s.studentModules,
        dietModule: s.dietModule,
      },
      create: {
        email: s.email,
        password: hashedPassword,
        name: s.name,
        role: 'USER',
        coachId: coach.id,
        isTestAccount: true,
        plan: 'ELITE',
        studentModules: s.studentModules,
        dietModule: s.dietModule,
        active: true,
        accountStatus: 'ACTIVE',
        onboardingCompleted: true, // pula Anamnese/onboarding inicial
        gender: 'Masculino',
        birthDate: '1995-01-01',
        goal: 'Hipertrofia',
      },
    });

    const existingWorkout = s.cloneWorkout
      ? await prisma.workout.findFirst({ where: { userId: student.id } })
      : null;
    if (s.cloneWorkout && !existingWorkout) await cloneWorkoutFor(student.id, sampleWorkout);

    const existingDiet = s.cloneDiet
      ? await prisma.diet.findFirst({ where: { userId: student.id } })
      : null;
    if (s.cloneDiet && !existingDiet) await cloneDietFor(student.id, sampleDiet);

    console.log(`✅ Aluno ${s.key.padEnd(10)} ${s.email}  (userId ${student.id}) — coach: ${s.coachEmail}`);
  }

  console.log('\nSenha (os 3 alunos):', PASSWORD, '\n');
}

main()
  .catch((e) => {
    console.error('Erro ao criar alunos de revisão:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
