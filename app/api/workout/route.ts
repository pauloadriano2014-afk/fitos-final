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

    // --- CENÁRIO 1: DETALHES DO TREINO ---
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

        // 1. Busca histórico recente (Últimos 10 treinos)
        // NÃO filtramos por workoutId aqui porque a coluna não existe no schema
        const history = await prisma.workoutHistory.findMany({
            where: { userId },
            orderBy: { date: 'desc' },
            take: 20,
            include: { details: true }
        });

        // 🔥 2. LÓGICA DE DETETIVE NO BACKEND 🔥
        // Vamos descobrir qual foi o último dia feito lendo os nomes
        let calculatedLastLog = null;

        for (const log of history) {
            const name = (log.workoutName || log.name || "").toUpperCase();
            
            // Procura padrões como "TREINO A", "TREINO B" ou apenas "A", "B" se estiver isolado
            // Regex procura a letra A-F
            const match = name.match(/TREINO\s+([A-F])/i) || name.match(/\b([A-F])\b/i);
            
            if (match) {
                // Achamos! Ex: O cara fez o "TREINO B" ontem.
                calculatedLastLog = {
                    day: match[1].toUpperCase(), // "B"
                    date: log.date
                };
                break; // Para no primeiro que achar (o mais recente)
            }
            
            // Fallback para nomes mapeados (Ex: "PERNAS" -> C)
            if (name.includes('SUPERIORES')) { calculatedLastLog = { day: 'A', date: log.date }; break; }
            if (name.includes('COSTAS')) { calculatedLastLog = { day: 'B', date: log.date }; break; }
            if (name.includes('PERNAS')) { calculatedLastLog = { day: 'C', date: log.date }; break; }
        }

        // Mapeia pesos (Lógica antiga mantida)
        const lastWeightsMap: any = {};
        if (history.length > 0) {
            history.slice().reverse().forEach(h => { // slice para não mutar o array original
                h.details.forEach(d => {
                    if (!lastWeightsMap[d.exerciseId]) lastWeightsMap[d.exerciseId] = {};
                    lastWeightsMap[d.exerciseId][d.setNumber] = d.weight;
                });
            });
        }

        return NextResponse.json({ 
            ...workout, 
            lastWeights: lastWeightsMap,
            lastLog: calculatedLastLog // <--- Agora enviamos o dia calculado (ex: { day: 'A' })
        });
    }

    // --- CENÁRIO 2: LISTA DE TREINOS ---
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

// POST: Mantive igual ao original
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