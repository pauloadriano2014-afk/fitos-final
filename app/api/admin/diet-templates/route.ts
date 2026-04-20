// app/api/admin/diet-templates/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🔥 ROTA PARA BUSCAR TODOS OS TEMPLATES SALVOS
export async function GET() {
  try {
    const templates = await prisma.dietTemplate.findMany({
      orderBy: {
        createdAt: 'desc' // Traz os mais recentes primeiro
      }
    });
    
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Erro ao buscar templates:", error);
    return NextResponse.json({ error: "Falha ao buscar os templates da dieta." }, { status: 500 });
  }
}

// 🔥 ROTA PARA SALVAR UM NOVO TEMPLATE
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, goal, totalKcal, meals } = body;

    if (!name || !meals) {
      return NextResponse.json({ error: "O nome do template e as refeições são obrigatórios." }, { status: 400 });
    }

    // 🔥 A CURA: Limpa a sujeira antes de gravar. Garante que todo alimento tenha uma etiqueta de origem.
    const safeMeals = (meals || []).map((m: any) => ({
        ...m,
        dayType: m.dayType || 'TREINO'
    }));

    const template = await prisma.dietTemplate.create({
      data: {
        name,
        goal: goal || 'Indefinido',
        totalKcal: Number(totalKcal) || 0,
        // Salva os dados blindados
        meals: safeMeals 
      }
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("Erro ao salvar template:", error);
    return NextResponse.json({ error: "Falha ao gravar o template no banco de dados." }, { status: 500 });
  }
}

// 🔥 ROTA PARA DELETAR UM TEMPLATE
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "ID do template não fornecido." }, { status: 400 });
    }

    await prisma.dietTemplate.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar template:", error);
    return NextResponse.json({ error: "Falha ao deletar o template." }, { status: 500 });
  }
}