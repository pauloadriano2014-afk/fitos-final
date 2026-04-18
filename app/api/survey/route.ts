// app/api/survey/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            userId, appExperience, appExpReason, appImprovement, 
            coachSupport, checkinExperience, checkinReason, dietExperience 
        } = body;

        if (!userId) {
            return NextResponse.json({ error: 'Usuário não identificado.' }, { status: 400 });
        }

        // 1. Salva a pesquisa no banco
        const newSurvey = await prisma.satisfactionSurvey.create({
            data: {
                userId,
                appExperience,
                appExpReason,
                appImprovement,
                coachSupport,
                checkinExperience,
                checkinReason,
                dietExperience
            }
        });

        // 2. 🔥 DESLIGA O GATILHO PARA O MODAL NÃO APARECER MAIS
        await prisma.user.update({
            where: { id: userId },
            data: { npsRequested: false }
        });

        return NextResponse.json({ message: 'Pesquisa enviada com sucesso!', survey: newSurvey }, { status: 201 });
    } catch (error) {
        console.error("Erro ao salvar pesquisa de satisfação:", error);
        return NextResponse.json({ error: 'Erro interno ao salvar pesquisa.' }, { status: 500 });
    }
}