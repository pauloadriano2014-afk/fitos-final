// fitos-api-nova/app/api/admin/desafios/checkin/[checkinId]/route.ts
//
// PATCH /api/admin/desafios/checkin/{checkinId}
// Body: { missao: boolean }
//
// Rota MASTER-ONLY (Adri/Paulo) — a Missão semanal (15 pts) não é mais
// autodeclarada pela aluna. É a Adri quem confirma, direto no admin,
// geralmente olhando o check-in de domingo de cada participante.
// Recalcula "pontos" do check-in inteiro, aplicando o mesmo multiplicador
// do dia (normal/fim de semana/data especial) usado no check-in normal.
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    try {
        const { checkinId } = params;
        const body = await request.json();
        const { missao } = body;

        if (missao === undefined) {
            return NextResponse.json({ error: 'Informe missao (true ou false).' }, { status: 400 });
        }

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
        if (missao) pontosBase += PONTOS_FIXOS.missao;
        if (checkin.fotoAcademiaUrl) pontosBase += PONTOS_FIXOS.checkin;
        const pontos = Math.round(pontosBase * multiplicador);

        const atualizado = await prisma.desafioCheckin.update({
            where: { id: checkinId },
            data: { missao: !!missao, pontos },
        });

        return NextResponse.json({ checkin: atualizado });
    } catch (error) {
        console.error('[admin/desafios/checkin/checkinId][PATCH]', error);
        return NextResponse.json({ error: 'Erro ao atualizar missão.' }, { status: 500 });
    }
}