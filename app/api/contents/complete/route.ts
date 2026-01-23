import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, contentId } = body;

    // 1. Verifica se já completou
    const existing = await prisma.contentCompletion.findUnique({
      where: { userId_contentId: { userId, contentId } }
    });

    if (existing) {
      return NextResponse.json({ message: "Já assistido", xpEarned: 0 });
    }

    // 2. Marca como visto e dá XP (Transação atômica)
    const result = await prisma.$transaction([
      prisma.contentCompletion.create({
        data: { userId, contentId }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { currentXP: { increment: 20 } } // 🔥 +20 XP por vídeo
      })
    ]);

    return NextResponse.json({ message: "Aula Concluída!", xpEarned: 20 });

  } catch (error) {
    console.error("Erro ao completar aula:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}