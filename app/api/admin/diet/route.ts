// app/api/admin/diet/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId, name, goal,
      totalKcal, totalProtein, totalCarbs, totalFats,
      waterIntake, generalNotes, meals
    } = body;

    if (!userId || userId === '[object Object]' || userId === 'undefined') {
      console.error('❌ TENTATIVA DE SALVAR DIETA COM ID INVÁLIDO:', userId);
      return NextResponse.json({ error: 'ID do usuário inválido ou corrompido.' }, { status: 400 });
    }

    const newDiet = await prisma.$transaction(async (tx) => {

      // 1. Inativa dieta atual
      await tx.diet.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false }
      });

      // 2. Cria nova dieta completa
      const diet = await tx.diet.create({
        data: {
          userId,
          name: name || 'Plano Alimentar',
          goal: goal || 'Não definido',
          totalKcal:    parseFloat(totalKcal)    || 0,
          totalProtein: parseFloat(totalProtein) || 0,
          totalCarbs:   parseFloat(totalCarbs)   || 0,
          totalFats:    parseFloat(totalFats)    || 0,
          waterIntake:  waterIntake  || 'Não definido',
          generalNotes: generalNotes || '',
          isActive: true,
          meals: {
            create: (meals || []).map((meal: any, mIndex: number) => ({
              name:  meal.name,
              time:  meal.time,
              order: mIndex,
              notes: meal.notes || '',
              items: {
                create: (meal.items || []).map((item: any) => ({
                  name:   item.name,
                  amount: parseFloat(item.amount) || 0,
                  unit:   item.unit || 'g',

                  gramAmount: parseFloat(item.gram_amount) || parseFloat(item.amount) || 0,

                  // Macros e Calorias blindados (Se vier de um jeito ou de outro, ele pega)
                  calories: parseFloat(item.calories_per_100) || parseFloat(item.calories) || 0,
                  protein:  parseFloat(item.p) || parseFloat(item.protein) || 0,
                  carbs:    parseFloat(item.c) || parseFloat(item.carbs) || 0,
                  fats:     parseFloat(item.f) || parseFloat(item.fats) || 0,

                  // 🔥 CORREÇÃO DO AGRUPAMENTO: Agora ele acha o grupo de substituição certo!
                  substitutionGroupId: item.groupId || item.substitutionGroupId || null,
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

  } catch (error) {
    console.error('❌ ERRO CRÍTICO NO PRISMA AO SALVAR:', error);
    return NextResponse.json({ error: 'Falha técnica ao gravar no banco.' }, { status: 500 });
  }
}