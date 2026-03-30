// app/api/exercises/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// 🔥 BUSCAR TODOS OS EXERCÍCIOS (FILTRADOS E BLINDADOS)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    // Trava para evitar que o app mande "null" ou "undefined" como texto
    const validAdminId = (adminId && adminId !== 'null' && adminId !== 'undefined') ? adminId : null;

    const exercises = await prisma.exercise.findMany({
      where: validAdminId 
        ? { OR: [{ coachId: validAdminId }, { coachId: null }] } // 🔥 Traz os do Coach + os Globais (sem dono)
        : {}, 
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(exercises);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar exercícios" }, { status: 500 });
  }
}

// 🔥 CRIAR NOVO EXERCÍCIO COM DONO
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const exercise = await prisma.exercise.create({
      data: {
        name: body.name,
        category: body.muscleGroup || body.category || "Geral",
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS.",
        coachId: body.adminId || null // 🔥 CARIMBA O DONO NO EXERCÍCIO!
      }
    });

    return NextResponse.json(exercise);
  } catch (error: any) {
    console.error("ERRO NO CADASTRO DE EXERCÍCIO:", error);
    
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Este exercício já está cadastrado na sua lista." }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao cadastrar", details: error.message }, { status: 500 });
  }
}

// 🔥 EDITAR EXERCÍCIO EXISTENTE
export async function PUT(req: Request) {
  try {
    const body = await req.json();

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
    return NextResponse.json({ error: "Erro ao editar exercício", details: error.message }, { status: 500 });
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
    if (error.code === 'P2003') {
        return NextResponse.json({ error: "Trava de Segurança: Este exercício está em uso." }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao excluir exercício", details: error.message }, { status: 500 });
  }
}