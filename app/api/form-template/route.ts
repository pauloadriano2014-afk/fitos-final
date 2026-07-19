// app/api/form-template/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Método para CRIAR um novo template customizado
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { coachId, type, name, schema, isActive } = body;

    if (!coachId || !type || !name || !schema) {
      return NextResponse.json({ error: 'Dados incompletos para criação' }, { status: 400 });
    }

    // Se o coach estiver a ativar este template, desativa temporariamente os outros do mesmo tipo
    if (isActive) {
      await prisma.formTemplate.updateMany({
        where: { coachId, type, isActive: true },
        data: { isActive: false },
      });
    }

    const newTemplate = await prisma.formTemplate.create({
      data: {
        coachId,
        type,
        name,
        schema,
        isActive: isActive ?? true,
      },
    });

    return NextResponse.json(newTemplate);
  } catch (error) {
    console.error('Erro ao criar template de anamnese:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// Método para ATUALIZAR um template existente
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, coachId, type, name, schema, isActive } = body;

    if (!id || !coachId) {
      return NextResponse.json({ error: 'Falta o ID do template ou do Coach' }, { status: 400 });
    }

    // Se estiver a reativar este, garante isolamento desativando os outros do mesmo tipo
    if (isActive) {
      await prisma.formTemplate.updateMany({
        where: { coachId, type, isActive: true, NOT: { id } },
        data: { isActive: false },
      });
    }

    const updatedTemplate = await prisma.formTemplate.update({
      where: { id },
      data: {
        name,
        schema,
        isActive,
      },
    });

    return NextResponse.json(updatedTemplate);
  } catch (error) {
    console.error('Erro ao atualizar template de anamnese:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}