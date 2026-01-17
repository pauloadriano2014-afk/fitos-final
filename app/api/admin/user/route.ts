import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// 👇 A LINHA MÁGICA: Obriga o Next.js a ler o banco SEMPRE, sem cache.
export const dynamic = 'force-dynamic'; 

const prisma = new PrismaClient();

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: 'desc' // Mostra os mais recentes no topo
      },
      // DICA: O include abaixo traz a anamnese junto, útil pro Admin ver quem já preencheu
      include: {
        anamneses: true 
      }
    });

    console.log("Usuários listados para o Admin (Tempo Real):", users.length);

    return NextResponse.json(users);
  } catch (error) {
    console.error("Erro na rota Admin User:", error);
    return NextResponse.json({ error: "Erro ao buscar lista" }, { status: 500 });
  }
}