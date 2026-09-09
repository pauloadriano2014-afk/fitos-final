// fitos-api-nova/app/api/proposta-ofertas/route.ts
//
// GET /api/proposta-ofertas?pagina=start&slug=high-ticket
//
// Rota PÚBLICA (sem autenticação) — chamada pelas próprias páginas de venda
// (PropostaScreen, PropostaStartScreen, etc.) para buscar os preços/cards de
// uma oferta específica. `pagina` identifica de qual tela é a oferta (default
// "proposta", pra não quebrar o link antigo da PropostaScreen que não manda
// esse parâmetro). Só retorna ofertas com ativa=true; se não encontrar,
// retorna 404 e o front cai automaticamente nos preços padrão (fallback já
// implementado em cada tela).
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');
        // 🔥 `pagina` default "proposta" por compatibilidade com o link
        // antigo da PropostaScreen, que não manda esse parâmetro.
        const pagina = searchParams.get('pagina') || 'proposta';

        if (!slug) {
            return NextResponse.json({ error: 'slug é obrigatório' }, { status: 400 });
        }

        const oferta = await prisma.propostaOferta.findFirst({
            where: { pagina, slug, ativa: true },
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