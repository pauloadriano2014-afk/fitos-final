// app/api/admin/produtos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId, canActAsCoach } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // 🔒 Isolamento multi-tenant: master vê todos os produtos digitais,
        // cada coach só vê os produtos que ele mesmo dono (coachId) — antes
        // essa lista voltava inteira pra qualquer chamada, sem filtro nenhum.
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        const where = isMasterId(auth.user.id) ? {} : { coachId: auth.user.id };

        // 🔥 Conta só vendas PAGO — vendas TESTE (geradas pela pré-visualização
        // do treino) e PENDENTE (carrinho ainda não confirmado) não devem
        // aparecer como "venda efetuada" na lista do admin.
        const produtos = await prisma.produtoDigital.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                vendas: { where: { status: 'PAGO' }, select: { id: true } },
            }
        });
        const produtosComContagem = produtos.map(({ vendas, ...produto }) => ({
            ...produto,
            _count: { vendas: vendas.length },
        }));
        return NextResponse.json({ produtos: produtosComContagem });
    } catch (error) {
        console.error('[admin/produtos][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar produtos' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            nome, slug, descricao, capaUrl, valor, precoDe, coachId, linkEntrega,
            videoUrl, videoOrientacao,
            beneficios, imagensExtra, orderBumpProdutoIds,
            depoimentos, antesDepois, faq, ativo, treinoPrograma, cursoPrograma
        } = body;

        if (!nome || !slug || !valor || !coachId) {
            return NextResponse.json({ error: 'Nome, slug, valor e dono do produto são obrigatórios.' }, { status: 400 });
        }

        // 🔒 Só o próprio coach (dono do produto) ou o time master pode criar
        // um produto em nome desse coachId — antes qualquer coachId servia.
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        if (!canActAsCoach(auth.user, coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const produto = await prisma.produtoDigital.create({
            data: {
                nome,
                slug,
                descricao,
                capaUrl,
                valor: Number(valor),
                precoDe: precoDe ? Number(precoDe) : null,
                coachId,
                linkEntrega,
                videoUrl: videoUrl || null,
                videoOrientacao: videoOrientacao || null,
                beneficios: beneficios || null,
                imagensExtra: imagensExtra || null,
                orderBumpProdutoIds: orderBumpProdutoIds || null,
                depoimentos: depoimentos || null,
                antesDepois: antesDepois || null,
                faq: faq || null,
                treinoPrograma: treinoPrograma || null,
                cursoPrograma: cursoPrograma || null,
                ativo: ativo ?? true
            }
        });

        return NextResponse.json({ produto }, { status: 201 });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Já existe um produto usando este link (slug).' }, { status: 400 });
        }
        console.error('[admin/produtos][POST]', error);
        return NextResponse.json({ error: 'Erro ao criar produto' }, { status: 500 });
    }
}