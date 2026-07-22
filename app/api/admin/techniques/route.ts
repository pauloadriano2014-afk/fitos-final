// app/api/admin/techniques/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = (global as any).prisma || new PrismaClient();
if (process.env.NODE_ENV === 'development') (global as any).prisma = prisma;

// 🔥 Helper para anexar CORS limpos em todas as respostas (evita bloqueio no PWA/Web)
function corsResponse(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return corsResponse({});
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');

    if (!coachId) {
      return corsResponse({ error: 'O ID do Treinador é obrigatório.' }, 400);
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

    return corsResponse(techniques, 200);
  } catch (error) {
    console.error('[GET_TECHNIQUES_ERROR]', error);
    return corsResponse({ error: 'Erro interno ao buscar as técnicas.' }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description, steps, coachId, isGlobal, videoUrl } = body;

    if (!name || !steps || !coachId) {
      return corsResponse({ error: 'Nome, steps e coachId são obrigatórios.' }, 400);
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

    return corsResponse(newTechnique, 201);
  } catch (error) {
    console.error('[POST_TECHNIQUE_ERROR]', error);
    return corsResponse({ error: 'Erro interno ao criar a técnica.' }, 500);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, description, steps, videoUrl, coachId } = body;

    if (!id || !coachId) {
      return corsResponse({ error: 'ID da técnica e coachId são obrigatórios.' }, 400);
    }

    const existing = await prisma.technique.findUnique({ where: { id } });

    if (!existing) {
      return corsResponse({ error: 'Técnica não encontrada.' }, 404);
    }

    // 🔒 Só o dono pode editar.
    if (existing.isGlobal || existing.coachId !== coachId) {
      return corsResponse({ error: 'Você não tem permissão para editar esta técnica.' }, 403);
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

    return corsResponse(updatedTechnique, 200);
  } catch (error) {
    console.error('[PUT_TECHNIQUE_ERROR]', error);
    return corsResponse({ error: 'Erro interno ao atualizar a técnica.' }, 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const coachId = searchParams.get('coachId');

    if (!id || !coachId) {
      return corsResponse({ error: 'ID da técnica e coachId são obrigatórios.' }, 400);
    }

    const existing = await prisma.technique.findUnique({ where: { id } });

    if (!existing) {
      return corsResponse({ error: 'Técnica não encontrada.' }, 404);
    }

    // 🔒 Só o dono pode apagar.
    if (existing.isGlobal || existing.coachId !== coachId) {
      return corsResponse({ error: 'Você não tem permissão para apagar esta técnica.' }, 403);
    }

    await prisma.technique.delete({ where: { id } });

    return corsResponse({ message: 'Técnica deletada com sucesso.' }, 200);
  } catch (error) {
    console.error('[DELETE_TECHNIQUE_ERROR]', error);
    return corsResponse({ error: 'Erro interno ao deletar a técnica.' }, 500);
  }
}