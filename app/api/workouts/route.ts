import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Busca o treino
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const workout = await prisma.workout.findFirst({
      where: { userId: userId },
      include: {
        exercises: {
          include: { exercise: true },
          orderBy: [{ day: 'asc' }, { id: 'asc' }]
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!workout) return NextResponse.json(null);

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
    console.log("POST /api/workout payload:", JSON.stringify(body));

    const { userId, name, exercises } = body; 

    if (!userId || !exercises) {
        return NextResponse.json({ error: "Dados incompletos (userId/exercises)" }, { status: 400 });
    }

    // 1. Limpa treino anterior
    await prisma.workout.deleteMany({ where: { userId: userId } });

    // 2. Cria novo treino
    const newWorkout = await prisma.workout.create({
      data: {
        name: name || "Treino Personalizado",
        userId: userId,
        exercises: {
          create: exercises.map((ex: any) => ({
            exerciseId: ex.exerciseId, 
            sets: parseInt(ex.sets) || 3, 
            reps: String(ex.reps) || "12", 
            
            // CAMPOS CRÍTICOS
            notes: ex.notes || "",         
            technique: ex.technique || "", 
            day: ex.day || "A",
            restTime: parseInt(ex.restTime) || 60
          })),
        },
      }
    });

    console.log("Treino salvo com sucesso. ID:", newWorkout.id);
    return NextResponse.json(newWorkout);

  } catch (error: any) {
    console.error("Erro POST Workout:", error);
    // Retorna JSON legível mesmo no erro
    return NextResponse.json({ error: "Erro ao salvar: " + error.message }, { status: 500 });
  }
}