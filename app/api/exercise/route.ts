import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// 🔥 BUSCAR TODOS OS EXERCÍCIOS
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

// 🔥 CRIAR NOVO EXERCÍCIO
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    console.log("Recebendo cadastro de exercício:", body);

    const exercise = await prisma.exercise.create({
      data: {
        name: body.name,
        category: body.muscleGroup || body.category || "Geral",
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS."
      }
    });

    return NextResponse.json(exercise);
  } catch (error: any) {
    console.error("ERRO NO CADASTRO DE EXERCÍCIO:", error);
    
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Este exercício já está cadastrado." }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: "Erro ao cadastrar", 
      details: error.message 
    }, { status: 500 });
  }
}

// 🔥 EDITAR EXERCÍCIO EXISTENTE (A Rota que faltava!)
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    
    console.log("Recebendo edição de exercício:", body);

    if (!body.id) {
      return NextResponse.json({ error: "ID do exercício é obrigatório para edição." }, { status: 400 });
    }

    const updatedExercise = await prisma.exercise.update({
      where: { id: body.id },
      data: {
        name: body.name,
        category: body.muscleGroup || body.category || "Geral",
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS."
      }
    });

    return NextResponse.json(updatedExercise);
  } catch (error: any) {
    console.error("ERRO NA EDIÇÃO DE EXERCÍCIO:", error);
    return NextResponse.json({ 
      error: "Erro ao editar exercício", 
      details: error.message 
    }, { status: 500 });
  }
}

// 🔥 EXCLUIR EXERCÍCIO
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "ID do exercício é obrigatório para exclusão." }, { status: 400 });
    }

    await prisma.exercise.delete({
      where: { id: id }
    });

    return NextResponse.json({ success: true, message: "Exercício excluído com sucesso." });
  } catch (error: any) {
    console.error("ERRO NA EXCLUSÃO DE EXERCÍCIO:", error);
    return NextResponse.json({ 
      error: "Erro ao excluir exercício", 
      details: error.message 
    }, { status: 500 });
  }
}