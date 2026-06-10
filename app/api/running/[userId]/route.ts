// app/api/running/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET — App do aluno busca protocolo ativo + logs + anamnese
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const userId = params.userId;

    // Busca anamnese de corrida
    const anamnese = await prisma.runningAnamnese.findUnique({
      where: { userId },
      select: { token: true, filled: true, filledAt: true },
    });

    // Busca protocolo ativo
    const protocol = await prisma.runningProtocol.findFirst({
      where: { userId, isActive: true },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!protocol) {
      return NextResponse.json({ protocol: null, anamnese: anamnese || null });
    }

    // Calcula semana atual com base no startDate
    const now = new Date();
    const start = new Date(protocol.startDate);
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const weeksElapsed = Math.floor(diffDays / 7);
    const currentWeek = Math.min(protocol.startWeek + weeksElapsed, 8);

    const currentBlock =
      currentWeek <= 2 ? 1 :
      currentWeek <= 4 ? 2 :
      currentWeek <= 6 ? 3 :
      currentWeek === 7 ? 4 : 5;

    return NextResponse.json({
      protocol,
      currentWeek,
      currentBlock,
      anamnese: anamnese || null,
    });

  } catch (error) {
    console.error('[running-userId-get]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}