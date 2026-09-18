// app/api/user/student-onboarding/route.ts
// 🔥 (18 set 2026) Marca o tour de primeiro acesso do ALUNO como concluído.
// Espelha app/api/admin/coach-onboarding/route.ts, mas sem controle de step
// — o tour do aluno é sequencial e roda inteiro de uma vez (ver
// StudentTourLauncher.js no app), então só existe "completo" ou "não visto
// ainda". Reaproveita o campo onboardingCompleted do model User, o mesmo já
// usado pelo onboarding do coach — sem conflito, porque um User é OU coach
// OU aluno.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { MASTER_IDS } from '@/lib/masterIds';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
    try {
        const { userId, completed } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'userId obrigatório.' }, { status: 400 });
        }

        // 🔒 O aluno só pode marcar o PRÓPRIO tour como concluído (ou master).
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        if (auth.user.id !== userId && !MASTER_IDS.includes(auth.user.id)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        await prisma.user.update({
            where: { id: userId },
            data:  { onboardingCompleted: completed !== false } as any,
        });

        return NextResponse.json({ ok: true, onboardingCompleted: completed !== false });

    } catch (error: any) {
        console.error('[student-onboarding]', error.message);
        return NextResponse.json({ error: 'Erro ao atualizar onboarding.' }, { status: 500 });
    }
}
