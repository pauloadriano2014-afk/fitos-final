import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // 1. Busca todos os usuários COM A ANAMNESE ANEXADA
    const rawUsers = await prisma.user.findMany({
      where: { role: 'USER' },
      orderBy: { name: 'asc' },
      
      // 👇 AQUI ESTAVA FALTANDO: Pede para incluir a ficha mais recente
      include: {
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        assessments: { // Já traz a avaliação física também, se tiver
            orderBy: { date: 'desc' },
            take: 1
        }
      }
    });

    // Tratamento de dados: Tira a anamnese de dentro do array [ ] e coloca direto no objeto
    // Assim o front recebe "user.anamnese" direto, em vez de "user.anamneses[0]"
    const users = rawUsers.map(u => ({
        ...u,
        anamnese: u.anamneses.length > 0 ? u.anamneses[0] : null,
        assessment: u.assessments.length > 0 ? u.assessments[0] : null
    }));

    // 2. Busca os últimos 15 históricos de treino (O FEED)
    const recentLogs = await prisma.workoutHistory.findMany({
      take: 15,
      orderBy: { date: 'desc' },
      include: {
        user: { select: { name: true, email: true } } 
      }
    });

    // 3. Busca exercícios (para a biblioteca)
    const exercises = await prisma.exercise.findMany({
        orderBy: { name: 'asc' }
    });

    return NextResponse.json({ 
        users, 
        recentLogs, 
        exercises 
    });

  } catch (error) {
    console.error("ERRO ADMIN:", error);
    return NextResponse.json({ error: "Erro ao carregar dados admin" }, { status: 500 });
  }
}