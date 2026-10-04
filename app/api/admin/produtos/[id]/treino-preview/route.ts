// app/api/admin/produtos/[id]/treino-preview/route.ts
// 🔥 PRÉ-VISUALIZAÇÃO SEM CUSTO: gera (ou reaproveita) um link de treino
// interativo pra esse produto sem precisar de uma compra real. Com a Área de Membros ligada (MEMBROS_URL) o link é o da página nova /treino/ (token assinado de 2h);
// sem ela, é o da página antiga do app (venda TESTE abaixo) — útil pro
// admin conferir como a página vai ficar enquanto ainda está montando o
// programa. A "venda" criada aqui tem status TESTE (nunca PAGO/PENDENTE), por
// isso não entra em nenhuma métrica de vendas, no dashboard, na prova social
// ("vendas-recentes") nem no lembrete de carrinho abandonado — todos esses
// filtram por status específico e TESTE não bate com nenhum.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { gerarTokenPrevia, membrosBaseUrl, PREVIA_TTL_MS } from '@/lib/membros';
import { lerPrograma } from '@/lib/membrosTreino';

export const dynamic = 'force-dynamic';

// 🔥 TEMPORÁRIO: revertido pra pauloadrianoteam.com.br -- ver forgot-password/route.ts
const APP_URL = process.env.APP_URL || 'https://www.pauloadrianoteam.com.br';

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

        // 🏋️ Treino na Área de Membros (página /treino/ do site de membros): link temporário e assinado, sem venda e sem e-mail. A página abre em "modo prévia"
        // (aviso no topo, nada do que for marcado é gravado). Só vale quando o site de membros está ligado (MEMBROS_URL) e o programa é válido.
        const membros = membrosBaseUrl();
        if (membros && lerPrograma(produto.treinoPrograma)) {
            const url = `${membros}/treino/?p=${encodeURIComponent(produto.id)}#previa=${gerarTokenPrevia(produto.id)}`;
            return NextResponse.json({ url, membros: true, expiraEm: new Date(Date.now() + PREVIA_TTL_MS).toISOString() });
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
