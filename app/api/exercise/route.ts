import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    if (!adminId || adminId === 'null' || adminId === 'undefined') {
        return NextResponse.json([]);
    }

    // 🔥 BUSCA CIRÚRGICA: Apenas os exercícios que VOCÊ cadastrou.
    const exercises = await prisma.exercise.findMany({
      where: { coachId: adminId }, 
      orderBy: { name: 'asc' }
    });
    
    return NextResponse.json(exercises);
  } catch (error) {
    console.error("Erro GET Exercises:", error);
    return NextResponse.json({ error: "Erro ao buscar exercícios" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const exercise = await prisma.exercise.create({
      data: {
        name: body.name,
        category: body.muscleGroup || body.category || "Geral",
        videoUrl: body.videoUrl || "",
        instructions: body.instructions || "Execução padrão FIT OS.",
        coachId: body.adminId || null 
      }
    });
    return NextResponse.json(exercise);
  } catch (error: any) {
    console.error("Erro POST Exercise:", error);
    if (error.code === 'P2002') return NextResponse.json({ error: "Já cadastrado." }, { status: 400 });
    return NextResponse.json({ error: "Erro ao cadastrar" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
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
  } catch (error) {
    return NextResponse.json({ error: "Erro ao editar" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    await prisma.user.delete({ where: { id: id } }); // Correção: prisma.exercise
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
  }
}