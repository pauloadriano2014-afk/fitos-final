// app/api/coach-brand/[id]/route.ts
// Marca (nome + logo) pública de um coach — usada pra estampar a logo do
// coach do aluno nos PDFs entregues a ele (treino, dieta, avaliação),
// gerados tanto pelo próprio aluno quanto pelo coach/master.
//
// Não expõe nada sensível: é exatamente o que qualquer aluno desse coach já
// vê hoje no rodapé do próprio app (ver app/api/user/home) — só nome, logo
// e o tamanho configurado dela. Por isso a checagem de acesso aqui é mais
// aberta que a de app/api/admin/user/[id] (que lida com dados completos do
// usuário): liberamos pra master, pro próprio coach, ou pra qualquer aluno
// cujo coachId (já vem no token JWT) seja esse coach.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';

function corsResponse(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return corsResponse({});
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const coachId = params.id;
    if (!coachId) return corsResponse({ error: 'ID do coach é obrigatório.' }, 400);

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const isSelf = auth.user.id === coachId;
    const isMaster = isMasterId(auth.user.id);
    const isOwnCoach = auth.user.coachId === coachId; // aluno pedindo a marca do próprio coach

    if (!isSelf && !isMaster && !isOwnCoach) {
      return corsResponse({ error: 'Acesso não autorizado.' }, 403);
    }

    const coach = await prisma.user.findUnique({
      where: { id: coachId },
      select: { name: true, brandLogoUrl: true, brandLogoSize: true },
    });

    if (!coach) return corsResponse({ error: 'Coach não encontrado.' }, 404);

    return corsResponse(coach);
  } catch (error) {
    console.error('[coach-brand] erro:', error);
    return corsResponse({ error: 'Erro ao buscar marca do coach.' }, 500);
  }
}
