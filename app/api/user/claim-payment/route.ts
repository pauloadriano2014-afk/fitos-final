// app/api/user/claim-payment/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🔥 ALUNO CLICA EM "JÁ PAGUEI" NO MODAL DE BLOQUEIO FINANCEIRO 🔥
//
// Regras:
// - Só grava o claim, NÃO marca como pago de fato (isso só o coach confirma).
// - Libera o treino temporariamente por até 2 dias (lógica de liberação
//   fica no frontend, em useHomeData.js, comparando paymentClaimedAt).
// - Só permite 1 claim por ciclo de vencimento: se já existe um claim
//   REJECTED para o paymentDueDate atual, bloqueia novo claim no mesmo ciclo.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        paymentDueDate: true,
        paymentClaimStatus: true,
        paymentClaimCycleDueDate: true,
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    if (!user.paymentDueDate) {
      return NextResponse.json({ error: "Aluno sem vencimento cadastrado" }, { status: 400 });
    }

    // 🔒 Bloqueia novo claim no mesmo ciclo se o último foi recusado
    // e o vencimento ainda não mudou (ou seja, o coach não renovou manualmente)
    const sameCycle = user.paymentClaimCycleDueDate
      && new Date(user.paymentClaimCycleDueDate).getTime() === new Date(user.paymentDueDate).getTime();

    if (user.paymentClaimStatus === 'REJECTED' && sameCycle) {
      return NextResponse.json(
        { error: "Já existe uma reivindicação recusada para este ciclo. Entre em contato direto com o coach." },
        { status: 409 }
      );
    }

    // Se já está PENDING, apenas confirma o estado atual (idempotente)
    if (user.paymentClaimStatus === 'PENDING' && sameCycle) {
      return NextResponse.json({ success: true, alreadyPending: true });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        paymentClaimedAt: new Date(),
        paymentClaimStatus: 'PENDING',
        paymentClaimCycleDueDate: user.paymentDueDate,
      },
      select: {
        id: true,
        paymentClaimedAt: true,
        paymentClaimStatus: true,
      }
    });

    return NextResponse.json({ success: true, user: updatedUser });

  } catch (error: any) {
    console.error("Erro ao registrar claim de pagamento:", error);
    return NextResponse.json({ error: "Erro ao registrar pagamento" }, { status: 500 });
  }
}