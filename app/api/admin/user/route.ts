import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Buscamos todos os usuários cadastrados sem exceção para garantir a listagem
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Log interno para monitoramento no painel da Render
    console.log("Usuários listados para o Admin:", users.length);

    return NextResponse.json(users);
  } catch (error) {
    console.error("Erro na rota Admin User:", error);
    return NextResponse.json({ error: "Erro ao buscar lista" }, { status: 500 });
  }
}