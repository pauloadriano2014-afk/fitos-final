// app/api/indicacao/route.ts
// 🤝 "INDIQUE E GANHE" do ALUNO (ver lib/indicacao.ts). GET -> o código pessoal dele (criado na primeira vez), quantos amigos já compraram e os prêmios que ganhou.
// Não devolve nenhum dado dos amigos (nome, e-mail...): só as contagens.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { RESERVA_PENDENTE_MS, round2 } from '@/lib/cupom';
import { donosDosProdutos, obterCodigoDoAluno, ORIGEM_PREMIO, PERCENTUAL_AMIGO, PERCENTUAL_PREMIO, situacaoDoPremio, VALIDADE_PREMIO_DIAS } from '@/lib/indicacao';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;

        const aluno = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { id: true, name: true, coachId: true } });
        if (!aluno || !aluno.coachId) return NextResponse.json({ error: 'O "Indique e ganhe" está disponível para alunos de um coach.' }, { status: 403 });

        const codigo = await obterCodigoDoAluno(prisma, { id: aluno.id, name: aluno.name, coachId: aluno.coachId });
        const agora = new Date();

        const produtos = await prisma.produtoDigital.findMany({
            where: { coachId: { in: donosDosProdutos(aluno.coachId) }, ativo: true },
            select: { id: true, nome: true, slug: true },
            orderBy: { nome: 'asc' },
        });
        const pagas = await prisma.produtoVenda.count({ where: { cupomId: codigo.id, status: 'PAGO' } });
        const pendentes = await prisma.produtoVenda.count({ where: { cupomId: codigo.id, status: 'PENDENTE', createdAt: { gte: new Date(agora.getTime() - RESERVA_PENDENTE_MS) } } });

        const premios = await prisma.cupomDesconto.findMany({ where: { origem: ORIGEM_PREMIO, indicadorId: aluno.id }, orderBy: { createdAt: 'desc' } });
        const usadas = premios.length ? await prisma.produtoVenda.findMany({ where: { cupomId: { in: premios.map((p: any) => p.id) }, status: 'PAGO' }, select: { cupomId: true } }) : [];

        return NextResponse.json({
            codigo: codigo.codigo,
            ativo: codigo.ativo !== false,
            percentualAmigo: PERCENTUAL_AMIGO,
            percentualPremio: PERCENTUAL_PREMIO,
            validadePremioDias: VALIDADE_PREMIO_DIAS,
            produtos,
            indicacoes: { pagas, pendentes },
            premios: premios.map((p: any) => ({
                id: p.id, codigo: p.codigo, percentual: round2(p.valor), validoAte: p.validoAte, criadoEm: p.createdAt,
                situacao: situacaoDoPremio(p, usadas.filter((v: any) => v.cupomId === p.id).length, agora),
            })),
        });
    } catch (error: any) {
        console.error('[indicacao][GET]', error?.message || error);
        return NextResponse.json({ error: 'Não foi possível abrir o "Indique e ganhe" agora. Tente de novo.' }, { status: 500 });
    }
}
