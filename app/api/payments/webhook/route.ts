// app/api/payments/webhook/route.ts — v3
// v3: adiciona handler para inscrições do Desafio (Projeto 90 Dias e futuros
// desafios por WhatsApp), verificado ANTES do fluxo de aluno. Nada da lógica
// de coach ou aluno foi alterado.
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { BILLING_PLANS, calcBillingEnd } from '@/config/coachBillingPlans';

export const dynamic = 'force-dynamic';

// 🔥 Usado pelo e-mail de entrega de Produto Digital (mesmo padrão do
// forgot-password/route.ts — fetch direto na API REST do Resend, sem SDK).
const APP_URL = process.env.APP_URL || 'https://www.pauloadrianoteam.com.br';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.RESEND_FROM || 'PA TEAM ELITE <onboarding@resend.dev>';

export async function POST(req: Request) {
    try {
        // 🔒 Verificação do token de autenticação do webhook — só é aplicada
        // se ASAAS_WEBHOOK_TOKEN estiver configurado no Render, pra não
        // quebrar pagamentos em produção antes de você configurar o mesmo
        // valor em Asaas > Integrações > Webhooks > Token de autenticação.
        // Configure isso o quanto antes: sem token, qualquer requisição
        // forjada pode simular "pagamento confirmado".
        const expectedWebhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
        if (expectedWebhookToken) {
            const receivedWebhookToken = req.headers.get('asaas-access-token');
            if (receivedWebhookToken !== expectedWebhookToken) {
                console.warn('[payments/webhook] Token de autenticação ausente ou inválido.');
                return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
            }
        }

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

        // ── HANDLER DE COACH (cobrança avulsa/assinatura antiga, não-Checkout) ─
        if (externalRef.startsWith('coach:')) {
            return await handleCoachPayment(event, payment, externalRef);
        }

        // ── HANDLER DE COMPRA AVULSA DE CONTEÚDO (ebook/audiobook — Biblioteca) ─
        if (externalRef.startsWith('conteudo:')) {
            return await handleContentPurchase(event, payment, externalRef);
        }

        // ── HANDLER DE VENDA DE PRODUTO DIGITAL (página de vendas pública) ────
        if (externalRef.startsWith('produto:')) {
            return await handleProdutoPayment(event, payment, externalRef);
        }

        // ── HANDLER DE RENOVAÇÃO DE CICLO (recorrência via cartão/Checkout) ───
        // Pode ser ciclo de ALUNO (consultoria) ou de COACH (mensalidade da
        // plataforma) — a Asaas não manda um externalReference confiável nesse
        // tipo de cobrança auto-gerada (gerada sozinha a cada ciclo, sem passar
        // pelo Checkout de novo). A gente descobre pela Subscription local
        // vinculada ao asaasSubscriptionId + role do dono dela.
        if (payment.subscription) {
            const localSub = await prisma.subscription.findFirst({
                where: { asaasSubscriptionId: payment.subscription },
            });
            if (localSub) {
                const owner = await prisma.user.findUnique({ where: { id: localSub.userId }, select: { role: true } });
                if (owner?.role === 'COACH') {
                    return await handleCoachSubscriptionRenewal(event, payment, localSub);
                }
            }
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

    if (externalRef.startsWith('coach-recorrencia:')) {
        return await handleCoachCheckoutEvent(event, externalRef, checkoutId);
    }

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

// ─── COACH: ativação de recorrência via Checkout (mensalidade da plataforma) ─
async function handleCoachCheckoutEvent(event: string, externalRef: string, checkoutId: string | undefined) {
    // externalRef formato: "coach-recorrencia:{coachId}:{billingPlan}"
    const parts = externalRef.split(':');
    const coachId = parts[1];
    const billingPlan = parts[2];
    if (!coachId) return NextResponse.json({ received: true });

    let subscription = checkoutId
        ? await prisma.subscription.findUnique({ where: { asaasCheckoutId: checkoutId } })
        : null;

    if (!subscription) {
        subscription = await prisma.subscription.findFirst({
            where: { userId: coachId, billingType: 'CREDIT_CARD', status: 'PENDING_CHECKOUT' },
            orderBy: { createdAt: 'desc' },
        });
    }

    if (!subscription) return NextResponse.json({ received: true });

    if (event === 'CHECKOUT_PAID') {
        // Idempotência: já processado? não repete.
        if (subscription.status === 'ACTIVE') return NextResponse.json({ received: true });

        const plan = BILLING_PLANS[billingPlan] || BILLING_PLANS[subscription.planName];
        const billingStart = new Date();
        const billingEnd = plan
            ? calcBillingEnd(billingStart, plan.months)
            : (() => { const d = new Date(billingStart); d.setMonth(d.getMonth() + 1); return d; })();

        await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'ACTIVE', nextDueDate: billingEnd },
        });

        await prisma.user.update({
            where: { id: coachId },
            data: {
                coachBillingStatus: 'ACTIVE',
                coachBillingStart: billingStart,
                coachBillingEnd: billingEnd,
                coachBillingPlan: billingPlan || subscription.planName,
                ...(plan ? { coachPlan: plan.coachType } : {}),
                accountStatus: 'ACTIVE',
            } as any,
        });

        const coach = await prisma.user.findUnique({ where: { id: coachId }, select: { pushToken: true } });
        if (coach?.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: coach.pushToken,
                    sound: 'default',
                    title: '✅ Pagamento automático ativado!',
                    body: 'Sua mensalidade ELITE FIT agora é renovada automaticamente no cartão. 💪',
                }),
            }).catch(() => {});
        }

        console.log(`✅ Recorrência de coach ativada: coach ${coachId}, subscription ${subscription.id}`);
    }

    if (event === 'CHECKOUT_CANCELED') {
        await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'CANCELLED' } });
    }

    if (event === 'CHECKOUT_EXPIRED') {
        await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'EXPIRED' } });
    }

    return NextResponse.json({ received: true });
}

