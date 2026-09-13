import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';


// BUSCAR TODAS AS ESTRUTURAS DE PIRÂMIDE SALVAS
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const presets = await prisma.pyramidPreset.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ presets });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao buscar as estruturas de pirâmide." }, { status: 500 });
  }
}

// SALVAR UMA NOVA ESTRUTURA DE PIRÂMIDE
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { structure } = body;

    if (!structure || !String(structure).trim()) {
      return NextResponse.json({ error: "Estrutura é obrigatória." }, { status: 400 });
    }

    const preset = await prisma.pyramidPreset.create({
      data: {
        structure: String(structure).trim()
      }
    });

    return NextResponse.json(preset);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao gravar a estrutura no banco." }, { status: 500 });
  }
}

// APAGAR UMA ESTRUTURA DE PIRÂMIDE
export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });

    await prisma.pyramidPreset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao apagar." }, { status: 500 });
  }
}
