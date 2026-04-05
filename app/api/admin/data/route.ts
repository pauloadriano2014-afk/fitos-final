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

    // 🔥 CORTA-FOGO: Arranquei o filtro "role". Agora puxa absolutamente todos vinculados a você ou sem dono!
    const rawUsers = await prisma.user.findMany({
      where: { 
          OR: [
              { coachId: adminId },
              { coachId: null }
          ]
      },
      orderBy: { name: 'asc' },
      select: querySelect
    });

    // Filtra apenas para remover VOCÊ MESMO da lista de alunos
    const finalUsers = rawUsers.filter((u: any) => u.id !== adminId);

    const activeUsers = finalUsers.filter((u: any) => u.active !== false);
    const inactiveUsers = finalUsers.filter((u: any) => u.active === false);

    const recentLogs = await prisma.workoutHistory.findMany({
      where: { 
          user: { 
              OR: [
                  { coachId: adminId },
                  { coachId: null }
              ] 
          } 
      },
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true, photoUrl: true } } } 
    });

    const exercises = await prisma.exercise.findMany({
        where: { 
            OR: [
                { coachId: adminId },
                { coachId: null }
            ]
        }, 
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