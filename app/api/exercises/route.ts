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
    
    // Log para monitoramento no painel da Render
    console.log("Recebendo cadastro de exercício:", body);

    const exercise = await prisma.exercise.create({
      data: {
        name: body.name,
        // Aqui está o ajuste: se o Mobile mandar 'muscleGroup', o Prisma salva em 'category'
        category: body.muscleGroup || body.category || "Geral",
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS."
      }
    });

    return NextResponse.json(exercise);
  } catch (error: any) {
    console.error("ERRO NO CADASTRO DE EXERCÍCIO:", error);
    
    // Erro P2002 é o código do Prisma para "Unique constraint failed" (já existe)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Este exercício já está cadastrado." }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: "Erro ao cadastrar", 
      details: error.message 
    }, { status: 500 });
  }
}