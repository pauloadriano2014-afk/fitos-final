// app/api/survey/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';


export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            userId, appExperience, appExpReason, visualExperience, visualReason, 
            toolsExperience, toolsReason, libraryExperience, appImprovement, 
            coachSupport, checkinExperience, checkinReason, 
            dietExperience, dietAdherence, dietRoutine, dietTools, dietToolsReason, dietSubstitutions 
        } = body;

        if (!userId) {
            return NextResponse.json({ error: 'Usuário não identificado.' }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
        if (!canAccessStudent(auth.user, userId, targetUser?.coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const newSurvey = await prisma.satisfactionSurvey.create({
            data: {
                userId,
                appExperience,
                appExpReason,
                visualExperience,
                visualReason,
                toolsExperience,
                toolsReason,
                libraryExperience,
                appImprovement,
                coachSupport,
                checkinExperience,
                checkinReason,
                dietExperience,
                dietAdherence,
                dietRoutine,
                dietTools,
                dietToolsReason,
                dietSubstitutions
            }
        });

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