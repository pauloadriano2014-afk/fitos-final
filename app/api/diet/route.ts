import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

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
    // Garantindo que pegamos tudo
    const { userId, calories, protein, carbs, fats, water, meals } = body;

    // 1. Salva/Atualiza a Dieta (Meta)
    const diet = await prisma.diet.upsert({
      where: { userId },
      update: { calories, protein, carbs, fats, water },
      create: { userId, calories, protein, carbs, fats, water }
    });

    // 2. Limpa refeições antigas para evitar duplicidade
    await prisma.meal.deleteMany({ where: { dietId: diet.id } });

    // 3. Salva as novas com o HORÁRIO
    if (meals && meals.length > 0) {
      await prisma.meal.createMany({
        data: meals.map((m: any, idx: number) => ({
          dietId: diet.id,
          name: m.name,
          time: m.time || "00:00", // <--- O SEGREDO: Garante que nunca vá vazio
          content: m.content,
          order: idx
        }))
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao salvar dieta:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}