// app/api/admin/produtos/dashboard/route.ts
// Painel de vendas dos Produtos Digitais — receita total, vendas confirmadas,
// carrinhos pendentes/abandonados, taxa de conversão e ranking de produtos
// mais vendidos. Consumido pela seção de métricas no topo da TabProdutos.js.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // 🔒 Esse painel agrega vendas/produtos de TODOS os coaches sem
        // filtrar por dono — restrito ao time master até existir uma versão
        // com isolamento por coachId.
        const auth = requireMaster(request);
        if ('response' in auth) return auth.response;

        const [vendasPagas, vendasPendentes, produtos] = await Promise.all([
            prisma.produtoVenda.findMany({
                where: { status: 'PAGO' },
                select: { valorTotal: true, produtoId: true },
            }),
            prisma.produtoVenda.count({ where: { status: 'PENDENTE' } }),
            prisma.produtoDigital.findMany({ select: { id: true, nome: true } }),
        ]);

        const receitaTotal = vendasPagas.reduce((soma, v) => soma + v.valorTotal, 0);
        const totalVendas = vendasPagas.length;
        const totalCarrinhos = totalVendas + vendasPendentes;
        const taxaConversao = totalCarrinhos > 0 ? (totalVendas / totalCarrinhos) * 100 : 0;

        // Ranking por quantidade de vendas E receita gerada por produto —
        // só entram produtos com pelo menos 1 venda confirmada.
        const contagemPorProduto = new Map<string, { vendas: number; receita: number }>();
        for (const v of vendasPagas) {
            const atual = contagemPorProduto.get(v.produtoId) || { vendas: 0, receita: 0 };
            atual.vendas += 1;
            atual.receita += v.valorTotal;
            contagemPorProduto.set(v.produtoId, atual);
        }

        const nomeDoProduto = new Map(produtos.map((p) => [p.id, p.nome]));
        const rankingProdutos = Array.from(contagemPorProduto.entries())
            .map(([produtoId, dados]) => ({
                produtoId,
                nome: nomeDoProduto.get(produtoId) || 'Produto removido',
                vendas: dados.vendas,
                receita: dados.receita,
            }))
            .sort((a, b) => b.receita - a.receita);

        return NextResponse.json({
            receitaTotal,
            totalVendas,
            totalPendentes: vendasPendentes,
            taxaConversao,
            produtoMaisVendido: rankingProdutos[0] || null,
            rankingProdutos: rankingProdutos.slice(0, 5),
        });
    } catch (error) {
        console.error('[admin/produtos/dashboard][GET]', error);
        return NextResponse.json({ error: 'Erro ao calcular métricas' }, { status: 500 });
    }
}
