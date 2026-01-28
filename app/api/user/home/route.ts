import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    // 1. Busca Usuário (XP e Nome)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, currentXP: true, plan: true }
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 2. Busca Treino Ativo (O último criado que não está arquivado)
    const activeWorkout = await prisma.workout.findFirst({
      where: { userId: userId, archived: false },
      orderBy: { createdAt: 'desc' },
      include: { exercises: true } // Inclui exercícios para contar quantos são
    });

    // 3. Busca Último Histórico (Para saber qual letra sugerir: A, B, C...)
    const lastLog = await prisma.workoutHistory.findFirst({
      where: { userId: userId },
      orderBy: { date: 'desc' }
    });

    // Lógica simples de sugestão (Se fez A, sugere B. Se fez último, volta pro A)
    let nextDay = 'A';
    if (lastLog && activeWorkout) {
        // Pega as letras disponíveis no treino (Ex: ['A', 'B', 'C'])
        const days = Array.from(new Set(activeWorkout.exercises.map(e => e.day))).sort();
        
        // Descobre qual foi a letra do último treino logado (Ex: "Treino de Hipertrofia - Dia A")
        const lastDayChar = lastLog.workoutName.split('Dia ')[1]?.trim(); 
        
        if (lastDayChar && days.includes(lastDayChar)) {
            const currentIndex = days.indexOf(lastDayChar);
            const nextIndex = (currentIndex + 1) % days.length; // Loop: A -> B -> C -> A
            nextDay = days[nextIndex];
        }
    }

    return NextResponse.json({
      user,
      activeWorkout: activeWorkout ? {
          id: activeWorkout.id,
          name: activeWorkout.name,
          totalExercises: activeWorkout.exercises.length,
          suggestedDay: nextDay
      } : null,
      lastWorkoutDate: lastLog?.date || null
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao carregar Home" }, { status: 500 });
  }
}