// app/api/laboratory/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

// 🔥 BUSCAR AS MATRIZES SALVAS 🔥
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    if (!adminId || adminId === 'null' || adminId === 'undefined') {
      return NextResponse.json({ error: "Admin ID é obrigatório" }, { status: 400 });
    }

    const templates = await prisma.motorTemplate.findMany({
      where: { coachId: adminId },
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json(templates);
  } catch (error) {
    console.error("Erro GET MotorTemplates:", error);
    return NextResponse.json({ error: "Erro ao buscar as matrizes." }, { status: 500 });
  }
}

// 🔥 SALVAR UMA NOVA MATRIZ DE PRESCRIÇÃO 🔥
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, objectives, levels, times, days, structure, adminId } = body;

    if (!name || !structure || !adminId) {
        return NextResponse.json({ error: "Nome, estrutura e Admin ID são obrigatórios." }, { status: 400 });
    }

    const newTemplate = await prisma.motorTemplate.create({
      data: {
        name,
        objectives: objectives || [],
        levels: levels || [],
        times: times || [],
        days: days || [],
        structure, // Esse é o JSON pesadão com a divisão (Ex: Dia A = Quadríceps)
        coachId: adminId
      }
    });

    return NextResponse.json(newTemplate);
  } catch (error: any) {
    console.error("Erro POST MotorTemplate:", error);
    return NextResponse.json({ error: "Erro ao salvar a matriz inteligente." }, { status: 500 });
  }
}

// 🔥 DELETAR UMA MATRIZ 🔥
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    
    await prisma.motorTemplate.delete({ where: { id: id } }); 
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro DELETE MotorTemplate:", error);
    return NextResponse.json({ error: "Erro ao excluir matriz." }, { status: 500 });
  }
}