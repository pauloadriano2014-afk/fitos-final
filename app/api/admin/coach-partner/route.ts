// app/api/admin/coach-partner/route.ts
// 🤝 Marca (ou desmarca) um coach como PARCEIRO: teste grátis de 30 dias + vaga EXTRA da promoção de lançamento (fora das vagas de fundador). Só master.
// Aprovar um coach NOVO já como parceiro é feito na própria aprovação (coach-requests, `partner: true`); esta rota serve para quem já está no teste de 7 dias (ou cujo teste venceu).
// POST { coachId, partner: boolean } -> { ok, partner, trialEndsAt?, partnerOfferUntil? }
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster, isMasterId } from '@/lib/auth';
import { setPartnerCoach } from '@/lib/launchPromo';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    try {
        const body = await req.json().catch(() => ({}));
        const coachId = typeof body?.coachId === 'string' ? body.coachId : '';
        if (typeof body?.partner !== 'boolean') return NextResponse.json({ error: 'Informe partner: true ou false.' }, { status: 400 });
        const r = await setPartnerCoach(prisma, coachId, body.partner, isMasterId);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
        return NextResponse.json({ ok: true, partner: body.partner, trialEndsAt: r.trialEndsAt ?? null, partnerOfferUntil: r.partnerOfferUntil ?? null });
    } catch (e: any) {
        console.error('[coach-partner]', e?.message);
        return NextResponse.json({ error: 'Erro ao salvar o coach parceiro.' }, { status: 500 });
    }
}
