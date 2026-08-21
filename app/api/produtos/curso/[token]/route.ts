// app/api/produtos/curso/[token]/route.ts
// 🌐 ROTA PÚBLICA — sem login. Acesso à área de membros (curso) via link
// mágico enviado por e-mail depois da compra confirmada (ver webhook/route.ts,
// handleProdutoPayment). O token é a única credencial — mesmo padrão do
// ProdutoTreinoAcesso já usado no treino interativo.
//
// 🔒 DESBLOQUEIO POR DIAS: cada módulo só libera `liberacaoDias` dias depois
// da compra (calculado em cima de `acesso.createdAt`, nunca armazenado —
// assim, se o admin editar o programa depois, o cálculo já reflete o valor
// novo). Isso existe por pedido explícito do Paulo: proteger contra reembolso
// abusivo durante os 7 dias de garantia — o aluno não recebe o curso inteiro
// de uma vez, então não dá pra consumir tudo e depois pedir o dinheiro de
// volta. Por isso um módulo ainda bloqueado NUNCA devolve o conteúdo das
// aulas (nome/vídeo/descrição/anexo) — só o fato de que existe e quando libera.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
    try {
        const { token } = params;

        const acesso = await prisma.produtoCursoAcesso.findUnique({
            where: { token },
            include: { produto: { select: { nome: true, cursoPrograma: true } } },
        });

        if (!acesso) {
            return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 });
        }

        let modulosBrutos: any[] = [];
        try {
            const parsed = acesso.produto.cursoPrograma ? JSON.parse(acesso.produto.cursoPrograma) : null;
            modulosBrutos = Array.isArray(parsed?.modulos) ? parsed.modulos : [];
        } catch {
            modulosBrutos = [];
        }

        let progresso: { aulasConcluidas: string[] } = { aulasConcluidas: [] };
        try {
            progresso = acesso.progresso ? JSON.parse(acesso.progresso) : { aulasConcluidas: [] };
        } catch {
            progresso = { aulasConcluidas: [] };
        }
        const aulasConcluidas: string[] = Array.isArray(progresso.aulasConcluidas) ? progresso.aulasConcluidas : [];

        const diasDesdeCompra = Math.floor((Date.now() - new Date(acesso.createdAt).getTime()) / MS_POR_DIA);

        let totalAulas = 0;
        let totalConcluidas = 0;
        let todosModulosLiberados = true;

        const modulos = modulosBrutos.map((modulo, modIdx) => {
            const liberacaoDias = Number(modulo?.liberacaoDias) || 0;
            const liberada = diasDesdeCompra >= liberacaoDias;
            const aulasDoModulo = Array.isArray(modulo?.aulas) ? modulo.aulas : [];

            if (!liberada) {
                todosModulosLiberados = false;
                // 🔒 Módulo bloqueado: nada do conteúdo das aulas vaza aqui —
                // só o nome do módulo e quando ele libera.
                return {
                    nome: modulo?.nome || `Módulo ${modIdx + 1}`,
                    liberada: false,
                    diasParaLiberar: liberacaoDias - diasDesdeCompra,
                    totalAulas: aulasDoModulo.length,
                    aulas: [],
                };
            }

            const aulas = aulasDoModulo.map((aula: any, aulaIdx: number) => {
                totalAulas += 1;
                const chave = `${modIdx}-${aulaIdx}`;
                const concluida = aulasConcluidas.includes(chave);
                if (concluida) totalConcluidas += 1;
                return {
                    nome: aula?.nome || `Aula ${aulaIdx + 1}`,
                    descricao: aula?.descricao || null,
                    videoUrl: aula?.videoUrl || null,
                    videoOrientacao: aula?.videoOrientacao || 'vertical',
                    anexoUrl: aula?.anexoUrl || null,
                    concluida,
                };
            });

            return {
                nome: modulo?.nome || `Módulo ${modIdx + 1}`,
                liberada: true,
                diasParaLiberar: 0,
                totalAulas: aulas.length,
                aulas,
            };
        });

        // Só considera o curso "completo" (libera certificado) se todo módulo já
        // desbloqueou e toda aula dentro deles foi marcada como concluída — e se
        // existe pelo menos uma aula (evita "completar" um curso vazio).
        const cursoCompleto = totalAulas > 0 && todosModulosLiberados && totalConcluidas === totalAulas;

        // "Último acesso" é só informativo — não trava a resposta por causa disso.
        prisma.produtoCursoAcesso
            .update({ where: { token }, data: { ultimoAcesso: new Date() } })
            .catch(() => {});

        return NextResponse.json({
            nomeCliente: acesso.nomeCliente,
            produtoNome: acesso.produto.nome,
            modulos,
            cursoCompleto,
            certificadoEmitidoEm: acesso.certificadoEmitidoEm,
        });
    } catch (error) {
        console.error('[produtos/curso/[token]][GET]', error);
        return NextResponse.json({ error: 'Erro ao carregar curso' }, { status: 500 });
    }
}
