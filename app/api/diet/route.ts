import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const diet = await prisma.diet.findUnique({
    where: { userId },
    include: { meals: { orderBy: { order: 'asc' } } }
  });
  return NextResponse.json(diet || { matches: false });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, calories, protein, carbs, fats, water, meals } = body;

    const diet = await prisma.diet.upsert({
      where: { userId },
      update: { calories, protein, carbs, fats, water },
      create: { userId, calories, protein, carbs, fats, water }
    });

    await prisma.meal.deleteMany({ where: { dietId: diet.id } });

    if (meals && meals.length > 0) {
      await prisma.meal.createMany({
        data: meals.map((m: any, idx: number) => ({
          dietId: diet.id, name: m.name, time: m.time, content: m.content, order: idx
        }))
      });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}