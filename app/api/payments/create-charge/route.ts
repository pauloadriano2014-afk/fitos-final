// app/api/payments/create-charge/route.ts
// Cria uma cobrança (avulsa ou assinatura) para um aluno
// Body esperado:
// {
//   userId: string,
//   value: number,
//   planName: string,           // ex: "Mensal", "Trimestral"
//   type: "SINGLE" | "SUBSCRIPTION",
//   cycle?: "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY", // se SUBSCRIPTION
//   billingType?: "PIX" | "CREDIT_CARD" | "BOLETO" | "UNDEFINED", // default UNDEFINED
//   dueDate?: string,           // 'YYYY-MM-DD' — default: hoje + 3 dias
//   cpfCnpj: string             // CPF da aluna (obrigatório pro Asaas)
// }

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  findOrCreateCustomer,
  createPayment,
  createSubscription,
  getSubscriptionPayments,
  getPixQrCode,
} from '@/lib/asaas';

const prisma = new PrismaClient();

const DEFAULT_COACH_ID = 'paulo'; // fase 1: coach único

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      value,
      planName,
      type = 'SINGLE',
      cycle = 'MONTHLY',
      billingType = 'UNDEFINED',
      dueDate,
      cpfCnpj,
    } = body;

    // ---- Validações ----
    if (!userId || !value || !planName || !cpfCnpj) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: userId, value, planName, cpfCnpj' },
        { status: 400 }
      );
    }
    if (typeof value !== 'number' || value <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // ---- Conta gateway (fase 1: registro único; cria se não existir) ----
    let gatewayAccount = await prisma.paymentGatewayAccount.findUnique({
      where: { coachId: DEFAULT_COACH_ID },
    });
    if (!gatewayAccount) {
      gatewayAccount = await prisma.paymentGatewayAccount.create({
        data: {
          coachId: DEFAULT_COACH_ID,
          provider: 'ASAAS',
          asaasApiKey: process.env.ASAAS_API_KEY || '',
        },
      });
    }

    // ---- Customer no Asaas (cria ou reutiliza) ----
    let asaasCustomerId = user.asaasCustomerId;
    if (!asaasCustomerId) {
      const customer = await findOrCreateCustomer({
        name: user.name || 'Aluno',
        cpfCnpj,
        email: user.email || undefined,
        externalReference: user.id,
      });
      asaasCustomerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { asaasCustomerId },
      });
    }

    const due = dueDate || defaultDueDate();

    // ---- Cria cobrança ou assinatura ----
    let asaasPayment: any;
    let subscriptionRecord: any = null;

    if (type === 'SUBSCRIPTION') {
      const asaasSub = await createSubscription({
        customer: asaasCustomerId!,
        billingType,
        value,
        nextDueDate: due,
        cycle,
        description: `${planName} - Consultoria PA TEAM ELITE`,
        externalReference: user.id,
      });

      subscriptionRecord = await prisma.subscription.create({
        data: {
          userId: user.id,
          coachId: DEFAULT_COACH_ID,
          gatewayAccountId: gatewayAccount.id,
          asaasCustomerId: asaasCustomerId!,
          asaasSubscriptionId: asaasSub.id,
          planName,
          value,
          cycle,
          billingType,
          status: 'ACTIVE',
          nextDueDate: new Date(due),
        },
      });

      // O Asaas gera a 1ª cobrança da assinatura automaticamente
      const subPayments = await getSubscriptionPayments(asaasSub.id);
      asaasPayment = subPayments?.data?.[0];

      if (!asaasPayment) {
        return NextResponse.json(
          {
            success: true,
            subscriptionId: subscriptionRecord.id,
            warning: 'Assinatura criada; primeira cobrança ainda não disponível.',
          },
          { status: 201 }
        );
      }
    } else {
      asaasPayment = await createPayment({
        customer: asaasCustomerId!,
        billingType,
        value,
        dueDate: due,
        description: `${planName} - Consultoria PA TEAM ELITE`,
        externalReference: user.id,
      });
    }

    // ---- QR Code PIX (se aplicável) ----
    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;
    if (billingType === 'PIX' || billingType === 'UNDEFINED') {
      try {
        const pix = await getPixQrCode(asaasPayment.id);
        pixQrCode = pix?.encodedImage || null;
        pixCopyPaste = pix?.payload || null;
      } catch {
        // QR pode não estar disponível imediatamente; a fatura (invoiceUrl) cobre isso
      }
    }

    // ---- Salva o Payment local ----
    const payment = await prisma.payment.create({
      data: {
        subscriptionId: subscriptionRecord?.id || null,
        userId: user.id,
        coachId: DEFAULT_COACH_ID,
        gatewayAccountId: gatewayAccount.id,
        asaasPaymentId: asaasPayment.id,
        value,
        billingType: asaasPayment.billingType || billingType,
        status: 'PENDING',
        dueDate: new Date(due),
        invoiceUrl: asaasPayment.invoiceUrl || null,
        pixQrCode,
        pixCopyPaste,
      },
    });

    return NextResponse.json(
      {
        success: true,
        payment: {
          id: payment.id,
          asaasPaymentId: asaasPayment.id,
          value,
          dueDate: due,
          status: 'PENDING',
          invoiceUrl: asaasPayment.invoiceUrl,
          pixQrCode,
          pixCopyPaste,
        },
        subscriptionId: subscriptionRecord?.id || null,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[create-charge] Erro:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao criar cobrança' },
      { status: 500 }
    );
  }
}