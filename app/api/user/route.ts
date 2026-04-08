// app/api/user/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        anamneses: { orderBy: { createdAt: 'desc' }, take: 1 },
        workouts: true 
      }
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    return NextResponse.json({ error: "Erro ao listar usuários" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { userId, goal, level } = body;

    // 🔥 LOG DE VERIFICAÇÃO: Veja isso no painel do Render!
    console.log(`🚀 RECEBENDO SETUP - User: ${userId} | Objetivo: ${goal} | Nível: ${level}`);

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário não fornecido" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        goal: goal,
        level: level
      }
    });

    console.log(`✅ SETUP SALVO COM SUCESSO PARA: ${updatedUser.email}`);
    return NextResponse.json(updatedUser);

  } catch (error) {
    console.error("❌ ERRO AO SALVAR SETUP NO BANCO:", error);
    return NextResponse.json({ error: "Erro ao salvar setup no banco" }, { status: 500 });
  }
}