// app/api/admin/strategies/[userId]/route.ts
// CRUD de estratégias de dieta para um aluno específico
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// ─── GET — lista todas as estratégias + dieta base do aluno ──────────────────
export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    const diets = await prisma.diet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        meals: {
          orderBy: { order: 'asc' },
          include: { items: true },
        },
      },
    });

    const baseDiets     = diets.filter(d => !d.isStrategy);
    const strategies    = diets.filter(d => d.isStrategy);

    return NextResponse.json({ baseDiets, strategies });

  } catch (error) {
    console.error('GET strategies error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estratégias' }, { status: 500 });
  }
}

// ─── POST — cria nova estratégia (copia a dieta base ou começa do zero) ──────
export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = await req.json();

    const {
      strategyName,           // obrigatório — ex: "Low Carb", "Finalização"
      goal,
      waterIntake,
      generalNotes,
      strategyStartDate,      // null = manual
      strategyEndDate,        // null = sem data de fim
      activateNow = false,    // se true, já ativa ao criar
      copyFromDietId,         // se informado, copia refeições da dieta base
      meals = [],             // refeições passadas diretamente (opcional)
    } = body;

    if (!strategyName) {
      return NextResponse.json({ error: 'Nome da estratégia é obrigatório' }, { status: 400 });
    }

    // Se ativar agora, desativa outras estratégias do aluno
    if (activateNow) {
      await prisma.diet.updateMany({
        where: { userId, isStrategy: true, strategyActive: true },
        data:  { strategyActive: false },
      });
    }

    // Determina os dados base
    let baseMeals = meals;

    if (copyFromDietId) {
      // Copia refeições da dieta indicada
      const sourceDiet = await prisma.diet.findUnique({
        where: { id: copyFromDietId },
        include: { meals: { include: { items: true } } },
      });

      if (sourceDiet) {
        baseMeals = sourceDiet.meals.map(meal => ({
          name:              meal.name,
          time:              meal.time,
          order:             meal.order,
          notes:             meal.notes,
          dayType:           meal.dayType,
          alternativeGroupId: meal.alternativeGroupId,
          isMainVersion:     meal.isMainVersion,
          alternativeLabel:  meal.alternativeLabel,
          items: meal.items.map(item => ({
            name:               item.name,
            amount:             item.amount,
            unit:               item.unit,
            protein:            item.protein,
            carbs:              item.carbs,
            fats:               item.fats,
            calories:           item.calories,
            substitutionGroupId: item.substitutionGroupId,
          })),
        }));
      }
    }

    // Cria a estratégia
    const strategy = await prisma.diet.create({
      data: {
        userId,
        name:             `Estratégia: ${strategyName}`,
        goal:             goal || null,
        waterIntake:      waterIntake || null,
        generalNotes:     generalNotes || null,
        isActive:         true,
        isStrategy:       true,
        strategyName,
        strategyActive:   activateNow,
        strategyStartDate: strategyStartDate ? new Date(strategyStartDate) : null,
        strategyEndDate:   strategyEndDate   ? new Date(strategyEndDate)   : null,
        meals: {
          create: baseMeals.map((meal: any) => ({
            name:              meal.name,
            time:              meal.time,
            order:             meal.order ?? 0,
            notes:             meal.notes,
            dayType:           meal.dayType ?? 'TREINO',
            alternativeGroupId: meal.alternativeGroupId,
            isMainVersion:     meal.isMainVersion ?? true,
            alternativeLabel:  meal.alternativeLabel,
            items: {
              create: (meal.items ?? []).map((item: any) => ({
                name:               item.name,
                amount:             item.amount,
                unit:               item.unit,
                protein:            item.protein,
                carbs:              item.carbs,
                fats:               item.fats,
                calories:           item.calories,
                substitutionGroupId: item.substitutionGroupId,
              })),
            },
          })),
        },
      },
      include: {
        meals: { include: { items: true } },
      },
    });

    return NextResponse.json(strategy, { status: 201 });

  } catch (error: any) {
    console.error('POST strategy error:', error);
    return NextResponse.json({ error: 'Erro ao criar estratégia', details: error.message }, { status: 500 });
  }
}