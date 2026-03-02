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

// 🔥 NOVO POST: SEMPRE CRIA UM TREINO NOVO E IGNORA FANTASMAS 🔥
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

    // 1. CRIAMOS UM TREINO NOVO ZERADO (Sem mesclar com o antigo)
    const workout = await prisma.workout.create({
      data: { 
          userId, 
          name: name || "Planejamento Atual", 
          level: "Personalizado",
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null
      }
    });

    // 2. ESCUDO ANTI-CORRUPÇÃO (Filtramos IDs fantasmas/excluídos antes de salvar)
    if (exercises && exercises.length > 0) {
      const incomingIds = exercises.map((ex: any) => ex.exerciseId);
      
      const validExercises = await prisma.exercise.findMany({
        where: { id: { in: incomingIds } },
        select: { id: true }
      });
      const validIds = validExercises.map(e => e.id);

      const exercisesToCreate = exercises
        .filter((ex: any) => validIds.includes(ex.exerciseId)) // Só deixa passar os reais
        .map((ex: any) => ({
          workoutId: workout.id, // Amarra ao treino novo que acabamos de criar
          exerciseId: ex.exerciseId,
          day: ex.day,
          sets: Number(ex.sets) || 0,
          reps: String(ex.reps),
          restTime: Number(ex.restTime) || 0,
          technique: ex.technique || "",
          order: ex.order || 0,
          observation: ex.observation || "",
          substituteId: ex.substituteId || null 
        }));

      if (exercisesToCreate.length > 0) {
          await prisma.workoutExercise.createMany({
              data: exercisesToCreate
          });
      }
    }

    // Notificação (Intacta)
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
