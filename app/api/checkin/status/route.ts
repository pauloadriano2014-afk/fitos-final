import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// 🔥 DETONADOR DE CACHE: Sem isso, o celular do aluno não atualiza a data!
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

// Máximo de check-ins para planos de ciclo
const PLAN_MAX_CHECKINS: Record<string, number> = {
    FICHA_8S: 2,
    FICHAS: 2,
    CHALLENGE_21: 2,
};

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                plan: true,
                disableCheckIn: true,
                nextCheckInDate: true,
            }
        });

        if (!user) {
            return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
        }

        const plan = user.plan || 'PERFORMANCE';
        const isCyclePlan = ['FICHA_8S', 'FICHAS', 'CHALLENGE_21'].includes(plan);

        // Verifica se o ciclo já encerrou (só para planos de ciclo)
        let cycleCompleted = false;
        if (isCyclePlan) {
            const totalCheckins = await prisma.checkIn.count({ where: { userId } });
            const maxCheckins = PLAN_MAX_CHECKINS[plan] || 2;
            cycleCompleted = totalCheckins >= maxCheckins;
        }

        return NextResponse.json({
            disableCheckIn: user.disableCheckIn || false,
            nextCheckInDate: user.nextCheckInDate,
            cycleCompleted,
        });

    } catch (error) {
        console.error("Erro checkin/status:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}