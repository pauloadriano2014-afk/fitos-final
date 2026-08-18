// app/api/payments/recurrence/status/route.ts
// Consulta o estado da recorrência (cartão salvo) de um aluno.
// GET ?userId=...

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, billingType: 'CREDIT_CARD' },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json({ active: false, status: null });
    }

    return NextResponse.json({
      active: subscription.status === 'ACTIVE',
      status: subscription.status, // PENDING_CHECKOUT | ACTIVE | CANCELLED | EXPIRED
      value: subscription.value,
      cycle: subscription.cycle,
      nextDueDate: subscription.nextDueDate,
      createdAt: subscription.createdAt,
    });
  } catch (error: any) {
    console.error('[recurrence/status] Erro:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao consultar recorrência' },
      { status: 500 }
    );
  }
}
