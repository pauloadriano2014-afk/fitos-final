// app/api/admin/cupons/[id]/route.ts
// 🎟️ Editar (PATCH) e apagar (DELETE) um cupom. O código não muda depois de criado. Só o dono do cupom ou o time master.
//   PATCH { ativo?, descricao?, tipo+valor?, produtoIds?, validoDe?, validoAte?, usoMaximo?, umaVezPorCliente? }
//   DELETE -> apaga o cupom; as vendas já feitas continuam com o código e o desconto gravados (cupomCodigo, valorOriginal, descontoValor).
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';
import { limparEntradaCupom, parseProdutoIds } from '@/lib/cupom';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        const existente = await prisma.cupomDesconto.findUnique({ where: { id: params.id }, select: { id: true, coachId: true } });
        if (!existente) return NextResponse.json({ error: 'Cupom não encontrado.' }, { status: 404 });
        if (!canActAsCoach(auth.user, existente.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

        const body = await request.json().catch(() => ({}));
        if (body && body.codigo !== undefined) return NextResponse.json({ error: 'O código do cupom não pode ser alterado. Crie um novo.' }, { status: 400 });
        const limpo = limparEntradaCupom(body, { parcial: true });
        if (!limpo.ok) return NextResponse.json({ error: limpo.error }, { status: 400 });
        const d = limpo.data;
        if (Object.keys(d).length === 0) return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 });

        const ids = parseProdutoIds(d.produtoIds);
        if (ids.length > 0) {
            const achados = await prisma.produtoDigital.findMany({ where: { id: { in: ids } }, select: { id: true, coachId: true } });
            if (achados.length !== ids.length) return NextResponse.json({ error: 'Algum produto escolhido não existe mais.' }, { status: 400 });
            if (achados.some((p: any) => !canActAsCoach(auth.user, p.coachId))) return NextResponse.json({ error: 'Acesso negado a um dos produtos escolhidos.' }, { status: 403 });
        }

        const cupom = await prisma.cupomDesconto.update({ where: { id: params.id }, data: d });
        return NextResponse.json({ cupom });
    } catch (error) {
        console.error('[admin/cupons/[id]][PATCH]', error);
        return NextResponse.json({ error: 'Erro ao atualizar o cupom.' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        const existente = await prisma.cupomDesconto.findUnique({ where: { id: params.id }, select: { id: true, coachId: true } });
        if (!existente) return NextResponse.json({ error: 'Cupom não encontrado.' }, { status: 404 });
        if (!canActAsCoach(auth.user, existente.coachId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });

        await prisma.cupomDesconto.delete({ where: { id: params.id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[admin/cupons/[id]][DELETE]', error);
        return NextResponse.json({ error: 'Erro ao apagar o cupom.' }, { status: 500 });
    }
}
