// app/api/workout/[id]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    
    // 🔥 RECEBENDO A CHAVE DA CARGA E DO MOTOR DE PERIODIZAÇÃO AQUI
    const { name, startDate, endDate, exercises, workoutModel, intensityMultiplier, intensityEndDate, archiveCurrent } = body;

    const workout = await prisma.workout.update({
      where: { id },
      data: {
        name,
        workoutModel: workoutModel || "CARGA", // 🔥 INJETANDO NO BANCO DE DADOS
        
        // 🔥 MOTOR DE PERIODIZAÇÃO (DELOAD/CHOQUE) INJETADO AQUI 🔥
        intensityMultiplier: intensityMultiplier !== undefined ? parseFloat(intensityMultiplier) : 1.0,
        intensityEndDate: intensityEndDate ? new Date(intensityEndDate) : null,
        archived: archiveCurrent !== undefined ? archiveCurrent : undefined,

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
          
          // 🔥 AQUI ESTÁ A ADIÇÃO PARA VALIDAR O ARRAY DE SUBSTITUTOS 🔥
          if (ex.substitutes && Array.isArray(ex.substitutes)) {
              ex.substitutes.forEach((subId: string) => allIds.push(subId));
          }
      });

      const validExercises = await prisma.exercise.findMany({
        where: { id: { in: allIds } },
        select: { id: true }
      });
      const validIds = validExercises.map(e => e.id);

      const exercisesToCreate = exercises
        .filter((ex: any) => validIds.includes(ex.exerciseId))
        .map((ex: any, index: number) => {
            // 🔥 Garante que todos os substitutos do array também são válidos no banco
            const validSubstitutes = Array.isArray(ex.substitutes) 
                ? ex.substitutes.filter((subId: string) => validIds.includes(subId)) 
                : [];

            return {
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
              substitutes: validSubstitutes // 🔥 NOVO: Injeta o array validado de substitutos
            };
        });

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