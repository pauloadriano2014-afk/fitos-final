// app/api/membros/sair/route.ts
// 🔐 ÁREA DE MEMBROS — encerra a sessão deste aparelho.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { tokenDoCabecalho, encerrarSessao } from '@/lib/membros';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = tokenDoCabecalho(request.headers.get('authorization'));
    if (token) await encerrarSessao(prisma, token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[membros/sair][POST]', error);
    return NextResponse.json({ error: 'Erro ao sair.' }, { status: 500 });
  }
}
