import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// GET: Busca o treino (CORRIGIDO PARA NÃO CRASHAR)
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
            exercise: true // Detalhes da biblioteca (nome, vídeo)
          },
          orderBy: [
            { day: 'asc' }, 
            { id: 'asc' }
          ]
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Se não encontrar nada, retorna null em JSON (evita o erro <)
    if (!workout) {
      return NextResponse.json(null);
    }

    return NextResponse.json(workout);
  } catch (error: any) {
    console.error("Erro GET Workout:", error);
    // Retorna JSON de erro, NUNCA HTML
    return NextResponse.json({ error: "Erro interno: " + error.message }, { status: 500 });
  }
}

// POST: Salva o Treino (CORRIGIDO E COMPLETO)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, exercises } = body; 

    if (!userId || !exercises) return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });

    // 1. Limpa treino anterior
    await prisma.workout.deleteMany({ where: { userId: userId } });

    // 2. Cria novo com os campos certos
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
    console.error("Erro POST Workout:", error.message);
    return NextResponse.json({ error: "Erro ao salvar: " + error.message }, { status: 500 });
  }
}