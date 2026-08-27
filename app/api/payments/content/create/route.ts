// app/api/payments/content/create/route.ts
// 💳 COMPRA AVULSA DE CONTEÚDO (ebook / audiobook) — PA FLIX / Biblioteca
//
// Quando um conteúdo é marcado como VIP (isVIP=true) e tem um `valor`
// definido, ele aparece BLOQUEADO na Biblioteca do aluno que não tem
// ContentAccess — mas continua visível, com opção de compra avulsa via
// PIX/cartão. Essa rota gera essa cobrança avulsa (mesmo padrão de
// /api/payments/checkout, mas por contentId em vez de ciclo mensal).
//
// Body: { userId: string, contentId: string, cpf?: string }

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { findOrCreateCustomer, createPayment, getPixQrCode } from '@/lib/asaas';
import { requireAuth, canAccessStudent } from '@/lib/auth';

const DEFAULT_COACH_ID = 'paulo'; // fase 1: coach único (dono da conta Asaas)

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, contentId, cpf } = body;

    if (!userId || !contentId) {
      return NextResponse.json({ error: 'userId e contentId são obrigatórios' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // 🔒 Só o próprio aluno, o coach dono dele, ou o time master pode gerar
    // essa cobrança avulsa — antes bastava mandar qualquer userId no body.
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canAccessStudent(auth.user, user.id, user.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const content = await prisma.content.findUnique({ where: { id: contentId } });
    if (!content) {
      return NextResponse.json({ error: 'Conteúdo não encontrado' }, { status: 404 });
    }

    if (!content.isVIP || !content.valor || content.valor <= 0) {
      return NextResponse.json({ error: 'Este conteúdo não está disponível para compra avulsa' }, { status: 400 });
    }

    // ---- Já tem acesso? Não deixa comprar de novo ----
    const existingAccess = await prisma.contentAccess.findUnique({
      where: { userId_contentId: { userId, contentId } },
    });
    if (existingAccess) {
      return NextResponse.json({ alreadyOwned: true });
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

    // ---- 2. Pagamento PENDENTE já existente para este conteúdo? Reutiliza ----
    const lastPayment = await prisma.payment.findFirst({
      where: { userId: user.id, contentId },
      orderBy: { createdAt: 'desc' },
    });

    if (lastPayment && (lastPayment.status === 'CONFIRMED' || lastPayment.status === 'RECEIVED')) {
      // Já pago mas o ContentAccess ainda não foi criado (webhook atrasado) —
      // não recria cobrança, só avisa o app pra recarregar em instantes.
      return NextResponse.json({ paid: true });
    }

    if (lastPayment && lastPayment.status === 'PENDING') {
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

    // ---- 3. Cria a cobrança nova ----
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

    const today = new Date();
    const dueStr = toDateOnly(today);

    const asaasPayment = await createPayment({
      customer: asaasCustomerId!,
      billingType: 'UNDEFINED', // aluna escolhe PIX/cartão
      value: content.valor,
      dueDate: dueStr,
      description: `${content.title} - Biblioteca`,
      externalReference: `conteudo:${user.id}:${content.id}`,
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
        coachId: content.coachId || DEFAULT_COACH_ID,
        gatewayAccountId: gatewayAccount.id,
        contentId: content.id,
        asaasPaymentId: asaasPayment.id,
        value: content.valor,
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
          value: content.valor,
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
    console.error('[payments/content/create] Erro:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao preparar pagamento' },
      { status: 500 }
    );
  }
}
