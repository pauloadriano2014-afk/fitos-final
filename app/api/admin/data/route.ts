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
        plan_tier: true,
        currentWeight: true,
        nextCheckInDate: true, 
        pushToken: true,
        coachId: true,
        active: true, 
        
        // 🔥 AQUI ESTAVA O SEGREDO! Isso obriga o servidor a mandar a foto pro Dashboard 🔥
        photoUrl: true, 

        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        assessments: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { id: true, date: true, weight: true }
        },
        workouts: {
            where: { archived: false },
            orderBy: { createdAt: 'desc' }, 
            take: 1,
            select: { id: true, endDate: true, name: true }
        }
    };

    const rawUsers = await prisma.user.findMany({
      where: { 
          role: 'USER',
          coachId: adminId 
      },
      orderBy: { name: 'asc' },
      select: querySelect
    });

    const activeUsers = rawUsers.filter((u: any) => u.active !== false);
    const inactiveUsers = rawUsers.filter((u: any) => u.active === false);

    const recentLogs = await prisma.workoutHistory.findMany({
      where: { user: { coachId: adminId } },
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true, photoUrl: true } } }
    });

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