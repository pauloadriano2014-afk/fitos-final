// fitos-api-nova/app/api/admin/desafios/[id]/checkins/route.ts
//
// GET → lista os check-ins dos últimos 14 dias de TODAS as participantes
// pagas de um desafio, já agrupados por inscrição — pra você ver de
// relance quem está em dia e quem está sumindo.
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;

        const inscricoes = await prisma.desafioInscricao.findMany({
            where: { desafioId: id, status: 'PAGO' },
            select: {
                id: true,
                nome: true,
                telefone: true,
                isTeste: true,
                checkins: {
                    orderBy: { data: 'desc' },
                    take: 14,
                },
            },
            orderBy: { nome: 'asc' },
        });

        return NextResponse.json({ inscricoes });
    } catch (error) {
        console.error('[desafios/id/checkins][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar check-ins' }, { status: 500 });
    }
}
