import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "UserId obrigatório" }, { status: 400 });

    const diet = await prisma.diet.findUnique({
      where: { userId },
      include: { meals: { orderBy: { order: 'asc' } } }
    });

    return NextResponse.json(diet || { matches: false });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar dieta" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Recebendo payload de dieta:", JSON.stringify(body)); // LOG PARA DEBUG NA RENDER

    const { userId, calories, protein, carbs, fats, water, meals } = body;

    if (!userId) return NextResponse.json({ error: "UserId faltando no payload" }, { status: 400 });

    // 1. Garante que os Macros são números inteiros
    const safeCalories = parseInt(String(calories)) || 2000;
    const safeProtein = parseInt(String(protein)) || 150;
    const safeCarbs = parseInt(String(carbs)) || 200;
    const safeFats = parseInt(String(fats)) || 60;
    const safeWater = parseInt(String(water)) || 3000;

    // 2. Salva/Atualiza a Meta (Diet)
    const diet = await prisma.diet.upsert({
      where: { userId },
      update: { 
        calories: safeCalories, 
        protein: safeProtein, 
        carbs: safeCarbs, 
        fats: safeFats, 
        water: safeWater 
      },
      create: { 
        userId, 
        calories: safeCalories, 
        protein: safeProtein, 
        carbs: safeCarbs, 
        fats: safeFats, 
        water: safeWater 
      }
    });

    // 3. Atualiza as Refeições (Delete All + Create All)
    // Isso evita problemas de IDs perdidos ou duplicados
    await prisma.meal.deleteMany({ where: { dietId: diet.id } });

    if (meals && Array.isArray(meals) && meals.length > 0) {
      const mealsToSave = meals.map((m: any, idx: number) => ({
        dietId: diet.id,
        name: m.name || "Refeição", // Nunca deixa nulo
        time: m.time || "00:00",    // Nunca deixa nulo
        content: m.content || "",   // Nunca deixa nulo (Isso quebrava antes)
        order: idx
      }));

      await prisma.meal.createMany({
        data: mealsToSave
      });
    }

    return NextResponse.json({ success: true, dietId: diet.id });

  } catch (error: any) {
    console.error("ERRO FATAL AO SALVAR DIETA:", error);
    return NextResponse.json({ 
        error: "Erro no servidor: " + error.message, 
        details: error.meta 
    }, { status: 500 });
  }
}