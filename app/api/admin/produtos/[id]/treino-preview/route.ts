// app/api/admin/produtos/[id]/treino-preview/route.ts
// 🔥 PRÉ-VISUALIZAÇÃO SEM CUSTO: gera (ou reaproveita) um link de treino
// interativo pra esse produto sem precisar de uma compra real — útil pro
// admin conferir como a página vai ficar enquanto ainda está montando o
// programa. A "venda" criada aqui tem status TESTE (nunca PAGO/PENDENTE), por
// isso não entra em nenhuma métrica de vendas, no dashboard, na prova social
// ("vendas-recentes") nem no lembrete de carrinho abandonado — todos esses
// filtram por status específico e TESTE não bate com nenhum.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.APP_URL || 'https://www.elitefitapp.com.br';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { id } = params;

        const produto = await prisma.produtoDigital.findUnique({
            where: { id },
            select: { id: true, treinoPrograma: true, coachId: true },
        });
        if (!produto) {
            return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
        }

        // 🔒 Só o coach dono do produto (ou o time master) pode gerar essa
        // pré-visualização.
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        if (!canActAsCoach(auth.user, produto.coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        if (!produto.treinoPrograma) {
            return NextResponse.json({ error: 'Configure e salve o programa de treino antes de pré-visualizar.' }, { status: 400 });
        }

        // Reaproveita a mesma "venda de teste" em pré-visualizações seguintes
        // — o link fica sempre o mesmo enquanto o produto existir.
        let venda = await prisma.produtoVenda.findFirst({
            where: { produtoId: id, status: 'TESTE' },
        });
        if (!venda) {
            venda = await prisma.produtoVenda.create({
                data: {
                    produtoId: id,
                    nomeCliente: 'Pré-visualização',
                    emailCliente: 'previsualizacao@painel.local',
                    telefoneCliente: '',
                    cpfCliente: '',
                    status: 'TESTE',
                    valorTotal: 0,
                },
            });
        }

        let acesso = await prisma.produtoTreinoAcesso.findUnique({
            where: { vendaId_produtoId: { vendaId: venda.id, produtoId: id } },
        });
        if (!acesso) {
            acesso = await prisma.produtoTreinoAcesso.create({
                data: {
                    token: crypto.randomBytes(24).toString('hex'),
                    vendaId: venda.id,
                    produtoId: id,
                    nomeCliente: 'Pré-visualização',
                },
            });
        }

        return NextResponse.json({ token: acesso.token, url: `${APP_URL}/ProdutoTreino?token=${acesso.token}` });
    } catch (error) {
        console.error('[admin/produtos/[id]/treino-preview][POST]', error);
        return NextResponse.json({ error: 'Erro ao gerar pré-visualização' }, { status: 500 });
    }
}
