// app/api/membros/me/route.ts
// 🔐 ÁREA DE MEMBROS — quem sou eu e o que tenho liberado. Exige `Authorization: Bearer <sessão>`.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { tokenDoCabecalho, sessaoValida, produtosDoMembro } from '@/lib/membros';

export const dynamic = 'force-dynamic';

// Onde as páginas atuais de treino e curso abrem (mesmo endereço usado nos e-mails da compra).
const APP_URL = process.env.APP_URL || 'https://www.pauloadrianoteam.com.br';

export async function GET(request: Request) {
  try {
    const sessao = await sessaoValida(prisma, tokenDoCabecalho(request.headers.get('authorization')));
    if (!sessao) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 });

    const produtos = await produtosDoMembro(prisma, sessao.membro.email, APP_URL);
    return NextResponse.json({ membro: { nome: sessao.membro.nome ?? null, email: sessao.membro.email }, produtos });
  } catch (error) {
    console.error('[membros/me][GET]', error);
    return NextResponse.json({ error: 'Erro ao carregar sua área.' }, { status: 500 });
  }
}
