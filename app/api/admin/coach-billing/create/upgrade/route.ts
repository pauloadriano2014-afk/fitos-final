// app/api/admin/coach-billing/upgrade/route.ts
// Calcula crédito proporcional e gera cobrança da diferença para upgrade de plano
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { BILLING_PLANS, calcProportionalCredit, calcBillingEnd } from '@/config/coachBillingPlans';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0',
    'b7c0c181-41fd-4156-b8fe-963a267759a3',
];

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
        const { adminId, coachId, newBillingPlan, paymentMethod = 'PIX' } = await req.json();

        if (!MASTER_IDS.includes(adminId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const newPlan = BILLING_PLANS[newBillingPlan];
        if (!newPlan) {
            return NextResponse.json({ error: 'Plano inválido.' }, { status: 400 });
        }

        // Busca dados atuais do coach
        const coach = await prisma.user.findUnique({
            where:  { id: coachId },
            select: {
                id:true, name:true, email:true,
                coachAsaasId:true, coachBillingPlan:true,
                coachBillingStart:true, coachBillingEnd:true,
                coachBillingStatus:true,
            } as any,
        });
        if (!coach) return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });

        const currentPlanKey = (coach as any).coachBillingPlan;
        const currentPlan    = currentPlanKey ? BILLING_PLANS[currentPlanKey] : null;
        const billingEnd     = (coach as any).coachBillingEnd ? new Date((coach as any).coachBillingEnd) : null;
        const billingStart   = (coach as any).coachBillingStart ? new Date((coach as any).coachBillingStart) : null;

        // Calcula crédito proporcional
        let credit = 0;
        let daysRemaining = 0;
        let totalDays = 0;

        if (currentPlan && billingStart && billingEnd) {
            const now = new Date();
            totalDays     = Math.round((billingEnd.getTime() - billingStart.getTime()) / (1000 * 3600 * 24));
            daysRemaining = Math.max(0, Math.round((billingEnd.getTime() - now.getTime()) / (1000 * 3600 * 24)));
            credit        = calcProportionalCredit(currentPlan.totalPrice, totalDays, daysRemaining);
        }

        // Valor a cobrar = novo plano - crédito (mínimo R$5)
        const chargeValue = Math.max(5, Math.round((newPlan.totalPrice - credit) * 100) / 100);

        // Gera cobrança de diferença no Asaas
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        const description = `ELITE FIT — Upgrade para ${newPlan.label}` +
            (credit > 0 ? ` (crédito de R$${credit.toFixed(2)} aplicado)` : '');

        const charge = await asaasFetch('/payments', {
            method: 'POST',
            body: JSON.stringify({
                customer:          (coach as any).coachAsaasId,
                billingType:       paymentMethod === 'BOLETO' ? 'BOLETO' : 'PIX',
                value:             chargeValue,
                dueDate:           dueDateStr,
                description,
                externalReference: `coach:${coachId}:upgrade:${newBillingPlan}`,
            }),
        });

        if (!charge.id) {
            return NextResponse.json({ error: 'Falha ao gerar cobrança no Asaas.', details: charge }, { status: 500 });
        }

        // Novo ciclo começa hoje, termina daqui N meses
        const newStart = new Date();
        const newEnd   = calcBillingEnd(newStart, newPlan.months);

        // Atualiza o coach — status PENDING até webhook confirmar
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