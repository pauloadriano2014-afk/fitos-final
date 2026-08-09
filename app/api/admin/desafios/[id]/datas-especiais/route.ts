// fitos-api-nova/app/api/admin/desafios/[id]/datas-especiais/route.ts
//
// GET  → lista todas as datas especiais (passadas e futuras) desse desafio
// POST → cria uma nova data especial { data, pontosPorItem, motivo }
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
        const datas = await prisma.desafioDataEspecial.findMany({
            where: { desafioId: id },
            orderBy: { data: 'asc' },
        });
        return NextResponse.json({ datas });
    } catch (error) {
        console.error('[desafios/id/datas-especiais][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar datas especiais' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;
        const body = await request.json();
        const { data, pontosPorItem, motivo } = body;

        if (!data || !pontosPorItem || !motivo) {
            return NextResponse.json(
                { error: 'Preencha data, pontos por item e motivo.' },
                { status: 400 }
            );
        }

        const dataDia = new Date(data);
        dataDia.setUTCHours(0, 0, 0, 0);

        const dataEspecial = await prisma.desafioDataEspecial.upsert({
            where: { desafioId_data: { desafioId: id, data: dataDia } },
            create: {
                desafioId: id,
                data: dataDia,
                pontosPorItem: parseInt(pontosPorItem),
                motivo,
            },
            update: {
                pontosPorItem: parseInt(pontosPorItem),
                motivo,
            },
        });

        return NextResponse.json({ dataEspecial }, { status: 201 });
    } catch (error) {
        console.error('[desafios/id/datas-especiais][POST]', error);
        return NextResponse.json({ error: 'Erro ao criar data especial' }, { status: 500 });
    }
}
