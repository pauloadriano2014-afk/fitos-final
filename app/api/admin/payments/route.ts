// app/api/admin/payments/route.ts
// 📊 PAINEL DE PAGAMENTOS (ADMIN)
// 🔒 ISOLAMENTO MULTI-TENANT:
//   - ADMIN (Paulo/Adri): vê todos os pagamentos
//   - COACH parceiro: vê só os pagamentos com coachId dele

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

const PAID_STATUSES = ['CONFIRMED', 'RECEIVED'];
const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const adminId = searchParams.get('adminId');
    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Math.min(Math.max(limitParam, 1), 300);

    // Parâmetros de Data do Front-end
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');

    // 🔒 ISOLAMENTO MULTI-TENANT
    let tenantWhere: any = {};

    if (adminId) {
      const requester = await prisma.user.findUnique({
        where: { id: adminId },
        select: { id: true, role: true, accountStatus: true },
      });

      if (!requester || !['ADMIN', 'COACH'].includes(requester.role)) {
        return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 });
      }

      if (requester.role === 'COACH') {
        if (requester.accountStatus !== 'ACTIVE') {
          return NextResponse.json({ error: 'Conta aguardando aprovação' }, { status: 403 });
        }
        tenantWhere = { coachId: adminId };
      }
    }

    // ---- Mês e Ano Alvo ----
    const now = new Date();
    const targetMonth = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;
    const targetYear = yearParam ? parseInt(yearParam, 10) : now.getFullYear();

    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    // 🔥 CORREÇÃO 1: Bloqueia qualquer fatura de aluno que não esteja 'ACTIVE'
    const userFilter = { user: { accountStatus: 'ACTIVE' } };

    // Filtro de data geral para a lista
    const dateFilterList = {
      OR: [
        { dueDate: { gte: monthStart, lte: monthEnd } },
        { paymentDate: { gte: monthStart, lte: monthEnd } }
      ]
    };

    // ---- 1. Lista de pagamentos (Com limite para não travar a tela) ----
    const payments = await prisma.payment.findMany({
      where: {
        ...tenantWhere,
        ...userFilter, 
        ...dateFilterList,
        ...(status ? { status } : {}),
      },
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

    // ---- 2. Métricas do Mês (🔥 CORREÇÃO 2: Feita separada e sem limite de 100 itens!) ----
    const monthPayments = await prisma.payment.findMany({
      where: {
        ...tenantWhere,
        ...userFilter,
        OR: [
          { status: { in: PAID_STATUSES }, paymentDate: { gte: monthStart, lte: monthEnd } },
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
        month: targetMonth,
        year: targetYear,
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

// 🔥 ROTA DE EXCLUSÃO DE FATURA
export async function DELETE(req: NextRequest) {
  try {
    const { paymentId } = await req.json();

    if (!paymentId) return NextResponse.json({ error: 'Falta o ID do pagamento.' }, { status: 400 });

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId }
    });

    if (!payment || !payment.asaasPaymentId) {
      return NextResponse.json({ error: 'Cobrança não encontrada ou sem ID do Asaas.' }, { status: 404 });
    }

    let apiKey = process.env.ASAAS_API_KEY!;
    if (payment.coachId) {
      const coach: any = await prisma.user.findUnique({ 
        where: { id: payment.coachId },
        select: { coachAsaasApiKey: true }
      });
      if (coach && coach.coachAsaasApiKey) {
        apiKey = String(coach.coachAsaasApiKey);
      }
    }

    const asaasRes = await fetch(`${ASAAS_BASE_URL}/payments/${payment.asaasPaymentId}`, {
      method: 'DELETE',
      headers: { 'access_token': apiKey }
    });

    if (asaasRes.ok) {
      await prisma.payment.delete({ where: { id: paymentId } });
      return NextResponse.json({ ok: true });
    } else {
      const asaasData = await asaasRes.json();
      const errorMsg = asaasData.errors?.[0]?.description || 'Erro ao cancelar no Asaas.';
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

  } catch (error: any) {
    console.error('[admin/payments DELETE] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro interno ao cancelar fatura.' }, { status: 500 });
  }
}