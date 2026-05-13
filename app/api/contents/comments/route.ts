import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, contentId, text } = body;

    if (!text || !userId || !contentId) return NextResponse.json({ error: "Faltam dados" }, { status: 400 });
    
    const comment = await prisma.contentComment.create({
      data: { userId, contentId, text },
      include: { user: { select: { name: true } } }
    });

    return NextResponse.json(comment);

  } catch (error) {
    return NextResponse.json({ error: "Erro ao comentar" }, { status: 500 });
  }
}