import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const excludeId = searchParams.get('excludeId');
    const adminId = searchParams.get('adminId'); // 🔥 Puxa o dono

    if (!category) return NextResponse.json({ error: "Categoria necessária" }, { status: 400 });

    const validAdminId = (adminId && adminId !== 'null' && adminId !== 'undefined') ? adminId : null;

    const substitutes = await prisma.exercise.findMany({
      where: {
        category: category,
        id: { not: excludeId || "" },
        // 🔥 Blinda: Traz só os seus exercícios + os globais. Nunca de outros coaches.
        OR: validAdminId ? [{ coachId: validAdminId }, { coachId: null }] : [{ coachId: null }]
      },
      take: 5
    });

    return NextResponse.json(substitutes);

  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar substitutos" }, { status: 500 });
  }
}