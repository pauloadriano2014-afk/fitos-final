// app/api/admin/data/route.ts
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

    const rawUsers = await prisma.user.findMany({
      where: { 
          role: 'USER',
          coachId: adminId 
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan_tier: true,
        currentWeight: true,
        nextCheckInDate: true,
        pushToken: true,
        coachId: true,
        active: true, // Garante que traz o status
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, createdAt: true }
        },
        assessments: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { id: true, date: true, weight: true }
        }
      }
    });

    // 🔥 GAVETAS SEPARADAS: Ativos vs Inativos
    const activeUsers = rawUsers.filter((u: any) => u.active === true);
    const inactiveUsers = rawUsers.filter((u: any) => u.active === false);

    const recentLogs = await prisma.workoutHistory.findMany({
      where: { user: { coachId: adminId } },
      take: 5,
      orderBy: { date: 'desc' },
      include: { user: { select: { name: true } } }
    });

    const exercises = await prisma.exercise.findMany({
        where: { coachId: adminId }, 
        orderBy: { name: 'asc' }
    });

    return NextResponse.json({ 
        activeUsers, // Agora mandamos listas separadas
        inactiveUsers,
        recentLogs, 
        exercises 
    });

  } catch (error) {
    console.error("ERRO ADMIN:", error);
    return NextResponse.json({ error: "Erro ao carregar dados admin" }, { status: 500 });
  }
}