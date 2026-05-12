import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 🔥 Agora sim estamos recebendo o isFinanceActive 🔥
    const { userId, contractType, contractValue, paymentDueDate, financeCategory, isFinanceActive } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do aluno é obrigatório" }, { status: 400 });
    }

    // Blindagem dos centavos
    const parsedValue = parseFloat(String(contractValue).replace(',', '.')) || 0;

    // 🔥 ATUALIZA O ALUNO NO BANCO DE DADOS 🔥
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        contractType: contractType || 'Mensal',
        contractValue: parsedValue,
        paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
        financeCategory: financeCategory || 'Consultoria Online',
        // 🔥 AQUI ESTAVA FALTANDO! Agora salva de verdade no banco de dados 🔥
        isFinanceActive: isFinanceActive !== undefined ? isFinanceActive : true 
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Erro ao atualizar contrato financeiro:", error);
    return NextResponse.json({ error: "Erro interno no servidor ao salvar contrato" }, { status: 500 });
  }
}