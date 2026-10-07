// app/api/admin/cupons/route.ts
// 🎟️ ADMIN dos CUPONS DE DESCONTO (ver lib/cupom.ts). Quem vê/cria: o próprio coach (só os dele) e o time master (todos).
//   GET  -> { cupons: [...] } com a situação e o desempenho de cada um (usos pagos, pendentes, receita e desconto dado)
//   POST -> cria um cupom { codigo, tipo, valor, descricao?, produtoIds?, validoDe?, validoAte?, usoMaximo?, umaVezPorCliente?, ativo?, coachId? }
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId, canActAsCoach } from '@/lib/auth';
import { descreverCupom, limparEntradaCupom, parseProdutoIds, situacaoDoCupom, RESERVA_PENDENTE_MS, round2 } from '@/lib/cupom';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        const where = isMasterId(auth.user.id) ? {} : { coachId: auth.user.id };
        const cupons = await prisma.cupomDesconto.findMany({ where, orderBy: { createdAt: 'desc' } });

        const ids = cupons.map((c: any) => c.id);
        const agora = new Date();
        const pagas = ids.length ? await prisma.produtoVenda.findMany({ where: { cupomId: { in: ids }, status: 'PAGO' }, select: { cupomId: true, valorTotal: true, descontoValor: true } }) : [];
        const pendentes = ids.length ? await prisma.produtoVenda.findMany({ where: { cupomId: { in: ids }, status: 'PENDENTE', createdAt: { gte: new Date(agora.getTime() - RESERVA_PENDENTE_MS) } }, select: { cupomId: true } }) : [];

        const lista = cupons.map((c: any) => {
            const minhas = pagas.filter((v: any) => v.cupomId === c.id);
            const usosPagos = minhas.length;
            return {
                id: c.id, codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, valor: c.valor, resumo: descreverCupom(c), coachId: c.coachId,
                produtoIds: parseProdutoIds(c.produtoIds), validoDe: c.validoDe, validoAte: c.validoAte, usoMaximo: c.usoMaximo, umaVezPorCliente: c.umaVezPorCliente, ativo: c.ativo,
                situacao: situacaoDoCupom(c, usosPagos, agora), usosPagos, pendentes: pendentes.filter((v: any) => v.cupomId === c.id).length,
                receita: round2(minhas.reduce((s: number, v: any) => s + (v.valorTotal || 0), 0)), descontoTotal: round2(minhas.reduce((s: number, v: any) => s + (v.descontoValor || 0), 0)),
                createdAt: c.createdAt,
            };
        });
        return NextResponse.json({ cupons: lista });
    } catch (error) {
        console.error('[admin/cupons][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar os cupons.' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;

        const body = await request.json().catch(() => ({}));
        const coachId = typeof body?.coachId === 'string' && body.coachId ? body.coachId : auth.user.id;
        if (!canActAsCoach(auth.user, coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

        const limpo = limparEntradaCupom(body);
        if (!limpo.ok) return NextResponse.json({ error: limpo.error }, { status: 400 });
        const d = limpo.data;

        // Os produtos escolhidos precisam existir e ser de quem está criando (o time master vale para todos).
        const ids = parseProdutoIds(d.produtoIds);
        if (ids.length > 0) {
            const achados = await prisma.produtoDigital.findMany({ where: { id: { in: ids } }, select: { id: true, coachId: true } });
            if (achados.length !== ids.length) return NextResponse.json({ error: 'Algum produto escolhido não existe mais.' }, { status: 400 });
            if (achados.some((p: any) => !canActAsCoach(auth.user, p.coachId))) return NextResponse.json({ error: 'Acesso negado a um dos produtos escolhidos.' }, { status: 403 });
        }

        try {
            const cupom = await prisma.cupomDesconto.create({
                data: {
                    codigo: d.codigo!, tipo: d.tipo!, valor: d.valor!, coachId,
                    descricao: d.descricao ?? null, produtoIds: d.produtoIds ?? null,
                    validoDe: d.validoDe ?? null, validoAte: d.validoAte ?? null, usoMaximo: d.usoMaximo ?? null,
                    umaVezPorCliente: d.umaVezPorCliente ?? true, ativo: d.ativo ?? true,
                },
            });
            return NextResponse.json({ cupom }, { status: 201 });
        } catch (e: any) {
            if (e?.code === 'P2002') return NextResponse.json({ error: 'Já existe um cupom com esse código. Escolha outro.' }, { status: 409 });
            throw e;
        }
    } catch (error) {
        console.error('[admin/cupons][POST]', error);
        return NextResponse.json({ error: 'Erro ao criar o cupom.' }, { status: 500 });
    }
}
