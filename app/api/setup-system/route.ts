import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const pauloEmail = url.searchParams.get('paulo');
        const adriEmail = url.searchParams.get('adri');

        if (!pauloEmail || !adriEmail) {
            return NextResponse.json({ error: "Faltam os emails. Use a URL: ?paulo=SEU_EMAIL&adri=EMAIL_DELA" }, { status: 400 });
        }

        // 1. Busca os dois usuários
        const paulo = await prisma.user.findUnique({ where: { email: pauloEmail } });
        const adri = await prisma.user.findUnique({ where: { email: adriEmail } });

        if (!paulo) return NextResponse.json({ error: "Conta do Paulo não encontrada com esse email." });
        if (!adri) return NextResponse.json({ error: "Conta da Adri não encontrada com esse email." });

        // 2. Transforma a Adri em ADMIN
        await prisma.user.update({
            where: { id: adri.id },
            data: { role: 'ADMIN', plan: 'VIP' }
        });

        // 3. Dá a posse de tudo que é antigo (e está sem dono) para o Paulo
        await prisma.user.updateMany({ where: { role: 'USER', coachId: null }, data: { coachId: paulo.id } });
        await prisma.exercise.updateMany({ where: { coachId: null }, data: { coachId: paulo.id } });
        await prisma.content.updateMany({ where: { coachId: null }, data: { coachId: paulo.id } });
        await prisma.workoutTemplate.updateMany({ where: { coachId: null }, data: { coachId: paulo.id } });
        await prisma.notice.updateMany({ where: { coachId: null }, data: { coachId: paulo.id } });

        // 4. Clona os exercícios do Paulo para a Adri
        const adriExercisesCount = await prisma.exercise.count({ where: { coachId: adri.id } });
        let clonados = 0;

        if (adriExercisesCount === 0) {
            const pauloExercises = await prisma.exercise.findMany({ where: { coachId: paulo.id } });
            clonados = pauloExercises.length;
            
            for (const ex of pauloExercises) {
                await prisma.exercise.create({
                    data: {
                        name: ex.name,
                        category: ex.category,
                        videoUrl: ex.videoUrl,
                        instructions: ex.instructions,
                        coachId: adri.id
                    }
                });
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: "SISTEMA MULTI-COACH ATIVADO COM SUCESSO!",
            dono_1: paulo.name,
            dono_2: adri.name,
            exercicios_clonados: clonados
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
    }
}