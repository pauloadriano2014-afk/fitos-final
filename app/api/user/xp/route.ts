import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const { userId, amount } = await req.json();

    if (!userId || !amount) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    // Atualiza o XP do usuário (Incrementa o valor atual)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        currentXP: {
          increment: Number(amount)
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      newXP: updatedUser.currentXP,
      message: `Você ganhou ${amount} XP!` 
    });

  } catch (error) {
    return NextResponse.json({ error: "Erro ao adicionar XP" }, { status: 500 });
  }
}