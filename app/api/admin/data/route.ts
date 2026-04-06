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

    // Mantemos a otimização de não trazer as anamneses aqui para não pesar, mas trazemos as infos base.
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
        workouts: {
            where: { archived: false },
            orderBy: { createdAt: 'desc' }, 
            take: 1,
            select: { id: true, endDate: true, name: true }
        }
    };

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

    const finalUsers = rawUsers.filter((u: any) => 
        u.id !== adminId && 
        u.role !== 'ADMIN' && 
        u.email !== 'adri.personal@hotmail.com'
    );

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

    // 🔥 O RESGATE: Trazemos de volta a sua biblioteca de exercícios para o app não travar!
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
        exercises // <- De volta ao seu devido lugar
    });

  } catch (error) {
    console.error("ERRO ADMIN:", error);
    return NextResponse.json({ error: "Erro ao carregar dados admin" }, { status: 500 });
  }
}