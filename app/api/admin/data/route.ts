// app/api/admin/data/route.ts
// 🔒 AGORA COM ISOLAMENTO MULTI-TENANT:
//   - MASTER (Paulo/Adri, role ADMIN): vê tudo (comportamento original, toggle PAULO/ADRI funciona)
//   - COACH (role COACH): vê APENAS os alunos amarrados a ele (coachId ou nutritionistId),
//     apenas os logs dos alunos dele, e a biblioteca de exercícios dele + a do master (herança)

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const ADRI_EMAIL = 'adri.personal@hotmail.com';

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
        select: { id: true, email: true, role: true, accountStatus: true } as any,
    });

    if (!requester || !['ADMIN', 'COACH'].includes(requester.role)) {
        return NextResponse.json({ error: "Acesso não autorizado" }, { status: 403 });
    }

    // Coach pendente/recusado não acessa dados
    if (requester.role === 'COACH' && (requester as any).accountStatus !== 'ACTIVE') {
        return NextResponse.json({ error: "Conta aguardando aprovação" }, { status: 403 });
    }

    const isMasterAdmin = requester.role === 'ADMIN';

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

    // 🔒 2. FILTRO DE ALUNOS POR PAPEL
    // Master: todos (comportamento original). Coach: só os alunos DELE.
    const userWhere: any = isMasterAdmin
        ? undefined
        : {
            OR: [
                { coachId: adminId },
                { nutritionistId: adminId },
            ],
          };

    const rawUsers = await prisma.user.findMany({
      where: userWhere,
      orderBy: { name: 'asc' },
      select: querySelect
    });

    const finalUsers = rawUsers.filter((u: any) => 
        u.id !== adminId && 
        u.role !== 'ADMIN' && 
        u.role !== 'COACH' &&
        u.email !== ADRI_EMAIL
    );

    const activeUsers = finalUsers.filter((u: any) => u.active !== false);
    const inactiveUsers = finalUsers.filter((u: any) => u.active === false);

    // 🔒 3. FEED DE ATIVIDADES: coach só vê logs dos alunos dele
    const recentLogs = await prisma.workoutHistory.findMany({
      where: isMasterAdmin
          ? undefined
          : { user: { OR: [ { coachId: adminId }, { nutritionistId: adminId } ] } },
      take: 50, 
      orderBy: { date: 'desc' },
      include: { user: { select: { id: true, name: true, photoUrl: true, coachId: true } } } 
    });

    // 🔒 4. BIBLIOTECA DE EXERCÍCIOS
    // - Master Paulo: só os dele (original)
    // - Adri: os dela + herança do Paulo (original)
    // - Coach novo: os dele + herança do Paulo (biblioteca padrão do sistema,
    //   senão ele começa com biblioteca vazia)
    const isAdri = requester.email?.toLowerCase() === ADRI_EMAIL;
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
        // 🔒 Papel do solicitante — o front usa para esconder o toggle PAULO/ADRI
        requesterRole: requester.role,
    });

  } catch (error) {
    console.error("ERRO ADMIN:", error);
    return NextResponse.json({ error: "Erro ao carregar dados admin" }, { status: 500 });
  }
}