import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Busca o treino do aluno
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário não fornecido" }, { status: 400 });
    }

    const workouts = await prisma.workout.findMany({
      where: { userId: userId }, // FILTRO POR USUÁRIO GARANTIDO
      include: {
        exercises: {
          include: {
            exercise: true 
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(workouts);
  } catch (error) {
    console.error("Erro ao buscar treinos:", error);
    return NextResponse.json({ error: "Erro interno ao buscar treinos" }, { status: 500 });
  }
}

// POST: Você (Admin) cria o treino para o aluno
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Recebendo payload de treino:", JSON.stringify(body, null, 2));

    const { userId, name, workoutName, exercises } = body; 
    const finalWorkoutName = workoutName || name || "Novo Treino";

    if (!userId || !exercises) {
      return NextResponse.json({ error: "Dados insuficientes (userId ou exercícios faltando)" }, { status: 400 });
    }

    // OPCIONAL: Deletar treino anterior com o mesmo nome para o mesmo aluno (evita duplicidade)
    await prisma.workout.deleteMany({
      where: {
        userId: userId,
        name: finalWorkoutName
      }
    });

    // OPERAÇÃO BLINDADA COM TRATAMENTO DE TIPOS
    const newWorkout = await prisma.workout.create({
      data: {
        name: finalWorkoutName,
        userId: userId,
        exercises: {
          create: exercises.map((ex: any) => ({
            exerciseId: ex.exerciseId, 
            sets: parseInt(ex.sets) || 3, 
            reps: String(ex.reps) || "12", 
            notes: ex.technique || ex.notes || "" 
          })),
        },
      },
      include: {
        exercises: {
          include: {
            exercise: true
          }
        }
      }
    });

    return NextResponse.json(newWorkout);
  } catch (error: any) {
    console.error("Erro detalhado ao criar treino:", error.message);
    return NextResponse.json({ 
      error: "Erro ao criar treino", 
      details: error.message 
    }, { status: 500 });
  }
}