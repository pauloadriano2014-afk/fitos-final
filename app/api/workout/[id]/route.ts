import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const { name, startDate, endDate, exercises } = body;

    // 1. Atualiza as Datas (Garante o Arquivamento)
    const workout = await prisma.workout.update({
      where: { id },
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    // 2. Apaga os exercícios antigos daquela rotina específica
    await prisma.workoutExercise.deleteMany({
      where: { workoutId: id },
    });

    // 3. 🔥 ESCUDO DUPLO ANTI-CORRUPÇÃO NA EDIÇÃO 🔥
    if (exercises && exercises.length > 0) {
      const allIds: string[] = [];
      exercises.forEach((ex: any) => {
          if (ex.exerciseId) allIds.push(ex.exerciseId);
          if (ex.substituteId) allIds.push(ex.substituteId);
      });

      const validExercises = await prisma.exercise.findMany({
        where: { id: { in: allIds } },
        select: { id: true }
      });
      const validIds = validExercises.map(e => e.id);

      const exercisesToCreate = exercises
        .filter((ex: any) => validIds.includes(ex.exerciseId))
        .map((ex: any, index: number) => ({
          workoutId: id,
          exerciseId: ex.exerciseId,
          day: ex.day,
          sets: Number(ex.sets) || 0,
          reps: String(ex.reps),
          technique: ex.technique || "",
          restTime: Number(ex.restTime) || 0,
          order: index,
          observation: ex.observation || "",
          substituteId: (ex.substituteId && validIds.includes(ex.substituteId)) ? ex.substituteId : null,
        }));

      if (exercisesToCreate.length > 0) {
          await prisma.workoutExercise.createMany({
            data: exercisesToCreate,
          });
      }
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
