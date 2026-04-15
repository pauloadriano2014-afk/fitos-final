// app/api/diet/[userId]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // 🔥 FORÇA O SERVIDOR A LER O BANCO EM TEMPO REAL (MATA O CACHE)

const prisma = new PrismaClient();

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const { userId } = params;

    // 🔥 BUSCA A DIETA MAIS RECENTE DO USUÁRIO (ORDENADO POR DATA)
    const diet = await prisma.diet.findFirst({
      where: { 
        userId: userId
      },
      orderBy: {
        createdAt: 'desc' // Pega sempre a última salva
      },
      include: {
        meals: {
          orderBy: { order: 'asc' },
          include: {
            items: true
          }
        }
      }
    });

    if (!diet) {
      return NextResponse.json({ error: "Nenhuma dieta encontrada" }, { status: 404 });
    }

    return NextResponse.json(diet);

  } catch (error) {
    console.error("Erro ao buscar dieta do aluno:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}