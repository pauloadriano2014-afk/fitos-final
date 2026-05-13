import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🔥 ATUALIZA O COMENTÁRIO (EDITAR) 🔥
export async function PUT(request: Request, { params }: { params: { commentId: string } }) {
  try {
    const body = await request.json();
    const { text } = body;

    const updatedComment = await prisma.contentComment.update({
      where: { id: params.commentId },
      data: { text },
      include: { user: { select: { name: true, role: true } } }
    });

    return NextResponse.json(updatedComment);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao editar comentário" }, { status: 500 });
  }
}

// 🔥 APAGA O COMENTÁRIO (EXCLUIR) 🔥
export async function DELETE(request: Request, { params }: { params: { commentId: string } }) {
  try {
    await prisma.contentComment.delete({
      where: { id: params.commentId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao excluir comentário" }, { status: 500 });
  }
}