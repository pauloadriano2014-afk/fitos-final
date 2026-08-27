import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';


// 🔥 ATUALIZA O COMENTÁRIO (EDITAR) 🔥
export async function PUT(request: Request, { params }: { params: { commentId: string } }) {
  try {
    const body = await request.json();
    const { text } = body;

    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    const existingComment = await prisma.contentComment.findUnique({
      where: { id: params.commentId },
      select: { userId: true, user: { select: { coachId: true } } }
    });
    if (!existingComment) {
      return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, existingComment.userId, existingComment.user?.coachId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

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
    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    const existingComment = await prisma.contentComment.findUnique({
      where: { id: params.commentId },
      select: { userId: true, user: { select: { coachId: true } } }
    });
    if (!existingComment) {
      return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, existingComment.userId, existingComment.user?.coachId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    await prisma.contentComment.delete({
      where: { id: params.commentId }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao excluir comentário" }, { status: 500 });
  }
}