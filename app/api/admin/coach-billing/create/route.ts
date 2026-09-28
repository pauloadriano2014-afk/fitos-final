// app/api/admin/coach-billing/create/route.ts
// Paulo gera cobrança de plano para um coach parceiro
// Cria cliente no Asaas se não existir, gera cobrança Híbrida (PIX/Boleto/Cartão)
// COM LOGS EXPLÍCITOS DE ERRO DO ASAAS
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BILLING_PLANS, LAUNCH_PROMO_MAX, calcBillingEnd } from '@/config/coachBillingPlans';
import { requireAuth, canActAsCoach } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ASAAS_API_KEY = process.env.ASAAS_API_KEY!;
const ASAAS_BASE    = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';

// 🔥 (28 set 2026) PROMOÇÃO DE LANÇAMENTO — as primeiras LAUNCH_PROMO_MAX
// cobranças de coach saem automaticamente no valor promocional (_LAUNCH), sem
// precisar de nenhuma tela nova pra selecionar esse plano: o app (TabAssinatura)
// sempre pede o plano cheio mensal (_MONTHLY) na primeira cobrança, e aqui a
// gente troca por baixo pro _LAUNCH correspondente, se ainda sobrar vaga.
//
// IMPORTANTE: isso NÃO mexe no teste grátis de 7 dias. O trial é concedido na
// APROVAÇÃO do cadastro (coachBillingStatus:'TRIAL', trialEndsAt +7 dias em
// app/api/admin/coach-requests/route.ts) e roda do jeito que já rodava, sem
// nenhuma cobrança. Essa troca de plano só entra em ação quando essa PRIMEIRA
// cobrança de verdade é gerada -- seja porque os 7 dias acabaram, seja porque
// o coach decidiu pagar antes -- nunca antes disso.
const LAUNCH_PLAN_BY_TYPE: Record<string, string> = {
    PERSONAL:      'PERSONAL_LAUNCH',
    NUTRICIONISTA: 'NUTRI_LAUNCH',
    ELITE:         'ELITE_LAUNCH',
};

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

        let plan = BILLING_PLANS[billingPlan];
        if (!plan) {
            return NextResponse.json({ error: `Plano não reconhecido: ${billingPlan}` }, { status: 400 });
        }

        // Busca o coach
        const coach = await prisma.user.findUnique({
            where:  { id: coachId },
            select: { id:true, name:true, email:true, phone:true, cpf:true, coachAsaasId:true, isLaunchPromo:true, coachPlan:true, coachBillingPlan:true } as any,
        });
        if (!coach) return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });

        // 🔥 PROMOÇÃO DE LANÇAMENTO: só entra na 1ª cobrança de verdade desse
        // coach (nunca teve coachBillingPlan salvo) e só quando o pedido é o
        // plano cheio mensal -- não mexe em cobranças de renovação nem em
        // planos mais longos escolhidos de propósito (trimestral/semestral/anual).
        const isFirstCharge  = !(coach as any).coachBillingPlan;
        const launchKey      = LAUNCH_PLAN_BY_TYPE[(coach as any).coachPlan as string];
        if (isFirstCharge && launchKey && billingPlan.endsWith('_MONTHLY')) {
            const config = await prisma.platformConfig.upsert({
                where:  { id: 'singleton' },
                update: {},
                create: { id: 'singleton', launchPromoUsed: 0, launchPromoMax: LAUNCH_PROMO_MAX },
            }) as any;

            if (config.launchPromoUsed < config.launchPromoMax) {
                billingPlan = launchKey;
                plan = BILLING_PLANS[billingPlan];
            }
        }

        // Verifica vagas de promoção (revalida aqui pra cobrir tanto o caso
        // acima quanto um billingPlan "_LAUNCH" pedido direto, ex: por você
        // na mão, via Postman, pra um coach específico)
        if (plan.isPromo) {
            const config = await prisma.platformConfig.upsert({
                where:  { id: 'singleton' },
                update: {},
                create: { id: 'singleton', launchPromoUsed: 0, launchPromoMax: LAUNCH_PROMO_MAX },
            }) as any;

            if (config.launchPromoUsed >= config.launchPromoMax) {
                return NextResponse.json({ error: `Vagas de lançamento esgotadas (${LAUNCH_PROMO_MAX}/${LAUNCH_PROMO_MAX}).` }, { status: 409 });
            }
        }

        // Valor final
        const finalValue = customValue ?? plan.totalPrice;

        // Data de vencimento — amanhã (dá tempo do coach pagar)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Garante cliente no Asaas (Captura o erro descritivo se falhar)
        let asaasCustomerId;
        try {
            asaasCustomerId = await getOrCreateAsaasCustomer(coach);
        } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 500 });
        }

        // Descrição da cobrança
        const description = `ELITE FIT — ${plan.label}${customValue ? ` (valor especial)` : ''}`;

        // Cria cobrança no Asaas
        const charge = await asaasFetch('/payments', {
            method: 'POST',
            body: JSON.stringify({
                customer:          asaasCustomerId,
                billingType:       paymentMethod, // Permite PIX, BOLETO, CREDIT_CARD ou UNDEFINED
                value:             finalValue,
                dueDate:           dueDateStr,
                description,
                externalReference: `coach:${coachId}:${billingPlan}`,
            }),
        });

        // 🔥 LOG EXPLÍCITO DO ASAAS: Se falhar na cobrança, extrai o erro exato
        if (!charge.id) {
            console.error('[Asaas] Erro ao gerar cobrança:', charge);
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
                isLaunchPromo:      plan.isPromo,
            } as any,
        });

        // Incrementa contador de promoção se for promo
        if (plan.isPromo) {
            await prisma.platformConfig.update({
                where: { id: 'singleton' },
                data:  { launchPromoUsed: { increment: 1 } } as any,
            });
        }

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
        });

    } catch (error: any) {
        console.error('[coach-billing/create] Erro Interno:', error.message);
        return NextResponse.json({ error: 'Erro interno do servidor.', details: error.message }, { status: 500 });
    }
}