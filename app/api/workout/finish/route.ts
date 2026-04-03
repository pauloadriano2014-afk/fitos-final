import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, workoutName, exercisesData, duration, rpe, feedback } = body;

    if (!userId) return NextResponse.json({ error: "User ID missing" }, { status: 400 });

    // Função auxiliar para limpar peso (troca virgula por ponto e garante numero)
    const cleanWeight = (val: any) => {
        if (!val) return 0;
        const strVal = String(val).replace(',', '.');
        return parseFloat(strVal) || 0;
    };

    let xpBase = 150; 
    let xpBonus = 0;
    
    // Calcula XP Bonus (Lógica simplificada para garantir funcionamento)
    if (exercisesData && exercisesData.length > 0) {
        xpBonus = exercisesData.length * 5; // 5 XP por exercício feito
    }

    const totalXp = xpBase + xpBonus;

    // Salva Histórico
    await prisma.workoutHistory.create({
        data: {
            userId,
            name: workoutName,
            xpEarned: totalXp,
            duration: duration || 0,
            rpe: rpe ? Number(rpe) : null,
            feedback: feedback || null,
            details: {
                create: exercisesData.flatMap((ex: any) => {
                    // Pega a última série válida para registrar a carga final
                    const lastSet = ex.sets && ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : null;
                    
                    return ex.sets.map((s: any) => ({
                        exerciseId: ex.exerciseId,
                        exerciseName: ex.name,
                        setNumber: s.index,
                        weight: cleanWeight(s.weight), // <--- USO DA FUNÇÃO DE LIMPEZA
                        reps: String(s.reps || "0")
                    }));
                })
            }
        }
    });

    // Atualiza XP do Usuário e resgata dados do Treinador para Notificação
    const user = await prisma.user.update({
        where: { id: userId },
        data: { 
            currentXP: { increment: totalXp } 
        },
        include: {
            coach: { select: { pushToken: true } } // Busca o token do Coach
        }
    });

    // 🔥 DISPARO DE NOTIFICAÇÃO PARA O COACH
    try {
        if (user.coach?.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: user.coach.pushToken,
                    sound: 'default',
                    title: '🔥 Treino Concluído!',
                    body: `${user.name || 'Um aluno'} acabou de esmagar o treino ${workoutName || ''}!`,
                }),
            });
        }
    } catch (pushError) {
        console.error("Erro ao enviar push de treino finalizado:", pushError);
    }

    return NextResponse.json({ 
        success: true, 
        xpGained: totalXp, 
        newTotalXP: user.currentXP
    });

  } catch (error: any) {
    console.error("Erro finalizar:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
