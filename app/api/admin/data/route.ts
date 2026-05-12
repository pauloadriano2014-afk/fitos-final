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

    const querySelect: any = {
        id: true,
        name: true,
        email: true,
        phone: true,          // 🔥 O CAMPO QUE FALTAVA
        role: true,
        plan: true,
        plan_tier: true,
        currentXP: true,
        active: true, 
        photoUrl: true,
        nextCheckInDate: true, 
        disableCheckIn: true,  
        coachId: true,        
        nutritionistId: true, 

        // 🔥 A MÁGICA FINANCEIRA LIBERADA PARA O FRONTEND 🔥
        contractType: true,
        contractValue: true,
        paymentDueDate: true,
        nextWorkoutUpdate: true,

        // 🔥 INJETADO AQUI PARA O F5 NÃO RESSUSCITAR NINGUÉM 🔥
        financeCategory: true,
        isFinanceActive: true,

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

    // 🔥 GARGALO DO FEED E DA CEGUEIRA DE ID RESOLVIDOS
    const recentLogs = await prisma.workoutHistory.findMany({
      take: 50, 
      orderBy: { date: 'desc' },
      include: { user: { select: { id: true, name: true, photoUrl: true, coachId: true } } } 
    });

    // 🔥 LÓGICA DE HERANÇA DE EXERCÍCIOS (ESPELHO DE MÃO ÚNICA)
    const currentAdmin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { email: true }
    });
    
    const isAdri = currentAdmin?.email?.toLowerCase() === 'adri.personal@hotmail.com';
    let exerciseWhere: any = { coachId: adminId }; // Padrão de segurança: Só vê o próprio

    if (isAdri) {
        // Se for a Adri, o sistema busca o ID do Paulo (Master)
        const masterAdmin = await prisma.user.findFirst({
            where: { role: 'ADMIN', email: { not: 'adri.personal@hotmail.com' } },
            select: { id: true }
        });
        
        if (masterAdmin) {
            exerciseWhere = {
                OR: [
                    { coachId: adminId },       // Os exercícios que a Adri criar
                    { coachId: masterAdmin.id } // Os exercícios do Paulo (como modelo)
                ]
            };
        }
    }

    const exercises = await prisma.exercise.findMany({
        where: exerciseWhere,
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