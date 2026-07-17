// app/api/food/route.ts
// POST /api/food — cria alimento customizado
// GET  /api/food/search já existe em /api/food/search/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
const prisma = new PrismaClient();

const MASTER_IDS = [
  '3c82f763-66b4-48da-836e-16817d4f57c0',
  'b7c0c181-41fd-4156-b8fe-963a267759a3',
];
const MASTER_TEAM = 'MASTER_TEAM';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { coachId, name, category, subcategory, baseUnit, kcal, protein, carbs, fat, fiber } = body;

    if (!coachId) return NextResponse.json({ error: 'coachId obrigatório' }, { status: 400 });
    if (!name || kcal === undefined || protein === undefined || carbs === undefined || fat === undefined)
      return NextResponse.json({ error: 'Campos obrigatórios: name, kcal, protein, carbs, fat' }, { status: 400 });

    const teamId  = MASTER_IDS.includes(coachId) ? MASTER_TEAM : coachId;
    const extId   = `custom-${name.toLowerCase().replace(/[\s\/\(\)]+/g, '-').replace(/-+/g, '-')}-${Date.now()}`;

    const food = await (prisma as any).food.create({
      data: {
        source:      'CUSTOM',
        externalId:  extId,
        teamId,
        name:        name.trim(),
        category:    category    ?? 'Outros',
        subcategory: subcategory ?? null,
        baseUnit:    baseUnit    ?? 'g',
        kcal:        parseFloat(kcal),
        protein:     parseFloat(protein),
        carbs:       parseFloat(carbs),
        fat:         parseFloat(fat),
        fiber:       fiber !== undefined ? parseFloat(fiber) : null,
        isFavorite:  true, // alimentos criados pelo coach já entram como favoritos
      },
    });

    return NextResponse.json(food, { status: 201 });

  } catch (error: any) {
    console.error('[food/POST]', error.message);
    return NextResponse.json({ error: 'Erro ao criar alimento.' }, { status: 500 });
  }
}