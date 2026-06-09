// app/api/exercise/substitutes/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const exerciseId  = searchParams.get('exerciseId');  // ID do exercício principal
    const category    = searchParams.get('category');
    const subCategory = searchParams.get('subCategory');
    const excludeId   = searchParams.get('excludeId');
    const adminId     = searchParams.get('adminId');

    if (!category) return NextResponse.json({ error: "Categoria necessária" }, { status: 400 });

    const validAdminId = (adminId && adminId !== 'null' && adminId !== 'undefined') ? adminId : null;

    // ─── 1. VERIFICAR SE TEM SUBSTITUTOS PREFERIDOS DEFINIDOS ───
    if (exerciseId) {
      const mainExercise = await (prisma.exercise as any).findUnique({
        where: { id: exerciseId },
        select: { defaultSubstitutes: true }
      });

      const subs: string[] = mainExercise?.defaultSubstitutes ?? [];

      if (subs.length > 0) {
        const preferred = await prisma.exercise.findMany({
          where: { id: { in: subs } }
        });

        // Retorna na ordem definida pelo coach
        const ordered = subs
          .map((id: string) => preferred.find(e => e.id === id))
          .filter(Boolean);

        return NextResponse.json(ordered);
      }
    }

    // ─── 2. FALLBACK: BUSCA AUTOMÁTICA POR SUBCATEGORIA ───
    const whereClause: any = {
      category,
      id: { not: excludeId || '' },
      OR: validAdminId
        ? [{ coachId: validAdminId }, { coachId: null }]
        : [{ coachId: null }],
    };

    if (subCategory && subCategory !== 'undefined' && subCategory !== 'null' && subCategory !== 'Geral') {
      whereClause.subCategory = subCategory;
    }

    const substitutes = await prisma.exercise.findMany({ where: whereClause, take: 5 });

    // Se não achou nada com subCategoria, busca na categoria toda
    if (substitutes.length === 0 && subCategory && subCategory !== 'Geral') {
      delete whereClause.subCategory;
      const backup = await prisma.exercise.findMany({ where: whereClause, take: 5 });
      return NextResponse.json(backup);
    }

    return NextResponse.json(substitutes);

  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar substitutos" }, { status: 500 });
  }
}