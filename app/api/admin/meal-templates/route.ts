import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isCoachLike, vaultWhere, vaultCanTouch, vaultDenied } from '@/lib/dietVault';


// BUSCAR TODAS AS REFEIÇÕES GUARDADAS
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    if (!isCoachLike(auth.user)) return vaultDenied();
    const templates = await prisma.mealTemplate.findMany({
      where: vaultWhere(auth.user),   // 🔒 cada coach vê só os dele (o time master vê o acervo do time)
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
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    if (!isCoachLike(auth.user)) return vaultDenied();
    const body = await req.json();
    const { name, category, items } = body;

    if (!name || !items) {
      return NextResponse.json({ error: "Nome e itens são obrigatórios." }, { status: 400 });
    }

    const template = await prisma.mealTemplate.create({
      data: {
        name,
        category: category || "Geral",
        coachId: auth.user.id,
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
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });

    if (!isCoachLike(auth.user)) return vaultDenied();
    const row = await prisma.mealTemplate.findUnique({ where: { id }, select: { coachId: true } as any });
    if (!row) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });
    if (!vaultCanTouch(auth.user, row as any)) return vaultDenied();   // 🔒 só apaga o que é dele
    await prisma.mealTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao apagar." }, { status: 500 });
  }
}