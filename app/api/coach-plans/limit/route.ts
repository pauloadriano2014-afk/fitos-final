// app/api/coach-plans/limit/route.ts
// 🔔 Aviso suave de limite de alunos (ver lib/coachStudentLimit.ts). Só INFORMA, nunca bloqueia.
// O coach lê o dele (token). O time master pode olhar o de outro coach com ?coachId=.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { studentLimitFor } from '@/lib/coachStudentLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const asked = new URL(req.url).searchParams.get('coachId');
    const coachId = asked && isMasterId(auth.user.id) ? asked : auth.user.id;

    // time master não tem limite de plano; aluno comum não tem nada a ver com isso
    if (isMasterId(coachId) || (!asked && auth.user.role !== 'COACH')) {
        return NextResponse.json({ level: 'NONE', count: 0, max: null, tier: null, tierLabel: null, neededTier: null, neededTierLabel: null, neededMax: null });
    }

    try {
        return NextResponse.json(await studentLimitFor(prisma, coachId));
    } catch (e: any) {
        console.error('[coach-plans/limit]', e?.message || e);
        return NextResponse.json({ error: 'Não foi possível conferir o limite agora.' }, { status: 500 });
    }
}
