// fitos-api-nova/app/api/proposta-ofertas/route.ts
//
// GET /api/proposta-ofertas?slug=high-ticket
//
// Rota PÚBLICA (sem autenticação) — chamada pela própria página de vendas
// (PropostaScreen) para buscar os preços/cards de uma oferta específica.
// Só retorna ofertas com ativa=true; se não encontrar, retorna 404 e o
// front cai automaticamente nos preços padrão (fallback já implementado
// na PropostaScreen).
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');

        if (!slug) {
            return NextResponse.json({ error: 'slug é obrigatório' }, { status: 400 });
        }

        const oferta = await prisma.propostaOferta.findFirst({
            where: { slug, ativa: true },
        });

        if (!oferta) {
            return NextResponse.json({ oferta: null }, { status: 404 });
        }

        return NextResponse.json({ oferta });
    } catch (error) {
        console.error('[proposta-ofertas][GET public]', error);
        return NextResponse.json({ error: 'Erro ao buscar oferta' }, { status: 500 });
    }
}