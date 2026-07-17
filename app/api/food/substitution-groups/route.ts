// app/api/food/substitution-groups/route.ts
// GET  — lista grupos do coach
// POST — cria novo grupo

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId') ?? '';
    if (!coachId) return NextResponse.json({ error: 'coachId obrigatório' }, { status: 400 });

    const teamId = getTeamId(coachId);

    const groups = await (prisma as any).substitutionGroup.findMany({
      where: { teamId },
      include: {
        members: {
          include: {
            // Busca os dados do alimento via Food
          }
        }
      },
      orderBy: { createdAt: 'asc' },
    });

    // Enriquece com dados dos alimentos
    const enriched = await Promise.all(groups.map(async (group: any) => {
      const foodIds = group.members.map((m: any) => m.foodId);
      const foods   = foodIds.length > 0
        ? await (prisma as any).food.findMany({
            where: { id: { in: foodIds } },
            select: { id: true, name: true, category: true, subcategory: true, kcal: true, protein: true, carbs: true, fat: true, baseUnit: true },
          })
        : [];
      return {
        id:          group.id,
        name:        group.name,
        description: group.description,
        teamId:      group.teamId,
        createdAt:   group.createdAt,
        memberCount: foods.length,
        foods,
      };
    }));

    return NextResponse.json(enriched);
  } catch (error: any) {
    console.error('[substitution-groups/GET]', error.message);
    return NextResponse.json({ error: 'Erro ao buscar grupos.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { coachId, name, description } = await req.json();
    if (!coachId || !name?.trim())
      return NextResponse.json({ error: 'coachId e name obrigatórios' }, { status: 400 });

    const teamId = getTeamId(coachId);

    const group = await (prisma as any).substitutionGroup.create({
      data: { name: name.trim(), description: description?.trim() ?? null, teamId },
    });

    return NextResponse.json({ ...group, memberCount: 0, foods: [] }, { status: 201 });
  } catch (error: any) {
    console.error('[substitution-groups/POST]', error.message);
    return NextResponse.json({ error: 'Erro ao criar grupo.' }, { status: 500 });
  }
}