// app/api/form-template/active/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Ou o caminho correto para a tua instância do Prisma
import { requireAuth, canActAsCoach } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const coachId = searchParams.get('coachId');
    const type = searchParams.get('type') || 'TRAINING';

    if (!coachId) {
      return NextResponse.json({ error: 'Falta o parâmetro coachId' }, { status: 400 });
    }

    const auth = requireAuth(request);
    if ('response' in auth) return auth.response;
    // O coach dono do template (ou master) pode ver; e também o próprio
    // aluno desse coach, que precisa do schema pra preencher o formulário.
    if (!canActAsCoach(auth.user, coachId) && auth.user.coachId !== coachId) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // Procura o primeiro template ativo para este coach e tipo específico
    const template = await prisma.formTemplate.findFirst({
      where: {
        coachId: coachId,
        type: type,
        isActive: true,
      },
    });

    if (!template) {
      return NextResponse.json({ error: 'Nenhum template ativo encontrado' }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error('Erro ao buscar template dinâmico:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}