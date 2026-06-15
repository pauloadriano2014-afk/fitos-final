// app/api/diet/[userId]/route.ts — VERSÃO 2.0
// Novidade: agrupa refeições por alternativeGroupId e retorna versões alternativas
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const { userId } = params;

    const diet = await prisma.diet.findFirst({
      where: { userId: userId.trim() },
      orderBy: { createdAt: 'desc' },
      include: {
        meals: {
          orderBy: { order: 'asc' },
          include: { items: true }
        }
      }
    });

    if (!diet) {
      return NextResponse.json({ error: 'Nenhuma dieta encontrada' }, { status: 404 });
    }

    // ─── FORMATAR ITEM ────────────────────────────────────────────────────────
    const formatItem = (item: any) => ({
      id:                  item.id,
      substitutionGroupId: item.substitutionGroupId,
      name:                item.name,
      amount:              item.amount,
      unit:                item.unit,
      gram_amount:         item.gramAmount ?? item.amount,
      calories_per_100:    item.calories,
      p:                   item.protein,
      c:                   item.carbs,
      f:                   item.fats,
    });

    // ─── FORMATAR REFEIÇÃO ────────────────────────────────────────────────────
    const formatMeal = (meal: any, alternatives: any[] = []) => ({
      id:                  meal.id,
      name:                meal.name,
      time:                meal.time,
      notes:               meal.notes || '',
      dayType:             meal.dayType,
      isMainVersion:       meal.isMainVersion !== false,
      alternativeGroupId:  meal.alternativeGroupId || null,
      alternativeLabel:    meal.alternativeLabel   || null,
      items:               meal.items.map(formatItem),
      // 🔥 versões alternativas embutidas na refeição principal
      alternatives: alternatives.map(alt => ({
        id:               alt.id,
        name:             alt.name,
        time:             alt.time,
        notes:            alt.notes || '',
        alternativeLabel: alt.alternativeLabel || 'Versão Alternativa',
        items:            alt.items.map(formatItem),
      })),
    });

    // ─── AGRUPAR VERSÕES ALTERNATIVAS ────────────────────────────────────────
    // Separa principais das alternativas e agrupa pelo alternativeGroupId
    const mainMeals:  any[] = [];
    const altMap:     Map<string, any[]> = new Map();

    for (const meal of diet.meals) {
      if (!meal.alternativeGroupId || meal.isMainVersion !== false) {
        // É uma refeição principal (ou não tem grupo)
        mainMeals.push(meal);
      } else {
        // É uma versão alternativa — agrupa pelo ID do grupo
        const existing = altMap.get(meal.alternativeGroupId) ?? [];
        altMap.set(meal.alternativeGroupId, [...existing, meal]);
      }
    }

    // Monta resposta final: cada refeição principal carrega suas alternativas
    const formattedMeals = mainMeals.map(meal => {
      const alternatives = meal.alternativeGroupId
        ? (altMap.get(meal.alternativeGroupId) ?? [])
        : [];
      return formatMeal(meal, alternatives);
    });

    return NextResponse.json({
      id:           diet.id,
      goal:         diet.goal,
      totalKcal:    diet.totalKcal,
      totalProtein: diet.totalProtein,
      totalCarbs:   diet.totalCarbs,
      totalFats:    diet.totalFats,
      waterIntake:  diet.waterIntake,
      generalNotes: diet.generalNotes,
      meals:        formattedMeals,
    });

  } catch (error) {
    console.error('Erro ao buscar dieta:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}