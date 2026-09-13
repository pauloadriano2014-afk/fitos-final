import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';


// BUSCAR TODAS AS OBSERVAÇÕES RÁPIDAS SALVAS
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const presets = await prisma.observationPreset.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ presets });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao buscar as observações rápidas." }, { status: 500 });
  }
}

// SALVAR UMA NOVA OBSERVAÇÃO RÁPIDA
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { text } = body;

    if (!text || !String(text).trim()) {
      return NextResponse.json({ error: "Texto é obrigatório." }, { status: 400 });
    }

    const preset = await prisma.observationPreset.create({
      data: {
        text: String(text).trim()
      }
    });

    return NextResponse.json(preset);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao gravar a observação no banco." }, { status: 500 });
  }
}

// APAGAR UMA OBSERVAÇÃO RÁPIDA
export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });

    await prisma.observationPreset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao apagar." }, { status: 500 });
  }
}
