// fitos-api-nova/app/api/admin/desafios/checkin/[checkinId]/route.ts
//
// PATCH  /api/admin/desafios/checkin/{checkinId} — define quanto da missão
//        semanal foi cumprido (0, 25, 50, 75 ou 100%) — pontos proporcionais
// DELETE /api/admin/desafios/checkin/{checkinId} — invalida/apaga um
//        check-in específico (ex: registrado antes da data de início real
//        ser corrigida, ou qualquer outro erro pontual de um dia)
//
// Rota MASTER-ONLY (Adri/Paulo).
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

const PONTOS_FIXOS = {
    treino: 10,
    cardio: 10,
    agua: 5,
    alimentacao: 10,
    missao: 15,
    checkin: 5,
};

export async function PATCH(
    request: NextRequest,
    { params }: { params: { checkinId: string } }
) {
    const auth = requireMaster(request);
    if ('response' in auth) return auth.response;

    try {
        const { checkinId } = params;
        const body = await request.json();
        const { missaoPercentual } = body;

        if (missaoPercentual === undefined || missaoPercentual === null) {
            return NextResponse.json({ error: 'Informe missaoPercentual (0 a 100).' }, { status: 400 });
        }
        const percentualNum = Math.max(0, Math.min(100, parseInt(missaoPercentual)));

        const checkin = await prisma.desafioCheckin.findUnique({
            where: { id: checkinId },
            include: {
                inscricao: {
                    select: {
                        desafioId: true,
                        desafio: { select: { pontosPorItem: true, pontosPorItemFimDeSemana: true } },
                    },
                },
            },
        });
        if (!checkin) {
            return NextResponse.json({ error: 'Check-in não encontrado.' }, { status: 404 });
        }

        // Mesmo cálculo de multiplicador usado no check-in normal
        const dataEspecial = await prisma.desafioDataEspecial.findUnique({
            where: { desafioId_data: { desafioId: checkin.inscricao.desafioId, data: checkin.data } },
        });

        let multiplicador: number;
        if (dataEspecial) {
            multiplicador = dataEspecial.pontosPorItem;
        } else {
            const diaSemana = checkin.data.getUTCDay();
            const ehFimDeSemana = diaSemana === 0 || diaSemana === 6;
            multiplicador = ehFimDeSemana
                ? checkin.inscricao.desafio.pontosPorItemFimDeSemana
                : checkin.inscricao.desafio.pontosPorItem;
        }

        let pontosBase = 0;
        if (checkin.treino) pontosBase += PONTOS_FIXOS.treino;
        if (checkin.cardio) pontosBase += PONTOS_FIXOS.cardio;
        if (checkin.agua) pontosBase += PONTOS_FIXOS.agua;
        if (checkin.alimentacao) pontosBase += PONTOS_FIXOS.alimentacao;
        pontosBase += Math.round(PONTOS_FIXOS.missao * (percentualNum / 100));
        if (checkin.fotoAcademiaUrl) pontosBase += PONTOS_FIXOS.checkin;
        const pontos = Math.round(pontosBase * multiplicador);

        const atualizado = await prisma.desafioCheckin.update({
            where: { id: checkinId },
            data: { missaoPercentual: percentualNum, pontos },
        });

        return NextResponse.json({ checkin: atualizado });
    } catch (error) {
        console.error('[admin/desafios/checkin/checkinId][PATCH]', error);
        return NextResponse.json({ error: 'Erro ao atualizar missão.' }, { status: 500 });
    }
}

// DELETE /api/admin/desafios/checkin/[checkinId]
export async function DELETE(
    request: NextRequest,
    { params }: { params: { checkinId: string } }
) {
    const auth = requireMaster(request);
    if ('response' in auth) return auth.response;

    try {
        const { checkinId } = params;
        await prisma.desafioCheckin.delete({ where: { id: checkinId } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[admin/desafios/checkin/checkinId][DELETE]', error);
        return NextResponse.json({ error: 'Erro ao excluir check-in.' }, { status: 500 });
    }
}