import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = (global as any).prisma || new PrismaClient();
if (process.env.NODE_ENV === 'development') (global as any).prisma = prisma;

// 🔥 Tratamento de CORS GLOBAL
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

    // Já estava certo: só retorna técnicas globais OU do próprio coach.
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
    const { name, description, steps, coachId, isGlobal, videoUrl } = body;

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
        videoUrl: videoUrl || null,
      }
    });

    return NextResponse.json(newTechnique, { status: 201 });
  } catch (error) {
    console.error('[POST_TECHNIQUE_ERROR]', error);
    return NextResponse.json({ error: 'Erro interno ao criar a técnica.' }, { status: 500 });
  }
}

// 🔥 PUT agora exige coachId e verifica se quem está editando é o dono
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, description, steps, videoUrl, coachId } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID da técnica é obrigatório.' }, { status: 400 });
    }
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
        videoUrl: videoUrl || null,
      }
    });

    return NextResponse.json(updatedTechnique, { status: 200 });
  } catch (error) {
    console.error('[PUT_TECHNIQUE_ERROR]', error);
    return NextResponse.json({ error: 'Erro interno ao atualizar a técnica.' }, { status: 500 });
  }
}

// 🔥 DELETE agora exige coachId (via query) e verifica se quem está apagando é o dono
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const coachId = searchParams.get('coachId');

    if (!id) {
      return NextResponse.json({ error: 'ID da técnica é obrigatório.' }, { status: 400 });
    }
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

    await prisma.technique.delete({ where: { id } });

    return NextResponse.json({ message: 'Técnica deletada com sucesso.' }, { status: 200 });
  } catch (error) {
    console.error('[DELETE_TECHNIQUE_ERROR]', error);
    return NextResponse.json({ error: 'Erro interno ao deletar a técnica.' }, { status: 500 });
  }
}