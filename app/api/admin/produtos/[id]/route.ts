// app/api/admin/produtos/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { id } = params;
        const body = await request.json();
        
        const produto = await prisma.produtoDigital.update({
            where: { id },
            data: {
                ...body,
                valor: body.valor !== undefined ? Number(body.valor) : undefined,
                orderBumpValor: body.orderBumpValor !== undefined ? Number(body.orderBumpValor) : undefined,
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
        await prisma.produtoDigital.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[admin/produtos/[id]][DELETE]', error);
        return NextResponse.json({ error: 'Erro ao deletar produto' }, { status: 500 });
    }
}