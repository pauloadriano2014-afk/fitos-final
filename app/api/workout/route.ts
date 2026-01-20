import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Expo } from 'expo-server-sdk'; // <--- BIBLIOTECA NOVA

const prisma = new PrismaClient();
const expo = new Expo(); // <--- INICIALIZA O DISPARADOR
export const dynamic = 'force-dynamic';

// GET: Busca lista de treinos OU um treino específico
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

// POST: Cria/Atualiza treino E ENVIA NOTIFICAÇÃO
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises, startDate, endDate, archiveCurrent } = body;

    // 1. Lógica de Arquivamento
    if (archiveCurrent) {
        await prisma.workout.updateMany({
            where: { userId, archived: false },
            data: { archived: true }
        });
    }

    // 2. Salva ou Atualiza o Treino
    let workout = await prisma.workout.findFirst({ 
        where: { userId, archived: false },
        orderBy: { createdAt: 'desc' }
    });

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
              order: i,
              substituteId: ex.substituteId || null 
            }
          });
        }
      }
    });

    // --- 👇 LÓGICA DE NOTIFICAÇÃO (NOVO) 👇 ---
    
    // 1. Busca o Token do Usuário
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushToken: true, name: true }
    });

    if (user && user.pushToken && Expo.isExpoPushToken(user.pushToken)) {
        // 2. Prepara a mensagem
        const messages = [{
            to: user.pushToken,
            sound: 'default',
            title: '🔥 Treino Novo Disponível!',
            body: `${user.name ? user.name.split(' ')[0] : 'Atleta'}, seu coach acabou de atualizar sua planilha. Bora treinar!`,
            data: { workoutId: workout.id }, // Dados extras se quiser navegar direto depois
        }];

        // 3. Envia (sem travar a resposta da API se der erro)
        try {
            await expo.sendPushNotificationsAsync(messages);
            console.log("Notificação enviada para", user.name);
        } catch (pushError) {
            console.error("Erro ao enviar push:", pushError);
        }
    }
    // ------------------------------------------

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro POST workout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}