// app/api/admin/produtos/[id]/treino-preview/route.ts
// 🔥 PRÉ-VISUALIZAÇÃO SEM CUSTO: gera (ou reaproveita) um link de treino
// interativo pra esse produto sem precisar de uma compra real. Com a Área de Membros ligada (MEMBROS_URL) o link é o do site de membros (página /p/, token assinado de 2h, todas as abas do produto);
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
import { lerAbas } from '@/lib/membrosConteudo';

export const dynamic = 'force-dynamic';

// 🔥 TEMPORÁRIO: revertido pra pauloadrianoteam.com.br -- ver forgot-password/route.ts
const APP_URL = process.env.APP_URL || 'https://www.pauloadrianoteam.com.br';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { id } = params;

        const produto = await prisma.produtoDigital.findUnique({
            where: { id },
            select: { id: true, treinoPrograma: true, coachId: true, treinoAvulsoId: true, membrosAbas: true },
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

        // 🏋️ Área de Membros (site membros.pauloadrianoteam.com.br): link temporário e assinado, sem venda e sem e-mail. A página abre em "modo prévia" (aviso no topo,
        // nada do que for marcado é gravado) e mostra TODAS as abas do produto: treino, guias, hábitos, medidas, receitas. Só vale quando o site de membros está ligado
        // (MEMBROS_URL) e o produto tem alguma aba (um Treino Avulso ligado, ou a lista de abas).
        const membros = membrosBaseUrl();
        if (membros && lerAbas(produto.membrosAbas, !!produto.treinoAvulsoId).length > 0) {
            const url = `${membros}/p/?p=${encodeURIComponent(produto.id)}#previa=${gerarTokenPrevia(produto.id)}`;
            return NextResponse.json({ url, membros: true, expiraEm: new Date(Date.now() + PREVIA_TTL_MS).toISOString() });
        }

        // Sem Área de Membros, o caminho antigo: a página de treino do app, com uma "venda de teste".
        if (!produto.treinoPrograma) {
            return NextResponse.json({ error: 'Ligue um treino ao produto (Área de membros) ou configure o programa de treino antes de pré-visualizar.' }, { status: 400 });
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
