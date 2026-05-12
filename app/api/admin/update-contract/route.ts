import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, contractType, contractValue, paymentDueDate, financeCategory } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do aluno é obrigatório" }, { status: 400 });
    }

    // 🔥 BLINDAGEM DOS CENTAVOS: Aceita 97 / 97.00 / 97,10 / 97.10
    const parsedValue = parseFloat(String(contractValue).replace(',', '.')) || 0;

    // 🔥 ATUALIZA O BANCO DE DADOS
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        contractType: contractType || 'Mensal',
        contractValue: parsedValue,
        paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
        // Salva a categoria apenas pro financeiro. Se vier vazio, padrão é Consultoria Online.
        financeCategory: financeCategory || 'Consultoria Online', 
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Erro ao atualizar contrato:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}