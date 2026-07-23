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
        nextCheckInDate: true, 
        disableCheckIn: true,
        anamnesePendente: true,

        // 🔥 FINANCEIRO
        paymentDueDate: true,
        isFinanceActive: true,
        paymentClaimedAt: true,
        paymentClaimStatus: true,
        paymentClaimCycleDueDate: true,

        // 🔥 CAMPOS DE RELAÇÃO DO COACH
        coachId: true,
        nutritionistId: true,
        coach: {
            select: {
                brandLogoUrl: true,
                brandLogoSize: true
            }
        }
      }
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 🔥 GARANTIA ABSOLUTA DA LOGO 🔥
    // Se o aluno não tiver logo (ex: cadastro antigo sem coachId), puxamos o ID Master na marra
    let finalLogo = user.coach?.brandLogoUrl;
    let finalSize = user.coach?.brandLogoSize;

    if (!finalLogo) {
        const masterId = user.coachId || user.nutritionistId || '3c82f763-66b4-48da-836e-16817d4f57c0';
        const master = await prisma.user.findUnique({
            where: { id: masterId },
            select: { brandLogoUrl: true, brandLogoSize: true }
        });
        finalLogo = master?.brandLogoUrl || null;
        finalSize = master?.brandLogoSize || 220;
    }

    // Coloca a logo exatamente onde o aplicativo Mobile já está procurando
    const userWithLogo = {
        ...user,
        coach: { 
            brandLogoUrl: finalLogo, 
            brandLogoSize: finalSize 
        }
    };

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
      user: userWithLogo,
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