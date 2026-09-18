// app/api/food/free-meal-options/[id]/route.ts
// PATCH  — edita ícone/título/descrição/evite/ordem/ativo
// DELETE — remove a opção (logs antigos já têm o título salvo em
//          freeMealOptionLabel, então apagar aqui não quebra o histórico)

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { MASTER_IDS } from '@/lib/masterIds';

export const dynamic = 'force-dynamic';

const MASTER_TEAM = 'MASTER_TEAM';
function getTeamId(coachId: string) {
  return MASTER_IDS.includes(coachId) ? MASTER_TEAM : coachId;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { coachId, icon, title, desc, avoid, order, isActive } = await req.json();
    if (!canActAsCoach(auth.user, coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    const teamId = getTeamId(coachId);
    const option = await (prisma as any).freeMealOption.findUnique({ where: { id: params.id } });
    if (!option || option.teamId !== teamId)
      return NextResponse.json({ error: 'Não encontrado ou sem permissão.' }, { status: 404 });

    const updated = await (prisma as any).freeMealOption.update({
      where: { id: params.id },
      data: {
        icon: icon?.trim() || option.icon,
        title: title?.trim() ?? option.title,
        desc: desc !== undefined ? (desc?.trim() || null) : option.desc,
        avoid: avoid !== undefined ? (avoid?.trim() || null) : option.avoid,
        order: typeof order === 'number' ? order : option.order,
        isActive: typeof isActive === 'boolean' ? isActive : option.isActive,
      },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[free-meal-options/[id]/PATCH]', error.message);
    return NextResponse.json({ error: 'Erro ao atualizar.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId') ?? '';
    if (!canActAsCoach(auth.user, coachId)) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    const teamId = getTeamId(coachId);
    const option = await (prisma as any).freeMealOption.findUnique({ where: { id: params.id } });
    if (!option || option.teamId !== teamId)
      return NextResponse.json({ error: 'Não encontrado ou sem permissão.' }, { status: 404 });

    await (prisma as any).freeMealOption.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[free-meal-options/[id]/DELETE]', error.message);
    return NextResponse.json({ error: 'Erro ao deletar.' }, { status: 500 });
  }
}
