// app/api/admin/diet/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, goal, totalKcal, totalProtein, totalCarbs, totalFats, waterIntake, generalNotes, meals } = body;

    if (!userId) {
      return NextResponse.json({ error: "ID do usuário é obrigatório" }, { status: 400 });
    }

    // 🔥 PADRÃO ELITE: Transação blindada para garantir a integridade do banco
    const newDiet = await prisma.$transaction(async (tx) => {
      
      // 1. Inativa qualquer dieta atual do aluno (Mantém o histórico, mas tira do app principal)
      await tx.diet.updateMany({
        where: { userId: userId, isActive: true },
        data: { isActive: false }
      });

      // 2. Cria a nova dieta em cascata (Dieta -> Refeições -> Alimentos)
      const diet = await tx.diet.create({
        data: {
          userId,
          name: name || "Plano Alimentar",
          goal,
          totalKcal,
          totalProtein,
          totalCarbs,
          totalFats,
          waterIntake,
          generalNotes,
          isActive: true,
          meals: {
            create: meals.map((meal: any, mIndex: number) => ({
              name: meal.name,
              time: meal.time,
              order: mIndex,
              notes: meal.notes,
              items: {
                create: meal.items.map((item: any) => ({
                  name: item.name,
                  amount: parseFloat(item.amount) || 0,
                  unit: item.unit || "g",
                  protein: parseFloat(item.p) || 0,
                  carbs: parseFloat(item.c) || 0,
                  fats: parseFloat(item.f) || 0,
                  calories: parseFloat(item.calories_per_100) || 0,
                  substitutionGroupId: item.groupId || null
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

    console.log(`✅ DIETA SALVA COM SUCESSO PARA O USER: ${userId}`);
    return NextResponse.json(newDiet);

  } catch (error) {
    console.error("❌ ERRO AO SALVAR DIETA:", error);
    return NextResponse.json({ error: "Erro interno ao salvar dieta" }, { status: 500 });
  }
}