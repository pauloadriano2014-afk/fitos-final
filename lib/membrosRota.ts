// lib/membrosRota.ts
// 🧩 (out 2026) Cola comum das rotas /api/membros/produto/[produtoId]/*: confere quem está chamando (sessão ou prévia), aplica o limite de pedidos e entrega o `acesso`.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { acessoAoProduto, dentroDoLimite, type Acesso } from '@/lib/membrosAcesso';

export const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
export const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

/** Roda `fazer` só para quem pode abrir o produto. Erros inesperados viram 500 sem vazar detalhes. */
export async function comAcesso(request: Request, produtoId: unknown, tipo: 'leitura' | 'escrita', rotulo: string, fazer: (acesso: Acesso) => Promise<Response>): Promise<Response> {
  try {
    const r = await acessoAoProduto(prisma, request.headers.get('authorization'), produtoId);
    if (!r.ok) return reply({ error: r.error }, r.status);
    if (!dentroDoLimite(r.acesso, tipo)) return reply({ error: 'Muitos pedidos seguidos. Aguarde um instante.' }, 429);
    return await fazer(r.acesso);
  } catch (error) {
    console.error(`[membros/produto][${rotulo}]`, error);
    return reply({ error: tipo === 'escrita' ? 'Não foi possível salvar agora.' : 'Erro ao carregar. Tente de novo em instantes.' }, 500);
  }
}
