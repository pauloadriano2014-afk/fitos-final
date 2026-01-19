import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Busca lista de treinos OU um treino específico
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const workoutId = searchParams.get('workoutId'); // Novo parâmetro para buscar um específico
    const archived = searchParams.get('archived') === 'true';

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    // --- CENÁRIO 1: Busca Detalhes de um Treino Específico (Clicou na Pasta) ---
    if (workoutId) {
        const workout = await prisma.workout.findUnique({
            where: { id: workoutId },
            include: { 
                exercises: { 
                    include: { exercise: true },
                    orderBy: { order: 'asc' } 
                } 
            }
        });

        if (!workout) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

        // Busca histórico de cargas para preencher o "Anterior: 20kg"
        const history = await prisma.workoutHistory.findMany({
            where: { userId },
            orderBy: { date: 'desc' },
            take: 20,
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
    }

    // --- CENÁRIO 2: Busca a LISTA de Periodizações (Tela Inicial de Treinos) ---
    const workouts = await prisma.workout.findMany({
        where: { 
            userId, 
            archived: archived // Se não passar nada, busca os ativos (archived=false)
        },
        orderBy: { createdAt: 'desc' },
        // Selecionamos apenas o necessário para montar os cards
        select: {
            id: true,
            name: true,
            goal: true,
            level: true,
            startDate: true,
            endDate: true,
            createdAt: true
        }
    });

    return NextResponse.json(workouts);

  } catch (error) {
    console.error("Erro GET workout:", error);
    return NextResponse.json({ error: "Erro ao buscar treino" }, { status: 500 });
  }
}

// POST: Cria ou Atualiza treino (Mantido com suporte a datas)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises, startDate, endDate, archiveCurrent } = body;

    // Se mandar arquivar, esconde os anteriores
    if (archiveCurrent) {
        await prisma.workout.updateMany({
            where: { userId, archived: false },
            data: { archived: true }
        });
    }

    // Tenta achar o treino ativo mais recente para editar, ou cria um novo
    let workout = await prisma.workout.findFirst({ 
        where: { userId, archived: false },
        orderBy: { createdAt: 'desc' }
    });

    // Se não existir ativo ou se foi pedido para arquivar (criar novo ciclo)
    if (!workout || archiveCurrent) {
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
        // Atualiza metadados do treino existente
        await prisma.workout.update({
            where: { id: workout.id },
            data: {
                name: name || workout.name,
                startDate: startDate ? new Date(startDate) : workout.startDate,
                endDate: endDate ? new Date(endDate) : workout.endDate
            }
        });
    }

    // Atualiza os exercícios (Apaga os do dia e recria)
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