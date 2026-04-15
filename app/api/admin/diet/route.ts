import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, goal, totalKcal, totalProtein, totalCarbs, totalFats, waterIntake, generalNotes, meals } = body;

    if (!userId || userId === '[object Object]' || userId === 'undefined') {
      return NextResponse.json({ error: 'ID do usuário inválido.' }, { status: 400 });
    }

    const newDiet = await prisma.$transaction(async (tx) => {
      // 1. Inativa dietas anteriores
      await tx.diet.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false }
      });

      // 2. Cria a nova dieta sem o campo inexistente (gramAmount)
      return await tx.diet.create({
        data: {
          userId: String(userId),
          name: name || 'Plano Alimentar',
          goal: goal || 'Não definido',
          totalKcal: Number(totalKcal) || 0,
          totalProtein: Number(totalProtein) || 0,
          totalCarbs: Number(totalCarbs) || 0,
          totalFats: Number(totalFats) || 0,
          waterIntake: waterIntake || 'Não definido',
          generalNotes: generalNotes || '',
          isActive: true,
          meals: {
            create: (meals || []).map((meal: any, mIndex: number) => ({
              name: meal.name || 'Refeição',
              time: meal.time || '00:00',
              order: mIndex,
              notes: meal.notes || '',
              items: {
                create: (meal.items || []).map((item: any) => {
                  let groupId = item.groupId || item.substitutionGroupId;
                  
                  return {
                    name: item.name || 'Alimento',
                    amount: Number(item.amount) || 0, // O banco usa este campo!
                    unit: item.unit || 'g',
                    // 🔥 REMOVIDO gramAmount daqui para não dar erro
                    calories: Number(item.calories_per_100) || Number(item.calories) || 0,
                    protein: Number(item.p) || Number(item.protein) || 0,
                    carbs: Number(item.c) || Number(item.carbs) || 0,
                    fats: Number(item.f) || Number(item.fats) || 0,
                    substitutionGroupId: groupId ? String(groupId) : null,
                  };
                })
              }
            }))
          }
        },
        include: { meals: { include: { items: true } } }
      });
    });

    console.log(`✅ DIETA SALVA COM SUCESSO: ${userId}`);
    return NextResponse.json(newDiet);

  } catch (error: any) {
    console.error('❌ ERRO CRÍTICO NO PRISMA:', error.message);
    return NextResponse.json({ 
      error: 'Erro no Banco de Dados', 
      details: error.message 
    }, { status: 500 });
  }
}