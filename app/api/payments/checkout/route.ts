// app/api/payments/checkout/route.ts
// 💳 CHECKOUT DA ALUNA (lado do app)
//
// Chamado pela tela de pagamento do TrainerOS. Fluxo:
// 1. Se o user não tem CPF e não veio no body → responde { needsCpf: true }
// 2. Se veio CPF no body → salva no perfil (coleta única)
// 3. Reutiliza a cobrança PENDENTE do ciclo atual se existir (não duplica)
// 4. Se não existe → cria no Asaas usando contractValue + paymentDueDate
//    que o coach já gerencia no financeiro (fonte única da verdade)
// 5. Se o último pagamento do ciclo já foi pago → responde { paid: true }
//
// Body: { userId: string, cpf?: string }

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { findOrCreateCustomer, createPayment, getPixQrCode } from '@/lib/asaas';

const prisma = new PrismaClient();

const DEFAULT_COACH_ID = 'paulo'; // fase 1: coach único

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, cpf } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // ---- 1. CPF: salva se veio no body; exige se não existe ----
    let userCpf = (user as any).cpf || null;
    if (cpf) {
      const digits = String(cpf).replace(/\D/g, '');
      if (digits.length !== 11 && digits.length !== 14) {
        return NextResponse.json({ error: 'CPF inválido. Verifique os números.' }, { status: 400 });
      }
      userCpf = digits;
      await prisma.user.update({ where: { id: user.id }, data: { cpf: digits } as any });
    }
    if (!userCpf) {
      return NextResponse.json({ needsCpf: true });
    }

    // ---- 2. Dados do contrato (fonte: o financeiro que o coach já gerencia) ----
    const value = user.contractValue || 0;
    if (!value || value <= 0) {
      return NextResponse.json(
        { error: 'Seu plano ainda não tem valor definido. Fale com seu coach.' },
        { status: 400 }
      );
    }

    // Vencimento: o do contrato; se já passou, cobra para hoje (Asaas não aceita data passada)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let due = user.paymentDueDate ? new Date(user.paymentDueDate) : today;
    if (due < today) due = today;
    const dueStr = toDateOnly(due);

    // ---- 3. Já existe pagamento deste ciclo? ----
    const cycleRef = user.paymentDueDate ? new Date(user.paymentDueDate) : today;

    const lastPayment = await prisma.payment.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // Já pago neste ciclo? (webhook já avançou o paymentDueDate; o app só precisa recarregar)
    if (
      lastPayment &&
      (lastPayment.status === 'CONFIRMED' || lastPayment.status === 'RECEIVED') &&
      user.paymentDueDate &&
      new Date(user.paymentDueDate) > today
    ) {
      return NextResponse.json({ paid: true });
    }

    // Pendente do mesmo ciclo → reutiliza (não cria duplicada)
    if (
      lastPayment &&
      lastPayment.status === 'PENDING' &&
      toDateOnly(new Date(lastPayment.dueDate)) === toDateOnly(cycleRef >= today ? cycleRef : today)
    ) {
      // Tenta completar o QR PIX se ainda não temos
      let pixQrCode = lastPayment.pixQrCode;
      let pixCopyPaste = lastPayment.pixCopyPaste;
      if (!pixCopyPaste) {
        try {
          const pix = await getPixQrCode(lastPayment.asaasPaymentId);
          pixQrCode = pix?.encodedImage || null;
          pixCopyPaste = pix?.payload || null;
          if (pixCopyPaste) {
            await prisma.payment.update({
              where: { id: lastPayment.id },
              data: { pixQrCode, pixCopyPaste },
            });
          }
        } catch { /* fatura cobre o PIX */ }
      }

      return NextResponse.json({
        success: true,
        payment: {
          id: lastPayment.id,
          value: lastPayment.value,
          dueDate: toDateOnly(new Date(lastPayment.dueDate)),
          status: lastPayment.status,
          invoiceUrl: lastPayment.invoiceUrl,
          pixQrCode,
          pixCopyPaste,
        },
      });
    }

    // ---- 4. Cria a cobrança nova ----
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

    let asaasCustomerId = user.asaasCustomerId;
    if (!asaasCustomerId) {
      const customer = await findOrCreateCustomer({
        name: user.name || 'Aluno',
        cpfCnpj: userCpf,
        email: user.email || undefined,
        externalReference: user.id,
      });
      asaasCustomerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { asaasCustomerId },
      });
    }

    const planLabel = user.contractType || 'Mensal';
    const asaasPayment = await createPayment({
      customer: asaasCustomerId!,
      billingType: 'UNDEFINED', // aluna escolhe PIX/cartão/boleto
      value,
      dueDate: dueStr,
      description: `${planLabel} - Consultoria`,
      externalReference: user.id,
    });

    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;
    try {
      const pix = await getPixQrCode(asaasPayment.id);
      pixQrCode = pix?.encodedImage || null;
      pixCopyPaste = pix?.payload || null;
    } catch { /* fatura cobre o PIX */ }

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        coachId: DEFAULT_COACH_ID,
        gatewayAccountId: gatewayAccount.id,
        asaasPaymentId: asaasPayment.id,
        value,
        billingType: asaasPayment.billingType || 'UNDEFINED',
        status: 'PENDING',
        dueDate: new Date(dueStr),
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
          value,
          dueDate: dueStr,
          status: 'PENDING',
          invoiceUrl: asaasPayment.invoiceUrl,
          pixQrCode,
          pixCopyPaste,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[checkout] Erro:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao preparar pagamento' },
      { status: 500 }
    );
  }
}