// app/api/diet/[userId]/route.ts — VERSÃO 3.0
// Novidade: retorna estratégia ativa se houver, senão retorna dieta base
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

// ─── HELPER: checa se uma estratégia está ativa agora ────────────────────────
function isStrategyActiveNow(diet: any): boolean {
  if (!diet.strategyActive) return false;

  const now = new Date();

  // Sem datas = ativação manual — já está ativa
  if (!diet.strategyStartDate && !diet.strategyEndDate) return true;

  // Com data de início mas sem fim = ativa se já passou do início
  if (diet.strategyStartDate && !diet.strategyEndDate) {
    return now >= new Date(diet.strategyStartDate);
  }

  // Com data de fim mas sem início = ativa até a data de fim
  if (!diet.strategyStartDate && diet.strategyEndDate) {
    return now <= new Date(diet.strategyEndDate);
  }

  // Com as duas datas = ativa dentro do intervalo
  return now >= new Date(diet.strategyStartDate) && now <= new Date(diet.strategyEndDate);
}

// ─── FORMATAR ITEM ────────────────────────────────────────────────────────────
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

// ─── FORMATAR REFEIÇÃO ────────────────────────────────────────────────────────
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
  alternatives: alternatives.map(alt => ({
    id:               alt.id,
    name:             alt.name,
    time:             alt.time,
    notes:            alt.notes || '',
    alternativeLabel: alt.alternativeLabel || 'Versão Alternativa',
    items:            alt.items.map(formatItem),
  })),
});

// ─── FORMATAR DIETA COMPLETA ──────────────────────────────────────────────────
function formatDiet(diet: any, isFromStrategy = false) {
  const mainMeals:  any[] = [];
  const altMap:     Map<string, any[]> = new Map();

  for (const meal of diet.meals) {
    if (!meal.alternativeGroupId || meal.isMainVersion !== false) {
      mainMeals.push(meal);
    } else {
      const existing = altMap.get(meal.alternativeGroupId) ?? [];
      altMap.set(meal.alternativeGroupId, [...existing, meal]);
    }
  }

  const formattedMeals = mainMeals.map(meal => {
    const alternatives = meal.alternativeGroupId
      ? (altMap.get(meal.alternativeGroupId) ?? [])
      : [];
    return formatMeal(meal, alternatives);
  });

  return {
    id:           diet.id,
    goal:         diet.goal,
    totalKcal:    diet.totalKcal,
    totalProtein: diet.totalProtein,
    totalCarbs:   diet.totalCarbs,
    totalFats:    diet.totalFats,
    waterIntake:  diet.waterIntake,
    generalNotes: diet.generalNotes,
    meals:        formattedMeals,

    // 🔥 Campos de estratégia — o app do aluno usa para mostrar o banner
    isStrategy:        isFromStrategy,
    strategyName:      isFromStrategy ? diet.strategyName : null,
    strategyEndDate:   isFromStrategy ? diet.strategyEndDate : null,
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: Request, { params }: { params: { userId: string } }) {
  try {
    const { userId } = params;

    // 1. Busca TODAS as dietas do aluno (base + estratégias)
    const allDiets = await prisma.diet.findMany({
      where: { userId: userId.trim() },
      orderBy: { createdAt: 'desc' },
      include: {
        meals: {
          orderBy: { order: 'asc' },
          include: { items: true },
        },
      },
    });

    if (!allDiets.length) {
      return NextResponse.json({ error: 'Nenhuma dieta encontrada' }, { status: 404 });
    }

    // 2. Verifica se há estratégia ativa agora
    const activeStrategy = allDiets.find(d => d.isStrategy && isStrategyActiveNow(d));

    if (activeStrategy) {
      // Retorna a estratégia com flag para o app mostrar o banner
      return NextResponse.json(formatDiet(activeStrategy, true));
    }

    // 3. Sem estratégia ativa → retorna a dieta base mais recente
    const baseDiet = allDiets.find(d => !d.isStrategy && d.isActive);

    if (!baseDiet) {
      return NextResponse.json({ error: 'Nenhuma dieta encontrada' }, { status: 404 });
    }

    return NextResponse.json(formatDiet(baseDiet, false));

  } catch (error) {
    console.error('Erro ao buscar dieta:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}