import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; 

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();
    const { name, startDate, endDate, exercises } = body;

    // 1. Atualiza os dados básicos do Treino (Onde o Arquivamento acontece!)
    const workout = await prisma.workout.update({
      where: { id },
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    // 2. Apaga os exercícios velhos dessa rotina
    await prisma.workoutExercise.deleteMany({
      where: { workoutId: id },
    });

    // 3. 🔥 O ESCUDO ANTI-CORRUPÇÃO: Impede o erro Fatal "Foreign Key" 🔥
    if (exercises && exercises.length > 0) {
      // Pega todos os IDs que estão chegando do aplicativo
      const incomingIds = exercises.map((ex: any) => ex.exerciseId);
      
      // Verifica no banco QUAIS desses IDs ainda existem de verdade na sua Galeria
      const validExercises = await prisma.exercise.findMany({
        where: { id: { in: incomingIds } },
        select: { id: true }
      });
      const validIds = validExercises.map(e => e.id);

      // Só deixa passar para o salvamento os exercícios que passaram no teste
      const exercisesToCreate = exercises
        .filter((ex: any) => validIds.includes(ex.exerciseId)) 
        .map((ex: any) => ({
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
