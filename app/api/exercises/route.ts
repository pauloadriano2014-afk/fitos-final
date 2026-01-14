import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const exercises = await prisma.exercise.findMany({
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(exercises);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar exercícios" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const exercise = await prisma.exercise.create({
      data: {
        name: body.name,
        category: body.category,
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS."
      }
    });

    return NextResponse.json(exercise);
  } catch (error: any) {
    // Erro P2002 é o código do Prisma para "Unique constraint failed" (já existe)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Este exercício já está cadastrado." }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao cadastrar" }, { status: 500 });
  }
}