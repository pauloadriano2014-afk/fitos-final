// fitos-api-nova/app/api/admin/desafios/[id]/datas-especiais/[dataId]/route.ts
//
// DELETE → remove uma data especial (volta a valer o peso normal naquele dia)
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string; dataId: string } }
) {
    const auth = requireMaster(request);
    if ('response' in auth) return auth.response;

    try {
        const { dataId } = params;
        await prisma.desafioDataEspecial.delete({ where: { id: dataId } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[desafios/id/datas-especiais/dataId][DELETE]', error);
        return NextResponse.json({ error: 'Erro ao remover data especial' }, { status: 500 });
    }
}
