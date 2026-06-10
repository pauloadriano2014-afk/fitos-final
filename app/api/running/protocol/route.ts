import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST — Admin confirma e salva o protocolo (após revisar sugestão da IA)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, startBlock, startWeek, customSpeeds, adaptations, customNotes, generatedByAI, aiPromptSnapshot } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });
    }

    // Desativa protocolos anteriores do aluno
    await prisma.runningProtocol.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    const protocol = await prisma.runningProtocol.create({
      data: {
        userId,
        startBlock:       startBlock       ?? 1,
        startWeek:        startWeek        ?? 1,
        customSpeeds:     customSpeeds     ?? undefined,
        adaptations:      adaptations      ?? null,
        customNotes:      customNotes      ?? null,
        generatedByAI:    generatedByAI    ?? false,
        aiPromptSnapshot: aiPromptSnapshot ?? null,
        startDate:        new Date(),
        isActive:         true,
      },
    });

    return NextResponse.json({ success: true, protocol });

  } catch (error) {
    console.error('[running-protocol-post]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}