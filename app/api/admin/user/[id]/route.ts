import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 👇 BUSCA DADOS CIRÚRGICOS DO ALUNO (PERFORMANCE MÁXIMA)
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
        // 🔥 CAMPOS LIBERADOS: Agora a API entrega os dados do Raio-X para o Admin
        goal: true,
        level: true,
        // 🔥 Carrega apenas a anamnese mais recente
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        // 🔥 Carrega apenas o treino vigente (não arquivado)
        workouts: {
          where: { archived: false },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    return NextResponse.json(user);

  } catch (error) {
    console.error("Erro GET User ID:", error);
    return NextResponse.json({ error: "Erro ao buscar usuário" }, { status: 500 });
  }
}

// 👇 ATUALIZA DADOS DO ALUNO (FOTO, STATUS, PDF, SETUP, ETC)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const userId = params.id;

    // O Prisma agora aceita 'goal' e 'level' pois atualizamos o schema.prisma
    const user = await prisma.user.update({
      where: { id: userId },
      data: body
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erro PATCH User:", error);
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}

// 👇 EXCLUIR ALUNO E TODOS OS SEUS VÍNCULOS
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

    await prisma.user.delete({
      where: { id: userId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro DELETE User:", error);
    return NextResponse.json({ error: "Erro ao excluir usuário" }, { status: 500 });
  }
}