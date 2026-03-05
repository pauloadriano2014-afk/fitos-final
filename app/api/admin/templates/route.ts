import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const goal = searchParams.get('goal');
  const level = searchParams.get('level');

  const where: any = {};
  if (goal && goal !== 'TODOS') where.goal = goal;
  if (level && level !== 'TODOS') where.level = level;

  try {
    const templates = await prisma.workoutTemplate.findMany({
      where,
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar templates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // 🔥 CIRURGIA: Agora o servidor aceita 'data' (que já é a string JSON) e o 'id' para edição
    const { id, name, goal, level, data } = body;

    if (!name || !data) {
        return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    if (id) {
        // Se mandou ID, atualiza o template que já existe (Edição)
        await prisma.workoutTemplate.update({
            where: { id },
            data: { name, goal, level, data }
        });
    } else {
        // Se não tem ID, cria um novo (Novo Template)
        await prisma.workoutTemplate.create({
            data: { name, goal, level, data }
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao salvar template" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });

    try {
        await prisma.workoutTemplate.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Erro ao deletar" }, { status: 500 });
    }
}