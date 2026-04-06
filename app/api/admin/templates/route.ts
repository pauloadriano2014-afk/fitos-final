import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const goal = searchParams.get('goal');
  const level = searchParams.get('level');
  const adminId = searchParams.get('adminId'); // 🔥 O CRACHÁ DE SEGURANÇA

  const where: any = {};
  if (goal && goal !== 'TODOS') where.goal = goal;
  if (level && level !== 'TODOS') where.level = level;
  if (adminId) where.coachId = adminId; // 🔥 BLINDAGEM: Traz só os templates do dono

  try {
    const templates = await prisma.workoutTemplate.findMany({
      where,
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar templates" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // 🔥 AGORA O BACKEND ENXERGA O ID DA PASTA (collectionId)
    const { id, name, goal, level, data, adminId, collectionId } = body; 

    if (!name || !data) {
        return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    if (id) {
        // 🔥 ATUALIZA O TEMPLATE E PERMITE MOVER DE PASTA
        await prisma.workoutTemplate.update({
            where: { id },
            data: { 
                name, 
                goal, 
                level, 
                data,
                collectionId: collectionId !== undefined ? collectionId : undefined 
            }
        });
    } else {
        // 🔥 CRIA O TEMPLATE JÁ DENTRO DA PASTA
        await prisma.workoutTemplate.create({
            data: { 
                name, 
                goal, 
                level, 
                data, 
                coachId: adminId || null,
                collectionId: collectionId || null
            }
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao salvar template" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });

    try {
        await prisma.workoutTemplate.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Erro ao deletar" }, { status: 500 });
    }
}