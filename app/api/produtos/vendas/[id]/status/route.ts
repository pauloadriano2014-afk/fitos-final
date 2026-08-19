// app/api/produtos/vendas/[id]/status/route.ts
// 🌐 ROTA PÚBLICA — sem login. Polling de 5s feito pelo ProdutoCheckoutScreen
// enquanto aguarda a confirmação do PIX. Só revela os links de entrega
// (`itens[].linkEntrega`) quando o status vira PAGO — antes disso vem `itens:
// null`. Retorna UM item por produto comprado (o principal + cada bump).
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { id } = params;

        const venda = await prisma.produtoVenda.findUnique({
            where: { id },
            include: { produto: { select: { nome: true, linkEntrega: true } } },
        });

        if (!venda) {
            return NextResponse.json({ error: 'Venda não encontrada' }, { status: 404 });
        }

        if (venda.status !== 'PAGO') {
            return NextResponse.json({ status: venda.status, itens: null });
        }

        const itens = [{ nome: venda.produto.nome, linkEntrega: venda.produto.linkEntrega }];

        let bumpIds: string[] = [];
        try {
            bumpIds = venda.itensBumpIds ? JSON.parse(venda.itensBumpIds) : [];
        } catch { /* JSON inválido — segue só com o item principal */ }

        if (bumpIds.length > 0) {
            const bumpProdutos = await prisma.produtoDigital.findMany({
                where: { id: { in: bumpIds } },
                select: { nome: true, linkEntrega: true },
            });
            itens.push(...bumpProdutos.map((p) => ({ nome: p.nome, linkEntrega: p.linkEntrega })));
        }

        return NextResponse.json({ status: venda.status, itens });
    } catch (error) {
        console.error('[produtos/vendas/[id]/status][GET]', error);
        return NextResponse.json({ error: 'Erro ao consultar status' }, { status: 500 });
    }
}
