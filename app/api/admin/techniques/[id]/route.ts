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

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const body = await req.json();
    const { name, description, steps } = body;

    const updatedTechnique = await prisma.technique.update({
      where: { id },
      data: {
        name,
        description,
        steps,
      }
    });

    return NextResponse.json(updatedTechnique, { status: 200 });
  } catch (error) {
    console.error('[PUT_TECHNIQUE_ERROR]', error);
    return NextResponse.json({ error: 'Erro interno ao atualizar a técnica.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;

    await prisma.technique.delete({
      where: { id }
    });

    return NextResponse.json({ message: 'Técnica deletada com sucesso.' }, { status: 200 });
  } catch (error) {
    console.error('[DELETE_TECHNIQUE_ERROR]', error);
    return NextResponse.json({ error: 'Erro interno ao deletar a técnica.' }, { status: 500 });
  }
}