import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';


// BUSCAR TODOS OS ATALHOS DE OBSERVAÇÃO SALVOS
export async function GET(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const snippets = await prisma.noteSnippet.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ snippets });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao buscar os atalhos de observação." }, { status: 500 });
  }
}

// SALVAR UM NOVO ATALHO DE OBSERVAÇÃO
export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const body = await req.json();
    const { text } = body;

    if (!text || !String(text).trim()) {
      return NextResponse.json({ error: "Texto é obrigatório." }, { status: 400 });
    }

    const snippet = await prisma.noteSnippet.create({
      data: {
        text: String(text).trim()
      }
    });

    return NextResponse.json(snippet);
  } catch (error) {
    return NextResponse.json({ error: "Falha ao gravar o atalho no banco." }, { status: 500 });
  }
}

// APAGAR UM ATALHO DE OBSERVAÇÃO
export async function DELETE(req: Request) {
  try {
    const auth = requireAuth(req);
    if ('response' in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: "ID em falta." }, { status: 400 });

    await prisma.noteSnippet.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Falha ao apagar." }, { status: 500 });
  }
}
