import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Expo } from 'expo-server-sdk';

const prisma = new PrismaClient();
const expo = new Expo();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const workoutId = searchParams.get('workoutId'); 
    const archived = searchParams.get('archived') === 'true';

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    if (workoutId) {
        const workout = await prisma.workout.findUnique({
            where: { id: workoutId },
            include: { 
                exercises: { 
                    include: { exercise: true, substitute: true },
                    orderBy: { order: 'asc' } 
                } 
            }
        });

        if (!workout) return NextResponse.json({ error: "Workout not found" }, { status: 404 });

        const history = await prisma.workoutHistory.findMany({
            where: { userId },
            orderBy: { date: 'desc' },
            take: 20,
            include: { details: true }
        });

        let calculatedLastLog = null;

        for (const log of history) {
            const name = (log.workoutName || log.name || "").toUpperCase();
            const match = name.match(/TREINO\s+([A-F])/i) || name.match(/\b([A-F])\b/i);
            
            if (match) {
                calculatedLastLog = { day: match[1].toUpperCase(), date: log.date };
                break; 
            }
            if (name.includes('SUPERIORES')) { calculatedLastLog = { day: 'A', date: log.date }; break; }
            if (name.includes('COSTAS')) { calculatedLastLog = { day: 'B', date: log.date }; break; }
            if (name.includes('PERNAS')) { calculatedLastLog = { day: 'C', date: log.date }; break; }
        }

        const lastWeightsMap: any = {};
        if (history.length > 0) {
            history.slice().reverse().forEach(h => { 
                h.details.forEach(d => {
                    if (!lastWeightsMap[d.exerciseId]) lastWeightsMap[d.exerciseId] = {};
                    lastWeightsMap[d.exerciseId][d.setNumber] = d.weight;
                });
            });
        }

        return NextResponse.json({ 
            ...workout, 
            lastWeights: lastWeightsMap,
            lastLog: calculatedLastLog 
        });
    }

    const workouts = await prisma.workout.findMany({
        where: { userId, archived: archived },
        orderBy: { createdAt: 'desc' },
        include: { exercises: { include: { exercise: true, substitute: true } } }
    });

    return NextResponse.json(workouts);

  } catch (error) {
    console.error("Erro GET workout:", error);
    return NextResponse.json({ error: "Erro ao buscar treino" }, { status: 500 });
  }
}

// 🔥 POST: TREINO NOVO COM ESCUDO E OBSERVAÇÕES SALVAS CORRETAMENTE 🔥
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises, startDate, endDate, archiveCurrent } = body;

    if (archiveCurrent) {
        await prisma.workout.updateMany({
            where: { userId, archived: false },
            data: { archived: true }
        });
    }

    // 1. Cria um treino novo zerado
    const workout = await prisma.workout.create({
      data: { 
          userId, 
          name: name || "Planejamento Atual", 
          level: "Personalizado",
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null
      }
    });

    // 2. Escudo Duplo Anti-Corrupção
    if (exercises && exercises.length > 0) {
      const allIds: string[] = [];
      exercises.forEach((ex: any) => {
          if (ex.exerciseId) allIds.push(ex.exerciseId);
          if (ex.substituteId) allIds.push(ex.substituteId);
      });
      
      const validExercises = await prisma.exercise.findMany({
        where: { id: { in: allIds } },
        select: { id: true }
      });
      const validIds = validExercises.map(e => e.id);

      const exercisesToCreate = exercises
        .filter((ex: any) => validIds.includes(ex.exerciseId)) 
        .map((ex: any, index: number) => ({
          workoutId: workout.id, 
          exerciseId: ex.exerciseId,
          day: ex.day,
          sets: Number(ex.sets) || 0,
          reps: String(ex.reps),
          restTime: Number(ex.restTime) || 0,
          technique: ex.technique || "",
          order: index, 
          
          // 🔥 AS OBSERVAÇÕES VOLTARAM! AGORA O BANCO ACEITA ELAS 🔥
          observation: ex.observation || "",
          
          substituteId: (ex.substituteId && validIds.includes(ex.substituteId)) ? ex.substituteId : null 
        }));

      if (exercisesToCreate.length > 0) {
          await prisma.workoutExercise.createMany({
              data: exercisesToCreate
          });
      }
    }

    // Notificação
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushToken: true, name: true }
    });

    if (user && user.pushToken && Expo.isExpoPushToken(user.pushToken)) {
        const messages = [{
            to: user.pushToken,
            sound: 'default' as const,
            title: '🔥 Treino Novo Disponível!',
            body: `${user.name ? user.name.split(' ')[0] : 'Atleta'}, seu coach acabou de atualizar sua planilha. Bora treinar!`,
            data: { workoutId: workout.id }, 
        }];
        try { await expo.sendPushNotificationsAsync(messages); } catch (e) {}
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro POST workout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 🔥 NOVO: PERMITE O APLICATIVO ARQUIVAR/DESARQUIVAR COM O BOTÃO NOVO 🔥
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, archived } = body;

    if (!id) return NextResponse.json({ error: "ID do treino não fornecido" }, { status: 400 });

    if (typeof archived !== 'undefined') {
        const updated = await prisma.workout.update({
            where: { id },
            data: { archived }
        });
        return NextResponse.json({ success: true, updated });
    }

    return NextResponse.json({ error: "Nenhum dado para atualizar" }, { status: 400 });
  } catch (error: any) {
    console.error("Erro PATCH Workout:", error);
    return NextResponse.json({ error: "Erro ao atualizar status do treino" }, { status: 500 });
  }
}

// 🔥 FALLBACK: O mesmo comando em formato PUT, para garantir que o seu app consiga arquivar de qualquer jeito 🔥
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, archived } = body;

    if (!id) return NextResponse.json({ error: "ID do treino não fornecido" }, { status: 400 });

    if (typeof archived !== 'undefined') {
        const updated = await prisma.workout.update({
            where: { id },
            data: { archived }
        });
        return NextResponse.json({ success: true, updated });
    }

    return NextResponse.json({ error: "Nenhum dado para atualizar" }, { status: 400 });
  } catch (error: any) {
    console.error("Erro PUT Workout:", error);
    return NextResponse.json({ error: "Erro ao atualizar status do treino" }, { status: 500 });
  }
}