// app/api/food/[id]/groups/route.ts
// GET — retorna todos os grupos de substituição que contêm este alimento
// Usado ao montar dieta: quando coach adiciona um alimento, sistema busca seus grupos

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

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId') ?? '';
    const teamId  = getTeamId(coachId);

    // Busca todos os grupos que contêm esse alimento e pertencem ao coach
    const memberships = await (prisma as any).substitutionGroupMember.findMany({
      where: { foodId: params.id },
    });

    const groupIds = memberships.map((m: any) => m.groupId);
    if (groupIds.length === 0) return NextResponse.json([]);

    const groups = await (prisma as any).substitutionGroup.findMany({
      where: { id: { in: groupIds }, teamId },
    });

    // Para cada grupo, busca todos os outros membros (exceto o alimento atual)
    const result = await Promise.all(groups.map(async (group: any) => {
      const allMembers = await (prisma as any).substitutionGroupMember.findMany({
        where: { groupId: group.id, foodId: { not: params.id } },
      });
      const foodIds = allMembers.map((m: any) => m.foodId);
      const foods   = foodIds.length > 0
        ? await (prisma as any).food.findMany({
            where: { id: { in: foodIds }, isActive: true },
            select: { id: true, name: true, category: true, subcategory: true, kcal: true, protein: true, carbs: true, fat: true, baseUnit: true },
          })
        : [];
      return { groupId: group.id, groupName: group.name, substitutes: foods };
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[food/groups/GET]', error.message);
    return NextResponse.json({ error: 'Erro.' }, { status: 500 });
  }
}