import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, contentId } = body;

    if (!userId || !contentId) {
        return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
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