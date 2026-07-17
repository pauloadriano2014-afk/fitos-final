// app/api/food/substitution-groups/[id]/route.ts
// PATCH  — edita nome/descrição
// DELETE — remove grupo

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
const prisma = new PrismaClient();

const MASTER_IDS = [
  '3c82f763-66b4-48da-836e-16817d4f57c0',
  'b7c0c181-41fd-4156-b8fe-963a267759a3',
];
const MASTER_TEAM = 'MASTER_TEAM';
function getTeamId(coachId: string) {
  return MASTER_IDS.includes(coachId) ? MASTER_TEAM : coachId;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { coachId, name, description } = await req.json();
    const teamId = getTeamId(coachId);
    const group  = await (prisma as any).substitutionGroup.findUnique({ where: { id: params.id } });
    if (!group || group.teamId !== teamId)
      return NextResponse.json({ error: 'Não encontrado ou sem permissão.' }, { status: 404 });

    const updated = await (prisma as any).substitutionGroup.update({
      where: { id: params.id },
      data:  { name: name?.trim() ?? group.name, description: description?.trim() ?? group.description },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao atualizar.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId') ?? '';
    const teamId  = getTeamId(coachId);
    const group   = await (prisma as any).substitutionGroup.findUnique({ where: { id: params.id } });
    if (!group || group.teamId !== teamId)
      return NextResponse.json({ error: 'Não encontrado ou sem permissão.' }, { status: 404 });

    await (prisma as any).substitutionGroup.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao deletar.' }, { status: 500 });
  }
}