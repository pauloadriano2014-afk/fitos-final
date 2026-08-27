import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 👇 BUSCA AS PASTAS DO COACH
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const adminId = searchParams.get('adminId');

    if (!adminId) return NextResponse.json({ error: "Admin ID obrigatório" }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    // 🔥 ISOLAMENTO TOTAL DA MURALHA (COLEÇÕES):
    const isMaster = MASTER_IDS.includes(adminId);
    let whereClause: any = {};

    if (isMaster) {
        // Paulo e Adri não veem pastas de parceiros. 
        whereClause.OR = [
            { coachId: null },
            { coachId: { in: MASTER_IDS } }
        ];
    } else {
        // Parceiro vê ESTRITAMENTE as pastas criadas por ele.
        whereClause.coachId = adminId;
    }

    const collections = await prisma.templateCollection.findMany({
      where: whereClause,
      include: {
        _count: { select: { templates: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(collections);
  } catch (error) {
    console.error("Erro GET Collections:", error);
    return NextResponse.json({ error: "Erro ao buscar coleções" }, { status: 500 });
  }
}

// 👇 CRIA UMA NOVA PASTA
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, color, adminId } = body;

    if (!name || !adminId) return NextResponse.json({ error: "Nome e Admin ID são obrigatórios" }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    if (!canActAsCoach(auth.user, adminId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const collection = await prisma.templateCollection.create({
      data: {
        name,
        color: color || '#22c55e',
        coachId: adminId
      }
    });

    return NextResponse.json(collection);
  } catch (error) {
    console.error("Erro POST Collection:", error);
    return NextResponse.json({ error: "Erro ao criar coleção" }, { status: 500 });
  }
}

// 👇 EDITA NOME OU COR DA PASTA
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, color } = body;

    if (!id) return NextResponse.json({ error: "ID da coleção obrigatório" }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const existing = await prisma.templateCollection.findUnique({ where: { id }, select: { coachId: true } });
    if (!existing) return NextResponse.json({ error: "Coleção não encontrada" }, { status: 404 });
    if (!isMasterId(auth.user.id) && !canActAsCoach(auth.user, existing.coachId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const collection = await prisma.templateCollection.update({
      where: { id },
      data: { 
        ...(name && { name }), 
        ...(color && { color }) 
      }
    });

    return NextResponse.json(collection);
  } catch (error) {
    console.error("Erro PUT Collection:", error);
    return NextResponse.json({ error: "Erro ao atualizar coleção" }, { status: 500 });
  }
}

// 👇 APAGA A PASTA
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;
    const existing = await prisma.templateCollection.findUnique({ where: { id }, select: { coachId: true } });
    if (!existing) return NextResponse.json({ error: "Coleção não encontrada" }, { status: 404 });
    if (!isMasterId(auth.user.id) && !canActAsCoach(auth.user, existing.coachId)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    await prisma.templateCollection.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro DELETE Collection:", error);
    return NextResponse.json({ error: "Erro ao excluir coleção" }, { status: 500 });
  }
}