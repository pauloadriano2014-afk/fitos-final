// fitos-api-nova/app/api/admin/desafios/checkin-missao/route.ts
//
// POST /api/admin/desafios/checkin-missao
// Body: { inscricaoId, data (YYYY-MM-DD), missaoPercentual (0-100) }
//
// Diferente da rota /admin/desafios/checkin/[checkinId] (que exige um
// check-in JÁ EXISTENTE pra editar), esta rota faz um UPSERT: se a
// participante não enviou check-in nenhum naquele dia (ex: sumiu no
// domingo, dia da missão), a Adri ainda consegue dar a pontuação da
// missão mesmo assim — cria um check-in "vazio" só com a missão marcada.
// Se já existir check-in naquele dia, só atualiza o percentual da missão,
// preservando treino/cardio/água/alimentação/foto que a aluna já enviou.
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

export async function POST(request: NextRequest) {
    const auth = requireMaster(request);
    if ('response' in auth) return auth.response;

    try {
        const body = await request.json();
        const { inscricaoId, data, missaoPercentual } = body;

        if (!inscricaoId || !data || missaoPercentual === undefined || missaoPercentual === null) {
            return NextResponse.json({ error: 'Informe inscricaoId, data e missaoPercentual.' }, { status: 400 });
        }
        const percentualNum = Math.max(0, Math.min(100, parseInt(missaoPercentual)));

        const inscricao = await prisma.desafioInscricao.findUnique({
            where: { id: inscricaoId },
            select: { desafioId: true, desafio: { select: { pontosPorItem: true, pontosPorItemFimDeSemana: true } } },
        });
        if (!inscricao) {
            return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
        }

        const dataDia = new Date(data);
        dataDia.setUTCHours(0, 0, 0, 0);

        // Mesmo cálculo de multiplicador usado no check-in normal
        const dataEspecial = await prisma.desafioDataEspecial.findUnique({
            where: { desafioId_data: { desafioId: inscricao.desafioId, data: dataDia } },
        });

        let multiplicador: number;
        if (dataEspecial) {
            multiplicador = dataEspecial.pontosPorItem;
        } else {
            const diaSemana = dataDia.getUTCDay();
            const ehFimDeSemana = diaSemana === 0 || diaSemana === 6;
            multiplicador = ehFimDeSemana
                ? inscricao.desafio.pontosPorItemFimDeSemana
                : inscricao.desafio.pontosPorItem;
        }

        // Busca o que já existe (se existir) — pra não perder treino/cardio/
        // água/alimentação/foto que a aluna já tenha enviado naquele dia.
        const existente = await prisma.desafioCheckin.findUnique({
            where: { inscricaoId_data: { inscricaoId, data: dataDia } },
        });

        let pontosBase = 0;
        if (existente?.treino) pontosBase += PONTOS_FIXOS.treino;
        if (existente?.cardio) pontosBase += PONTOS_FIXOS.cardio;
        if (existente?.agua) pontosBase += PONTOS_FIXOS.agua;
        if (existente?.alimentacao) pontosBase += PONTOS_FIXOS.alimentacao;
        pontosBase += Math.round(PONTOS_FIXOS.missao * (percentualNum / 100));
        if (existente?.fotoAcademiaUrl) pontosBase += PONTOS_FIXOS.checkin;
        const pontos = Math.round(pontosBase * multiplicador);

        const checkin = await prisma.desafioCheckin.upsert({
            where: { inscricaoId_data: { inscricaoId, data: dataDia } },
            create: {
                inscricaoId,
                data: dataDia,
                treino: false,
                cardio: false,
                agua: false,
                alimentacao: false,
                missaoPercentual: percentualNum,
                pontos,
            },
            update: {
                missaoPercentual: percentualNum,
                pontos,
            },
        });

        return NextResponse.json({ checkin });
    } catch (error) {
        console.error('[admin/desafios/checkin-missao][POST]', error);
        return NextResponse.json({ error: 'Erro ao salvar missão.' }, { status: 500 });
    }
}