import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const workout = await prisma.workout.findFirst({
      where: { userId: userId },
      include: {
        exercises: {
          include: { 
            exercise: true 
          },
          orderBy: [
            { day: 'asc' }, 
            { id: 'asc' }
          ]
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!workout) return NextResponse.json(null);

    return NextResponse.json(workout);
  } catch (error: any) {
    // Esse log vai aparecer no terminal da Render
    console.error("ERRO CRÍTICO NO GET WORKOUT:", error.message);
    return NextResponse.json({ error: "Erro ao buscar: " + error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises } = body; 

    if (!userId || !exercises) return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });

    await prisma.workout.deleteMany({ where: { userId: userId } });

    const newWorkout = await prisma.workout.create({
      data: {
        name: name || "Treino Personalizado",
        userId: userId,
        exercises: {
          create: exercises.map((ex: any) => ({
            exerciseId: ex.exerciseId, 
            sets: parseInt(ex.sets) || 3, 
            reps: String(ex.reps) || "12", 
            notes: ex.notes || "",         
            technique: ex.technique || "", 
            day: ex.day || "A",
            restTime: parseInt(ex.restTime) || 60
          })),
        },
      }
    });

    return NextResponse.json(newWorkout);
  } catch (error: any) {
    console.error("ERRO CRÍTICO NO POST WORKOUT:", error.message);
    return NextResponse.json({ error: "Erro ao salvar: " + error.message }, { status: 500 });
  }
}