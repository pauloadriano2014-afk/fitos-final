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
    return NextResponse.json({ error: "Erro ao buscar" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, calories, protein, carbs, fats, water, meals } = body;

    if (!userId) return NextResponse.json({ error: "UserId ausente" }, { status: 400 });

    // UPSERT: Se existe atualiza, se não existe cria.
    // Usamos Number() para garantir que vá como Inteiro para o Postgres
    const diet = await prisma.diet.upsert({
      where: { userId },
      update: {
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fats: Number(fats) || 0,
        water: Number(water) || 0,
      },
      create: {
        userId,
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fats: Number(fats) || 0,
        water: Number(water) || 0,
      }
    });

    // Limpa as refeições antigas vinculadas a esta dieta
    await prisma.meal.deleteMany({ where: { dietId: diet.id } });

    // Cria as novas garantindo que nenhum campo seja nulo (o banco não aceita nulo)
    if (meals && Array.isArray(meals) && meals.length > 0) {
      await prisma.meal.createMany({
        data: meals.map((m: any, idx: number) => ({
          dietId: diet.id,
          name: String(m.name || "Refeição"),
          time: String(m.time || "00:00"),
          content: String(m.content || ""),
          order: idx
        }))
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO NO POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}