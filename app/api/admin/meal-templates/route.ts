import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// BUSCAR TODAS AS REFEIÇÕES GUARDADAS
export async function GET() {
  try {
    const templates = await prisma.mealTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao buscar os modelos de refeição." }, { status: 500 });
  }
}

// SALVAR UMA NOVA REFEIÇÃO COMO MODELO
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, category, items } = body;

    if (!name || !items) {
      return NextResponse.json({ error: "Nome e itens são obrigatórios." }, { status: 400 });
    }

    const template = await prisma.mealTemplate.create({
      data: {
        name,
        category: category || "Geral",
        items: items 
      }
    });

    return NextResponse.json(template);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao gravar a refeição no banco." }, { status: 500 });
  }
}

// APAGAR UM MODELO DE REFEIÇÃO
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });

    await prisma.mealTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao apagar." }, { status: 500 });
  }
}