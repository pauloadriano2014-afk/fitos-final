import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Busca o treino (Com ordenação correta)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const workout = await prisma.workout.findFirst({
      where: { userId: userId },
      include: {
        exercises: {
          include: { exercise: true }, // Traz detalhes do exercício
          orderBy: [{ day: 'asc' }, { id: 'asc' }] // Ordena: A, B, C... e depois por ordem de inserção
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!workout) return NextResponse.json(null); // Retorna nulo se não tiver treino

    return NextResponse.json(workout);
  } catch (error) {
    console.error("Erro GET Workout:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST: Salva o Treino
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises } = body; 

    if (!userId || !exercises) return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });

    // Limpa anterior
    await prisma.workout.deleteMany({ where: { userId: userId } });

    // Cria novo
    const newWorkout = await prisma.workout.create({
      data: {
        name: name || "Treino Personalizado",
        userId: userId,
        exercises: {
          create: exercises.map((ex: any) => ({
            exerciseId: ex.exerciseId, 
            sets: parseInt(ex.sets) || 3, 
            reps: String(ex.reps) || "12", 
            notes: ex.notes || ex.technique || "", // Garante que a técnica seja salva
            
            // 👇 AQUI ESTAVA O ERRO! Adicionei esta linha:
            day: ex.day || "A" 
          })),
        },
      }
    });

    return NextResponse.json(newWorkout);
  } catch (error: any) {
    console.error("Erro POST Workout:", error.message);
    return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
  }
}