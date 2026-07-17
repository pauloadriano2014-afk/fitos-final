// app/api/food/search/route.ts
// Busca alimentos: TACO (global) + CUSTOM do teamId do coach autenticado
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

const MASTER_TEAM = 'MASTER_TEAM';
const MASTER_IDS  = [
  '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
  'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q            = (searchParams.get('q') ?? '').trim();
    const coachId      = searchParams.get('coachId') ?? '';
    const category     = searchParams.get('category') ?? '';
    const favoritesOnly = searchParams.get('favorites') === 'true';
    const page         = parseInt(searchParams.get('page') ?? '1');
    const limit        = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
    const skip         = (page - 1) * limit;

    // Determina o teamId do coach
    const teamId = MASTER_IDS.includes(coachId) ? MASTER_TEAM : (coachId || null);

    // Monta filtro de busca
    const where: any = {
      isActive: true,
      AND: [
        // Alimentos visíveis: TACO (global) OU CUSTOM do team do coach
        {
          OR: [
            { source: 'TACO', teamId: null },
            { source: 'CUSTOM', teamId: teamId ?? MASTER_TEAM },
          ]
        },
      ],
    };

    // Filtro por texto
    if (q.length >= 2) {
      where.AND.push({
        name: { contains: q, mode: 'insensitive' }
      });
    }

    // Filtro por categoria
    if (category && category !== 'Todas') {
      where.AND.push({ category });
    }

    // Filtro favoritos
    if (favoritesOnly) {
      where.AND.push({ isFavorite: true });
    }

    const [foods, total] = await Promise.all([
      prisma.food.findMany({
        where,
        orderBy: [
          // CUSTOM primeiro (alimentos do coach aparecem antes dos TACO)
          { source: 'desc' },
          { name: 'asc' },
        ],
        skip,
        take: limit,
        select: {
          id:           true,
          source:       true,
          name:         true,
          category:     true,
          subcategory:  true,
          baseUnit:     true,
          kcal:         true,
          protein:      true,
          carbs:        true,
          fat:          true,
          fiber:        true,
          isLactoseFree:true,
          conversionFactor: true,
        },
      }),
      prisma.food.count({ where }),
    ]);

    // Formata para o mesmo formato que o foodDatabase.js usa no frontend
    const formatted = foods.map(f => ({
      id:               f.id,
      source:           f.source,
      name:             f.name,
      category:         f.category,
      subcategory:      f.subcategory ?? f.category,
      base_unit:        f.baseUnit,
      calories_per_100: f.kcal,
      p:                f.protein,
      c:                f.carbs,
      f:                f.fat,
      fiber:            f.fiber ?? 0,
      isLactoseFree:    f.isLactoseFree ?? false,
      conversionFactor: f.conversionFactor ?? 1,
    }));

    return NextResponse.json({
      foods: formatted,
      total,
      page,
      pages: Math.ceil(total / limit),
    });

  } catch (error: any) {
    console.error('[food/search]', error.message);
    return NextResponse.json({ error: 'Erro ao buscar alimentos.' }, { status: 500 });
  }
}