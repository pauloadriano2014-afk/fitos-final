// app/api/payments/coach-recurrence/create/route.ts
// 💳 ATIVA RECORRÊNCIA (cartão salvo) PARA COACH PARCEIRO — mensalidade da
// plataforma ELITE FIT, paga pelo próprio coach para Paulo (DEFAULT_COACH_ID).
//
// Espelha /api/payments/recurrence/create (recorrência do ALUNO pro coach),
// mas aqui é o pagamento do COACH pra Paulo. Mesma estratégia: Asaas Checkout
// hospedado (RECURRENT + CREDIT_CARD) — o cartão nunca passa pelo backend.
//
// Body: { coachId: string, billingPlan?: string, cpf?, postalCode?, address?, addressNumber?, province?, complement? }
// Se billingPlan não vier, infere a partir do coachBillingPlan/coachPlan atual
// do coach (mesma lógica já usada em TabAssinatura.js pro botão avulso).

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { findOrCreateCustomer, createCheckoutSession } from '@/lib/asaas';
import { BILLING_PLANS } from '@/config/coachBillingPlans';

const DEFAULT_COACH_ID = 'paulo'; // fase 1: coach único (dono da plataforma)
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://fitos-final.onrender.com';

function toDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

function cycleFromMonths(months: number): 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY' {
  if (months >= 12) return 'YEARLY';
  if (months >= 6) return 'SEMIANNUALLY';
  if (months >= 3) return 'QUARTERLY';
  return 'MONTHLY';
}

