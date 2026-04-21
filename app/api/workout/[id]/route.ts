// app/api/workout/[id]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const workoutId = params.id;
        const body = await req.json();
        
        // 🔥 DESESTRUTURANDO A INTENSIDADE DO BODY 🔥
        const { name, workoutModel, intensityMultiplier, intensityEndDate, startDate, endDate, exercises, archiveCurrent } = body;

        // Atualiza o Cabeçalho do Treino
        await prisma.workout.update({
            where: { id: workoutId },
            data: {
                name: name,
                workoutModel: workoutModel || "CARGA",
                
                // 🔥 SALVANDO A PERIODIZAÇÃO NO BANCO 🔥
                intensityMultiplier: intensityMultiplier ? parseFloat(intensityMultiplier) : 1.0,
                intensityEndDate: intensityEndDate ? new Date(intensityEndDate) : null,
                
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                archived: archiveCurrent ? true : false
            }
        });

        // Recria a lista de exercícios
        if (exercises && Array.isArray(exercises)) {
            // Apaga os antigos
            await prisma.workoutExercise.deleteMany({
                where: { workoutId: workoutId }
            });

            // Prepara os novos
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
                    workoutId: workoutId,
                    exerciseId: ex.exerciseId,
                    day: ex.day,
                    sets: Number(ex.sets) || 0,
                    reps: String(ex.reps),
                    restTime: Number(ex.restTime) || 0,
                    technique: ex.technique || "",
                    order: index,
                    observation: ex.observation || "",
                    substituteId: (ex.substituteId && validIds.includes(ex.substituteId)) ? ex.substituteId : null
                }));

            if (exercisesToCreate.length > 0) {
                await prisma.workoutExercise.createMany({
                    data: exercisesToCreate
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Erro PUT workout:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        await prisma.workout.delete({
            where: { id: params.id }
        });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: "Erro ao deletar" }, { status: 500 });
    }
}