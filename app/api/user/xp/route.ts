import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';


export async function POST(req: Request) {
  try {
    const { userId, amount } = await req.json();

    if (!userId || !amount) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const targetForAuth = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!canAccessStudent(auth.user, userId, targetForAuth?.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
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