import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, workoutName, exercisesData, duration, rpe, feedback } = body;

    if (!userId) return NextResponse.json({ error: "User ID missing" }, { status: 400 });

    // 1. Busca histórico anterior para comparar cargas (Gamification)
    const previousHistory = await prisma.workoutHistory.findFirst({
      where: { userId, name: workoutName },
      orderBy: { date: 'desc' },
      include: { details: true }
    });

    let xpBase = 150; // XP por ir treinar
    let xpBonus = 0;
    let progressionCount = 0;

    // 2. Calcula Progressão
    if (previousHistory && exercisesData) {
        exercisesData.forEach((currEx: any) => {
            const prevExStats = previousHistory.details.filter(d => d.exerciseId === currEx.exerciseId);
            
            if (prevExStats.length > 0 && currEx.sets) {
                const maxWeightCurrent = Math.max(...currEx.sets.map((s:any) => parseFloat(s.weight) || 0));
                const maxWeightPrev = Math.max(...prevExStats.map(s => s.weight));

                if (maxWeightCurrent > maxWeightPrev) {
                    xpBonus += 20; 
                    progressionCount++;
                }
            }
        });
    }

    const totalXp = xpBase + xpBonus;

    // 3. Salva o Histórico Novo (COM RPE E FEEDBACK)
    const history = await prisma.workoutHistory.create({
        data: {
            userId,
            name: workoutName,
            xpEarned: totalXp,
            duration: duration || 0,
            rpe: rpe ? Number(rpe) : null,
            feedback: feedback || null,
            progressions: progressionCount,
            details: {
                create: exercisesData.flatMap((ex: any) => 
                    ex.sets.map((s: any) => ({
                        exerciseId: ex.exerciseId,
                        exerciseName: ex.name,
                        setNumber: s.index,
                        weight: parseFloat(s.weight) || 0,
                        reps: String(s.reps || "0")
                    }))
                )
            }
        }
    });

    // 4. Atualiza o XP do User
    const user = await prisma.user.update({
        where: { id: userId },
        data: { 
            currentXP: { increment: totalXp } 
        }
    });

    return NextResponse.json({ 
        success: true, 
        xpGained: totalXp, 
        bonus: xpBonus,
        progressions: progressionCount,
        newTotalXP: user.currentXP
    });

  } catch (error: any) {
    console.error("Erro ao finalizar treino:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}