// ─── COACH: renovação automática de ciclo (assinatura recorrente via cartão) ─
// Quando a Asaas cobra o cartão sozinha a cada ciclo (sem passar pelo Checkout
// de novo), ela manda PAYMENT_CONFIRMED/RECEIVED com `payment.subscription`
// preenchido, mas sem um externalReference confiável nele. O chamador (no topo
// do arquivo) já identificou que essa Subscription local pertence a um coach
// (role === 'COACH') antes de cair aqui.
async function handleCoachSubscriptionRenewal(event: string, payment: any, localSub: any) {
    // Registra a fatura local (mesmo padrão do fluxo de aluno) pra aparecer no histórico
    if (payment?.id) {
        const cobrancaExistente = await prisma.payment.findUnique({ where: { asaasPaymentId: payment.id } });
        if (!cobrancaExistente) {
            try {
                await prisma.payment.create({
                    data: {
                        subscriptionId: localSub.id,
                        userId: localSub.userId,
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
                console.log(`✅ Fatura de ciclo recorrente (coach) criada no banco: ${payment.id}`);
            } catch (err: any) {
                console.warn('[webhook][coach-renewal] Falha ao criar fatura de ciclo:', err?.message || err);
            }
        } else {
            await prisma.payment.update({
                where: { id: cobrancaExistente.id },
                data: { status: payment.status, netValue: payment.netValue, billingType: payment.billingType },
            });
        }
    }

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        const plan = BILLING_PLANS[localSub.planName];
        const billingStart = new Date();
        const billingEnd = plan
            ? calcBillingEnd(billingStart, plan.months)
            : (() => { const d = new Date(billingStart); d.setMonth(d.getMonth() + 1); return d; })();

        await prisma.user.update({
            where: { id: localSub.userId },
            data: {
                coachBillingStatus: 'ACTIVE',
                coachBillingStart: billingStart,
                coachBillingEnd: billingEnd,
                accountStatus: 'ACTIVE',
            } as any,
        });
        await prisma.subscription.update({ where: { id: localSub.id }, data: { nextDueDate: billingEnd } });

        const coach = await prisma.user.findUnique({ where: { id: localSub.userId }, select: { pushToken: true } });
        if (coach?.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: coach.pushToken,
                    sound: 'default',
                    title: '✅ Mensalidade renovada!',
                    body: 'Sua mensalidade ELITE FIT foi renovada automaticamente. Bora trabalhar! 💪',
                }),
            }).catch(() => {});
        }

        console.log(`✅ Ciclo recorrente de coach confirmado: coach ${localSub.userId}`);
    }

    if (event === 'PAYMENT_OVERDUE') {
        await prisma.user.update({ where: { id: localSub.userId }, data: { coachBillingStatus: 'OVERDUE' } as any });
    }

    if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED') {
        await prisma.user.update({
            where: { id: localSub.userId },
            data: { coachBillingStatus: 'CANCELLED', accountStatus: 'REJECTED' } as any,
        });
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

