import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// 🗂️ (27 out 2026) Categorias das frases prontas: as 6 fixas (mesmas chaves do app: src/utils/obsPhrases.js) ou o id de uma categoria criada pelo coach
// (tabela ObservationCategory). Vazio = sem categoria (o app classifica sozinho). Devolve: texto = válida, null = sem categoria, undefined = inválida.
const OBS_CATEGORIES = ['TECNICA', 'CUIDADOS', 'CONTAGEM', 'COMO_FAZER', 'CARGA', 'OUTRAS'];
const cleanCategory = async (v: any): Promise<string | null | undefined> => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const up = v.toUpperCase();
  if (OBS_CATEGORIES.includes(up)) return up;
  const mine = await prisma.observationCategory.findMany({});
  return mine.some((c: any) => c.id === v) ? v : undefined;
};

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

    const category = await cleanCategory(body.category);
    if (body.category && category === undefined) {
      return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
    }

    const preset = await prisma.observationPreset.create({
      data: {
        text: String(text).trim(),
        ...(category ? { category } : {}),
      }
    });

    return NextResponse.json(preset);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao gravar a observação no banco." }, { status: 500 });
  }
}

// MUDAR A CATEGORIA DE UMA OBSERVAÇÃO RÁPIDA (o texto não muda)
export async function PATCH(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });

    const category = await cleanCategory(body.category);
    if (category === undefined) return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });

    const preset = await prisma.observationPreset.update({ where: { id }, data: { category } });
    return NextResponse.json(preset);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao mudar a categoria." }, { status: 500 });
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
