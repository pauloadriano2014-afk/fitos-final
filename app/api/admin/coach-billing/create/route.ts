// app/api/admin/coach-billing/create/route.ts
// Paulo gera cobrança de plano para um coach parceiro
// Cria cliente no Asaas se não existir, gera cobrança Híbrida (PIX/Boleto/Cartão)
// COM LOGS EXPLÍCITOS DE ERRO DO ASAAS
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BILLING_PLANS, LAUNCH_PROMO_PERCENT, calcBillingEnd, isPromoCycle, quotePlan, resolveOfferedPlanKey } from '@/config/coachBillingPlans';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';
import { cancelReservation, isEligibleForPromo, reservePromo } from '@/lib/launchPromo';

export const dynamic = 'force-dynamic';

const ASAAS_API_KEY = process.env.ASAAS_API_KEY!;
const ASAAS_BASE    = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';

// 🔥 PROMOÇÃO DE LANÇAMENTO (1 out 2026, substitui a de 28 set): os 10 primeiros coaches que PAGAREM um plano TRIMESTRAL, SEMESTRAL ou ANUAL
// levam 30% de desconto no 1º período (a renovação volta ao preço normal). Regras e contagem de vagas: config/coachBillingPlans.ts e
// lib/launchPromo.ts. Aqui: se o coach é elegível (nunca pagou nada) e há vaga, a cobrança sai com o valor promocional e a vaga fica RESERVADA
// por 7 dias; ela só vira USADA quando o webhook confirma o pagamento (app/api/payments/webhook/route.ts). A cobrança promocional leva o sufixo
// ":promo" no externalReference para o webhook saber que é ela.
//
// NÃO mexe no teste grátis de 7 dias (concedido na aprovação do cadastro, em app/api/admin/coach-requests/route.ts).

// ─── HELPERS ASAAS ───────────────────────────────────────────────────────────
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

