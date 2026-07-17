// app/api/food/substitution-groups/[id]/members/route.ts
// POST   — adiciona alimento ao grupo
// DELETE — remove alimento do grupo (?foodId=xxx)

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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { coachId, foodId } = await req.json();
    const teamId = getTeamId(coachId);
    const group  = await (prisma as any).substitutionGroup.findUnique({ where: { id: params.id } });
    if (!group || group.teamId !== teamId)
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

    // upsert para não duplicar
    await (prisma as any).substitutionGroupMember.upsert({
      where:  { groupId_foodId: { groupId: params.id, foodId } },
      update: {},
      create: { groupId: params.id, foodId },
    });

    // retorna o alimento adicionado
    const food = await (prisma as any).food.findUnique({
      where:  { id: foodId },
      select: { id: true, name: true, category: true, subcategory: true, kcal: true, protein: true, carbs: true, fat: true, baseUnit: true },
    });

    return NextResponse.json({ ok: true, food }, { status: 201 });
  } catch (error: any) {
    console.error('[members/POST]', error.message);
    return NextResponse.json({ error: 'Erro ao adicionar.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId') ?? '';
    const foodId  = searchParams.get('foodId')  ?? '';
    const teamId  = getTeamId(coachId);

    const group = await (prisma as any).substitutionGroup.findUnique({ where: { id: params.id } });
    if (!group || group.teamId !== teamId)
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

    await (prisma as any).substitutionGroupMember.delete({
      where: { groupId_foodId: { groupId: params.id, foodId } },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao remover.' }, { status: 500 });
  }
}