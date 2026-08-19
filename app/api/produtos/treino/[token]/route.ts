// app/api/produtos/treino/[token]/route.ts
// 🌐 ROTA PÚBLICA — sem login. Acesso ao treino interativo via link mágico
// enviado por e-mail depois da compra confirmada (ver webhook/route.ts,
// handleProdutoPayment). O token é a única credencial — mesmo padrão do
// FormResponse.publicToken já usado em outro módulo — e só devolve o
// programa de treino e o progresso dessa venda específica, nada além disso.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
    try {
        const { token } = params;

        const acesso = await prisma.produtoTreinoAcesso.findUnique({
            where: { token },
            include: { produto: { select: { nome: true, treinoPrograma: true } } },
        });

        if (!acesso) {
            return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 });
        }

        let treinoPrograma = null;
        try {
            treinoPrograma = acesso.produto.treinoPrograma ? JSON.parse(acesso.produto.treinoPrograma) : null;
        } catch {
            treinoPrograma = null;
        }

        let progresso: { sessoes: any[] } = { sessoes: [] };
        try {
            progresso = acesso.progresso ? JSON.parse(acesso.progresso) : { sessoes: [] };
        } catch {
            progresso = { sessoes: [] };
        }

        // "Último acesso" é só informativo — não trava a resposta por causa disso.
        prisma.produtoTreinoAcesso
            .update({ where: { token }, data: { ultimoAcesso: new Date() } })
            .catch(() => {});

        return NextResponse.json({
            nomeCliente: acesso.nomeCliente,
            produtoNome: acesso.produto.nome,
            treinoPrograma,
            progresso,
        });
    } catch (error) {
        console.error('[produtos/treino/[token]][GET]', error);
        return NextResponse.json({ error: 'Erro ao carregar treino' }, { status: 500 });
    }
}
