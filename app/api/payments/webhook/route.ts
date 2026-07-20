// app/api/payments/webhook/route.ts — v2
// v2: handler para cobranças de coaches (externalReference começa com "coach:")
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { BILLING_PLANS, calcBillingEnd } from '@/config/coachBillingPlans';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { event, payment } = body;

        if (!payment) return NextResponse.json({ received: true });

        const externalRef: string = payment.externalReference || '';

        // ── HANDLER DE COACH ─────────────────────────────────────────────────
        if (externalRef.startsWith('coach:')) {
            return await handleCoachPayment(event, payment, externalRef);
        }

        // ── HANDLER DE ALUNO (fluxo original) ────────────────────────────────
        return await handleStudentPayment(event, payment);

    } catch (error: any) {
        console.error('[webhook]', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ─── COACH ───────────────────────────────────────────────────────────────────
async function handleCoachPayment(event: string, payment: any, externalRef: string) {
    // externalRef formato: "coach:{coachId}:{billingPlan}" ou "coach:{coachId}:upgrade:{billingPlan}"
    const parts      = externalRef.split(':');
    const coachId    = parts[1];
    const isUpgrade  = parts[2] === 'upgrade';
    const billingPlan = isUpgrade ? parts[3] : parts[2];

    if (!coachId) return NextResponse.json({ received: true });

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        const plan = BILLING_PLANS[billingPlan];

        // Ativa o coach e confirma o billing
        const updateData: any = {
            coachBillingStatus: 'ACTIVE',
            accountStatus:      'ACTIVE',
        };

        // Se for novo plano (não upgrade já processado), recalcula datas
        if (plan) {
            const start = new Date();
            updateData.coachBillingStart = start;
            updateData.coachBillingEnd   = calcBillingEnd(start, plan.months);
            updateData.coachBillingPlan  = billingPlan;
            updateData.coachPlan         = plan.coachType;
        }

        await prisma.user.update({ where: { id: coachId }, data: updateData });

        // Push para o coach
        const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { pushToken: true, name: true } });
        if (coach?.pushToken && plan) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to:    coach.pushToken,
                    sound: 'default',
                    title: '✅ Pagamento confirmado!',
                    body:  `Seu plano ${plan.label} está ativo. Bora trabalhar! 💪`,
                }),
            }).catch(() => {});
        }

        console.log(`✅ Coach ${coachId} billing ativado — ${billingPlan}`);
    }

    if (event === 'PAYMENT_OVERDUE') {
        await prisma.user.update({
            where: { id: coachId },
            data:  { coachBillingStatus: 'OVERDUE' } as any,
        });
        console.log(`⚠️ Coach ${coachId} billing vencido`);
    }

    if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED') {
        await prisma.user.update({
            where: { id: coachId },
            data:  { coachBillingStatus: 'CANCELLED', accountStatus: 'REJECTED' } as any,
        });
        console.log(`❌ Coach ${coachId} billing cancelado`);
    }

    return NextResponse.json({ received: true });
}

// ─── ALUNO (lógica original preservada) ──────────────────────────────────────
async function handleStudentPayment(event: string, payment: any) {
    const customerId: string = payment.customer || '';
    if (!customerId) return NextResponse.json({ received: true });

    const user = await prisma.user.findFirst({
        where: { asaasCustomerId: customerId } as any,
    });
    if (!user) return NextResponse.json({ received: true });

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isFinanceActive: true,
                paymentDueDate:  dueDate,
            } as any,
        });

        if (user.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to:    user.pushToken,
                    sound: 'default',
                    title: '✅ Pagamento confirmado!',
                    body:  'Seu plano foi renovado. Bora treinar! 💪',
                }),
            }).catch(() => {});
        }
    }

    if (event === 'PAYMENT_OVERDUE') {
        await prisma.user.update({
            where: { id: user.id },
            data:  { isFinanceActive: false } as any,
        });
    }

    return NextResponse.json({ received: true });
}