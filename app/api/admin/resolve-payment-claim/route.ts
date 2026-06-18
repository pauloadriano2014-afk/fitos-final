// app/api/admin/resolve-payment-claim/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🔥 COACH CONFIRMA OU RECUSA O "JÁ PAGUEI" DO ALUNO 🔥
//
// action: "confirm" -> SÓ limpa os campos de claim (paymentClaimStatus,
//         paymentClaimedAt, paymentClaimCycleDueDate). NÃO avança o
//         paymentDueDate sozinho — o coach abre o FinanceEditModal e
//         clica "RENOVOU" normalmente, exatamente como já faz hoje.
//         Isso evita duplicar a lógica de calcularProximaData (que vive
//         no frontend, em financeUtils.js) e mantém o coach no controle
//         da data/valor exatos da renovação.
//
// action: "reject"  -> marca como REJECTED (mantém paymentClaimCycleDueDate
//         pra bloquear novo claim no mesmo ciclo) e limpa paymentClaimedAt.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, action } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: "userId e action são obrigatórios" }, { status: 400 });
    }

    if (!['confirm', 'reject'].includes(action)) {
      return NextResponse.json({ error: "action deve ser 'confirm' ou 'reject'" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        paymentClaimStatus: true,
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    if (user.paymentClaimStatus !== 'PENDING') {
      return NextResponse.json({ error: "Não há reivindicação pendente para este aluno" }, { status: 409 });
    }

    if (action === 'reject') {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          paymentClaimStatus: 'REJECTED',
          paymentClaimedAt: null,
          // paymentClaimCycleDueDate permanece igual ao paymentDueDate atual,
          // isso é o que impede um novo claim no mesmo ciclo.
        },
      });
      return NextResponse.json({ success: true, action: 'reject', user: updatedUser });
    }

    // action === 'confirm'
    // Apenas limpa o claim. O avanço real do paymentDueDate acontece quando
    // o coach clica "RENOVOU" no FinanceEditModal (fluxo que já existe).
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        paymentClaimStatus: null,
        paymentClaimedAt: null,
        paymentClaimCycleDueDate: null,
      },
    });

    return NextResponse.json({ success: true, action: 'confirm', user: updatedUser });

  } catch (error: any) {
    console.error("Erro ao resolver claim de pagamento:", error);
    return NextResponse.json({ error: "Erro ao processar resolução" }, { status: 500 });
  }
}