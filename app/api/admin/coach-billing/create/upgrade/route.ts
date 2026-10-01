// app/api/admin/coach-billing/create/upgrade/route.ts
// Calcula crédito proporcional e gera cobrança da diferença para upgrade de plano
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BILLING_PLANS, calcProportionalCredit, calcBillingEnd, resolveOfferedPlanKey } from '@/config/coachBillingPlans';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ASAAS_API_KEY = process.env.ASAAS_API_KEY!;
const ASAAS_BASE    = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';

async function asaasFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${ASAAS_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'access_token': ASAAS_API_KEY,
            ...((options.headers as any) ?? {}),
        },
    });
    return res.json();
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { coachId, paymentMethod = 'UNDEFINED', dryRun = false } = body;
        // plano antigo de lançamento (*_LAUNCH) não é mais oferecido: vira o plano normal equivalente
        const newBillingPlan = resolveOfferedPlanKey(body.newBillingPlan);

        // 🔒 (28 set 2026) Upgrade agora pode ser feito pelo PRÓPRIO coach (tela
        // de recurso bloqueado no app) OU pelo time master, igual já
        // funcionava. Antes era `requireMaster` -- só Paulo/Adri conseguiam
        // chamar essa rota, então não tinha como o coach fazer upgrade sozinho
        // pelo app, só manualmente.
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        if (!canActAsCoach(auth.user, coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }
        const isSelfService = !isMasterId(auth.user.id);

        const newPlan = BILLING_PLANS[newBillingPlan];
        if (!newPlan) {
            return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 });
        }

        // Busca dados atuais do coach
        const coach = await prisma.user.findUnique({
            where:  { id: coachId },
            select: {
                id:true, name:true, email:true,
                coachAsaasId:true, coachBillingPlan:true, coachPlan:true,
                coachBillingStart:true, coachBillingEnd:true,
                coachBillingStatus:true, coachBillingPaidValue:true,
            } as any,
        });
        if (!coach) return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });

        const currentPlanKey = (coach as any).coachBillingPlan;
        const currentPlan    = currentPlanKey ? BILLING_PLANS[currentPlanKey] : null;

        // 🔒 Travas de segurança quando é o PRÓPRIO coach fazendo o upgrade
        // sozinho pelo app (o time master continua com passe livre, igual
        // sempre teve, pra casos especiais combinados na mão).
        if (isSelfService) {
            // "para baixo" = degrau ou tipo mais barato (baseMonthly). Mudar só o CICLO (ex: mensal -> anual) pode, e o crédito proporcional cobre a diferença.
            if (currentPlan && newPlan.baseMonthly < currentPlan.baseMonthly) {
                return NextResponse.json({ error: 'Downgrade de plano não é feito por aqui ainda. Fale com a Elite Fit pra ajustar seu plano.' }, { status: 400 });
            }
        }

        // 🔥 (28 set 2026) Coach ainda no teste grátis de 7 dias (nunca teve
        // NENHUMA cobrança de verdade) -- não faz sentido calcular crédito
        // proporcional de um plano que ele nunca pagou. Aqui é só uma troca
        // do plano desejado, sem cobrar nada agora; a cobrança normal (ou já
        // com a promo de lançamento, se ainda tiver vaga) acontece do jeito
        // que sempre aconteceu quando o trial acabar ou ele decidir pagar
        // antes (ver app/api/admin/coach-billing/create/route.ts).
        const isTrialNoChargeYet = !currentPlanKey && (coach as any).coachBillingStatus === 'TRIAL';
        if (isTrialNoChargeYet) {
            if (dryRun) {
                return NextResponse.json({ ok: true, trialSwap: true, coachType: newPlan.coachType, newPlanLabel: newPlan.label });
            }
            await prisma.user.update({
                where: { id: coachId },
                data:  { coachPlan: newPlan.coachType } as any,
            });
            return NextResponse.json({ ok: true, trialSwap: true, coachType: newPlan.coachType, newPlanLabel: newPlan.label });
        }

        const billingEnd     = (coach as any).coachBillingEnd   ? new Date((coach as any).coachBillingEnd)   : null;
        const billingStart   = (coach as any).coachBillingStart ? new Date((coach as any).coachBillingStart) : null;

        // Calcula crédito proporcional (valor que sobrou do plano atual, não
        // usado ainda) a partir do que ele realmente pagou nesse ciclo.
        let credit = 0;
        let daysRemaining = 0;
        let totalDays = 0;

        if (currentPlan && billingStart && billingEnd) {
            const now = new Date();
            totalDays     = Math.round((billingEnd.getTime() - billingStart.getTime()) / (1000 * 3600 * 24));
            daysRemaining = Math.max(0, Math.round((billingEnd.getTime() - now.getTime()) / (1000 * 3600 * 24)));
            // O crédito é do que ele REALMENTE pagou nesse período (coachBillingPaidValue, gravado pelo webhook): quem entrou com 30% de desconto
            // da promoção não ganha crédito calculado em cima do preço cheio. Sem esse registro (coach de antes), usa o preço do plano, como sempre.
            const paid = Number((coach as any).coachBillingPaidValue);
            const totalPaid = Number.isFinite(paid) && paid > 0 ? paid : currentPlan.totalPrice;
            credit        = calcProportionalCredit(totalPaid, totalDays, daysRemaining);
        }

        // Valor a cobrar = novo plano - crédito (mínimo R$5, pra nunca gerar
        // uma cobrança de centavos que nem compensa processar no Asaas)
        const chargeValue = Math.max(5, Math.round((newPlan.totalPrice - credit) * 100) / 100);

        if (dryRun) {
            return NextResponse.json({
                ok: true,
                trialSwap: false,
                coachType: newPlan.coachType,
                newPlanLabel: newPlan.label,
                credit,
                daysRemaining,
                chargeValue,
            });
        }

        // Gera cobrança de diferença no Asaas — UNDEFINED abre o checkout
        // completo (Pix/Boleto/Cartão), igual o resto do app já faz pra
        // cobrança normal (ver coach-billing/create/route.ts e
        // TabAssinatura.js). Mantém suporte a forçar um método específico
        // caso o time master queira, mas o app do coach sempre manda UNDEFINED.
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        const description = `ELITE FIT — Upgrade para ${newPlan.label}` +
            (credit > 0 ? ` (crédito de R$${credit.toFixed(2)} aplicado)` : '');

        const charge = await asaasFetch('/payments', {
            method: 'POST',
            body: JSON.stringify({
                customer:          (coach as any).coachAsaasId,
                billingType:       paymentMethod,
                value:             chargeValue,
                dueDate:           dueDateStr,
                description,
                externalReference: `coach:${coachId}:upgrade:${newBillingPlan}`,
            }),
        });

        if (!charge.id) {
            console.error('[Asaas] Erro ao gerar cobrança de upgrade:', charge);
            const asaasError = charge.errors?.[0]?.description || 'Erro desconhecido ao gerar a cobrança.';
            return NextResponse.json({ error: `Asaas recusou a cobrança: ${asaasError}`, details: charge }, { status: 500 });
        }

        // Novo ciclo começa hoje, termina daqui N meses -- igual já era: o
        // plano/ciclo muda na hora (pra próxima renovação já sair certa), e o
        // acesso de verdade fica preso ao coachBillingStatus, que só vira
        // ACTIVE de novo quando o webhook confirmar esse pagamento (até lá,
        // se o ciclo antigo já tiver vencido, cai no fluxo normal de
        // CoachBlockedScreen -- igual qualquer renovação já funciona hoje).
        const newStart = new Date();
        const newEnd   = calcBillingEnd(newStart, newPlan.months);

        await prisma.user.update({
            where: { id: coachId },
            data: {
                coachBillingPlan:   newBillingPlan,
                coachBillingStatus: 'PENDING',
                coachBillingStart:  newStart,
                coachBillingEnd:    newEnd,
                coachAsaasChargeId: charge.id,
                coachPlan:          newPlan.coachType,
            } as any,
        });

        return NextResponse.json({
            ok:            true,
            trialSwap:     false,
            coachType:     newPlan.coachType,
            chargeId:      charge.id,
            credit,
            daysRemaining,
            originalValue: newPlan.totalPrice,
            chargeValue,
            dueDate:       dueDateStr,
            pixQrCode:     charge.pixQrCode     ?? null,
            pixCopyPaste:  charge.pixCopiaECola ?? null,
            boletoUrl:     charge.bankSlipUrl   ?? null,
            invoiceUrl:    charge.invoiceUrl    ?? null,
            newBillingPlan,
            newBillingEnd: newEnd.toISOString(),
        });

    } catch (error: any) {
        console.error('[coach-billing/upgrade]', error.message);
        return NextResponse.json({ error: 'Erro interno.', details: error.message }, { status: 500 });
    }
}
