// app/api/admin/coach-onboarding/route.ts
// Marca steps de onboarding concluídos e finaliza quando todos prontos
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
const prisma = new PrismaClient();

// Total de steps do onboarding
const TOTAL_STEPS = 5;

export async function PATCH(req: Request) {
    try {
        const { coachId, step, dismiss } = await req.json();

        if (!coachId) {
            return NextResponse.json({ error: 'coachId obrigatório.' }, { status: 400 });
        }

        // dismiss = coach fechou sem completar tudo — marca como concluído mesmo assim
        if (dismiss) {
            await prisma.user.update({
                where: { id: coachId },
                data:  { onboardingCompleted: true } as any,
            });
            return NextResponse.json({ ok: true, dismissed: true });
        }

        // Avança o step (guarda o maior step já concluído)
        const coach = await prisma.user.findUnique({
            where:  { id: coachId },
            select: { onboardingStep: true } as any,
        });

        const currentStep  = (coach as any)?.onboardingStep ?? 0;
        const nextStep     = Math.max(currentStep, step ?? 0);
        const isCompleted  = nextStep >= TOTAL_STEPS;

        await prisma.user.update({
            where: { id: coachId },
            data:  {
                onboardingStep:      nextStep,
                onboardingCompleted: isCompleted,
            } as any,
        });

        return NextResponse.json({ ok: true, onboardingStep: nextStep, onboardingCompleted: isCompleted });

    } catch (error: any) {
        console.error('[coach-onboarding]', error.message);
        return NextResponse.json({ error: 'Erro ao atualizar onboarding.' }, { status: 500 });
    }
}