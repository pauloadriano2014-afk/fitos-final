// app/api/admin/produtos/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';


export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { id } = params;
        const body = await request.json();

        // 🔒 Só o coach dono do produto (ou o time master) pode editá-lo —
        // antes essa rota fazia mass-assignment com QUALQUER body, sem
        // checar quem estava chamando nem se o produto era dele.
        const existing = await prisma.produtoDigital.findUnique({ where: { id }, select: { coachId: true } });
        if (!existing) {
            return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
        }
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        if (!canActAsCoach(auth.user, existing.coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const produto = await prisma.produtoDigital.update({
            where: { id },
            data: {
                ...body,
                valor: body.valor !== undefined ? Number(body.valor) : undefined,
                precoDe: body.precoDe !== undefined ? (body.precoDe ? Number(body.precoDe) : null) : undefined,
            }
        });

        return NextResponse.json({ produto });
    } catch (error) {
        console.error('[admin/produtos/[id]][PATCH]', error);
        return NextResponse.json({ error: 'Erro ao atualizar produto' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { id } = params;

        // 🔒 Só o coach dono do produto (ou o time master) pode apagá-lo.
        const existing = await prisma.produtoDigital.findUnique({ where: { id }, select: { coachId: true } });
        if (!existing) {
            return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
        }
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        if (!canActAsCoach(auth.user, existing.coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        await prisma.produtoDigital.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[admin/produtos/[id]][DELETE]', error);
        return NextResponse.json({ error: 'Erro ao deletar produto' }, { status: 500 });
    }
}