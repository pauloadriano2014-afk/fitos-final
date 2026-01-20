import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const excludeId = searchParams.get('excludeId');

    if (!category) return NextResponse.json({ error: "Categoria necessária" }, { status: 400 });

    // Busca até 5 exercícios da mesma categoria (aleatórios ou ordenados)
    const substitutes = await prisma.exercise.findMany({
      where: {
        category: category,
        id: { not: excludeId || "" } // Não sugerir o mesmo que já está lá
      },
      take: 5
    });

    return NextResponse.json(substitutes);

  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar substitutos" }, { status: 500 });
  }
}