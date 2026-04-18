import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId'); 

    if (!adminId) {
        return NextResponse.json({ error: "ID do admin não fornecido" }, { status: 400 });
    }

    const querySelect: any = {
        id: true,
        name: true,
        email: true,
        role: true,
        plan: true,
        plan_tier: true,
        currentXP: true,
        active: true, 
        photoUrl: true,
        nextCheckInDate: true, 
        disableCheckIn: true,  
        coachId: true,        // 🔥 NOVO: Identifica se é seu aluno ou da Adri (Treino)
        nutritionistId: true, // 🔥 NOVO: Identifica quem prescreve a dieta
        workouts: {
            where: { archived: false },
            orderBy: { createdAt: 'desc' }, 
            take: 1,
            select: { id: true, endDate: true, name: true }
        },
        _count: {
            select: {
                checkIns: {
                    where: { coachFeedback: null }
                }
            }
        }
    };

    // 🔥 MUDANÇA ELITE: Agora buscamos TODOS os alunos da base, sem travar no adminId.
    // A separação de "Meus Alunos" e "Alunos Adri" será feita visualmente lá no Frontend!
    const rawUsers = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: querySelect
    });

    const finalUsers = rawUsers.filter((u: any) => 
        u.id !== adminId && 
        u.role !== 'ADMIN' && 
        u.email !== 'adri.personal@hotmail.com'
    );

    const activeUsers = finalUsers.filter((u: any) => u.active !== false);
    const inactiveUsers = finalUsers.filter((u: any) => u.active === false);

    // 🔥 Feed Global da Equipe
    const recentLogs = await prisma.workoutHistory.findMany({
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true, photoUrl: true } } } 
    });

    // 🔥 A CIRURGIA SALVADORA MANTIDA INTACTA:
    const exercises = await prisma.exercise.findMany({
        where: { coachId: adminId }, 
        orderBy: { name: 'asc' }
    });

    return NextResponse.json({ 
        users: activeUsers, 
        activeUsers, 
        inactiveUsers,
        recentLogs, 
        exercises 
    });

  } catch (error) {
    console.error("ERRO ADMIN:", error);
    return NextResponse.json({ error: "Erro ao carregar dados admin" }, { status: 500 });
  }
}