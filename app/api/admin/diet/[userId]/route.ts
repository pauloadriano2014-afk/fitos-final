// app/api/diet/[userId]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
const prisma = new PrismaClient();

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const { userId } = params;

    // Busca a dieta ativa do aluno, trazendo as refeições e os alimentos ordenados
    const diet = await prisma.diet.findFirst({
      where: { 
        userId: userId, 
        isActive: true 
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