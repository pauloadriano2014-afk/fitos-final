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



export async function GET(req: NextRequest) {

  try {

    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status');

    const adminId = searchParams.get('adminId');

    const limitParam = parseInt(searchParams.get('limit') || '100', 10);

    const limit = Math.min(Math.max(limitParam, 1), 300);



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

        // Coach só vê cobranças geradas com o coachId dele

        tenantWhere = { coachId: adminId };

      }

      // ADMIN: tenantWhere fica {} → vê tudo

    }



    // ---- Lista de pagamentos (mais recentes primeiro) ----

    const payments = await prisma.payment.findMany({

      where: {

        ...tenantWhere,

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



    // ---- Métricas do mês corrente ----

    const now = new Date();

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);



    const monthPayments = await prisma.payment.findMany({

      where: {

        ...tenantWhere,

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