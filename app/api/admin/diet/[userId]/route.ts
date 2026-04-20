// app/api/diet/[userId]/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';
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

    // 🔥 Mapeia campos do Prisma → formato que o DietScreen.js espera
    const formatted = {
      id:           diet.id,
      goal:         diet.goal,
      totalKcal:    diet.totalKcal,
      totalProtein: diet.totalProtein,
      totalCarbs:   diet.totalCarbs,
      totalFats:    diet.totalFats,
      waterIntake:  diet.waterIntake,
      generalNotes: diet.generalNotes,
      meals: diet.meals.map((meal: any) => ({
        id:    meal.id,
        name:  meal.name,
        time:  meal.time,
        notes: meal.notes || '',
        dayType: meal.dayType, // 🔥 A PEÇA QUE FALTAVA PARA ACABAR COM A PALHAÇADA!
        items: meal.items.map((item: any) => ({
          id:                  item.id,
          substitutionGroupId: item.substitutionGroupId,
          name:                item.name,
          amount:              item.amount,
          unit:                item.unit,
          // DietScreen usa estes nomes para calcular macros por refeição
          gram_amount:         item.gramAmount ?? item.amount,
          calories_per_100:    item.calories,
          p:                   item.protein,
          c:                   item.carbs,
          f:                   item.fats,
        }))
      }))
    };

    return NextResponse.json(formatted);

  } catch (error) {
    console.error('Erro ao buscar dieta do aluno:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}