// app/api/form-response/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Método para LER a anamnese preenchida
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const templateId = searchParams.get('templateId');

    if (!userId || !templateId) {
      return NextResponse.json({ error: 'Falta userId ou templateId' }, { status: 400 });
    }

    const response = await prisma.formResponse.findFirst({
      where: {
        userId: userId,
        templateId: templateId,
      },
    });

    if (!response) {
      return NextResponse.json({ error: 'Resposta não encontrada' }, { status: 404 });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro ao buscar resposta da anamnese:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// Método para SALVAR a anamnese preenchida
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { templateId, userId, answers } = body;

    if (!templateId || !userId || !answers) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Verifica se o aluno já tinha respondido a este template antes
    let formResponse = await prisma.formResponse.findFirst({
      where: { userId, templateId }
    });

    if (formResponse) {
      // Atualiza a resposta existente
      formResponse = await prisma.formResponse.update({
        where: { id: formResponse.id },
        data: { answers, submittedAt: new Date() }
      });
    } else {
      // Cria uma nova resposta
      formResponse = await prisma.formResponse.create({
        data: {
          templateId,
          userId,
          answers,
          submittedAt: new Date()
        }
      });
    }

    // Remove o aviso de "Anamnese Pendente" do perfil do utilizador
    await prisma.user.update({
      where: { id: userId },
      data: { anamnesePendente: false }
    });

    return NextResponse.json(formResponse);
  } catch (error) {
    console.error('Erro ao salvar resposta da anamnese:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}