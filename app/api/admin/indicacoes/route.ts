// app/api/admin/indicacoes/route.ts
// 🤝 ADMIN das INDICAÇÕES (ver lib/indicacao.ts): quem indicou, quantos amigos compraram, quanto de desconto saiu e os prêmios. O coach vê os alunos dele; o time
// master vê todos. GET -> { resumo, indicacoes[] } (só quem já tem alguma compra feita com o código).
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';
import { RESERVA_PENDENTE_MS, round2 } from '@/lib/cupom';
import { ORIGEM_CODIGO, ORIGEM_PREMIO } from '@/lib/indicacao';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        const dono = isMasterId(auth.user.id) ? {} : { coachId: auth.user.id };

        const codigos = await prisma.cupomDesconto.findMany({ where: { origem: ORIGEM_CODIGO, ...dono } });
        const premios = await prisma.cupomDesconto.findMany({ where: { origem: ORIGEM_PREMIO, ...dono } });
        const ids = [...codigos, ...premios].map((c: any) => c.id);
        const agora = new Date();
        const pagas = ids.length ? await prisma.produtoVenda.findMany({ where: { cupomId: { in: ids }, status: 'PAGO' }, select: { cupomId: true, valorTotal: true, descontoValor: true } }) : [];
        const pendentes = ids.length ? await prisma.produtoVenda.findMany({ where: { cupomId: { in: ids }, status: 'PENDENTE', createdAt: { gte: new Date(agora.getTime() - RESERVA_PENDENTE_MS) } }, select: { cupomId: true } }) : [];
        const donos = codigos.length ? await prisma.user.findMany({ where: { id: { in: codigos.map((c: any) => c.indicadorId).filter(Boolean) } }, select: { id: true, name: true } }) : [];
        const soma = (lista: any[], campo: string) => round2(lista.reduce((s, v) => s + (v[campo] || 0), 0));

        const indicacoes = codigos.map((c: any) => {
            const minhas = pagas.filter((v: any) => v.cupomId === c.id);
            const pend = pendentes.filter((v: any) => v.cupomId === c.id).length;
            const meusPremios = premios.filter((p: any) => p.indicadorId === c.indicadorId);
            const premiosUsados = meusPremios.filter((p: any) => pagas.some((v: any) => v.cupomId === p.id)).length;
            return {
                id: c.id, codigo: c.codigo, ativo: c.ativo !== false, alunoId: c.indicadorId, aluno: donos.find((u: any) => u.id === c.indicadorId)?.name || 'Aluno',
                pagas: minhas.length, pendentes: pend, receita: soma(minhas, 'valorTotal'), descontoDado: soma(minhas, 'descontoValor'), premios: meusPremios.length, premiosUsados,
            };
        }).filter((i: any) => i.pagas + i.pendentes > 0).sort((a: any, b: any) => b.pagas - a.pagas || b.pendentes - a.pendentes || a.aluno.localeCompare(b.aluno, 'pt-BR'));

        const idsCodigos = new Set(codigos.map((c: any) => c.id));
        const dosCodigos = pagas.filter((v: any) => idsCodigos.has(v.cupomId));
        const dosPremios = pagas.filter((v: any) => !idsCodigos.has(v.cupomId));
        return NextResponse.json({
            resumo: {
                codigos: codigos.length, comIndicacao: indicacoes.length, vendasPagas: dosCodigos.length, receita: soma(dosCodigos, 'valorTotal'), descontoAmigos: soma(dosCodigos, 'descontoValor'),
                premiosGerados: premios.length, premiosUsados: new Set(dosPremios.map((v: any) => v.cupomId)).size, descontoPremios: soma(dosPremios, 'descontoValor'),
            },
            indicacoes,
        });
    } catch (error: any) {
        console.error('[admin/indicacoes][GET]', error?.message || error);
        return NextResponse.json({ error: 'Erro ao buscar as indicações.' }, { status: 500 });
    }
}
