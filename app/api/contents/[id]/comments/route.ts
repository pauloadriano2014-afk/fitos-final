import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params; 
    
    // 🔥 Puxa APENAS os comentários principais e aninha as respostas (replies) dentro deles
    const comments = await prisma.contentComment.findMany({
      where: { contentId: id, parentId: null },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, role: true } },
        replies: {
          orderBy: { createdAt: 'asc' }, // Respostas mais antigas primeiro
          include: { user: { select: { name: true, role: true } } }
        }
      }
    });

    return NextResponse.json(comments);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar comentários" }, { status: 500 });
  }
}