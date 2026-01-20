import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // 1. Busca todos os usuários
    const users = await prisma.user.findMany({
      where: { role: 'USER' },
      orderBy: { name: 'asc' }
    });

    // 2. Busca os últimos 15 históricos de treino (O FEED)
    const recentLogs = await prisma.workoutHistory.findMany({
      take: 15,
      orderBy: { date: 'desc' },
      include: {
        user: { select: { name: true, email: true } } // Traz o nome de quem treinou
      }
    });

    // 3. Busca exercícios (para a biblioteca)
    const exercises = await prisma.exercise.findMany({
        orderBy: { name: 'asc' }
    });

    return NextResponse.json({ 
        users, 
        recentLogs, // <--- NOVO CAMPO
        exercises 
    });

  } catch (error) {
    return NextResponse.json({ error: "Erro ao carregar dados admin" }, { status: 500 });
  }
}