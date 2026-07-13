// app/api/payments/webhook/route.ts
// Recebe eventos do Asaas (pagamento confirmado, vencido, estornado...)
// e atualiza o banco + destrava o app automaticamente.
//
// IMPORTANTE: o Asaas espera resposta 200 rápida. Se responder erro,
// ele pausa a fila de webhooks e para de enviar eventos até você reativar.
// Por isso: capturamos tudo e SEMPRE respondemos 200 (menos auth inválida).

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Quantos meses avançar o vencimento por ciclo
const CYCLE_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUALLY: 6,
  YEARLY: 12,
};

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function POST(req: NextRequest) {
  try {
    // ---- 1. Autenticação do webhook ----
    // Configuramos um token no painel do Asaas; ele vem neste header.
    // Isso impede que alguém descubra a URL e dispare "pagamentos" falsos.
    const receivedToken = req.headers.get('asaas-access-token');
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;

    if (!expectedToken || receivedToken !== expectedToken) {
      console.warn('[webhook] Token inválido ou ausente');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const event: string = body?.event || '';
    const asaasPayment = body?.payment;

    console.log(`[webhook] Evento recebido: ${event} | payment: ${asaasPayment?.id}`);

    // Só processamos eventos de pagamento que têm o objeto payment
    if (!asaasPayment?.id) {
      return NextResponse.json({ received: true });
    }

    // ---- 2. Busca o Payment local ----
    const payment = await prisma.payment.findUnique({
      where: { asaasPaymentId: asaasPayment.id },
      include: { subscription: true },
    });

    if (!payment) {
      // Cobrança criada fora do app (ex: manual no painel Asaas).
      // Não é erro — só registramos e seguimos.
      console.log(`[webhook] Payment ${asaasPayment.id} não encontrado no banco local. Ignorando.`);
      return NextResponse.json({ received: true });
    }

    // ---- 3. Processa por tipo de evento ----
    switch (event) {
      // 🔥 PAGAMENTO CAIU (PIX/dinheiro = RECEIVED; cartão aprovado = CONFIRMED)
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED': {
        // Idempotência: se já processamos, não faz de novo
        // (o Asaas pode reenviar o mesmo evento)
        if (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') {
          console.log(`[webhook] Payment ${payment.id} já estava pago. Ignorando duplicado.`);
          return NextResponse.json({ received: true });
        }

        const paymentDate = asaasPayment.paymentDate || asaasPayment.confirmedDate;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: event === 'PAYMENT_RECEIVED' ? 'RECEIVED' : 'CONFIRMED',
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            netValue: asaasPayment.netValue ?? null,
            billingType: asaasPayment.billingType || payment.billingType,
          },
        });

        // Avança o vencimento e a assinatura
        const cycle = payment.subscription?.cycle || 'MONTHLY';
        const months = CYCLE_MONTHS[cycle] || 1;

        // Base do novo vencimento: o vencimento da cobrança paga
        // (não a data do pagamento — assim quem paga adiantado não perde dias)
        const newDueDate = addMonths(new Date(payment.dueDate), months);

        if (payment.subscription) {
          await prisma.subscription.update({
            where: { id: payment.subscription.id },
            data: { status: 'ACTIVE', nextDueDate: newDueDate },
          });
        }

        // 🔥 DESTRAVA O APP: atualiza os campos que o useFinanceLock lê
        await prisma.user.update({
          where: { id: payment.userId },
          data: {
            paymentDueDate: newDueDate,
            isFinanceActive: true,
            // Limpa qualquer claim de "Já paguei" pendente — não é mais necessário
            paymentClaimedAt: null,
            paymentClaimStatus: null,
            paymentClaimCycleDueDate: null,
          },
        });

        // 🔔 Push de confirmação pra aluna (não-crítico: falha não quebra o webhook)
        try {
          const user = await prisma.user.findUnique({
            where: { id: payment.userId },
            select: { pushToken: true, name: true },
          });
          if (user?.pushToken) {
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: user.pushToken,
                sound: 'default',
                title: '✅ Pagamento confirmado!',
                body: 'Recebemos seu pagamento. Seu acesso está liberado. Bora treinar! 💪',
              }),
            });
          }
        } catch (pushErr) {
          console.error('[webhook] Erro no push (ignorado):', pushErr);
        }

        console.log(`[webhook] ✅ Pagamento ${payment.id} processado. Novo vencimento: ${newDueDate.toISOString()}`);
        break;
      }

      // 🔴 COBRANÇA VENCEU SEM PAGAMENTO
      case 'PAYMENT_OVERDUE': {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'OVERDUE' },
        });
        if (payment.subscriptionId) {
          await prisma.subscription.update({
            where: { id: payment.subscriptionId },
            data: { status: 'OVERDUE' },
          });
        }
        // NÃO bloqueamos o app aqui — o useFinanceLock já cuida disso
        // pelo paymentDueDate + período de carência que você definiu.
        console.log(`[webhook] ⚠️ Payment ${payment.id} vencido.`);
        break;
      }

      // 💸 ESTORNO
      case 'PAYMENT_REFUNDED': {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        });
        console.log(`[webhook] 💸 Payment ${payment.id} estornado. Revisar manualmente.`);
        break;
      }

      // 🗑️ COBRANÇA DELETADA NO PAINEL
      case 'PAYMENT_DELETED': {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'CANCELED' },
        });
        break;
      }

      default:
        // Eventos que não tratamos ainda (PAYMENT_UPDATED etc.) — só confirma recebimento
        console.log(`[webhook] Evento ${event} sem handler. OK.`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[webhook] Erro:', error?.message || error);
    // Mesmo com erro interno, respondemos 200 para não travar a fila do Asaas.
    // O log fica registrado pra investigarmos.
    return NextResponse.json({ received: true, warning: 'processed_with_error' });
  }
}