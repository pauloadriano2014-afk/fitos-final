// app/api/produtos/route.ts
// 🌐 ROTA PÚBLICA — sem login. Usada pela página de vendas
// (ProdutoCheckoutScreen) pra buscar os dados do produto pelo slug da URL
// (pauloadrianoteam.com.br/Produto?id=slug). Só devolve produtos ativos e só
// os campos necessários pra montar a vitrine — nada de dados internos
// (linkEntrega, coachId, etc.) vaza aqui antes do pagamento confirmado.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');

        if (!slug) {
            return NextResponse.json({ error: 'slug é obrigatório' }, { status: 400 });
        }

        const produto = await prisma.produtoDigital.findUnique({ where: { slug } });

        if (!produto || !produto.ativo) {
            return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
        }

        // Resolve os produtos oferecidos como order bump (só os que ainda
        // existem e continuam ativos — um bump apontando pra um produto
        // desativado/apagado simplesmente some da lista, sem quebrar nada).
        let orderBumpItens: { id: string; nome: string; descricao: string | null; capaUrl: string | null; valor: number }[] = [];
        try {
            const bumpIds: string[] = produto.orderBumpProdutoIds ? JSON.parse(produto.orderBumpProdutoIds) : [];
            if (bumpIds.length > 0) {
                const bumpProdutos = await prisma.produtoDigital.findMany({
                    where: { id: { in: bumpIds }, ativo: true },
                    select: { id: true, nome: true, descricao: true, capaUrl: true, valor: true },
                });
                // Preserva a ordem escolhida pelo admin
                orderBumpItens = bumpIds
                    .map((id) => bumpProdutos.find((p) => p.id === id))
                    .filter((p): p is NonNullable<typeof p> => !!p);
            }
        } catch { /* JSON inválido — trata como sem bump */ }

        return NextResponse.json({
            produto: {
                id: produto.id,
                nome: produto.nome,
                descricao: produto.descricao,
                capaUrl: produto.capaUrl,
                videoUrl: produto.videoUrl,
                videoOrientacao: produto.videoOrientacao,
                valor: produto.valor,
                precoDe: produto.precoDe,
                beneficios: produto.beneficios,
                imagensExtra: produto.imagensExtra,
                depoimentos: produto.depoimentos,
                antesDepois: produto.antesDepois,
                faq: produto.faq,
                orderBumpItens,
            },
        });
    } catch (error) {
        console.error('[produtos][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar produto' }, { status: 500 });
    }
}
