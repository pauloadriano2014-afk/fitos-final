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

    return new NextResponse(JSON.stringify(diet || { matches: false }), {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, calories, protein, carbs, fats, water, meals } = body;

    if (!userId) return NextResponse.json({ error: "UserId ausente" }, { status: 400 });

    // LÓGICA DE TRANSAÇÃO: Ou deleta e cria tudo, ou não faz nada.
    await prisma.$transaction([
        prisma.meal.deleteMany({ where: { diet: { userId } } }),
        prisma.diet.deleteMany({ where: { userId } }),
        prisma.diet.create({
          data: {
            userId,
            calories: Number(calories) || 0,
            protein: Number(protein) || 0,
            carbs: Number(carbs) || 0,
            fats: Number(fats) || 0,
            water: Number(water) || 0,
            meals: {
              create: meals.map((m: any, idx: number) => ({
                name: String(m.name || "Refeição"),
                time: String(m.time || "00:00"),
                content: String(m.content || ""),
                order: idx
              }))
            }
          }
        })
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}