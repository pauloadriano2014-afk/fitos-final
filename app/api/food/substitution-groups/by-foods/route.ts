// app/api/food/substitution-groups/by-foods/route.ts
// Recebe uma lista de foodIds e retorna os grupos de substituição
// que contêm pelo menos um deles, com todos os membros e seus macros.
// Usado pelo DietBuilderModal para injetar substitutos automaticamente.

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

const MASTER_TEAM = 'MASTER_TEAM';
const MASTER_IDS  = [
  '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
  'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

export async function POST(req: Request) {
  try {
    const body     = await req.json();
    const foodIds: string[] = body.foodIds ?? [];
    const coachId: string  = body.coachId  ?? '';

    if (!foodIds.length) {
      return NextResponse.json({ groups: [] });
    }

    const teamId = MASTER_IDS.includes(coachId) ? MASTER_TEAM : (coachId || MASTER_TEAM);

    // 1. Acha todos os grupos do team que contêm pelo menos um dos foodIds
    const matchingGroups = await prisma.substitutionGroup.findMany({
      where: {
        teamId,
        members: {
          some: { foodId: { in: foodIds } },
        },
      },
      include: {
        members: true, // traz todos os membros do grupo, não só os que bateram
      },
    });

    if (!matchingGroups.length) {
      return NextResponse.json({ groups: [] });
    }

    // 2. Coleta todos os foodIds únicos de todos os grupos encontrados
    const allMemberFoodIds = [
      ...new Set(matchingGroups.flatMap(g => g.members.map(m => m.foodId))),
    ];

    // 3. Busca os dados de macro de todos esses foods de uma vez
    const foods = await prisma.food.findMany({
      where: { id: { in: allMemberFoodIds }, isActive: true },
      select: {
        id:         true,
        name:       true,
        category:   true,
        subcategory:true,
        baseUnit:   true,
        kcal:       true,
        protein:    true,
        carbs:      true,
        fat:        true,
        source:     true,
      },
    });

    const foodMap = new Map(foods.map(f => [f.id, f]));

    // 4. Monta a resposta: para cada grupo, lista quais foodIds do input
    //    pertencem a ele (os "triggers") e todos os membros com macros
    const groups = matchingGroups.map(group => {
      const triggerFoodIds = group.members
        .filter(m => foodIds.includes(m.foodId))
        .map(m => m.foodId);

      const members = group.members
        .map(m => {
          const food = foodMap.get(m.foodId);
          if (!food) return null;
          return {
            foodId:           food.id,
            name:             food.name,
            category:         food.category,
            subcategory:      food.subcategory ?? food.category,
            base_unit:        food.baseUnit,
            calories_per_100: food.kcal,
            p:                food.protein,
            c:                food.carbs,
            f:                food.fat,
            source:           food.source,
          };
        })
        .filter(Boolean);

      return {
        groupId:        group.id,
        groupName:      group.name,
        triggerFoodIds, // quais foods do payload dispararam este grupo
        members,        // todos os membros com macros (inclui os triggers)
      };
    });

    return NextResponse.json({ groups });

  } catch (error: any) {
    console.error('[substitution-groups/by-foods]', error.message);
    return NextResponse.json({ error: 'Erro ao buscar grupos.' }, { status: 500 });
  }
}