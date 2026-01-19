import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Busca treino ATIVO para o aluno
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const archived = searchParams.get('archived'); // Opcional: buscar arquivados

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    // Se pedir arquivados, busca lista. Se não, busca o ATIVO.
    if (archived === 'true') {
        const workouts = await prisma.workout.findMany({
            where: { userId, archived: true },
            orderBy: { endDate: 'desc' }
        });
        return NextResponse.json(workouts);
    }

    // Busca o treino ATIVO (não arquivado) mais recente
    const workout = await prisma.workout.findFirst({
      where: { 
          userId, 
          archived: false 
      },
      include: { 
        exercises: { 
          include: { exercise: true },
          orderBy: { order: 'asc' } 
        } 
      },
      orderBy: { createdAt: 'desc' } // Pega o último criado se tiver mais de um ativo
    });

    if (!workout) return NextResponse.json({});

    // Busca histórico de cargas (mantido igual)
    const history = await prisma.workoutHistory.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 10,
        include: { details: true }
    });

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

// POST: Cria ou Atualiza treino com DATAS
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises, startDate, endDate, archiveCurrent } = body;

    // Se a flag "archiveCurrent" vier true, arquivamos o treino atual antes de criar o novo
    if (archiveCurrent) {
        await prisma.workout.updateMany({
            where: { userId, archived: false },
            data: { archived: true }
        });
    }

    // Busca treino ativo ou cria novo
    let workout = await prisma.workout.findFirst({ 
        where: { userId, archived: false } 
    });

    if (!workout) {
      workout = await prisma.workout.create({
        data: { 
            userId, 
            name: name || "Planejamento Atual", 
            level: "Personalizado",
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: endDate ? new Date(endDate) : null
        }
      });
    } else {
        // Atualiza dados do treino existente
        await prisma.workout.update({
            where: { id: workout.id },
            data: {
                name: name || workout.name,
                startDate: startDate ? new Date(startDate) : workout.startDate,
                endDate: endDate ? new Date(endDate) : workout.endDate
            }
        });
    }

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
              order: i
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