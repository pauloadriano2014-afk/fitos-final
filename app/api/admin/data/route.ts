// app/api/admin/data/route.ts
// 🔒 COM ISOLAMENTO MULTI-TENANT (MURALHA BIDIRECIONAL ABSOLUTA):
//   - MASTER (Paulo/Adri): vê APENAS os seus próprios alunos ou alunos globais (sem coach).
//   - COACH (Parceiro): vê APENAS os alunos amarrados a ele (coachId ou nutritionistId).
//   - BIBLIOTECA DE EXERCÍCIOS: Parceiros herdam a base do Master para não recadastrar exercícios do zero.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const ADRI_EMAIL = 'adri.personal@hotmail.com';

// 🔥 IDs MASTER PARA BLINDAGEM DO DASHBOARD
const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3'  // Adri
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId'); 

    if (!adminId) {
        return NextResponse.json({ error: "ID do admin não fornecido" }, { status: 400 });
    }

    // 🔒 1. IDENTIFICA QUEM ESTÁ PEDINDO (papel define o que pode ver)
    const requester = await prisma.user.findUnique({
        where: { id: adminId },
        select: { id: true, email: true, role: true, accountStatus: true },
    });

    if (!requester || !['ADMIN', 'COACH'].includes(requester.role)) {
        return NextResponse.json({ error: "Acesso não autorizado" }, { status: 403 });
    }

    // Coach pendente/recusado não acessa dados
    if (requester.role === 'COACH' && requester.accountStatus !== 'ACTIVE') {
        return NextResponse.json({ error: "Conta aguardando aprovação" }, { status: 403 });
    }

    const isMasterAdmin = MASTER_IDS.includes(adminId);

    const querySelect: any = {
        id: true,
        name: true,
        email: true,
        phone: true,          
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
        isMenstruating: true,

        // 🔥 CAMPOS DO NOVO SISTEMA DE ACOMPANHAMENTO 🔥
        strategyNotes: true,
        lastContactDate: true,

        // 🔥 FINANÇAS 🔥
        contractType: true,
        contractValue: true,
        paymentDueDate: true,
        nextWorkoutUpdate: true,
        financeCategory: true,
        isFinanceActive: true,

        // 🔥 SISTEMA DE "JÁ PAGUEI" (CLAIM DE PAGAMENTO)
        paymentClaimedAt: true,
        paymentClaimStatus: true,
        paymentClaimCycleDueDate: true,

        workouts: {
            where: { archived: false },
            orderBy: { createdAt: 'desc' }, 
            take: 1,
            select: { 
                id: true, 
                endDate: true, 
                name: true, 
                intensityMultiplier: true
            }
        },
        _count: {
            select: {
                checkIns: {
                    where: { coachFeedback: null }
                }
            }
        }
    };

    // 🔒 2. FILTRO DE ALUNOS POR PAPEL (A MURALHA)
    let userWhere: any = {};
    
    if (isMasterAdmin) {
        // Master não vê aluno de Coach Parceiro. Vê apenas os seus e os sem dono.
        userWhere = {
            OR: [
                { coachId: null },
                { coachId: { in: MASTER_IDS } }
            ]
        };
    } else {
        // Parceiro vê apenas os seus
        userWhere = {
            OR: [
                { coachId: adminId },
                { nutritionistId: adminId },
            ]
        };
    }

    const rawUsers = await prisma.user.findMany({
      where: userWhere,
      orderBy: { name: 'asc' },
      select: querySelect
    });

    const finalUsers = rawUsers.filter((u: any) => 
        !MASTER_IDS.includes(u.id) && 
        u.id !== adminId && 
        u.role !== 'ADMIN' && 
        u.role !== 'COACH' &&
        u.email !== ADRI_EMAIL
    );

    const activeUsers = finalUsers.filter((u: any) => u.active !== false);
    const inactiveUsers = finalUsers.filter((u: any) => u.active === false);

    // 🔒 3. FEED DE ATIVIDADES: muralha aplicada aos logs
    let logsWhere: any = {};
    if (isMasterAdmin) {
        logsWhere = {
            user: {
                OR: [
                    { coachId: null },
                    { coachId: { in: MASTER_IDS } }
                ]
            }
        };
    } else {
        logsWhere = {
            user: {
                OR: [
                    { coachId: adminId },
                    { nutritionistId: adminId }
                ]
            }
        };
    }

    const recentLogs = await prisma.workoutHistory.findMany({
      where: logsWhere,
      take: 50, 
      orderBy: { date: 'desc' },
      include: { user: { select: { id: true, name: true, photoUrl: true, coachId: true } } } 
    });

    // 🔒 4. BIBLIOTECA DE EXERCÍCIOS
    // - Parceiros e Adri herdam os exercícios básicos do Paulo para não recadastrar do zero
    const isAdri = (requester.email || '').toLowerCase() === ADRI_EMAIL;
    let exerciseWhere: any = { coachId: adminId };

    if (isAdri || !isMasterAdmin) {
        const masterAdmin = await prisma.user.findFirst({
            where: { role: 'ADMIN', email: { not: ADRI_EMAIL } },
            select: { id: true }
        });
        
        if (masterAdmin) {
            exerciseWhere = {
                OR: [
                    { coachId: adminId },
                    { coachId: masterAdmin.id }
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
        exercises,
        requesterRole: requester.role,
    });

  } catch (error) {
    console.error("ERRO ADMIN:", error);
    return NextResponse.json({ error: "Erro ao carregar dados admin" }, { status: 500 });
  }
}