// app/api/diet/free-meal-options/route.ts
// 🔥 (18 set 2026) Busca, do lado do ALUNO, as opções de refeição livre que o
// coach dele cadastrou (ver app/api/food/free-meal-options pro CRUD do
// coach). Só devolve as ativas — a lista de gerenciamento do coach continua
// mostrando as inativas, mas o app do aluno não precisa saber que existem.
//
// GET ?userId=

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { MASTER_IDS } from '@/lib/masterIds';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MASTER_TEAM = 'MASTER_TEAM';
function getTeamId(coachId: string) {
  return MASTER_IDS.includes(coachId) ? MASTER_TEAM : coachId;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const student = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
    if (!student) {
      return NextResponse.json({ error: 'Aluno não encontrado' }, { status: 404 });
    }
    if (!canAccessStudent(auth.user, userId, student.coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    // Aluno sem coach vinculado (raro, mas possível) não tem lista de ninguém pra herdar
    if (!student.coachId) {
      return NextResponse.json([]);
    }

    const teamId = getTeamId(student.coachId);

    const options = await (prisma as any).freeMealOption.findMany({
      where: { teamId, isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, icon: true, title: true, desc: true, avoid: true, hideRules: true },
    });

    return NextResponse.json(options);
  } catch (error: any) {
    console.error('[diet/free-meal-options] Erro GET:', error?.message || error);
    return NextResponse.json({ error: 'Erro ao buscar opções de refeição livre' }, { status: 500 });
  }
}
