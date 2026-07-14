// app/api/admin/payments/route.ts
// 📊 PAINEL DE PAGAMENTOS (ADMIN)
//
// GET → lista as cobranças Asaas registradas no banco (atualizadas pelo webhook)
//       + métricas resumidas do mês corrente.
//
// Query params (opcionais):
//   ?status=PENDING|CONFIRMED|RECEIVED|OVERDUE|REFUNDED|CANCELED
//   ?limit=100 (default 100, máx 300)

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const PAID_STATUSES = ['CONFIRMED', 'RECEIVED'];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Math.min(Math.max(limitParam, 1), 300);

    // ---- Lista de pagamentos (mais recentes primeiro) ----
    const payments = await prisma.payment.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, name: true, photoUrl: true, phone: true, email: true },
        },
        subscription: {
          select: { id: true, planName: true, cycle: true, status: true },
        },
      },
    });

    // ---- Métricas do mês corrente ----
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthPayments = await prisma.payment.findMany({
      where: {
        OR: [
          // Pagos neste mês (pela data de pagamento)
          { status: { in: PAID_STATUSES }, paymentDate: { gte: monthStart, lte: monthEnd } },
          // Pendentes/vencidos com vencimento neste mês
          { status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { gte: monthStart, lte: monthEnd } },
        ],
      },
      select: { status: true, value: true, netValue: true },
    });

    let receivedGross = 0;
    let receivedNet = 0;
    let receivedCount = 0;
    let pendingValue = 0;
    let pendingCount = 0;
    let overdueValue = 0;
    let overdueCount = 0;

    for (const p of monthPayments) {
      if (PAID_STATUSES.includes(p.status)) {
        receivedGross += p.value;
        receivedNet += p.netValue ?? p.value;
        receivedCount++;
      } else if (p.status === 'PENDING') {
        pendingValue += p.value;
        pendingCount++;
      } else if (p.status === 'OVERDUE') {
        overdueValue += p.value;
        overdueCount++;
      }
    }

    return NextResponse.json({
      metrics: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        receivedGross,
        receivedNet,
        receivedCount,
        pendingValue,
        pendingCount,
        overdueValue,
        overdueCount,
      },
      payments: payments.map((p) => ({
        id: p.id,
        asaasPaymentId: p.asaasPaymentId,
        value: p.value,
        netValue: p.netValue,
        billingType: p.billingType,
        status: p.status,
        dueDate: p.dueDate,
        paymentDate: p.paymentDate,
        invoiceUrl: p.invoiceUrl,
        createdAt: p.createdAt,
        isSubscription: !!p.subscriptionId,
        planName: p.subscription?.planName || null,
        user: p.user,
      })),
    });
  } catch (error: any) {
    console.error('[admin/payments] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao listar pagamentos' }, { status: 500 });
  }
}