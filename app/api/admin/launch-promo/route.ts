// app/api/admin/launch-promo/route.ts
// 🔥 Painel do MASTER da promoção de lançamento dos planos de coach: quantas vagas existem, quantas foram usadas/reservadas, quem entrou,
// e alterar o limite (hoje 10) sem mexer no banco.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { getPromoState, setPromoMax } from '@/lib/launchPromo';

export const dynamic = 'force-dynamic';

async function payload() {
    const state = await getPromoState(prisma);
    const now = new Date();
    const coaches: any[] = await (prisma.user as any).findMany({
        where: { OR: [{ isLaunchPromo: true }, { launchPromoStatus: 'RESERVED', launchPromoReservedUntil: { gt: now } }, { partnerCoach: true }] },
        select: { id: true, name: true, email: true, coachPlan: true, coachBillingPlan: true, isLaunchPromo: true, launchPromoExtra: true, partnerCoach: true, partnerOfferUntil: true, trialEndsAt: true, launchPromoStatus: true, launchPromoReservedUntil: true, coachFirstPaidAt: true },
        orderBy: { coachFirstPaidAt: 'asc' },
    });
    return {
        ...state,
        coaches: coaches.map((c) => ({
            id: c.id, name: c.name, email: c.email, plan: c.coachBillingPlan || c.coachPlan,
            // EXTRA = vaga extra de parceiro já paga (não conta nas vagas); PARCEIRO = parceiro ainda no teste/oferta, sem pagar; USADA/RESERVADA = fundadores de sempre
            status: c.isLaunchPromo ? (c.launchPromoExtra ? 'EXTRA' : 'USADA') : (c.launchPromoStatus === 'RESERVED' && c.launchPromoReservedUntil && new Date(c.launchPromoReservedUntil) > now ? 'RESERVADA' : 'PARCEIRO'),
            reservedUntil: c.isLaunchPromo ? null : c.launchPromoReservedUntil,
            partner: !!c.partnerCoach, partnerOfferUntil: c.partnerOfferUntil ?? null, trialEndsAt: c.trialEndsAt ?? null,
        })),
    };
}

export async function GET(req: Request) {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    try {
        return NextResponse.json(await payload());
    } catch (e: any) {
        return NextResponse.json({ error: 'Erro ao ler a promoção.', details: e?.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;
    try {
        const body = await req.json().catch(() => ({}));
        await setPromoMax(prisma, body?.max);
        return NextResponse.json(await payload());
    } catch (e: any) {
        const msg = String(e?.message || '');
        return NextResponse.json({ error: msg.startsWith('Limite inválido') ? msg : 'Erro ao salvar o limite.' }, { status: msg.startsWith('Limite inválido') ? 400 : 500 });
    }
}
