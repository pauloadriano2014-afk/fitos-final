import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST: Aluno envia Check-in
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, weight, feedback, photoFront, photoBack, photoSide } = body;

    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    const checkIn = await prisma.checkIn.create({
      data: {
        userId,
        weight: Number(weight),
        feedback,
        photoFront,
        photoBack,
        photoSide,
        date: new Date()
      }
    });

    // Opcional: Se enviou peso, atualiza o peso atual do usuário também
    if (weight) {
        // Você pode criar uma lógica para adicionar na tabela Assessment automaticamente se quiser
    }

    return NextResponse.json({ success: true, id: checkIn.id });

  } catch (error) {
    return NextResponse.json({ error: "Erro ao enviar check-in" }, { status: 500 });
  }
}

// GET: Buscar histórico de check-ins de um usuário
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    const checkins = await prisma.checkIn.findMany({
        where: { userId },
        orderBy: { date: 'desc' }
    });

    return NextResponse.json(checkins);
}