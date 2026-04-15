import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🔥 FILTROS BLINDADOS: Impedem o Prisma de engasgar e dar Erro 500
const safeNum = (val: any) => {
  if (val === null || val === undefined) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const safeStr = (val: any) => {
  if (val === null || val === undefined || val === '') return null;
  return String(val);
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId, name, goal,
      totalKcal, totalProtein, totalCarbs, totalFats,
      waterIntake, generalNotes, meals
    } = body;

    if (!userId || userId === '[object Object]' || userId === 'undefined') {
      return NextResponse.json({ error: 'ID do usuário inválido ou corrompido.' }, { status: 400 });
    }

    const newDiet = await prisma.$transaction(async (tx) => {

      // 1. Inativa dieta atual
      await tx.diet.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false }
      });

      // 2. Cria nova dieta completa (Agora passando pelos filtros de segurança)
      const diet = await tx.diet.create({
        data: {
          userId: String(userId),
          name: name || 'Plano Alimentar',
          goal: goal || 'Não definido',
          totalKcal: safeNum(totalKcal),
          totalProtein: safeNum(totalProtein),
          totalCarbs: safeNum(totalCarbs),
          totalFats: safeNum(totalFats),
          waterIntake: waterIntake || 'Não definido',
          generalNotes: generalNotes || '',
          isActive: true,
          meals: {
            create: (meals || []).map((meal: any, mIndex: number) => ({
              name: meal.name || 'Refeição',
              time: meal.time || '00:00',
              order: safeNum(mIndex),
              notes: meal.notes || '',
              items: {
                create: (meal.items || []).map((item: any) => ({
                  name: item.name || 'Alimento',
                  amount: safeNum(item.amount),
                  unit: item.unit || 'g',

                  gramAmount: safeNum(item.gram_amount) || safeNum(item.amount),

                  // Macros convertidos à força para Float
                  calories: safeNum(item.calories_per_100) || safeNum(item.calories),
                  protein: safeNum(item.p) || safeNum(item.protein),
                  carbs: safeNum(item.c) || safeNum(item.carbs),
                  fats: safeNum(item.f) || safeNum(item.fats),

                  // Grupo convertido à força para String
                  substitutionGroupId: safeStr(item.groupId) || safeStr(item.substitutionGroupId),
                }))
              }
            }))
          }
        },
        include: {
          meals: {
            include: { items: true }
          }
        }
      });

      return diet;
    });

    console.log(`✅ DIETA GRAVADA COM SUCESSO NO BANCO PARA O USER: ${userId}`);
    return NextResponse.json(newDiet);

  } catch (error: any) {
    console.error('❌ ERRO CRÍTICO NO PRISMA AO SALVAR:', error);
    // Agora, se o banco recusar, ele vai cuspir o motivo EXATO no console em vez de um "500" genérico
    return NextResponse.json({ error: 'Falha técnica ao gravar no banco.', details: error.message }, { status: 500 });
  }
}