// Mesma inferência de plano padrão usada em TabAssinatura.js (quando o coach
// ainda não tem um billingPlan detalhado salvo, ex: só "PERSONAL" cru)
function inferBillingPlan(coach: { coachBillingPlan?: string | null; coachPlan?: string | null }): string {
  if (coach.coachBillingPlan && coach.coachBillingPlan.includes('_')) return coach.coachBillingPlan;
  const base = coach.coachPlan || 'PERSONAL';
  if (base === 'NUTRICIONISTA') return 'NUTRI_MONTHLY';
  if (base === 'ELITE') return 'ELITE_MONTHLY';
  return 'PERSONAL_MONTHLY';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { coachId, cpf, postalCode, address, addressNumber, province, complement } = body;
    let { billingPlan } = body;

    if (!coachId) {
      return NextResponse.json({ error: 'coachId é obrigatório' }, { status: 400 });
    }

    const coach = await prisma.user.findUnique({ where: { id: coachId } });
    if (!coach) {
      return NextResponse.json({ error: 'Coach não encontrado' }, { status: 404 });
    }

    if (!billingPlan || !BILLING_PLANS[billingPlan]) {
      billingPlan = inferBillingPlan(coach);
    }
    const plan = BILLING_PLANS[billingPlan];
    if (!plan) {
      return NextResponse.json({ error: `Plano não reconhecido: ${billingPlan}` }, { status: 400 });
    }

    // ---- 1. CPF: salva se veio no body; exige se não existe (mesmo padrão do fluxo de aluno) ----
    let coachCpf = coach.cpf || null;
    if (cpf) {
      const digits = String(cpf).replace(/\D/g, '');
      if (digits.length !== 11 && digits.length !== 14) {
        return NextResponse.json({ error: 'CPF inválido. Verifique os números.' }, { status: 400 });
      }
      coachCpf = digits;
      await prisma.user.update({ where: { id: coach.id }, data: { cpf: digits } });
    }
    if (!coachCpf) {
      return NextResponse.json({ needsCpf: true });
    }

    // ---- 1b. Endereço: a Asaas exige pra Checkout de cartão recorrente ----
    let coachAddress = coach.address || null;
    let coachAddressNumber = coach.addressNumber || null;
    let coachProvince = coach.province || null;
    let coachPostalCode = coach.postalCode || null;
    let coachComplement = coach.complement || null;

    const gotNewAddress = address || addressNumber || province || postalCode;
    if (gotNewAddress) {
      const cepDigits = String(postalCode || '').replace(/\D/g, '');
      if (!address || !addressNumber || !province || cepDigits.length !== 8) {
        return NextResponse.json(
          { error: 'Endereço incompleto. Preencha CEP, rua, número e bairro.' },
          { status: 400 }
        );
      }
      coachAddress = String(address).trim();
      coachAddressNumber = String(addressNumber).trim();
      coachProvince = String(province).trim();
      coachPostalCode = cepDigits;
      coachComplement = complement ? String(complement).trim() : null;
      await prisma.user.update({
        where: { id: coach.id },
        data: {
          address: coachAddress,
          addressNumber: coachAddressNumber,
          province: coachProvince,
          postalCode: coachPostalCode,
          complement: coachComplement,
        },
      });
    }
    if (!coachAddress || !coachAddressNumber || !coachProvince || !coachPostalCode) {
      return NextResponse.json({ needsAddress: true });
    }

    // ---- 2. Já tem recorrência ativa? Não deixa duplicar ----
    const existingActive = await prisma.subscription.findFirst({
      where: { userId: coach.id, billingType: 'CREDIT_CARD', status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    if (existingActive) {
      return NextResponse.json({ alreadyActive: true });
    }

    // Qualquer checkout pendente antigo (não finalizado) vira obsoleto.
    await prisma.subscription.updateMany({
      where: { userId: coach.id, billingType: 'CREDIT_CARD', status: 'PENDING_CHECKOUT' },
      data: { status: 'EXPIRED' },
    });

    // ---- 3. Conta gateway + customer no Asaas ----
    // 🔥 Reaproveita coachAsaasId (não asaasCustomerId) — é o campo que o
    // resto do sistema de billing de coach já usa (ver coach-billing/create).
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

    let coachAsaasId = coach.coachAsaasId;
    if (!coachAsaasId) {
      const customer = await findOrCreateCustomer({
        name: coach.name || 'Coach',
        cpfCnpj: coachCpf,
        email: coach.email || undefined,
        externalReference: coach.id,
      });
      coachAsaasId = customer.id;
      await prisma.user.update({ where: { id: coach.id }, data: { coachAsaasId } });
    }

    // ---- 4. Vencimento do 1º ciclo: usa o fim do plano atual se ainda não
    // venceu; senão cobra pra hoje (mesmo padrão do fluxo de aluno) ----
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let due = coach.coachBillingEnd ? new Date(coach.coachBillingEnd) : today;
    if (due < today) due = today;
    const dueStr = toDateOnly(due);

    const cycle = cycleFromMonths(plan.months);
    const itemLabel = `ELITE FIT ${plan.label}`; // truncado automaticamente pra 30 chars se precisar (ver lib/asaas.ts)

    // ---- 5. Cria o Checkout (RECURRENT + CREDIT_CARD) ----
    const checkout = await createCheckoutSession({
      customerData: {
        name: coach.name || 'Coach',
        cpfCnpj: coachCpf,
        email: coach.email || undefined,
        phone: coach.phone || undefined,
        address: coachAddress,
        addressNumber: coachAddressNumber,
        complement: coachComplement || undefined,
        province: coachProvince,
        postalCode: coachPostalCode,
      },
      value: plan.totalPrice,
      description: itemLabel,
      cycle,
      nextDueDate: dueStr,
      externalReference: `coach-recorrencia:${coach.id}:${billingPlan}`,
      successUrl: `${APP_PUBLIC_URL}/pagamento-recorrencia/sucesso`,
      cancelUrl: `${APP_PUBLIC_URL}/pagamento-recorrencia/cancelado`,
      expiredUrl: `${APP_PUBLIC_URL}/pagamento-recorrencia/expirado`,
    });

    // ---- 6. Salva localmente como PENDING_CHECKOUT — o webhook CHECKOUT_PAID
    // confirma e vira ACTIVE (ver app/api/payments/webhook/route.ts) ----
    // planName guarda a CHAVE do plano (ex: "PERSONAL_MONTHLY") — usada no
    // webhook pra recalcular o ciclo em cada renovação automática.
    const subscription = await prisma.subscription.create({
      data: {
        userId: coach.id,
        coachId: DEFAULT_COACH_ID,
        gatewayAccountId: gatewayAccount.id,
        asaasCustomerId: coachAsaasId,
        asaasCheckoutId: checkout.id,
        planName: billingPlan,
        value: plan.totalPrice,
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
        billingPlan,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[coach-recurrence/create] Erro:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao preparar recorrência do coach' },
      { status: 500 }
    );
  }
}