// ─── CONTEÚDO: compra avulsa de ebook/audiobook (Biblioteca) ─────────────────
// externalRef formato: "conteudo:{userId}:{contentId}" — gerado em
// /api/payments/content/create. Ao confirmar, libera o ContentAccess (mesmo
// registro usado pra liberar conteúdo VIP manualmente pelo admin).
async function handleContentPurchase(event: string, payment: any, externalRef: string) {
    const parts = externalRef.split(':');
    const userId = parts[1];
    const contentId = parts[2];
    if (!userId || !contentId) return NextResponse.json({ received: true });

    // Atualiza a fatura local (mesmo padrão dos outros fluxos)
    if (payment?.id) {
        const cobrancaExistente = await prisma.payment.findUnique({ where: { asaasPaymentId: payment.id } });
        if (cobrancaExistente) {
            await prisma.payment.update({
                where: { id: cobrancaExistente.id },
                data: {
                    status: payment.status,
                    netValue: payment.netValue,
                    paymentDate: payment.clientPaymentDate ? new Date(payment.clientPaymentDate) : (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event) ? new Date() : null),
                    billingType: payment.billingType,
                },
            });
        }
    }

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        // Idempotência: @@unique([userId, contentId]) — upsert não duplica se o
        // webhook for reenviado pela Asaas.
        await prisma.contentAccess.upsert({
            where: { userId_contentId: { userId, contentId } },
            update: {},
            create: { userId, contentId },
        });

        const content = await prisma.content.findUnique({ where: { id: contentId }, select: { title: true } });
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
        if (user?.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: user.pushToken,
                    sound: 'default',
                    title: '✅ Compra confirmada!',
                    body: `"${content?.title || 'Seu conteúdo'}" já está liberado na sua Biblioteca.`,
                }),
            }).catch(() => {});
        }

        console.log(`✅ Compra de conteúdo confirmada: user ${userId}, content ${contentId}`);
    }

    return NextResponse.json({ received: true });
}

// ─── PRODUTO DIGITAL: venda via página de vendas pública ─────────────────────
// externalRef formato: "produto:{vendaId}" — gerado em
// /api/produtos/comprar. Diferente da compra de Conteúdo, aqui não existe
// User/ContentAccess: a confirmação só marca a ProdutoVenda como PAGO, e o
// linkEntrega passa a ser liberado pela rota de status (polling do checkout).
async function handleProdutoPayment(event: string, payment: any, externalRef: string) {
    const vendaId = externalRef.split(':')[1];
    if (!vendaId) return NextResponse.json({ received: true });

    const venda = await prisma.produtoVenda.findUnique({
        where: { id: vendaId },
        include: { produto: { select: { id: true, nome: true, slug: true, linkEntrega: true, treinoPrograma: true, cursoPrograma: true } } },
    });
    if (!venda) return NextResponse.json({ received: true });

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
        // Idempotência: não repete o processamento (nem reenvia o e-mail) se a
        // Asaas reenviar o mesmo webhook.
        if (venda.status !== 'PAGO') {
            await prisma.produtoVenda.update({
                where: { id: vendaId },
                data: {
                    status: 'PAGO',
                    paymentDate: payment.clientPaymentDate ? new Date(payment.clientPaymentDate) : new Date(),
                },
            });
            console.log(`✅ Produto: venda ${vendaId} confirmada (${venda.nomeCliente})`);

            // 🔥 Entrega por e-mail — essencial pro boleto (compensa em até
            // alguns dias úteis, o cliente não vai ficar com a aba aberta
            // esperando), mas enviado também pra PIX/cartão como comprovante e
            // backup do link (não depende só de o cliente ficar na página).
            // Erro aqui NUNCA deve derrubar o webhook — a venda já foi marcada
            // PAGO e liberada normalmente pela rota de status/polling.
            try {
                const itens: { nome: string; linkEntrega: string | null }[] = [
                    { nome: venda.produto.nome, linkEntrega: venda.produto.linkEntrega },
                ];
                // 🔥 Todos os itens (principal + bumps) que tiverem treinoPrograma
                // ou cursoPrograma configurado ganham um acesso por link mágico.
                const itensComTreino: { id: string; nome: string; treinoPrograma: string | null }[] = [
                    { id: venda.produto.id, nome: venda.produto.nome, treinoPrograma: venda.produto.treinoPrograma },
                ];
                const itensComCurso: { id: string; nome: string; cursoPrograma: string | null }[] = [
                    { id: venda.produto.id, nome: venda.produto.nome, cursoPrograma: venda.produto.cursoPrograma },
                ];

                let bumpIds: string[] = [];
                try { bumpIds = venda.itensBumpIds ? JSON.parse(venda.itensBumpIds) : []; } catch { /* ignora */ }
                if (bumpIds.length > 0) {
                    const bumpProdutos = await prisma.produtoDigital.findMany({
                        where: { id: { in: bumpIds } },
                        select: { id: true, nome: true, linkEntrega: true, treinoPrograma: true, cursoPrograma: true },
                    });
                    itens.push(...bumpProdutos.map((p) => ({ nome: p.nome, linkEntrega: p.linkEntrega })));
                    itensComTreino.push(...bumpProdutos.map((p) => ({ id: p.id, nome: p.nome, treinoPrograma: p.treinoPrograma })));
                    itensComCurso.push(...bumpProdutos.map((p) => ({ id: p.id, nome: p.nome, cursoPrograma: p.cursoPrograma })));
                }

                const treinoLinks: { nome: string; url: string }[] = [];
                for (const item of itensComTreino) {
                    if (!item.treinoPrograma) continue;
                    const token = crypto.randomBytes(24).toString('hex');
                    const acesso = await prisma.produtoTreinoAcesso.upsert({
                        where: { vendaId_produtoId: { vendaId, produtoId: item.id } },
                        update: {},
                        create: { token, vendaId, produtoId: item.id, nomeCliente: venda.nomeCliente },
                    });
                    treinoLinks.push({ nome: item.nome, url: `${APP_URL}/ProdutoTreino?token=${acesso.token}` });
                }

                const cursoLinks: { nome: string; url: string }[] = [];
                for (const item of itensComCurso) {
                    if (!item.cursoPrograma) continue;
                    const token = crypto.randomBytes(24).toString('hex');
                    const acesso = await prisma.produtoCursoAcesso.upsert({
                        where: { vendaId_produtoId: { vendaId, produtoId: item.id } },
                        update: {},
                        create: { token, vendaId, produtoId: item.id, nomeCliente: venda.nomeCliente },
                    });
                    cursoLinks.push({ nome: item.nome, url: `${APP_URL}/ProdutoCurso?token=${acesso.token}` });
                }

                await sendProdutoDeliveryEmail({
                    nomeCliente: venda.nomeCliente,
                    emailCliente: venda.emailCliente,
                    vendaId,
                    produtoSlug: venda.produto.slug,
                    itens,
                    treinoLinks,
                    cursoLinks,
                });
            } catch (emailError) {
                console.error('[produtos][email] Falhou ao enviar, mas a venda já foi marcada PAGO:', emailError);
            }
        }
    }

    return NextResponse.json({ received: true });
}

