import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params; // O ID do vídeo
    
    const comments = await prisma.contentComment.findMany({
      where: { contentId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } } // Traz o nome do aluno
      }
    });

    return NextResponse.json(comments);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar comentários" }, { status: 500 });
  }
}