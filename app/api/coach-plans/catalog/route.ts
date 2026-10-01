// app/api/coach-plans/catalog/route.ts
// 📋 Catálogo dos planos do coach (degraus × ciclos × tipo) + estado da promoção de lançamento.
// PÚBLICO (é o que a página de vendas mostra): preços são marketing. Se vier um token de coach, devolve também `eligible` (esse coach ainda pode
// receber o preço promocional?). É a ÚNICA fonte de preços: página de vendas, seletor do coach e painel do master leem daqui.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { catalogForClient } from '@/config/coachBillingPlans';
import { getAuthUser, isMasterId } from '@/lib/auth';
import { getPromoState, isEligibleForPromo } from '@/lib/launchPromo';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const catalog = catalogForClient();
    let state = { max: 0, used: 0, reserved: 0, available: 0, percent: catalog.promo.percent };
    try {
        state = await getPromoState(prisma);
    } catch (e: any) {
        // sem o estado a página ainda mostra os preços normais; só não anuncia vaga
        console.warn('[coach-plans/catalog] sem estado da promoção:', e?.message || e);
    }

    let eligible: boolean | undefined;
    try {
        const auth = getAuthUser(req);
        if (auth && !isMasterId(auth.id)) {
            const coach = await prisma.user.findUnique({ where: { id: auth.id }, select: { id: true, isLaunchPromo: true, coachFirstPaidAt: true, coachBillingStatus: true } as any });
            if (coach) eligible = isEligibleForPromo(coach as any, isMasterId) && state.available > 0;
        }
    } catch { /* sem login: segue sem `eligible` */ }

    return NextResponse.json({
        ...catalog,
        promo: { ...catalog.promo, active: state.available > 0, slotsLeft: state.available, max: state.max, ...(eligible === undefined ? {} : { eligible }) },
    });
}