async function getOrCreateAsaasCustomer(coach: any): Promise<string> {
    // Se já tem ID no Asaas, retorna
    if (coach.coachAsaasId) return coach.coachAsaasId;

    // Busca por CPF no Asaas
    const cpfClean = (coach.cpf || '').replace(/\D/g, '');
    if (cpfClean) {
        const search = await asaasFetch(`/customers?cpfCnpj=${cpfClean}`);
        if (search.data?.length > 0) {
            const existingId = search.data[0].id;
            await prisma.user.update({ where: { id: coach.id }, data: { coachAsaasId: existingId } as any });
            return existingId;
        }
    }

    // Cria novo cliente
    const created = await asaasFetch('/customers', {
        method: 'POST',
        body: JSON.stringify({
            name:     coach.name,
            email:    coach.email,
            cpfCnpj:  cpfClean || undefined,
            phone:    (coach.phone || '').replace(/\D/g, '') || undefined,
        }),
    });

    // 🔥 LOG EXPLÍCITO DO ASAAS: Se falhar, extrai a descrição do erro e joga para o frontend
    if (!created.id) {
        console.error('[Asaas] Erro ao criar cliente:', created);
        const asaasError = created.errors?.[0]?.description || 'Erro desconhecido ao criar cliente no Asaas.';
        throw new Error(`Asaas recusou o cliente: ${asaasError}`);
    }

    await prisma.user.update({ where: { id: coach.id }, data: { coachAsaasId: created.id } as any });
    return created.id;
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────
export async function POST(req: Request) {
    try {
        // Recebe UNDEFINED por padrão para abrir o checkout completo no Asaas
        const body = await req.json();
        const { coachId, paymentMethod = 'UNDEFINED', customValue } = body;
        let { billingPlan } = body; // 🔥 "let": pode ser trocado pelo plano de lançamento mais abaixo

        // 🔒 Identidade vem do token — só masters podem gerar cobrança de
        // terceiros, mas o coach pode gerar a própria.
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        if (!canActAsCoach(auth.user, coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        // Plano antigo de lançamento (*_LAUNCH) não é mais oferecido: cobra o plano normal equivalente (ver resolveOfferedPlanKey)
        billingPlan = resolveOfferedPlanKey(billingPlan);
        const plan = BILLING_PLANS[billingPlan];
        if (!plan) {
            return NextResponse.json({ error: `Plano não reconhecido: ${billingPlan}` }, { status: 400 });
        }

        // Busca o coach
        const coach = await prisma.user.findUnique({
            where:  { id: coachId },
            select: { id:true, name:true, email:true, phone:true, cpf:true, coachAsaasId:true, isLaunchPromo:true, coachFirstPaidAt:true, coachBillingStatus:true, coachPlan:true, coachBillingPlan:true } as any,
        });
        if (!coach) return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });

        // 🔥 Promoção: só ciclos longos, só coach que nunca pagou, só sem "valor especial" combinado na mão, só com vaga
        let usePromo = false;
        if (isPromoCycle(plan) && (customValue === undefined || customValue === null) && isEligibleForPromo(coach as any, isMasterId)) {
            usePromo = await reservePromo(prisma, coachId);
        }
        const quote = quotePlan(billingPlan, { promo: usePromo })!;

        // Valor final
        const finalValue = customValue ?? quote.value;

        // Data de vencimento — amanhã (dá tempo do coach pagar)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Garante cliente no Asaas (Captura o erro descritivo se falhar)
        let asaasCustomerId;
        try {
            asaasCustomerId = await getOrCreateAsaasCustomer(coach);
        } catch (err: any) {
            if (usePromo) await cancelReservation(prisma, coachId);
            return NextResponse.json({ error: err.message }, { status: 500 });
        }

        // Descrição da cobrança
        const description = `ELITE FIT — ${plan.label}${usePromo ? ` (Lançamento -${LAUNCH_PROMO_PERCENT}%)` : ''}${customValue ? ` (valor especial)` : ''}`;

        // Cria cobrança no Asaas
        const charge = await asaasFetch('/payments', {
            method: 'POST',
            body: JSON.stringify({
                customer:          asaasCustomerId,
                billingType:       paymentMethod, // Permite PIX, BOLETO, CREDIT_CARD ou UNDEFINED
                value:             finalValue,
                dueDate:           dueDateStr,
                description,
                externalReference: `coach:${coachId}:${billingPlan}${usePromo ? ':promo' : ''}`,
            }),
        });

        // 🔥 LOG EXPLÍCITO DO ASAAS: Se falhar na cobrança, extrai o erro exato
        if (!charge.id) {
            console.error('[Asaas] Erro ao gerar cobrança:', charge);
            if (usePromo) await cancelReservation(prisma, coachId);
            const asaasError = charge.errors?.[0]?.description || 'Erro desconhecido na geração da fatura.';
            return NextResponse.json({ error: `Asaas recusou a cobrança: ${asaasError}`, details: charge }, { status: 500 });
        }

        // Calcula datas do ciclo
        const billingStart = new Date();
        const billingEnd   = calcBillingEnd(billingStart, plan.months);

        // Atualiza o coach no banco (status PENDING até webhook confirmar)
        await prisma.user.update({
            where: { id: coachId },
            data: {
                coachBillingPlan:   billingPlan,
                coachBillingStatus: 'PENDING',
                coachBillingStart:  billingStart,
                coachBillingEnd:    billingEnd,
                coachAsaasChargeId: charge.id,
                coachPlan:          plan.coachType,
            } as any,
        });

        // Retorna link de pagamento e dados
        return NextResponse.json({
            ok:          true,
            chargeId:    charge.id,
            value:       finalValue,
            dueDate:     dueDateStr,
            pixQrCode:   charge.pixQrCode     ?? null,
            pixCopyPaste:charge.pixCopiaECola ?? null,
            boletoUrl:   charge.bankSlipUrl   ?? null,
            invoiceUrl:  charge.invoiceUrl    ?? null,
            billingPlan,
            billingEnd:  billingEnd.toISOString(),
            promo:       { applied: usePromo, percent: usePromo ? LAUNCH_PROMO_PERCENT : 0, regularValue: quote.regularValue },
        });

    } catch (error: any) {
        console.error('[coach-billing/create] Erro Interno:', error.message);
        return NextResponse.json({ error: 'Erro interno do servidor.', details: error.message }, { status: 500 });
    }
}