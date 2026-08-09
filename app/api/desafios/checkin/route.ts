// fitos-api-nova/app/api/desafios/checkin/route.ts
//
// POST /api/desafios/checkin — cria ou atualiza o check-in do dia (upsert,
//      garantido pelo @@unique([inscricaoId, data]) no schema — reabrir o
//      link no mesmo dia atualiza em vez de duplicar)
// GET  /api/desafios/checkin?inscricaoId=X — histórico dos últimos 14 dias
//      (usado pra mostrar a sequência/streak da participante)
//
// Rotas PÚBLICAS — protegidas só pelo fato de o inscricaoId ser um UUID
// não-adivinhável, obtido via /identificar depois de confirmar telefone.
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Conta quantos itens foram marcados/enviados e multiplica pelo peso do
// dia (peso maior aos fins de semana — configurado por desafio, já que é
// mais difícil manter a rotina no sábado/domingo).
function calcularPontos(itens: {
    treino?: boolean; cardio?: boolean; alimentacao?: boolean; agua?: boolean;
    fotoAcademiaUrl?: string | null;
    fotoFrenteUrl?: string | null; fotoLadoUrl?: string | null; fotoCostasUrl?: string | null;
}, pesoPorItem: number): number {
    let itensMarcados = 0;
    if (itens.treino) itensMarcados += 1;
    if (itens.cardio) itensMarcados += 1;
    if (itens.alimentacao) itensMarcados += 1;
    if (itens.agua) itensMarcados += 1;
    if (itens.fotoAcademiaUrl) itensMarcados += 1;
    if (itens.fotoFrenteUrl) itensMarcados += 1;
    if (itens.fotoLadoUrl) itensMarcados += 1;
    if (itens.fotoCostasUrl) itensMarcados += 1;
    return itensMarcados * pesoPorItem;
}

// POST /api/desafios/checkin
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            inscricaoId, data,
            treino, cardio, alimentacao, agua, fotoAcademiaUrl,
            fotoFrenteUrl, fotoLadoUrl, fotoCostasUrl,
        } = body;

        if (!inscricaoId || !data) {
            return NextResponse.json({ error: 'inscricaoId e data são obrigatórios.' }, { status: 400 });
        }

        // Busca os pesos de pontuação configurados no desafio dessa inscrição
        const inscricao = await prisma.desafioInscricao.findUnique({
            where: { id: inscricaoId },
            select: { desafioId: true, desafio: { select: { pontosPorItem: true, pontosPorItemFimDeSemana: true } } },
        });
        if (!inscricao) {
            return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
        }

        // Normaliza pro início do dia em UTC — evita duplicar por causa de horário
        const dataDia = new Date(data);
        dataDia.setUTCHours(0, 0, 0, 0);

        // 🎉 Data especial (feriado etc.) sobrescreve o peso normal do dia,
        // se houver uma cadastrada exatamente nessa data.
        const dataEspecial = await prisma.desafioDataEspecial.findUnique({
            where: { desafioId_data: { desafioId: inscricao.desafioId, data: dataDia } },
        });

        let pesoPorItem: number;
        if (dataEspecial) {
            pesoPorItem = dataEspecial.pontosPorItem;
        } else {
            const diaSemana = dataDia.getUTCDay(); // 0=domingo .. 6=sábado
            const ehFimDeSemana = diaSemana === 0 || diaSemana === 6;
            pesoPorItem = ehFimDeSemana
                ? inscricao.desafio.pontosPorItemFimDeSemana
                : inscricao.desafio.pontosPorItem;
        }

        const pontos = calcularPontos({
            treino, cardio, alimentacao, agua, fotoAcademiaUrl,
            fotoFrenteUrl, fotoLadoUrl, fotoCostasUrl,
        }, pesoPorItem);

        const checkin = await prisma.desafioCheckin.upsert({
            where: {
                inscricaoId_data: { inscricaoId, data: dataDia },
            },
            create: {
                inscricaoId,
                data: dataDia,
                treino: !!treino,
                cardio: !!cardio,
                alimentacao: !!alimentacao,
                agua: !!agua,
                fotoAcademiaUrl: fotoAcademiaUrl || null,
                fotoFrenteUrl: fotoFrenteUrl || null,
                fotoLadoUrl: fotoLadoUrl || null,
                fotoCostasUrl: fotoCostasUrl || null,
                pontos,
            },
            update: {
                treino: !!treino,
                cardio: !!cardio,
                alimentacao: !!alimentacao,
                agua: !!agua,
                fotoAcademiaUrl: fotoAcademiaUrl || null,
                fotoFrenteUrl: fotoFrenteUrl || null,
                fotoLadoUrl: fotoLadoUrl || null,
                fotoCostasUrl: fotoCostasUrl || null,
                pontos,
            },
        });

        return NextResponse.json({ checkin });
    } catch (error) {
        console.error('[desafios/checkin][POST]', error);
        return NextResponse.json({ error: 'Erro ao salvar check-in.' }, { status: 500 });
    }
}

// GET /api/desafios/checkin?inscricaoId=X
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const inscricaoId = searchParams.get('inscricaoId');

        if (!inscricaoId) {
            return NextResponse.json({ error: 'inscricaoId é obrigatório' }, { status: 400 });
        }

        const checkins = await prisma.desafioCheckin.findMany({
            where: { inscricaoId },
            orderBy: { data: 'desc' },
            take: 14,
        });

        return NextResponse.json({ checkins });
    } catch (error) {
        console.error('[desafios/checkin][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar check-ins' }, { status: 500 });
    }
}