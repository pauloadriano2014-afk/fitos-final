import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, contractType, contractValue, paymentDueDate, startDate, financeCategory, isFinanceActive } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do aluno é obrigatório" }, { status: 400 });
    }

    const parsedValue = parseFloat(String(contractValue).replace(',', '.')) || 0;

    const parsedPaymentDueDate = paymentDueDate ? new Date(paymentDueDate) : null;
    const parsedStartDate = startDate ? new Date(startDate) : null;

    // 🔥 BIFURCAÇÃO PARA ALUNOS OFFLINE 🔥
    if (String(userId).startsWith('offline_')) {
      const updatedOfflineClient = await prisma.offlineClient.update({
        where: { id: userId },
        data: {
          contractType: contractType || 'Mensal',
          contractValue: parsedValue,
          paymentDueDate: parsedPaymentDueDate,
          startDate: parsedStartDate,
          financeCategory: financeCategory || 'Consultoria Online',
          isFinanceActive: isFinanceActive !== undefined ? isFinanceActive : true
        },
      });

      return NextResponse.json({ success: true, client: updatedOfflineClient });
    }

    // 🔥 FLUXO NORMAL PARA ALUNOS DO APP (Users) 🔥
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        contractType: contractType || 'Mensal',
        contractValue: parsedValue,
        paymentDueDate: parsedPaymentDueDate,
        startDate: parsedStartDate,
        financeCategory: financeCategory || 'Consultoria Online',
        isFinanceActive: isFinanceActive !== undefined ? isFinanceActive : true
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: unknown) { // Explicitamente tipar como unknown
    console.error("Erro ao atualizar contrato financeiro:", error);

    // Adicione a verificação de tipo aqui
    let errorMessage = "Erro interno no servidor ao salvar contrato";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
      // Caso o erro seja um objeto com uma propriedade 'message'
      errorMessage = (error as any).message;
    } else if (typeof error === 'string') {
      // Caso o erro seja uma string
      errorMessage = error;
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}