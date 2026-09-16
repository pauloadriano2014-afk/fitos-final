// app/api/content-categories/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';

// DELETE: exclui uma categoria do pool do coach (mesmo padrão de checagem de
// dono usado em /api/contents/[id])
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const categoryId = params.id;

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const existing = await prisma.contentCategory.findUnique({ where: { id: categoryId }, select: { coachId: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }
    if (!isMasterId(auth.user.id) && !canActAsCoach(auth.user, existing.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    await prisma.contentCategory.delete({ where: { id: categoryId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro DELETE Categoria PA FLIX:', error);
    return NextResponse.json({ error: 'Erro ao excluir categoria' }, { status: 500 });
  }
}
