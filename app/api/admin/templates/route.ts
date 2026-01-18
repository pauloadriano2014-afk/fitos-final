import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Buscar templates (com filtros opcionais)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const goal = searchParams.get('goal');
  const level = searchParams.get('level');

  const where: any = {};
  // Se vier "TODOS", ignoramos o filtro. Se vier valor, filtramos.
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

// POST: Criar novo template
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, goal, level, exercisesByDay } = body;

    if (!name || !exercisesByDay) {
        return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    // Salva o objeto de exercícios como string JSON
    await prisma.workoutTemplate.create({
      data: {
        name,
        goal,
        level,
        data: JSON.stringify(exercisesByDay)
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao criar template" }, { status: 500 });
  }
}