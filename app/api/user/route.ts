import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic'; // Desativa cache, importante para ver users novos na hora

export async function GET(req: Request) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }, // O mais recente aparece no topo
      include: {
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        workouts: true // Para saber se já tem treino
      }
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return NextResponse.json({ error: "Erro ao listar usuários" }, { status: 500 });
  }
}