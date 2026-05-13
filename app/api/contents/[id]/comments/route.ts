import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params; 
    
    const comments = await prisma.contentComment.findMany({
      where: { contentId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        // 🔥 INCLUÍMOS O ROLE AQUI PARA ACHAR VOCÊ E A ADRI 🔥
        user: { select: { name: true, role: true } } 
      }
    });

    return NextResponse.json(comments);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar comentários" }, { status: 500 });
  }
}