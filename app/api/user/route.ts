// app/api/user/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic'; // Desativa cache, importante para ver users novos na hora

// 👇 LISTA TODOS OS USUÁRIOS (USADO NA LISTAGEM GERAL DO ADMIN)
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

// 👇 ATUALIZA OS DADOS DO ALUNO (USADO NO SETUP INICIAL DO PLANO BÁSICO/FICHAS)
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { userId, goal, level } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário não fornecido" }, { status: 400 });
    }

    // 🔥 GRAVA O OBJETIVO E O NÍVEL DIRETAMENTE NO PERFIL DO ALUNO
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        goal: goal,
        level: level
      }
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Erro ao atualizar setup do aluno:", error);
    return NextResponse.json({ error: "Erro ao salvar setup" }, { status: 500 });
  }
}