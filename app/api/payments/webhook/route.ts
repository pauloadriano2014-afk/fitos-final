// app/api/payments/webhook/route.ts — v3
// v3: adiciona handler para inscrições do Desafio (Projeto 90 Dias e futuros
// desafios por WhatsApp), verificado ANTES do fluxo de aluno. Nada da lógica
// de coach ou aluno foi alterado.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BILLING_PLANS, calcBillingEnd } from '@/config/coachBillingPlans';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { event, payment } = body;

        // ── HANDLER DE CHECKOUT (recorrência com cartão) ───────────────────────
        // Eventos de Checkout (CHECKOUT_CREATED/PAID/CANCELED/EXPIRED) NÃO têm
        // um objeto `payment` no corpo — por isso esse check precisa vir ANTES
        // do `if (!payment) return` abaixo, senão esses eventos são descartados
        // silenciosamente e a recorrência nunca ativa.
        if (typeof event === 'string' && event.startsWith('CHECKOUT_')) {
            return await handleCheckoutEvent(event, body);
        }

        if (!payment) return NextResponse.json({ received: true });

        const externalRef: string = payment.externalReference || '';

        // ── HANDLER DE COACH ─────────────────────────────────────────────────
        if (externalRef.startsWith('coach:')) {
            return await handleCoachPayment(event, payment, externalRef);
        }

        // ── HANDLER DE DESAFIO (Projeto 90 Dias e futuros desafios) ───────────
        // Checa se esse payment.id pertence a uma inscrição de Desafio ANTES
        // de cair no fluxo de aluno (que espera um customer vinculado a User).
        // Se não for um pagamento de Desafio, handleDesafioPayment devolve
        // false e o fluxo segue normalmente pro handler de aluno de sempre.
        const tratadoComoDesafio = await handleDesafioPayment(event, payment);
        if (tratadoComoDesafio) {
            return NextResponse.json({ received: true });
        }

        // ── HANDLER DE ALUNO (fluxo original) ────────────────────────────────
        return await handleStudentPayment(event, payment);

    } catch (error: any) {
        console.error('[webhook]', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ─── DESAFIO ───────────────────────────────────────────────────────────────
// Retorna true se o pagamento pertencia a uma inscrição de Desafio (e já foi
// tratado aqui); retorna false se não for o caso, pra deixar o fluxo seguir.
async function handleDesafioPayment(event: string, payment: any): Promise<boolean> {
    if (!payment?.id) return false;

    const inscricao = await prisma.desafioInscricao.findUnique({
        where: { asaasPaymentId: payment.id },
    });

    if (!inscricao) return false; // não é um pagamento de Desafio

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        // Idempotência: só atualiza se ainda não estava marcada como paga
        // (evita reprocessar caso a Asaas reenvie o mesmo webhook).
        if (inscricao.status !== 'PAGO') {
            await prisma.desafioInscricao.update({
                where: { id: inscricao.id },
                data: { status: 'PAGO', paymentDate: new Date() },
            });
            console.log(`✅ Desafio: inscrição ${inscricao.id} confirmada (${inscricao.nome})`);
        }
    }

    return true;
}

// ─── CHECKOUT (recorrência com cartão) ─────────────────────────────────────
// ⚠️ O formato exato do corpo desses eventos (CHECKOUT_CREATED/PAID/CANCELED/
// EXPIRED) não está 100% documentado publicamente pela Asaas — por isso o
// console.log abaixo fica de propósito, pra dar pra ver o payload real na
// primeira vez que rodar no sandbox (Render → Logs) e ajustar os campos se
// precisar. A lógica tenta vários caminhos possíveis pros campos por segurança.
function cycleToDays(cycle: string | null | undefined): number {
    switch (cycle) {
        case 'QUARTERLY': return 90;
        case 'SEMIANNUALLY': return 180;
        case 'YEARLY': return 365;
        default: return 30; // MONTHLY (mesma aproximação já usada no fluxo de aluno original)
    }
}

async function handleCheckoutEvent(event: string, body: any) {
    console.log('[webhook][checkout]', event, JSON.stringify(body));

    // 🔥 A URL do Checkout hospedado é "asaas.com/checkoutSession/show/..." —
    // o produto se chama "checkoutSession", não "checkout". É bem provável
    // que o corpo do webhook aninhe os dados numa chave `checkoutSession` em
    // vez de `checkout`. Checando os dois formatos por segurança (nenhum dos
    // dois documentado publicamente de forma clara pela Asaas).
    const checkoutId: string | undefined =
        body?.id || body?.checkout?.id || body?.checkoutSession?.id;
    const externalRef: string =
        body?.externalReference ||
        body?.checkout?.externalReference ||
        body?.checkoutSession?.externalReference ||
        body?.payment?.externalReference ||
        '';

    if (!externalRef.startsWith('recorrencia:')) {
        // Não é um checkout de recorrência nosso (ou não conseguimos identificar
        // — payload num formato inesperado). Não faz nada, só confirma recebido.
        return NextResponse.json({ received: true });
    }

    const userId = externalRef.split(':')[1];
    if (!userId) return NextResponse.json({ received: true });

    // Acha a Subscription local — primeiro pelo asaasCheckoutId (mais preciso),
    // com fallback pra "pendente mais recente desse aluno" se o id não bateu
    // por algum motivo de formato de payload.
    let subscription = checkoutId
        ? await prisma.subscription.findUnique({ where: { asaasCheckoutId: checkoutId } })
        : null;

    if (!subscription) {
        subscription = await prisma.subscription.findFirst({
            where: { userId, billingType: 'CREDIT_CARD', status: 'PENDING_CHECKOUT' },
            orderBy: { createdAt: 'desc' },
        });
    }

    if (!subscription) return NextResponse.json({ received: true });

    if (event === 'CHECKOUT_PAID') {
        // Idempotência: já processado? não repete.
        if (subscription.status === 'ACTIVE') return NextResponse.json({ received: true });

        const asaasSubscriptionId: string | undefined =
            body?.subscription?.id ||
            body?.checkout?.subscription?.id ||
            body?.checkoutSession?.subscription?.id;

        const newDueDate = new Date();
        newDueDate.setDate(newDueDate.getDate() + cycleToDays(subscription.cycle));

        await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: 'ACTIVE',
                ...(asaasSubscriptionId ? { asaasSubscriptionId } : {}),
                nextDueDate: newDueDate,
            },
        });

        await prisma.user.update({
            where: { id: userId },
            data: { isFinanceActive: true, paymentDueDate: newDueDate },
        });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
        if (user?.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: user.pushToken,
                    sound: 'default',
                    title: '✅ Pagamento automático ativado!',
                    body: 'Sua mensalidade agora é cobrada automaticamente no cartão. Sem mais preocupação! 💪',
                }),
            }).catch(() => {});
        }

        console.log(`✅ Recorrência ativada: aluno ${userId}, subscription ${subscription.id}`);
    }

    if (event === 'CHECKOUT_CANCELED') {
        await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'CANCELLED' } });
    }

    if (event === 'CHECKOUT_EXPIRED') {
        await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'EXPIRED' } });
    }

    return NextResponse.json({ received: true });
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

