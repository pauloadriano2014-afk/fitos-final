import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // O Asaas manda o tipo do evento e os dados da cobrança
    const { event, payment } = body;

    // Se não for um evento de pagamento (ex: ping de teste), apenas ignoramos e damos OK
    if (!payment || !payment.id) {
      return NextResponse.json({ ok: true });
    }

    // Procura se essa cobrança existe no nosso banco de dados
    const cobrancaExistente = await prisma.payment.findUnique({
      where: { asaasPaymentId: payment.id }
    });

    if (cobrancaExistente) {
      // Atualiza o status da cobrança no nosso banco com o que veio do Asaas
      await prisma.payment.update({
        where: { id: cobrancaExistente.id },
        data: {
          status: payment.status, // CONFIRMED, RECEIVED, OVERDUE, etc.
          netValue: payment.netValue, // Salva o valor líquido já descontando a taxa do Asaas
          paymentDate: payment.clientPaymentDate ? new Date(payment.clientPaymentDate) : null,
          billingType: payment.billingType,
        }
      });
    }

    // Retorna 200 OK rápido para o Asaas saber que recebemos o recado
    return NextResponse.json({ received: true });
    
  } catch (error: any) {
    console.error('[WEBHOOK ASAAS] Erro:', error.message);
    return NextResponse.json({ error: 'Erro ao processar webhook' }, { status: 500 });
  }
}