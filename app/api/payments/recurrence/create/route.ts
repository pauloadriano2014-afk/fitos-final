// app/api/payments/recurrence/create/route.ts
// 💳 ATIVA RECORRÊNCIA (cartão salvo, cobrança automática todo ciclo)
//
// Diferente de /api/payments/checkout (cobrança avulsa, PIX/cartão/boleto
// manual todo mês), essa rota cria um Asaas Checkout do tipo RECURRENT.
// O aluno é redirecionado pra uma página HOSPEDADA PELA ASAAS pra digitar
// o cartão — o número do cartão nunca passa por este backend. A partir daí
// a Asaas cobra o cartão sozinha a cada ciclo, sem o aluno precisar voltar
// no app pra pagar.
//
// Body: { userId: string, cpf?: string }

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { findOrCreateCustomer, createCheckoutSession } from '@/lib/asaas';

const DEFAULT_COACH_ID = 'paulo'; // fase 1: coach único
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://fitos-final.onrender.com';

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

function cycleFromContractType(contractType: string | null | undefined): 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY' {
  const t = String(contractType || '').toUpperCase();
  if (t.includes('TRIMESTR')) return 'QUARTERLY';
  if (t.includes('SEMESTR')) return 'SEMIANNUALLY';
  if (t.includes('ANUAL')) return 'YEARLY';
  return 'MONTHLY';
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

    // ---- 1. CPF: salva se veio no body; exige se não existe (mesmo padrão do /checkout) ----
    let userCpf = user.cpf || null;
    if (cpf) {
      const digits = String(cpf).replace(/\D/g, '');
      if (digits.length !== 11 && digits.length !== 14) {
        return NextResponse.json({ error: 'CPF inválido. Verifique os números.' }, { status: 400 });
      }
      userCpf = digits;
      await prisma.user.update({ where: { id: user.id }, data: { cpf: digits } });
    }
    if (!userCpf) {
      return NextResponse.json({ needsCpf: true });
    }

    const value = user.contractValue || 0;
    if (!value || value <= 0) {
      return NextResponse.json(
        { error: 'Seu plano ainda não tem valor definido. Fale com seu coach.' },
        { status: 400 }
      );
    }

    // ---- 2. Já tem recorrência ativa? Não deixa duplicar ----
    const existingActive = await prisma.subscription.findFirst({
      where: { userId: user.id, billingType: 'CREDIT_CARD', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (existingActive) {
      return NextResponse.json({ alreadyActive: true });
    }

    // Qualquer checkout pendente antigo (não finalizado) vira obsoleto —
    // essa rota sempre cria um novo, pra não depender de checar expiração
    // do lado da Asaas (não existe endpoint de consulta documentado).
    await prisma.subscription.updateMany({
      where: { userId: user.id, billingType: 'CREDIT_CARD', status: 'PENDING_CHECKOUT' },
      data: { status: 'EXPIRED' },
    });

    // ---- 3. Conta gateway + customer no Asaas (mesmo padrão do /checkout) ----
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
      await prisma.user.update({ where: { id: user.id }, data: { asaasCustomerId } });
    }

    // ---- 4. Vencimento do 1º ciclo: o do contrato; se já passou, cobra pra hoje ----
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let due = user.paymentDueDate ? new Date(user.paymentDueDate) : today;
    if (due < today) due = today;
    const dueStr = toDateOnly(due);

    const cycle = cycleFromContractType(user.contractType);
    const planLabel = user.contractType || 'Mensal';

    // ---- 5. Cria o Checkout (RECURRENT + CREDIT_CARD) ----
    const checkout = await createCheckoutSession({
      customerData: {
        name: user.name || 'Aluno',
        cpfCnpj: userCpf,
        email: user.email || undefined,
        phone: user.phone || undefined,
      },
      value,
      description: `${planLabel} - Consultoria (recorrência)`,
      cycle,
      nextDueDate: dueStr,
      externalReference: `recorrencia:${user.id}`,
      successUrl: `${APP_PUBLIC_URL}/pagamento-recorrencia/sucesso`,
      cancelUrl: `${APP_PUBLIC_URL}/pagamento-recorrencia/cancelado`,
      expiredUrl: `${APP_PUBLIC_URL}/pagamento-recorrencia/expirado`,
    });

    // ---- 6. Salva localmente como PENDING_CHECKOUT — o webhook CHECKOUT_PAID
    // confirma e vira ACTIVE (ver app/api/payments/webhook/route.ts) ----
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        coachId: DEFAULT_COACH_ID,
        gatewayAccountId: gatewayAccount.id,
        asaasCustomerId: asaasCustomerId!,
        asaasCheckoutId: checkout.id,
        planName: planLabel,
        value,
        cycle,
        billingType: 'CREDIT_CARD',
        status: 'PENDING_CHECKOUT',
        nextDueDate: due,
      },
    });

    return NextResponse.json(
      {
        success: true,
        checkoutUrl: checkout.link,
        subscriptionId: subscription.id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[recurrence/create] Erro:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao preparar recorrência' },
      { status: 500 }
    );
  }
}
