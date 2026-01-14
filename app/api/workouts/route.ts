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
      where: { userId: userId },
      include: {
        exercises: {
          include: {
            exercise: true // Traz os detalhes do exercício (nome, categoria, video)
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
    const { userId, name, exercises } = body; 
    // exercises deve ser um array de: { exerciseId: string, sets: number, reps: number }

    const newWorkout = await prisma.workout.create({
      data: {
        name: name,
        userId: userId,
        exercises: {
          create: exercises.map((ex: any) => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets || 3,
            reps: ex.reps || 12,
          })),
        },
      },
      include: {
        exercises: true
      }
    });

    return NextResponse.json(newWorkout);
  } catch (error) {
    console.error("Erro ao criar treino:", error);
    return NextResponse.json({ error: "Erro ao criar treino" }, { status: 500 });
  }
}