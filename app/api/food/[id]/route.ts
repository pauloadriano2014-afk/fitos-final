// app/api/food/[id]/route.ts
// PATCH /api/food/:id — atualiza isFavorite ou outros campos
// DELETE /api/food/:id — remove alimento CUSTOM

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
const prisma = new PrismaClient();

const MASTER_IDS = [
  '3c82f763-66b4-48da-836e-16817d4f57c0',
  'b7c0c181-41fd-4156-b8fe-963a267759a3',
];
const MASTER_TEAM = 'MASTER_TEAM';

function getTeamId(coachId: string): string {
  return MASTER_IDS.includes(coachId) ? MASTER_TEAM : coachId;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body   = await req.json();
    const { coachId, isFavorite, name, category, subcategory, baseUnit, kcal, protein, carbs, fat, fiber, isActive } = body;

    if (!coachId) return NextResponse.json({ error: 'coachId obrigatório' }, { status: 400 });

    const food = await (prisma as any).food.findUnique({ where: { id } });
    if (!food) return NextResponse.json({ error: 'Alimento não encontrado' }, { status: 404 });

    const teamId = getTeamId(coachId);

    // Permissão: pode editar TACO (qualquer coach, só isFavorite) ou CUSTOM do próprio team
    const canEditFull   = food.source === 'CUSTOM' && food.teamId === teamId;
    const canEditFav    = true; // qualquer coach pode favoritar

    if (!canEditFav) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    // Monta o update — se for TACO, só deixa mudar isFavorite
    // Para TACO, o favorito é POR COACH — salva numa tabela separada de preferências
    // Por simplicidade agora, isFavorite é global no registro TACO
    // TODO futuro: tabela FoodFavorite(coachId, foodId) para favoritos por coach
    const updateData: any = {};
    if (isFavorite !== undefined) updateData.isFavorite = isFavorite;

    if (canEditFull) {
      if (name        !== undefined) updateData.name        = name;
      if (category    !== undefined) updateData.category    = category;
      if (subcategory !== undefined) updateData.subcategory = subcategory;
      if (baseUnit    !== undefined) updateData.baseUnit    = baseUnit;
      if (kcal        !== undefined) updateData.kcal        = kcal;
      if (protein     !== undefined) updateData.protein     = protein;
      if (carbs       !== undefined) updateData.carbs       = carbs;
      if (fat         !== undefined) updateData.fat         = fat;
      if (fiber       !== undefined) updateData.fiber       = fiber;
      if (isActive    !== undefined) updateData.isActive    = isActive;
    }

    const updated = await (prisma as any).food.update({ where: { id }, data: updateData });
    return NextResponse.json(updated);

  } catch (error: any) {
    console.error('[food/PATCH]', error.message);
    return NextResponse.json({ error: 'Erro ao atualizar.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id }    = params;
    const { searchParams } = new URL(req.url);
    const coachId   = searchParams.get('coachId') ?? '';
    const teamId    = getTeamId(coachId);

    const food = await (prisma as any).food.findUnique({ where: { id } });
    if (!food) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (food.source !== 'CUSTOM' || food.teamId !== teamId)
      return NextResponse.json({ error: 'Só é possível excluir alimentos CUSTOM do seu catálogo.' }, { status: 403 });

    await (prisma as any).food.delete({ where: { id } });
    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('[food/DELETE]', error.message);
    return NextResponse.json({ error: 'Erro ao excluir.' }, { status: 500 });
  }
}