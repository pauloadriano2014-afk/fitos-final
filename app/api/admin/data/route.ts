import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const rawUsers = await prisma.user.findMany({
      where: { role: 'USER' },
      orderBy: { name: 'asc' },
      include: {
        // Traz a lista completa para garantir compatibilidade
        anamneses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        assessments: {
            orderBy: { date: 'desc' },
            take: 1
        }
      }
    });

    // Mapeamento Híbrido: Mantém a lista original E cria o atalho
    const users = rawUsers.map(u => ({
        ...u, 
        // 1. Mantém a lista original (Array) para o Front antigo não quebrar
        anamneses: u.anamneses, 
        
        // 2. Cria o atalho (Objeto) para facilitar leitura nova
        anamnese: u.anamneses.length > 0 ? u.anamneses[0] : null,
        
        // O mesmo para assessments
        assessments: u.assessments,
        assessment: u.assessments.length > 0 ? u.assessments[0] : null
    }));

    const recentLogs = await prisma.workoutHistory.findMany({
      take: 15,
      orderBy: { date: 'desc' },
      include: {
        user: { select: { name: true, email: true } } 
      }
    });

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