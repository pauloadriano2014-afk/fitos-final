// app/api/admin/coach-billing/create/route.ts
// Paulo gera cobrança de plano para um coach parceiro
// Cria cliente no Asaas se não existir, gera cobrança Híbrida (PIX/Boleto/Cartão)
// COM LOGS EXPLÍCITOS DE ERRO DO ASAAS
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { BILLING_PLANS, LAUNCH_PROMO_MAX, calcBillingEnd } from '@/config/coachBillingPlans';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0',
    'b7c0c181-41fd-4156-b8fe-963a267759a3',
];

const ASAAS_API_KEY = process.env.ASAAS_API_KEY!;
const ASAAS_BASE    = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';

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
        const { adminId, coachId, billingPlan, paymentMethod = 'UNDEFINED', customValue } = await req.json();

        // Só masters podem gerar cobranças de terceiros, mas o coach pode gerar a própria (adminId === coachId)
        if (!MASTER_IDS.includes(adminId) && adminId !== coachId) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const plan = BILLING_PLANS[billingPlan];
        if (!plan) {
            return NextResponse.json({ error: `Plano não reconhecido: ${billingPlan}` }, { status: 400 });
        }

        // Busca o coach
        const coach = await prisma.user.findUnique({
            where:  { id: coachId },
            select: { id:true, name:true, email:true, phone:true, cpf:true, coachAsaasId:true, isLaunchPromo:true } as any,
        });
        if (!coach) return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });

        // Verifica vagas de promoção
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