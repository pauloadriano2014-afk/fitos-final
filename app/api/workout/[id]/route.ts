import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // O caminho padrão do seu banco de dados

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const { name, startDate, endDate, exercises } = body;

    // 1. Atualiza os dados básicos do Treino (Nome e as Datas para o Arquivamento funcionar)
    const workout = await prisma.workout.update({
      where: { id },
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    // 2. Apaga os exercícios antigos desse treino específico para não duplicar
    await prisma.workoutExercise.deleteMany({
      where: { workoutId: id },
    });

    // 3. Insere os exercícios novos/editados que vieram do aplicativo
    if (exercises && exercises.length > 0) {
      const exercisesToCreate = exercises.map((ex: any) => ({
        workoutId: id,
        exerciseId: ex.exerciseId,
        day: ex.day,
        sets: ex.sets,
        reps: ex.reps,
        technique: ex.technique,
        restTime: ex.restTime,
        order: ex.order,
        observation: ex.observation,
        substituteId: ex.substituteId || null,
      }));

      await prisma.workoutExercise.createMany({
        data: exercisesToCreate,
      });
    }

    return NextResponse.json(workout, { status: 200 });
  } catch (error: any) {
    console.error("Erro no PUT (Edição) do Workout:", error);
    return NextResponse.json(
      { error: "Falha ao editar o treino", details: error.message }, 
      { status: 500 }
    );
  }
}