// ─── ALUNO (lógica original preservada e expandida para o painel) ────────────
async function handleStudentPayment(event: string, payment: any) {
    // 🔥 ATUALIZA A FATURA (PAYMENT) PARA APARECER VERDE NO SEU PAINEL NOVO
    if (payment && payment.id) {
        const cobrancaExistente = await prisma.payment.findUnique({
            where: { asaasPaymentId: payment.id }
        });

        if (cobrancaExistente) {
            await prisma.payment.update({
                where: { id: cobrancaExistente.id },
                data: {
                    status: payment.status, // Atualiza para CONFIRMED, RECEIVED, OVERDUE, etc.
                    netValue: payment.netValue,
                    paymentDate: payment.clientPaymentDate ? new Date(payment.clientPaymentDate) : (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event) ? new Date() : null),
                    billingType: payment.billingType,
                }
            });
            console.log(`✅ Fatura atualizada no banco: ${payment.id} -> ${payment.status}`);
        } else if (payment.subscription) {
            // 🔥 COBRANÇA DE CICLO DE RECORRÊNCIA (gerada sozinha pela Asaas, a
            // gente nunca chamou /payments/checkout pra ela) — cria a fatura
            // local agora, senão esse pagamento nunca aparece no painel financeiro.
            try {
                const localSub = await prisma.subscription.findFirst({
                    where: { asaasSubscriptionId: payment.subscription },
                });
                const user = await prisma.user.findFirst({ where: { asaasCustomerId: payment.customer || '' } });
                if (localSub && user) {
                    await prisma.payment.create({
                        data: {
                            subscriptionId: localSub.id,
                            userId: user.id,
                            coachId: localSub.coachId,
                            gatewayAccountId: localSub.gatewayAccountId,
                            asaasPaymentId: payment.id,
                            value: payment.value,
                            netValue: payment.netValue,
                            billingType: payment.billingType || 'CREDIT_CARD',
                            status: payment.status,
                            dueDate: new Date(payment.dueDate),
                            paymentDate: payment.clientPaymentDate ? new Date(payment.clientPaymentDate) : (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event) ? new Date() : null),
                            invoiceUrl: payment.invoiceUrl || null,
                        },
                    });
                    console.log(`✅ Fatura de ciclo recorrente criada no banco: ${payment.id}`);
                }
            } catch (err: any) {
                console.warn('[webhook] Falha ao criar fatura de ciclo recorrente:', err?.message || err);
            }
        }
    }

    // ── LÓGICA ORIGINAL INTACTA: RENOVAÇÃO DO ALUNO ──
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