// app/api/workout/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { Expo } from 'expo-server-sdk';

const prisma = new PrismaClient();
const expo = new Expo();
export const dynamic = 'force-dynamic';

// 🔥 IDs MASTER PARA BLINDAGEM DA TELA DE TREINOS
const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3'  // Adri
];

// 🔥 FUNÇÃO DE MURALHA: Verifica se o Coach é dono deste Aluno
async function checkUserOwnership(userId: string, adminId: string | null) {
    if (!adminId) return false; 
    if (MASTER_IDS.includes(adminId)) return true; // Master tem passe livre
    
    const targetUser = await prisma.user.findUnique({ 
        where: { id: userId }, 
        select: { coachId: true, nutritionistId: true } 
    });
    
    if (!targetUser) return false;
    return targetUser.coachId === adminId || targetUser.nutritionistId === adminId;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const workoutId = searchParams.get('workoutId'); 
    const adminId = searchParams.get('adminId'); // 🔥 Pega quem está pedindo (Painel Admin)

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    // 🔥 BLOQUEIO DE SEGURANÇA (MURALHA): Se a requisição vier do painel admin, checa a posse
    if (adminId) {
        const isOwner = await checkUserOwnership(userId, adminId);
        if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Aluno não pertence a você." }, { status: 403 });
    }

    // 🔥 O SEGREDO ESTÁ AQUI: Buscamos o dicionário de exercícios para traduzir as IDs em Nomes 🔥
    const allExercises = await prisma.exercise.findMany({
        select: { id: true, name: true, videoUrl: true }
    });

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

        // 🔥 TRADUÇÃO DOS SUBSTITUTOS PARA O TREINO ESPECÍFICO 🔥
        const populatedExercises = workout.exercises.map((ex: any) => {
            const mappedSubs = (ex.substitutes || []).map((subId: string) => {
                const found = allExercises.find(e => e.id === subId);
                return found ? { id: found.id, name: found.name, videoUrl: found.videoUrl } : null;
            }).filter(Boolean);

            return { ...ex, substitutes: mappedSubs };
        });

        return NextResponse.json({ 
            ...workout, 
            exercises: populatedExercises, 
            lastWeights: lastWeightsMap,
            lastLog: calculatedLastLog 
        });
    }

    const workouts = await prisma.workout.findMany({
        where: { userId: userId },
        orderBy: { createdAt: 'desc' },
        include: { 
            exercises: { 
                include: { exercise: true, substitute: true },
                orderBy: { order: 'asc' } 
            } 
        }
    });

    // 🔥 TRADUÇÃO PARA A LISTA GERAL DE TREINOS 🔥
    const populatedWorkouts = workouts.map(w => {
        return {
            ...w,
            exercises: w.exercises.map((ex: any) => {
                const mappedSubs = (ex.substitutes || []).map((subId: string) => {
                    const found = allExercises.find(e => e.id === subId);
                    return found ? { id: found.id, name: found.name, videoUrl: found.videoUrl } : null;
                }).filter(Boolean);
                return { ...ex, substitutes: mappedSubs };
            })
        };
    });

    return NextResponse.json(populatedWorkouts);

  } catch (error) {
    console.error("Erro GET workout:", error);
    return NextResponse.json({ error: "Erro ao buscar treino" }, { status: 500 });
  }
}

// 🔥 NOVA ROTA: PILOTO AUTOMÁTICO (MINI-ANAMNESE)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Se a requisição vier do Setup Automático (App do Aluno)
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
        const workout = await prisma.workout.create({
            data: {
                userId,
                name: `PROTOCOLO: ${focus.toUpperCase()}`,
                goal: goal,
                level: level,
                workoutModel: "CARGA", 
                startDate: new Date(),
                isVisible: true
            }
        });

        return NextResponse.json({ success: true, workoutId: workout.id });
    }

    // Lógica original de criação manual do Admin
    const { userId, name, exercises, startDate, endDate, archiveCurrent, workoutModel, intensityMultiplier, intensityEndDate, adminId } = body;

    // 🔥 BLOQUEIO DE SEGURANÇA NA CRIAÇÃO (Painel Admin)
    if (adminId) {
        const isOwner = await checkUserOwnership(userId, adminId);
        if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Aluno não pertence a você." }, { status: 403 });
    }

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
          workoutModel: workoutModel || "CARGA", 
          intensityMultiplier: intensityMultiplier !== undefined ? parseFloat(intensityMultiplier) : 1.0,
          intensityEndDate: intensityEndDate ? new Date(intensityEndDate) : null,
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
          if (ex.substitutes && Array.isArray(ex.substitutes)) {
              ex.substitutes.forEach((subId: string) => allIds.push(subId));
          }
      });
      
      const validExercises = await prisma.exercise.findMany({
        where: { id: { in: allIds } },
        select: { id: true }
      });
      const validIds = validExercises.map(e => e.id);

      const exercisesToCreate = exercises
        .filter((ex: any) => validIds.includes(ex.exerciseId)) 
        .map((ex: any, index: number) => {
            const validSubstitutes = Array.isArray(ex.substitutes) 
                ? ex.substitutes.filter((id: string) => validIds.includes(id)) 
                : [];

            return {
                workoutId: workout.id, 
                exerciseId: ex.exerciseId,
                day: ex.day,
                sets: Number(ex.sets) || 0,
                reps: String(ex.reps),
                restTime: Number(ex.restTime) || 0,
                technique: ex.technique || "",
                order: index, 
                observation: ex.observation || "",
                substituteId: (ex.substituteId && validIds.includes(ex.substituteId)) ? ex.substituteId : null,
                substitutes: validSubstitutes 
            };
        });

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
    const { id, archived, adminId } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    // 🔥 BLOQUEIO DE SEGURANÇA NO ARQUIVAMENTO
    if (adminId) {
        const workoutTarget = await prisma.workout.findUnique({ where: { id }, select: { userId: true } });
        if (workoutTarget) {
            const isOwner = await checkUserOwnership(workoutTarget.userId, adminId);
            if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Treino não pertence ao seu aluno." }, { status: 403 });
        }
    }

    const updated = await prisma.workout.update({ where: { id }, data: { archived } });
    return NextResponse.json({ success: true, updated });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, archived, adminId } = body;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    // 🔥 BLOQUEIO DE SEGURANÇA NA ATUALIZAÇÃO
    if (adminId) {
        const workoutTarget = await prisma.workout.findUnique({ where: { id }, select: { userId: true } });
        if (workoutTarget) {
            const isOwner = await checkUserOwnership(workoutTarget.userId, adminId);
            if (!isOwner) return NextResponse.json({ error: "Acesso Negado: Treino não pertence ao seu aluno." }, { status: 403 });
        }
    }

    const updated = await prisma.workout.update({ where: { id }, data: { archived } });
    return NextResponse.json({ success: true, updated });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}