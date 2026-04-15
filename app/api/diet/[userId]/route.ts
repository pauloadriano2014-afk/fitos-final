import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const { userId } = params;

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário não fornecido" }, { status: 400 });
    }

    // Busca a dieta do aluno com todas as refeições e itens (O include é vital aqui!)
    const diet = await prisma.diet.findFirst({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        meals: {
          include: { items: true }
        }
      }
    });

    if (!diet) {
      return NextResponse.json({ error: "Nenhuma dieta encontrada" }, { status: 404 });
    }

    return NextResponse.json(diet);
  } catch (error: any) {
    console.error("Erro ao buscar dieta do aluno:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}