// 🔥 Mesmo número usado como contato de suporte em outras telas do app
// (ex: BibliotecaScreen.js) — reaproveitado aqui pra dar um canal de ajuda
// caso o link não funcione ou o cliente tenha alguma dúvida sobre o material.
const SUPORTE_WHATSAPP = '5541997991346';

function buildProdutoEmailHtml(
    nomeCliente: string,
    itens: { nome: string; linkEntrega: string | null }[],
    acompanharLink: string,
    treinoLinks: { nome: string; url: string }[] = [],
    cursoLinks: { nome: string; url: string }[] = []
): string {
    const firstName = (nomeCliente || 'Atleta').split(' ')[0];
    const itensComLink = itens.filter((i) => i.linkEntrega);

    // Lista os itens comprados (recibo) ANTES dos botões de acesso — assim o
    // e-mail deixa claro exatamente o que foi liberado, mesmo pra quem
    // comprou o produto principal + vários itens do order bump juntos.
    const listaItens = itensComLink
        .map((i) => `<li style="color:#DDDDDD;font-size:14px;line-height:24px;">${i.nome}</li>`)
        .join('');

    const botoes = itensComLink
        .map(
            (i) => `
      <a href="${i.linkEntrega}"
         style="display:block;background-color:#8B5CF6;color:#FFFFFF;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:bold;font-size:14px;letter-spacing:0.5px;margin-bottom:12px;">
        ACESSAR: ${i.nome.toUpperCase()}
      </a>`
        )
        .join('');

    // 🔥 TREINO INTERATIVO: destacado num tom diferente (verde) pra se separar
    // visualmente do "baixar material" — é uma experiência à parte (sem
    // senha, direto no navegador).
    const treinoSecao = treinoLinks.length
        ? `
      <p style="color:#AAAAAA;font-size:14px;line-height:22px;margin:25px 0 10px 0;">
        Seu treino interativo já está liberado — dá pra acompanhar cada sessão, marcar como concluída e registrar sua carga direto pelo navegador, sem precisar criar conta:
      </p>
      ${treinoLinks
          .map(
              (t) => `
      <a href="${t.url}"
         style="display:block;background-color:#4DE38F;color:#0a0a0a;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:bold;font-size:14px;letter-spacing:0.5px;margin-bottom:12px;">
        COMEÇAR MEU TREINO: ${t.nome.toUpperCase()}
      </a>`
          )
          .join('')}`
        : '';

    // 🔥 CURSO / ÁREA DE MEMBROS: tom roxo-claro pra diferenciar do treino
    // (verde) e do material estático (roxo escuro dos botões principais).
    // Explica de cara que o conteúdo libera aos poucos, pra ninguém achar
    // que "sumiu" material que na verdade ainda vai desbloquear.
    const cursoSecao = cursoLinks.length
        ? `
      <p style="color:#AAAAAA;font-size:14px;line-height:22px;margin:25px 0 10px 0;">
        Sua área de membros já está liberada — o conteúdo desbloqueia aos poucos, módulo por módulo, então não estranhe se algum módulo ainda aparecer bloqueado (é só acompanhar o prazo mostrado na tela):
      </p>
      ${cursoLinks
          .map(
              (c) => `
      <a href="${c.url}"
         style="display:block;background-color:#C4B5FD;color:#1E1030;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:bold;font-size:14px;letter-spacing:0.5px;margin-bottom:12px;">
        ACESSAR MEU CURSO: ${c.nome.toUpperCase()}
      </a>`
          )
          .join('')}`
        : '';

    const whatsappLink = `https://wa.me/${SUPORTE_WHATSAPP}?text=${encodeURIComponent(`Oi! Comprei "${itensComLink[0]?.nome || 'um material'}" e preciso de ajuda com o acesso.`)}`;

    return `
  <div style="background-color:#0a0a0a;padding:40px 20px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background-color:#1E1E1E;border-radius:16px;padding:35px 30px;border:1px solid #333;">
      <h1 style="color:#8B5CF6;font-size:20px;letter-spacing:1px;margin:0 0 8px 0;">🎉 COMPRA CONFIRMADA!</h1>
      <p style="color:#FFFFFF;font-size:15px;line-height:24px;margin:20px 0 8px 0;">
        Fala, <strong>${firstName}</strong>! Recebemos a confirmação do seu pagamento — muito obrigado pela confiança! 🙌
      </p>
      <p style="color:#AAAAAA;font-size:14px;line-height:22px;margin:0 0 10px 0;">
        Você garantiu:
      </p>
      <ul style="margin:0 0 25px 0;padding-left:20px;">${listaItens}</ul>
      ${botoes}
      ${treinoSecao}
      ${cursoSecao}
      <p style="color:#AAAAAA;font-size:14px;line-height:22px;margin:25px 0 0 0;">
        Esperamos que esse material faça toda a diferença nos seus resultados! Qualquer dúvida sobre o acesso, chama a gente no
        <a href="${whatsappLink}" style="color:#C4B5FD;font-weight:bold;">WhatsApp</a> que vamos adorar ajudar. 💜
      </p>
      <p style="color:#777777;font-size:12px;line-height:19px;margin:25px 0 0 0;">
        Guarde este e-mail — você pode voltar aqui sempre que quiser baixar seu material de novo.
        Se preferir, também dá pra acessar pelo site: <a href="${acompanharLink}" style="color:#C4B5FD;">${acompanharLink}</a>
      </p>
      <hr style="border:none;border-top:1px solid #333;margin:25px 0;" />
      <p style="color:#555555;font-size:11px;text-align:center;margin:0;">
        PA TEAM ELITE — pauloadrianoteam.com.br
      </p>
    </div>
  </div>`;
}

async function sendProdutoDeliveryEmail(params: {
    nomeCliente: string;
    emailCliente: string;
    vendaId: string;
    produtoSlug: string;
    itens: { nome: string; linkEntrega: string | null }[];
    treinoLinks?: { nome: string; url: string }[];
    cursoLinks?: { nome: string; url: string }[];
}) {
    if (!RESEND_API_KEY || !params.emailCliente) return;

    const firstName = (params.nomeCliente || 'Atleta').split(' ')[0];
    const acompanharLink = `${APP_URL}/Produto?id=${encodeURIComponent(params.produtoSlug)}&venda=${encodeURIComponent(params.vendaId)}`;
    const html = buildProdutoEmailHtml(params.nomeCliente, params.itens, acompanharLink, params.treinoLinks || [], params.cursoLinks || []);

    const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: FROM_EMAIL,
            to: [params.emailCliente],
            subject: `🎉 ${firstName}, seu material já está liberado!`,
            html,
        }),
    });

    if (!emailRes.ok) {
        const errBody = await emailRes.json().catch(() => ({}));
        console.error('[produtos][email] Erro do Resend:', emailRes.status, errBody);
    }
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