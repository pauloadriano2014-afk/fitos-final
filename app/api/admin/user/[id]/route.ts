import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 👇 BUSCA DADOS COMPLETOS DO ALUNO
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
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
// 🔥 PATCH ATUALIZADO: SALVA FOTO, STATUS, PDF E DATA DO CHECK-IN
// ---------------------------------------------------------
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const userId = params.id;

    const updateData: any = {};

    if (typeof body.active === 'boolean') {
      updateData.active = body.active;
    }

    if (body.photoUrl !== undefined) {
      updateData.photoUrl = body.photoUrl;
    }

    if (body.evaluationUrl !== undefined) {
      updateData.evaluationUrl = body.evaluationUrl;
    }

    // 🔥 NOVO: Suporta salvar a data híbrida do check-in ou limpar (null)
    if (body.nextCheckInDate !== undefined) {
      updateData.nextCheckInDate = body.nextCheckInDate; 
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erro PATCH User:", error);
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