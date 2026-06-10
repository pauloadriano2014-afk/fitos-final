import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET — App do aluno busca protocolo ativo + logs + semana calculada
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const protocol = await prisma.runningProtocol.findFirst({
      where: { userId: params.userId, isActive: true },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!protocol) {
      return NextResponse.json({ protocol: null });
    }

    // Calcula semana atual com base no startDate
    const now = new Date();
    const start = new Date(protocol.startDate);
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const weeksElapsed = Math.floor(diffDays / 7);
    const currentWeek = Math.min(protocol.startWeek + weeksElapsed, 8);

    // Bloco atual baseado na semana
    const currentBlock =
      currentWeek <= 2 ? 1 :
      currentWeek <= 4 ? 2 :
      currentWeek <= 6 ? 3 :
      currentWeek === 7 ? 4 : 5;

    return NextResponse.json({
      protocol,
      currentWeek,
      currentBlock,
    });

  } catch (error) {
    console.error('[running-userId-get]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}