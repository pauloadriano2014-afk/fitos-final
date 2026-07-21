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

    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');

    // 🔒 ISOLAMENTO MULTI-TENANT ORIGINAL
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

    // 🗓️ PARSER DE DATA SEGURO
    const now = new Date();
    let targetMonth = now.getMonth() + 1;
    let targetYear = now.getFullYear();

    if (monthParam && monthParam !== 'undefined' && monthParam !== 'null') {
      const parsedM = parseInt(monthParam, 10);
      if (!isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) {
        targetMonth = parsedM;
      } else {
        const str = monthParam.substring(0, 3).toUpperCase();
        const idx = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'].indexOf(str);
        if (idx >= 0) targetMonth = idx + 1;
      }
    }
    if (yearParam && yearParam !== 'undefined' && yearParam !== 'null') {
      const parsedY = parseInt(yearParam, 10);
      if (!isNaN(parsedY) && parsedY > 2000) targetYear = parsedY;
    }

    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    // 🔥 FILTRO DE DATA ORIGINAL EXATO (Sem joins perigosos que quebram o Prisma)
    const dateFilter = {
      OR: [
        { status: { in: PAID_STATUSES }, paymentDate: { gte: monthStart, lte: monthEnd } },
        { status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { gte: monthStart, lte: monthEnd } },
      ],
    };

    // 1. BUSCA DA LISTA
    const rawPayments = await prisma.payment.findMany({
      where: {
        ...tenantWhere,
        ...dateFilter,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          // Buscamos o status da conta para usar no pente-fino do JS
          select: { id: true, name: true, photoUrl: true, phone: true, email: true, accountStatus: true, isFinanceActive: true },
        },
        subscription: {
          select: { id: true, planName: true, cycle: true, status: true },
        },
      },
    });

    // 2. BUSCA DAS MÉTRICAS (Total do mês, sem limite de 100)
    const monthPayments = await prisma.payment.findMany({
      where: {
        ...tenantWhere,
        ...dateFilter,
      },
      select: { 
        status: true, value: true, netValue: true,
        user: { select: { accountStatus: true, isFinanceActive: true } }
      },
    });

    // 🚀 O PENTE-FINO FEITO NO JAVASCRIPT (Não trava o banco de dados)
    const isUserInactive = (user: any) => {
      if (!user) return false;
      if (['REJECTED', 'INACTIVE', 'BLOCKED'].includes(user.accountStatus)) return true;
      if (user.isFinanceActive === false) return true;
      return false;
    };

    let receivedGross = 0;
    let receivedNet = 0;
    let receivedCount = 0;
    let pendingValue = 0;
    let pendingCount = 0;
    let overdueValue = 0;
    let overdueCount = 0;

    for (const p of monthPayments) {
      const inactive = isUserInactive(p.user);
      
      if (PAID_STATUSES.includes(p.status)) {
        // Dinheiro no bolso! Soma tudo que foi pago, não importa o status atual do aluno.
        receivedGross += p.value;
        receivedNet += p.netValue ?? p.value;
        receivedCount++;
      } else if (p.status === 'PENDING') {
        if (inactive) continue; // Pula as pendências de alunos inativos
        pendingValue += p.value;
        pendingCount++;
      } else if (p.status === 'OVERDUE') {
        if (inactive) continue; // Pula vencidos de alunos inativos
        overdueValue += p.value;
        overdueCount++;
      }
    }

    // Passa o pente-fino na lista visual também
    const finalPayments = rawPayments.filter(p => {
      if (PAID_STATUSES.includes(p.status)) return true;
      if (isUserInactive(p.user)) return false;
      return true;
    });

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
      payments: finalPayments.map((p) => ({
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