import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = (global as any).prisma || new PrismaClient();
if (process.env.NODE_ENV === 'development') (global as any).prisma = prisma;

// 🔥 Tratamento de CORS para evitar bloqueios no Chrome (Web)
export async function OPTIONS() {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');

    if (!coachId) {
      return NextResponse.json({ error: 'O ID do Treinador é obrigatório.' }, { status: 400 });
    }

    const techniques = await prisma.technique.findMany({
      where: {
        OR: [
          { coachId: coachId },
          { isGlobal: true }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(techniques, { status: 200 });
  } catch (error) {
    console.error('[GET_TECHNIQUES_ERROR]', error);
    return NextResponse.json({ error: 'Erro interno ao buscar as técnicas.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, steps, coachId, isGlobal } = body;

    if (!name || !steps || !coachId) {
      return NextResponse.json({ error: 'Nome, steps e coachId são obrigatórios.' }, { status: 400 });
    }

    const newTechnique = await prisma.technique.create({
      data: {
        name,
        description,
        steps,
        coachId,
        isGlobal: isGlobal || false,
      }
    });

    return NextResponse.json(newTechnique, { status: 201 });
  } catch (error) {
    console.error('[POST_TECHNIQUE_ERROR]', error);
    return NextResponse.json({ error: 'Erro interno ao criar a técnica.' }, { status: 500 });
  }
}