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

    // 2. Busca Treino Ativo
    // NOTA: Se seu banco usa 'archived', mantenha assim. Se der erro, troque para 'archive'
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

    // Lógica de sugestão BLINDADA 🛡️
    let nextDay = 'A';
    
    if (lastLog && activeWorkout && activeWorkout.exercises.length > 0) {
        // Pega as letras disponíveis (A, B, C...)
        const days = Array.from(new Set(activeWorkout.exercises.map(e => e.day))).sort();
        
        // 🛡️ CORREÇÃO DO CRASH AQUI:
        // Garante que workoutName existe. Se for null, vira string vazia "".
        const safeWorkoutName = lastLog.workoutName || ""; 
        
        // Tenta extrair a letra apenas se o nome tiver o formato esperado
        let lastDayChar = null;
        if (safeWorkoutName.includes('Dia ')) {
            const parts = safeWorkoutName.split('Dia ');
            if (parts.length > 1) {
                lastDayChar = parts[1].trim();
            }
        }
        
        // Se achou a letra e ela existe no treino atual, calcula a próxima
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
    console.error("ERRO CRÍTICO NA HOME:", error);
    // Retorna JSON de erro limpo para não travar o app com tela branca
    return NextResponse.json({ 
        error: "Erro ao carregar Home", 
        details: error.message 
    }, { status: 500 });
  }
}