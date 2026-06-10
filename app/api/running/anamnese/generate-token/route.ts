import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/running/anamnese/generate-token
// Body: { userId: string }
// Admin chama isso para gerar o link de anamnese de corrida do aluno
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });
    }

    // Verifica se o aluno existe
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }

    // Upsert — se já existe uma anamnese de corrida, retorna o token existente
    // Se não existe, cria com token novo (uuid gerado pelo default do Prisma)
    const anamnese = await prisma.runningAnamnese.upsert({
      where: { userId },
      update: {}, // Não sobrescreve nada se já existe
      create: { userId },
    });

    const link = `${process.env.NEXT_PUBLIC_APP_URL}/corrida/anamnese?token=${anamnese.token}`;

    return NextResponse.json({
      token: anamnese.token,
      link,
      filled: anamnese.filled,
      filledAt: anamnese.filledAt,
    });

  } catch (error) {
    console.error('[generate-token]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}