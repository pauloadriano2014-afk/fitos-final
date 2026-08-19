// app/api/produtos/vendas-recentes/route.ts
// 🌐 ROTA PÚBLICA — sem login. Alimenta o widget de prova social dinâmica
// ("Maria S. comprou há 8 minutos") na ProdutoCheckoutScreen. Só devolve
// vendas REAIS e já confirmadas (status='PAGO') — nunca inventa números,
// e some sozinha na tela se não houver nenhuma venda recente (sem fallback
// fake). Nome é reduzido a "Primeiro nome + inicial" por privacidade.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function nomeReduzido(nomeCompleto: string): string {
    const partes = (nomeCompleto || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'Alguém';
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes[1][0].toUpperCase()}.`;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');
        if (!slug) return NextResponse.json({ error: 'slug é obrigatório' }, { status: 400 });

        const produto = await prisma.produtoDigital.findUnique({ where: { slug }, select: { id: true } });
        if (!produto) return NextResponse.json({ vendas: [] });

        // Só conta venda em que este produto foi o item PRINCIPAL da compra
        // (não quando ele entrou como order bump de outro produto) — mantém a
        // prova social simples e sempre 100% real.
        const vendasDiretas = await prisma.produtoVenda.findMany({
            where: { produtoId: produto.id, status: 'PAGO' },
            select: { nomeCliente: true, paymentDate: true, createdAt: true },
            orderBy: { paymentDate: 'desc' },
            take: 8,
        });

        const vendas = vendasDiretas
            .map((v) => ({
                nome: nomeReduzido(v.nomeCliente),
                data: (v.paymentDate || v.createdAt).toISOString(),
            }))
            .slice(0, 5);

        return NextResponse.json({ vendas });
    } catch (error) {
        console.error('[produtos/vendas-recentes][GET]', error);
        return NextResponse.json({ vendas: [] });
    }
}
