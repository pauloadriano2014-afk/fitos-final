import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    // 1. Busca o Treino Atual
    const workout = await prisma.workout.findFirst({
      where: { userId },
      include: { 
        exercises: { 
          include: { exercise: true },
          orderBy: { order: 'asc' } // Respeita a ordem manual
        } 
      }
    });

    if (!workout) return NextResponse.json({});

    // 2. BUSCA HISTÓRICO RECENTE (Para mostrar "Anterior: 20kg")
    const history = await prisma.workoutHistory.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 10,
        include: { details: true }
    });

    // Mapeia histórico: { exerciseId: { 1: 20, 2: 22 } }
    const lastWeightsMap: any = {};
    if (history.length > 0) {
        history.reverse().forEach(h => {
            h.details.forEach(d => {
                if (!lastWeightsMap[d.exerciseId]) lastWeightsMap[d.exerciseId] = {};
                lastWeightsMap[d.exerciseId][d.setNumber] = d.weight;
            });
        });
    }

    return NextResponse.json({ ...workout, lastWeights: lastWeightsMap });

  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar treino" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises } = body;

    let workout = await prisma.workout.findFirst({ where: { userId } });

    if (!workout) {
      workout = await prisma.workout.create({
        data: { userId, name: name || "Treino", level: "Personalizado" }
      });
    }

    // Identifica dias afetados para limpar apenas eles
    const daysToUpdate = [...new Set(exercises.map((e: any) => e.day))];

    await prisma.$transaction(async (tx) => {
      await tx.workoutExercise.deleteMany({
        where: { workoutId: workout.id, day: { in: daysToUpdate as string[] } }
      });

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
              order: i // Salva a ordem manual
            }
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}