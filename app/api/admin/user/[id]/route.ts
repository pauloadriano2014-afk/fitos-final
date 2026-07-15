// app/api/admin/user/[id]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🔥 IDs MASTER PARA BLINDAGEM DO RAIO-X
const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3'  // Adri
];

// 🔥 FUNÇÃO DE MURALHA: Verifica se o Admin é dono deste Aluno
async function checkOwnership(userId: string, adminId: string | null) {
    if (!adminId) return false; 
    if (MASTER_IDS.includes(adminId)) return true; // Master pode tudo
    
    const targetUser = await prisma.user.findUnique({ 
        where: { id: userId }, 
        select: { coachId: true, nutritionistId: true } 
    });
    
    if (!targetUser) return false;
    return targetUser.coachId === adminId || targetUser.nutritionistId === adminId;
}

// 👇 BUSCA DADOS CIRÚRGICOS DO ALUNO (USADO NO RAIO-X DO ADMIN E NO MERGE DO useHomeData)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    // 🔥 BLOQUEIO DE SEGURANÇA
    if (adminId) {
        const isOwner = await checkOwnership(userId, adminId);
        if (!isOwner) return NextResponse.json({ error: "Acesso não autorizado a este aluno." }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        gender: true,
        strategyNotes: true,
        lastContactDate: true,
        weeklyChecks: true,
        phone: true,
        photoUrl: true,
        role: true,
        plan: true,
        active: true,
        currentWeight: true,
        currentXP: true,
        nextCheckInDate: true,
        evaluationUrl: true,
        disableCheckIn: true,
        dietGoal: true,
        dietModule: true,
        runningModule: true, 
        goal: true,
        level: true,

        // 🔑 CÓDIGO DE CONVITE DO COACH (usado no AdminInviteModal para
        // montar o link /registro?coach=... — sem isso o front recebia
        // undefined mesmo com o valor preenchido no banco)
        inviteCode: true,
        accountStatus: true,

        // 🔥 GESTÃO FINANCEIRA E CONTRATOS
        contractType: true,
        contractValue: true,
        paymentDueDate: true,
        isFinanceActive: true, 
        nextWorkoutUpdate: true,

        // 🔥 SISTEMA DE "JÁ PAGUEI" (CLAIM DE PAGAMENTO)
        paymentClaimedAt: true,
        paymentClaimStatus: true,
        paymentClaimCycleDueDate: true,

        // 🔥 CICLO MENSTRUAL
        isMenstruating: true,
        menstruationStartDate: true,

        // 🔥 Anamnese mais recente
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        // 🔥 Treino vigente
        workouts: {
          where: { archived: false },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        // 🔥 Dieta ativa
        diets: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            meals: {
              orderBy: { order: 'asc' },
              include: {
                items: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    return NextResponse.json(user);

  } catch (error) {
    console.error("Erro GET Admin User ID:", error);
    return NextResponse.json({ error: "Erro ao buscar usuário" }, { status: 500 });
  }
}

// 👇 ATUALIZA DADOS DO ALUNO PELO PAINEL ADMIN (PATCH)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const userId = params.id;
    const { adminId } = body; // Puxa o adminId do corpo da requisição

    // 🔥 BLOQUEIO DE SEGURANÇA
    if (adminId) {
        const isOwner = await checkOwnership(userId, adminId);
        if (!isOwner) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
    }

    // Remove o adminId do body para não tentar salvar na tabela do aluno
    const dataToUpdate = { ...body };
    delete dataToUpdate.adminId;

    const user = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erro PATCH Admin User:", error);
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}

// 🔥 PUT COM AUTOMAÇÃO DE DELOAD (menstruação)
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const userId = params.id;
    const { adminId } = body;

    // 🔥 BLOQUEIO DE SEGURANÇA
    if (adminId) {
        const isOwner = await checkOwnership(userId, adminId);
        if (!isOwner) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
    }

    const dataToUpdate = { ...body };
    delete dataToUpdate.adminId;

    const user = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate
    });

    if (body.isMenstruating === true) {
      const deloadEnd = new Date();
      deloadEnd.setDate(deloadEnd.getDate() + 5);

      await prisma.workout.updateMany({
        where: { userId: userId, archived: false },
        data: {
          intensityMultiplier: 0.8,
          intensityEndDate: deloadEnd
        }
      });
    } else if (body.isMenstruating === false) {
      await prisma.workout.updateMany({
        where: { userId: userId, archived: false },
        data: {
          intensityMultiplier: 1.0,
          intensityEndDate: null
        }
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erro PUT Admin User com Automação:", error);
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}

// 🔥 DELETE — EXCLUSÃO PERMANENTE DO ALUNO
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    if (!id) return NextResponse.json({ error: "User ID is required" }, { status: 400 });

    // 🔥 BLOQUEIO DE SEGURANÇA EXTREMA (Exclusão)
    if (adminId) {
        const isOwner = await checkOwnership(id, adminId);
        if (!isOwner) return NextResponse.json({ error: "Apenas o Coach responsável pode apagar este aluno." }, { status: 403 });
    }

    await prisma.user.delete({
      where: { id: id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao apagar utilizador:", error);
    return NextResponse.json({ error: "Falha ao eliminar utilizador." }, { status: 500 });
  }
}