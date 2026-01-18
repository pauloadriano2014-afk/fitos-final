import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Singleton para evitar múltiplas conexões travando o banco
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao buscar: " + error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, calories, protein, carbs, fats, water, meals } = body;

    console.log("🚀 Iniciando salvamento para User:", userId);

    if (!userId) return NextResponse.json({ error: "UserId ausente" }, { status: 400 });

    // Inicia uma transação para garantir que ou salva tudo ou nada (evita dados quebrados)
    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert da Dieta (Meta)
      const diet = await tx.diet.upsert({
        where: { userId },
        update: { 
          calories: parseInt(calories) || 2000, 
          protein: parseInt(protein) || 150, 
          carbs: parseInt(carbs) || 200, 
          fats: parseInt(fats) || 60, 
          water: parseInt(water) || 3000 
        },
        create: { 
          userId, 
          calories: parseInt(calories) || 2000, 
          protein: parseInt(protein) || 150, 
          carbs: parseInt(carbs) || 200, 
          fats: parseInt(fats) || 60, 
          water: parseInt(water) || 3000 
        }
      });

      // 2. Deleta refeições antigas
      await tx.meal.deleteMany({ where: { dietId: diet.id } });

      // 3. Cria as novas refeições com todos os campos garantidos
      if (meals && Array.isArray(meals) && meals.length > 0) {
        await tx.meal.createMany({
          data: meals.map((m: any, idx: number) => ({
            dietId: diet.id,
            name: String(m.name || "Refeição"),
            time: String(m.time || "00:00"),
            content: String(m.content || ""),
            order: idx
          }))
        });
      }
      return diet;
    }, {
      timeout: 10000 // 10 segundos de limite para não ficar "pensando" eterno
    });

    console.log("✅ Dieta salva com sucesso!");
    return NextResponse.json({ success: true, dietId: result.id });

  } catch (error: any) {
    console.error("❌ ERRO NO POST DIET:", error);
    return NextResponse.json({ 
        error: "Falha no banco de dados", 
        message: error.message 
    }, { status: 500 });
  }
}