// app/api/finance/invoice/route.ts
// 🧾 EMISSÃO DE NOTA FISCAL (NFS-e via Asaas) -- por botão manual, um
// pagamento/recebimento de cada vez (nunca automático -- decisão do Paulo).
//
// POST { paymentId }              -- nota vinculada a uma cobrança Asaas já
//                                    paga (o valor/data vêm do Payment).
// POST { manualReceiptId, cpfCnpj?, email? } -- nota AVULSA (o aluno nunca
//                                    pagou pela Asaas) -- precisa de um
//                                    "customer" Asaas: reaproveita o do
//                                    aluno se ele já tiver, ou cria um novo
//                                    a partir do CPF/CNPJ informado.
//
// Fase 1: só cobre a conta do 'paulo' (PA ELITE TEAM LTDA) -- ver nota em
// fiscal-config/route.ts sobre por que coach parceiro ainda não é suportado.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';
import { findOrCreateCustomer, createInvoice } from '@/lib/asaas';

export const dynamic = 'force-dynamic';

const PLATFORM_COACH_ID = 'paulo';

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireMaster(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { paymentId, manualReceiptId, cpfCnpj, email } = body;

    if (!paymentId && !manualReceiptId) {
      return NextResponse.json({ error: 'paymentId ou manualReceiptId é obrigatório.' }, { status: 400 });
    }

    const gatewayAccount = await prisma.paymentGatewayAccount.findUnique({
      where: { coachId: PLATFORM_COACH_ID },
    });
    if (!gatewayAccount) {
      return NextResponse.json({ error: 'Nenhuma conta Asaas configurada ainda.' }, { status: 400 });
    }
    if (!gatewayAccount.defaultServiceDescription || !gatewayAccount.defaultMunicipalServiceName) {
      return NextResponse.json(
        { error: 'Configure o serviço padrão de nota fiscal antes de emitir.', needsServiceConfig: true },
        { status: 400 }
      );
    }

    // 🔒 Não deixa duplicar nota pro mesmo pagamento/recebimento -- se já
    // existe uma que não deu erro/não foi cancelada, devolve ela em vez de
    // criar outra na Asaas.
    const existing = await prisma.invoice.findFirst({
      where: {
        OR: [
          paymentId ? { paymentId } : undefined,
          manualReceiptId ? { manualReceiptId } : undefined,
        ].filter(Boolean) as any,
        status: { notIn: ['ERROR', 'CANCELED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return NextResponse.json({ success: true, invoice: existing, alreadyExisted: true });
    }

    let asaasPaymentRef: string | undefined;
    let asaasCustomerId: string | undefined;
    let value: number;
    let studentName: string;
    let effectiveDate: string;

    if (paymentId) {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!payment) {
        return NextResponse.json({ error: 'Pagamento não encontrado.' }, { status: 404 });
      }
      if (!['CONFIRMED', 'RECEIVED'].includes(payment.status)) {
        return NextResponse.json({ error: 'Só é possível emitir nota de um pagamento já recebido.' }, { status: 400 });
      }
      asaasPaymentRef = payment.asaasPaymentId;
      value = payment.value;
      studentName = payment.user?.name || 'Aluno';
      effectiveDate = toDateOnly(payment.paymentDate ? new Date(payment.paymentDate) : new Date());
    } else {
      const receipt = await prisma.manualReceipt.findUnique({ where: { id: manualReceiptId } });
      if (!receipt) {
        return NextResponse.json({ error: 'Recebimento não encontrado.' }, { status: 404 });
      }
      value = receipt.value;
      studentName = receipt.studentName;
      effectiveDate = toDateOnly(new Date(receipt.receivedAt));

      // ---- Resolve o "customer" Asaas (obrigatório pra nota avulsa) ----
      let studentUser: { id: string; name: string | null; email: string | null; cpf: string | null; asaasCustomerId: string | null } | null = null;
      if (receipt.studentId) {
        studentUser = await prisma.user.findUnique({
          where: { id: receipt.studentId },
          select: { id: true, name: true, email: true, cpf: true, asaasCustomerId: true },
        });
      }

      asaasCustomerId = studentUser?.asaasCustomerId || undefined;
      if (!asaasCustomerId) {
        const finalCpf = cpfCnpj || studentUser?.cpf;
        if (!finalCpf) {
          return NextResponse.json({ needsCpf: true, error: 'Informe o CPF/CNPJ do aluno pra emitir a nota.' }, { status: 400 });
        }
        const digits = String(finalCpf).replace(/\D/g, '');
        if (digits.length !== 11 && digits.length !== 14) {
          return NextResponse.json({ error: 'CPF/CNPJ inválido. Verifique os números.' }, { status: 400 });
        }
        const customer = await findOrCreateCustomer(
          {
            name: studentUser?.name || receipt.studentName,
            cpfCnpj: digits,
            email: studentUser?.email || email || undefined,
            externalReference: studentUser?.id,
          },
          gatewayAccount.asaasApiKey
        );
        asaasCustomerId = customer.id;
        if (studentUser?.id) {
          await prisma.user.update({ where: { id: studentUser.id }, data: { asaasCustomerId } });
        }
      }
    }

    const asaasInvoice = await createInvoice(
      {
        payment: asaasPaymentRef,
        customer: asaasPaymentRef ? undefined : asaasCustomerId,
        serviceDescription: gatewayAccount.defaultServiceDescription,
        value,
        effectiveDate,
        municipalServiceId: gatewayAccount.defaultMunicipalServiceId || undefined,
        municipalServiceCode: gatewayAccount.defaultMunicipalServiceCode || undefined,
        municipalServiceName: gatewayAccount.defaultMunicipalServiceName || undefined,
        taxes: gatewayAccount.defaultIssRate != null ? { issRate: gatewayAccount.defaultIssRate } : undefined,
      },
      gatewayAccount.asaasApiKey
    );

    const invoice = await prisma.invoice.create({
      data: {
        coachId: PLATFORM_COACH_ID,
        asaasInvoiceId: asaasInvoice.id,
        paymentId: paymentId || null,
        manualReceiptId: manualReceiptId || null,
        studentName,
        value,
        status: asaasInvoice.status || 'SCHEDULED',
        pdfUrl: asaasInvoice.pdfUrl || null,
      },
    });

    return NextResponse.json({ success: true, invoice });
  } catch (error: any) {
    console.error('[finance/invoice] Erro:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Erro ao emitir nota fiscal' }, { status: 500 });
  }
}
