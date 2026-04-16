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
        where: { userId: userId },
        orderBy: { createdAt: 'desc' },
        include: { exercises: { include: { exercise: true, substitute: true } } }
    });

    return NextResponse.json(workouts);

  } catch (error) {
    console.error("Erro GET workout:", error);
    return NextResponse.json({ error: "Erro ao buscar treino" }, { status: 500 });
  }
}

// 🔥 NOVA ROTA: PILOTO AUTOMÁTICO (MINI-ANAMNESE)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Se a requisição vier do Setup Automático
    if (body.gender && body.goal && body.focus) {
        const { userId, gender, goal, focus, level } = body;

        // 1. Cria a Anamnese básica para o aluno não ficar vazio
        await prisma.anamnese.create({
            data: {
                userId,
                peso: 0,
                altura: 0,
                objetivo: goal,
                nivel: level,
                focoPrincipal: focus,
                frequencia: 3
            }
        });

        // 2. Cria um Treino de Boas-Vindas (Coringa)
        // Isso permite que o aluno entre no app e você veja no Admin que ele já escolheu o foco.
        const workout = await prisma.workout.create({
            data: {
                userId,
                name: `PROTOCOLO: ${focus.toUpperCase()}`,
                goal: goal,
                level: level,
                workoutModel: "CARGA", // Garantia do modelo
                startDate: new Date(),
                isVisible: true
            }
        });

        // NOTA PARA O COACH: Aqui nós vamos conectar os seus WorkoutTemplates reais em breve.
        // Por enquanto, ele cria apenas o cabeçalho do treino para liberar o acesso ao app.

        return NextResponse.json({ success: true, workoutId: workout.id });
    }

    // Lógica original de criação manual do Admin (Mantida Intocada)
    // 🔥 ADICIONADO A CHAVE DE CARGA
    const { userId, name, exercises, startDate, endDate, archiveCurrent, workoutModel } = body;

    if (archiveCurrent) {
        await prisma.workout.updateMany({
            where: { userId, archived: false },
            data: { archived: true }
        });
    }

    const workout = await prisma.workout.create({
      data: { 
          userId, 
          name: name || "Planejamento Atual",
          workoutModel: workoutModel || "CARGA", // 🔥 INJETANDO NO BANCO DE DADOS
          level: "Personalizado",
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null
      }
    });

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
          observation: ex.observation || "",
          substituteId: (ex.substituteId && validIds.includes(ex.substituteId)) ? ex.substituteId : null 
        }));

      if (exercisesToCreate.length > 0) {
          await prisma.workoutExercise.createMany({
              data: exercisesToCreate
          });
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Erro POST workout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, archived } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const updated = await prisma.workout.update({ where: { id }, data: { archived } });
    return NextResponse.json({ success: true, updated });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, archived } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const updated = await prisma.workout.update({ where: { id }, data: { archived } });
    return NextResponse.json({ success: true, updated });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}