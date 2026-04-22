import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const subCategory = searchParams.get('subCategory'); // 🔥 Lê a nova tag
    const excludeId = searchParams.get('excludeId');
    const adminId = searchParams.get('adminId'); 

    if (!category) return NextResponse.json({ error: "Categoria necessária" }, { status: 400 });

    const validAdminId = (adminId && adminId !== 'null' && adminId !== 'undefined') ? adminId : null;

    // 🔥 PREPARA O FILTRO INTELIGENTE
    const whereClause: any = {
      category: category,
      id: { not: excludeId || "" },
      OR: validAdminId ? [{ coachId: validAdminId }, { coachId: null }] : [{ coachId: null }]
    };

    // 🔥 O GOLPE DE MESTRE: Se a requisição enviou a subcategoria (Ex: "Puxadas"), a IA amarra a busca nela!
    if (subCategory && subCategory !== 'undefined' && subCategory !== 'null' && subCategory !== 'Geral') {
        whereClause.subCategory = subCategory;
    }

    const substitutes = await prisma.exercise.findMany({
      where: whereClause,
      take: 5 // Traz as 5 melhores opções de troca
    });

    // Se o filtro restrito da subcategoria não trouxer nada (banco vazio), ele busca na categoria toda como "plano B"
    if (substitutes.length === 0 && subCategory && subCategory !== 'Geral') {
        delete whereClause.subCategory;
        const backupSubstitutes = await prisma.exercise.findMany({
            where: whereClause,
            take: 5
        });
        return NextResponse.json(backupSubstitutes);
    }

    return NextResponse.json(substitutes);

  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar substitutos" }, { status: 500 });
  }
}