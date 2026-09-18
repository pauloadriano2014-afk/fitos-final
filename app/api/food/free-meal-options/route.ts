// app/api/food/free-meal-options/route.ts
// 🔥 (18 set 2026) Opções de refeição livre cadastradas pelo coach — mesmo
// padrão de escopo/segurança de app/api/food/substitution-groups (teamId =
// coachId, ou MASTER_TEAM se for Paulo/Adri, pra time master compartilhar a
// mesma lista).
//
// GET  ?coachId=  — lista as opções do time (ativas e inativas), ordenadas
// POST             — cria uma opção nova, no fim da lista

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { MASTER_IDS } from '@/lib/masterIds';

export const dynamic = 'force-dynamic';

const MASTER_TEAM = 'MASTER_TEAM';
function getTeamId(coachId: string) {
  return MASTER_IDS.includes(coachId) ? MASTER_TEAM : coachId;
}

export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId') ?? '';
    if (!coachId) return NextResponse.json({ error: 'coachId obrigatório' }, { status: 400 });
    if (!canActAsCoach(auth.user, coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const teamId = getTeamId(coachId);

    const options = await (prisma as any).freeMealOption.findMany({
      where: { teamId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json(options);
  } catch (error: any) {
    console.error('[free-meal-options/GET]', error.message);
    return NextResponse.json({ error: 'Erro ao buscar opções de refeição livre.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { coachId, icon, title, desc, avoid } = await req.json();
    if (!coachId || !title?.trim())
      return NextResponse.json({ error: 'coachId e title obrigatórios' }, { status: 400 });
    if (!canActAsCoach(auth.user, coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const teamId = getTeamId(coachId);

    const lastOption = await (prisma as any).freeMealOption.findFirst({
      where: { teamId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (lastOption?.order ?? -1) + 1;

    const option = await (prisma as any).freeMealOption.create({
      data: {
        teamId,
        icon: icon?.trim() || '🍽️',
        title: title.trim(),
        desc: desc?.trim() || null,
        avoid: avoid?.trim() || null,
        order: nextOrder,
      },
    });

    return NextResponse.json(option, { status: 201 });
  } catch (error: any) {
    console.error('[free-meal-options/POST]', error.message);
    return NextResponse.json({ error: 'Erro ao criar opção de refeição livre.' }, { status: 500 });
  }
}
