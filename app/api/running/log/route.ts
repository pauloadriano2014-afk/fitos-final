import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST — Aluno registra um treino de corrida concluído
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, protocolId, week, block, sessionDay, durationMinutes, distanceKm, avgPace, notes, rpe } = body;

    if (!userId || !protocolId || !sessionDay) {
      return NextResponse.json({ error: 'userId, protocolId e sessionDay são obrigatórios' }, { status: 400 });
    }

    const log = await prisma.runningLog.create({
      data: {
        userId,
        protocolId,
        week:            week            ?? 1,
        block:           block           ?? 1,
        sessionDay,
        durationMinutes: durationMinutes ?? null,
        distanceKm:      distanceKm      ?? null,
        avgPace:         avgPace         ?? null,
        notes:           notes           ?? null,
        rpe:             rpe             ?? null,
      },
    });

    return NextResponse.json({ success: true, log });

  } catch (error) {
    console.error('[running-log-post]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}