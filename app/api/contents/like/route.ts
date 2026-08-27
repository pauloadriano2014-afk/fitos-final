import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, contentId } = body;

    if (!userId || !contentId) {
        return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    const targetForAuth = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetForAuth?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // Verifica se já existe o like
    const existingLike = await prisma.contentLike.findUnique({
      where: {
        userId_contentId: { userId, contentId }
      }
    });

    if (existingLike) {
      // Remover Like (Descurtir)
      await prisma.contentLike.delete({
        where: { id: existingLike.id }
      });
      return NextResponse.json({ liked: false });
    } else {
      // Criar Like
      await prisma.contentLike.create({
        data: { userId, contentId }
      });
      
      // 🔥 Gamification: +5 XP
      await prisma.user.update({
        where: { id: userId },
        data: { currentXP: { increment: 5 } }
      });

      return NextResponse.json({ liked: true });
    }

  } catch (error) {
    console.error("Erro Like:", error);
    return NextResponse.json({ error: "Erro no like" }, { status: 500 });
  }
}