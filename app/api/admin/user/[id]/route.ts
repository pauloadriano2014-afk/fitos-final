import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

// DELETE: Excluir Aluno (e tudo relacionado a ele)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

    // O "onDelete: Cascade" no Schema deve cuidar dos relacionamentos,
    // mas por segurança podemos deletar manualmente se necessário.
    // Como seu schema já tem onDelete: Cascade, basta deletar o user.
    await prisma.user.delete({
      where: { id: userId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro DELETE User:", error);
    return NextResponse.json({ error: "Erro ao excluir usuário" }, { status: 500 });
  }
}