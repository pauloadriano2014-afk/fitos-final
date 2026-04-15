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
        dietModule: true, // 🔥 CHAVE DO MÓDULO DE DIETA
        goal: true,
        level: true,
        // 🔥 Carrega a anamnese mais recente
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        // 🔥 Carrega o treino vigente
        workouts: {
          where: { archived: false },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        // 🔥 Carrega a dieta ativa com as refeições e alimentos
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

// 👇 ATUALIZA DADOS DO ALUNO PELO PAINEL ADMIN
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

// 👇 EXCLUIR ALUNO
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;
    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro DELETE Admin User:", error);
    return NextResponse.json({ error: "Erro ao excluir usuário" }, { status: 500 });
  }
}