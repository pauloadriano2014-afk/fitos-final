import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, contractType, contractValue, paymentDueDate, financeCategory } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do aluno é obrigatório" }, { status: 400 });
    }

    // 🔥 BLINDAGEM DOS CENTAVOS (Aceita vírgula ou ponto e transforma em Float pro BD) 🔥
    const parsedValue = parseFloat(String(contractValue).replace(',', '.')) || 0;

    // 🔥 ATUALIZA O ALUNO NO BANCO DE DADOS 🔥
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        contractType: contractType || 'Mensal',
        contractValue: parsedValue,
        paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
        financeCategory: financeCategory || 'Consultoria Online', 
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Erro ao atualizar contrato financeiro:", error);
    return NextResponse.json({ error: "Erro interno no servidor ao salvar contrato" }, { status: 500 });
  }
}