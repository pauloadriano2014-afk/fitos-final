import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "UserId required" }, { status: 400 });

    // 1. Busca Usuário (Incluindo colunas de Check-in para o semáforo)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        name: true, 
        currentXP: true, 
        plan: true,
        nextCheckInDate: true, // 🔥 Crucial para a Home saber a data
        disableCheckIn: true   // 🔥 Crucial para a Home saber se deve cobrar
      }
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 2. Busca Treino Ativo
    const activeWorkout = await prisma.workout.findFirst({
      where: { userId: userId, archived: false }, 
      orderBy: { createdAt: 'desc' },
      include: { exercises: true } 
    });

    // 3. Busca Último Histórico
    const lastLog = await prisma.workoutHistory.findFirst({
      where: { userId: userId },
      orderBy: { date: 'desc' }
    });

    // Lógica de sugestão de próximo dia (A, B, C...)
    let nextDay = 'A';
    
    if (lastLog && activeWorkout && activeWorkout.exercises.length > 0) {
        const days = Array.from(new Set(activeWorkout.exercises.map(e => e.day))).sort() as string[];
        const safeWorkoutName = lastLog.workoutName || ""; 
        
        let lastDayChar = null;
        if (safeWorkoutName.includes('Dia ')) {
            const parts = safeWorkoutName.split('Dia ');
            if (parts.length > 1) {
                lastDayChar = parts[1].trim();
            }
        }
        
        if (lastDayChar && days.includes(lastDayChar)) {
            const currentIndex = days.indexOf(lastDayChar);
            const nextIndex = (currentIndex + 1) % days.length;
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

  } catch (error: any) {
    console.error("ERRO CRÍTICO NA HOME:", error);
    return NextResponse.json({ 
        error: "Erro ao carregar Home", 
        details: error.message 
    }, { status: 500 });
  }
}