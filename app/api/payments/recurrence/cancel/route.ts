// app/api/payments/recurrence/cancel/route.ts
// Cancela a recorrência (cartão salvo) de um aluno — volta a cobrar
// manualmente todo ciclo via /api/payments/checkout (PIX/cartão/boleto).
// Body: { userId: string }

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cancelSubscription, cancelCheckout } from '@/lib/asaas';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        billingType: 'CREDIT_CARD',
        status: { in: ['ACTIVE', 'PENDING_CHECKOUT'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json({ success: true, message: 'Nenhuma recorrência ativa encontrada.' });
    }

    // Cancela do lado da Asaas — tenta pelo que existir (assinatura já
    // confirmada, ou checkout ainda pendente de conclusão).
    try {
      if (subscription.asaasSubscriptionId) {
        await cancelSubscription(subscription.asaasSubscriptionId);
      } else if (subscription.asaasCheckoutId) {
        await cancelCheckout(subscription.asaasCheckoutId);
      }
    } catch (err: any) {
      // Se já estava cancelada/expirada do lado da Asaas, segue o baile —
      // o que importa é o estado local ficar CANCELLED de qualquer forma.
      console.warn('[recurrence/cancel] Aviso ao cancelar na Asaas:', err?.message || err);
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[recurrence/cancel] Erro:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao cancelar recorrência' },
      { status: 500 }
    );
  }
}
