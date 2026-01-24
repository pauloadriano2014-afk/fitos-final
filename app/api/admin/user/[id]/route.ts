import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 👇 ESTA É A FUNÇÃO QUE FALTAVA (GET)
// Ela busca os dados do aluno e a anamnese para mostrar no Admin
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        // Traz a anamnese mais recente para verificar limitações
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        // Traz o histórico de treinos se precisar
        workouts: {
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

// ---------------------------------------------------------
// SUAS FUNÇÕES ORIGINAIS (MANTIDAS)
// ---------------------------------------------------------

// PATCH: Atualizar (Inativar/Ativar)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { active } = await req.json();
    const userId = params.id;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { active }
    });

    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}

// DELETE: Excluir Aluno
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