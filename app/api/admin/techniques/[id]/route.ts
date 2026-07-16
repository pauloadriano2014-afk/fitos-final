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

// 🔥 PUT agora exige coachId no corpo e verifica se quem está editando é o dono
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const body = await req.json();
    const { name, description, steps, coachId } = body;

    if (!coachId) {
      return NextResponse.json({ error: 'coachId é obrigatório.' }, { status: 400 });
    }

    const existing = await prisma.technique.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Técnica não encontrada.' }, { status: 404 });
    }

    // 🔒 Só o dono pode editar. Técnicas globais não são editáveis por aqui.
    if (existing.isGlobal || existing.coachId !== coachId) {
      return NextResponse.json({ error: 'Você não tem permissão para editar esta técnica.' }, { status: 403 });
    }

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

// 🔥 DELETE agora exige coachId (via query ?coachId=) e verifica se quem está apagando é o dono
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');

    if (!coachId) {
      return NextResponse.json({ error: 'coachId é obrigatório.' }, { status: 400 });
    }

    const existing = await prisma.technique.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Técnica não encontrada.' }, { status: 404 });
    }

    // 🔒 Só o dono pode apagar. Técnicas globais não são apagáveis por aqui.
    if (existing.isGlobal || existing.coachId !== coachId) {
      return NextResponse.json({ error: 'Você não tem permissão para apagar esta técnica.' }, { status: 403 });
    }

    await prisma.technique.delete({
      where: { id }
    });

    return NextResponse.json({ message: 'Técnica deletada com sucesso.' }, { status: 200 });
  } catch (error) {
    console.error('[DELETE_TECHNIQUE_ERROR]', error);
    return NextResponse.json({ error: 'Erro interno ao deletar a técnica.' }, { status: 500 });
  }
}