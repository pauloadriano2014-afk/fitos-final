// app/api/admin/user/[id]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 👇 BUSCA DADOS CIRÚRGICOS DO ALUNO (USADO NO RAIO-X DO ADMIN)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

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
        runningModule: true, // 🏃
        goal: true,
        level: true,

        // 🔥 GESTÃO FINANCEIRA E CONTRATOS
        contractType: true,
        contractValue: true,
        paymentDueDate: true,
        nextWorkoutUpdate: true,

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
// Aceita qualquer campo do User diretamente no body — incluindo runningModule, dietModule, etc.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const userId = params.id;

    const user = await prisma.user.update({
      where: { id: userId },
      data: body
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

    const user = await prisma.user.update({
      where: { id: userId },
      data: body
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
    if (!id) return NextResponse.json({ error: "User ID is required" }, { status: 400 });

    await prisma.user.delete({
      where: { id: id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao apagar utilizador:", error);
    return NextResponse.json({ error: "Falha ao eliminar utilizador." }, { status: 500 });
  }
}