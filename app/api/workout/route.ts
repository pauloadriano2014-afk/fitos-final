import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Busca o treino completo ordenado
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    const workout = await prisma.workout.findFirst({
      where: { userId },
      include: { 
        exercises: { 
          include: { exercise: true },
          orderBy: { order: 'asc' } // Garante a ordem visual
        } 
      }
    });

    return NextResponse.json(workout || {});
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar treino" }, { status: 500 });
  }
}

// POST: Salva ou Atualiza um Dia Específico (Manual)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises } = body;

    // 1. Garante ou cria o Treino Pai (Ficha)
    let workout = await prisma.workout.findFirst({ where: { userId } });

    if (!workout) {
      workout = await prisma.workout.create({
        data: {
          userId,
          name: name || "Periodização Atual",
          level: "Personalizado"
        }
      });
    }

    // 2. Identifica quais dias estão sendo salvos neste request
    // (Geralmente o admin manda um dia por vez, ex: só exercícios do dia 'A')
    const daysToUpdate = [...new Set(exercises.map((e: any) => e.day))];

    await prisma.$transaction(async (tx) => {
      // 3. Remove APENAS os exercícios dos dias que estão sendo atualizados
      // Isso impede que ao salvar o B, o A seja apagado.
      await tx.workoutExercise.deleteMany({
        where: {
          workoutId: workout.id,
          day: { in: daysToUpdate as string[] }
        }
      });

      // 4. Cria os novos exercícios com a ORDEM correta
      if (exercises && exercises.length > 0) {
        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];
          await tx.workoutExercise.create({
            data: {
              workoutId: workout.id,
              exerciseId: ex.exerciseId,
              day: ex.day,
              sets: Number(ex.sets),
              reps: String(ex.reps),
              restTime: Number(ex.restTime),
              technique: ex.technique,
              order: i // Salva a posição manual (0, 1, 2...)
            }
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao salvar treino:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}