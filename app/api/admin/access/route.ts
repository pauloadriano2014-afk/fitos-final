import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET: Busca quais conteúdos VIP este aluno específico tem acesso
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "UserId necessário" }, { status: 400 });

    const accesses = await prisma.contentAccess.findMany({
      where: { userId },
      select: { contentId: true }
    });

    // Retorna apenas um array simples de IDs: ["id1", "id2"]
    const accessIds = accesses.map(a => a.contentId);
    return NextResponse.json(accessIds);

  } catch (error) {
    console.error("Erro GET Access:", error);
    return NextResponse.json({ error: "Erro ao buscar acessos" }, { status: 500 });
  }
}

// POST: Liga ou Desliga o acesso do aluno a um conteúdo
export async function POST(req: Request) {
  try {
    const { userId, contentId, grant } = await req.json();

    if (!userId || !contentId) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    if (grant) {
      // Liberar acesso: Cria o registro se não existir
      await prisma.contentAccess.upsert({
        where: {
          userId_contentId: { userId, contentId }
        },
        update: {},
        create: { userId, contentId }
      });
    } else {
      // Bloquear acesso: Remove o registro
      await prisma.contentAccess.deleteMany({
        where: { userId, contentId }
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Erro POST Access:", error);
    return NextResponse.json({ error: "Erro ao atualizar permissão" }, { status: 500 });
  }
}