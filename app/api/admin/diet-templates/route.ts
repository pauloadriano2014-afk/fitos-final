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

    const template = await prisma.dietTemplate.create({
      data: {
        name,
        goal,
        totalKcal,
        // O Prisma salva arrays/objetos diretamente se o campo for do tipo Json
        meals: meals 
      }
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("Erro ao salvar template:", error);
    return NextResponse.json({ error: "Falha ao gravar o template no banco de dados." }, { status: 500 });
  }
}