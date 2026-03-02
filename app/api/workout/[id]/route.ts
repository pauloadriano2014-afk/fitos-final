import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const { name, startDate, endDate, exercises } = body;

    const workout = await prisma.workout.update({
      where: { id },
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    await prisma.workoutExercise.deleteMany({
      where: { workoutId: id },
    });

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
          // 🔥 TIREI A COLUNA OBSERVATION DAQUI TAMBÉM!
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

// 🔥 O BOTÃO DA LIXEIRA VOLTOU A FUNCIONAR 🔥
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    
    // 1. Primeiro apagamos os exercícios vinculados a ele para não dar conflito
    await prisma.workoutExercise.deleteMany({
      where: { workoutId: id },
    });

    // 2. Depois apagamos a rotina em si
    await prisma.workout.delete({
      where: { id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao excluir o treino:", error);
    return NextResponse.json({ error: "Falha ao excluir treino" }, { status: 500 });
  }
}
