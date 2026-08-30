// app/api/finance/report/route.ts
// 📄 RELATÓRIO FINANCEIRO DO COACH (para declaração de imposto de renda)
//
// Gera os dados (o PDF em si é montado no app, ver mobile/src/utils/financeReportPdfUtils.js)
// de um relatório ANUAL (resumo mês a mês) ou MENSAL (pagamento por pagamento)
// contendo SOMENTE valores efetivamente recebidos (status CONFIRMED/RECEIVED).
// Cobranças pendentes/vencidas ficam de fora de propósito — isso aqui é
// pensado como apoio pra declaração/contador, não uma previsão financeira.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId, canActAsCoach } from '@/lib/auth';
import { PAULO_ID } from '@/lib/masterIds';

export const dynamic = 'force-dynamic';

const PAID_STATUSES = ['CONFIRMED', 'RECEIVED'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// 🧾 Emissão de nota fiscal (fase 1) só existe pra essa conta -- ver
// app/api/finance/invoice e a discussão sobre DEFAULT_COACH_ID hardcoded
// nas rotas de cobrança.
const PLATFORM_COACH_ID = 'paulo';

// 🔥 ACHADO (30/08): as rotas de cobrança (create-charge/checkout/
// recurrence/create) salvam TODO Payment/Subscription com
// `coachId: 'paulo'` (a string literal DEFAULT_COACH_ID), nunca com o
// coachId de verdade do aluno -- e o "coachId de verdade do Paulo" pro
// resto do sistema (login, auth, isMasterId) é PAULO_ID (um UUID de
// verdade). Ou seja: os Payments do Paulo SÓ aparecem se a gente procurar
// por essa string literal 'paulo', não pelo PAULO_ID real. Sem esse ajuste,
// o relatório do próprio Paulo mostraria R$ 0 de Asaas sempre (só os
// recebimentos manuais apareceriam, que são salvos com o coachId real).
// Pra Adri (ADRI_ID) isso NÃO se aplica -- hoje não dá pra saber quanto de
// 'paulo' era aluno dela, então o relatório dela mostra só os recebimentos
// manuais até esse ponto ser resolvido na raiz (rotas de cobrança).
function resolvePaymentCoachIds(coachId: string): string[] {
  return coachId === PAULO_ID ? [PAULO_ID, PLATFORM_COACH_ID] : [coachId];
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get('mode') || 'annual').toLowerCase();
    if (!['annual', 'monthly'].includes(mode)) {
      return NextResponse.json({ error: 'mode inválido (use annual ou monthly)' }, { status: 400 });
    }

    const now = new Date();
    const yearParam = parseInt(searchParams.get('year') || '', 10);
    const year = !isNaN(yearParam) && yearParam > 2000 ? yearParam : now.getFullYear();

    let month: number | null = null;
    if (mode === 'monthly') {
      const monthParam = parseInt(searchParams.get('month') || '', 10);
      month = !isNaN(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1;
    }

    // 🔒 Isolamento multi-tenant: coach parceiro só vê o próprio relatório.
    // Master pode gerar em nome de um coach específico via ?coachId=, ou o
    // próprio relatório dele (caso tenha pagamentos vinculados diretamente).
    const requestedCoachId = searchParams.get('coachId');
    let coachId: string;
    if (isMasterId(auth.user.id)) {
      coachId = requestedCoachId || auth.user.id;
    } else {
      if (requestedCoachId && !canActAsCoach(auth.user, requestedCoachId)) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
      }
      coachId = auth.user.id;
    }

    const coach = await prisma.user.findUnique({
      where: { id: coachId },
      select: { id: true, name: true, email: true, cpf: true },
    });
    if (!coach) {
      return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });
    }

    if (mode === 'annual') {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

      const payments = await prisma.payment.findMany({
        where: {
          coachId: { in: resolvePaymentCoachIds(coachId) },
          status: { in: PAID_STATUSES },
          paymentDate: { gte: yearStart, lte: yearEnd },
        },
        select: { value: true, netValue: true, paymentDate: true },
      });

      // 🔥 Recebimentos manuais (PIX direto, dinheiro etc. — fora da Asaas)
      // entram no relatório do mesmo jeito, já que pra imposto de renda o
      // que importa é o total recebido, não por qual canal entrou.
      const manualReceipts = await prisma.manualReceipt.findMany({
        where: { coachId, receivedAt: { gte: yearStart, lte: yearEnd } },
        select: { value: true, receivedAt: true },
      });

      const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: MONTH_NAMES[i],
        grossValue: 0,
        netValue: 0,
        count: 0,
      }));

      let totalGross = 0;
      let totalNet = 0;
      let totalCount = 0;

      for (const p of payments) {
        if (!p.paymentDate) continue;
        const idx = new Date(p.paymentDate).getMonth();
        months[idx].grossValue += p.value;
        months[idx].netValue += p.netValue ?? p.value;
        months[idx].count += 1;
        totalGross += p.value;
        totalNet += p.netValue ?? p.value;
        totalCount += 1;
      }

      for (const r of manualReceipts) {
        const idx = new Date(r.receivedAt).getMonth();
        months[idx].grossValue += r.value;
        months[idx].netValue += r.value; // recebimento manual não tem taxa de gateway
        months[idx].count += 1;
        totalGross += r.value;
        totalNet += r.value;
        totalCount += 1;
      }

      return NextResponse.json({
        mode: 'annual',
        year,
        coach,
        months,
        totals: { grossValue: totalGross, netValue: totalNet, count: totalCount },
        generatedAt: new Date().toISOString(),
      });
    }

    // mode === 'monthly'
    const monthStart = new Date(year, (month as number) - 1, 1);
    const monthEnd = new Date(year, month as number, 0, 23, 59, 59, 999);

    const payments = await prisma.payment.findMany({
      where: {
        coachId: { in: resolvePaymentCoachIds(coachId) },
        status: { in: PAID_STATUSES },
        paymentDate: { gte: monthStart, lte: monthEnd },
      },
      orderBy: { paymentDate: 'asc' },
      include: {
        user: { select: { id: true, name: true } },
        subscription: { select: { id: true, planName: true, cycle: true } },
      },
    });

    // 🔥 Recebimentos manuais (PIX direto, dinheiro etc.) do mesmo mês —
    // entram junto na lista itemizada, marcados com source: 'MANUAL' pra
    // ficar claro no PDF qual veio da Asaas e qual foi lançado à mão.
    const manualReceipts = await prisma.manualReceipt.findMany({
      where: { coachId, receivedAt: { gte: monthStart, lte: monthEnd } },
      orderBy: { receivedAt: 'asc' },
    });

    // 🧾 Notas fiscais já emitidas pra esses pagamentos/recebimentos (fase 1:
    // só existe pra coachId 'paulo' -- ver app/api/finance/invoice) -- entra
    // junto na resposta pra a tela mostrar "Emitir Nota" ou o status/PDF de
    // quem já tem, sem precisar de uma chamada separada.
    const paymentIds = payments.map((p: (typeof payments)[number]) => p.id);
    const manualReceiptIds = manualReceipts.map((r: (typeof manualReceipts)[number]) => r.id);
    const invoices = (paymentIds.length || manualReceiptIds.length)
      ? await prisma.invoice.findMany({
          where: {
            OR: [
              paymentIds.length ? { paymentId: { in: paymentIds } } : undefined,
              manualReceiptIds.length ? { manualReceiptId: { in: manualReceiptIds } } : undefined,
            ].filter(Boolean) as any,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const invoiceByPaymentId = new Map<string, (typeof invoices)[number]>();
    const invoiceByManualReceiptId = new Map<string, (typeof invoices)[number]>();
    for (const inv of invoices) {
      if (inv.paymentId && !invoiceByPaymentId.has(inv.paymentId)) invoiceByPaymentId.set(inv.paymentId, inv);
      if (inv.manualReceiptId && !invoiceByManualReceiptId.has(inv.manualReceiptId)) invoiceByManualReceiptId.set(inv.manualReceiptId, inv);
    }
    const invoiceSummary = (inv: (typeof invoices)[number] | undefined) =>
      inv ? { id: inv.id, status: inv.status, pdfUrl: inv.pdfUrl, errorMessage: inv.errorMessage } : null;

    let totalGross = 0;
    let totalNet = 0;

    const asaasItems = payments.map((p: (typeof payments)[number]) => {
      totalGross += p.value;
      totalNet += p.netValue ?? p.value;
      return {
        id: p.id,
        source: 'ASAAS',
        studentName: p.user?.name || 'Aluno',
        value: p.value,
        netValue: p.netValue ?? p.value,
        billingType: p.billingType,
        paymentDate: p.paymentDate,
        isSubscription: !!p.subscriptionId,
        planName: p.subscription?.planName || null,
        invoice: invoiceSummary(invoiceByPaymentId.get(p.id)),
      };
    });

    const manualItems = manualReceipts.map((r: (typeof manualReceipts)[number]) => {
      totalGross += r.value;
      totalNet += r.value;
      return {
        id: r.id,
        source: 'MANUAL',
        studentName: r.studentName,
        value: r.value,
        netValue: r.value,
        billingType: r.method,
        paymentDate: r.receivedAt,
        isSubscription: false,
        planName: null,
        note: r.note || null,
        invoice: invoiceSummary(invoiceByManualReceiptId.get(r.id)),
      };
    });

    const items = [...asaasItems, ...manualItems].sort(
      (a, b) => new Date(a.paymentDate as any).getTime() - new Date(b.paymentDate as any).getTime()
    );

    return NextResponse.json({
      mode: 'monthly',
      year,
      month,
      monthName: MONTH_NAMES[(month as number) - 1],
      coach,
      items,
      totals: { grossValue: totalGross, netValue: totalNet, count: items.length },
      invoiceSupported: coachId === PAULO_ID,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[finance/report] Erro:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao gerar relatório financeiro' }, { status: 500 });
  }
}
