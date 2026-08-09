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

// 🏋️ Pontuação FIXA por item. "checkin" = a foto do treino do dia (comprova
// presença). O multiplicador do dia (normal/fim de semana/data especial)
// é aplicado DEPOIS, em cima dessa soma — ver mais abaixo.
const PONTOS_FIXOS = {
    treino: 10,
    cardio: 10,
    agua: 5,
    alimentacao: 10,
    missao: 15,
    checkin: 5, // = fotoAcademiaUrl preenchida
};

function calcularPontosBase(itens: {
    treino?: boolean; cardio?: boolean; alimentacao?: boolean; agua?: boolean; missao?: boolean;
    fotoAcademiaUrl?: string | null;
}): number {
    let pontos = 0;
    if (itens.treino) pontos += PONTOS_FIXOS.treino;
    if (itens.cardio) pontos += PONTOS_FIXOS.cardio;
    if (itens.agua) pontos += PONTOS_FIXOS.agua;
    if (itens.alimentacao) pontos += PONTOS_FIXOS.alimentacao;
    if (itens.missao) pontos += PONTOS_FIXOS.missao;
    if (itens.fotoAcademiaUrl) pontos += PONTOS_FIXOS.checkin;
    return pontos;
}

// POST /api/desafios/checkin
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            inscricaoId, data,
            treino, cardio, alimentacao, agua, fotoAcademiaUrl,
            fotoFrenteUrl, fotoLadoUrl, fotoCostasUrl, pesoKg,
        } = body;
        // ⚠️ "missao" NÃO vem mais do formulário da aluna — ela não controla
        // mais esse campo. Só a Adri marca, por uma rota de admin separada.
        // Por isso buscamos o valor já salvo (se existir) só pra manter a
        // pontuação correta, sem nunca aceitar um valor vindo da aluna.

        if (!inscricaoId || !data) {
            return NextResponse.json({ error: 'inscricaoId e data são obrigatórios.' }, { status: 400 });
        }

        // ⚖️ Se vier alguma foto de sábado (frente/lado/costas), o peso é
        // obrigatório junto — sem isso a avaliação de evolução fica incompleta.
        const temFotoSabado = !!(fotoFrenteUrl || fotoLadoUrl || fotoCostasUrl);
        if (temFotoSabado && (pesoKg === undefined || pesoKg === null || pesoKg === '')) {
            return NextResponse.json(
                { error: 'Informe o peso junto com as fotos de frente/lado/costas.' },
                { status: 400 }
            );
        }

        // Busca os pesos de pontuação configurados no desafio dessa inscrição
        const inscricao = await prisma.desafioInscricao.findUnique({
            where: { id: inscricaoId },
            select: { desafioId: true, desafio: { select: { pontosPorItem: true, pontosPorItemFimDeSemana: true, dataInicio: true, duracaoDias: true } } },
        });
        if (!inscricao) {
            return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
        }

        // Normaliza pro início do dia em UTC — evita duplicar por causa de horário
        const dataDia = new Date(data);
        dataDia.setUTCHours(0, 0, 0, 0);

        // 📅 Se o desafio tem data de início configurada, só aceita check-in
        // dentro da janela válida (dataInicio até dataInicio + duracaoDias - 1).
        // Sem dataInicio configurada, não valida nada — comportamento de sempre.
        if (inscricao.desafio.dataInicio) {
            const inicio = new Date(inscricao.desafio.dataInicio);
            inicio.setUTCHours(0, 0, 0, 0);
            const fim = new Date(inicio);
            fim.setUTCDate(inicio.getUTCDate() + (inscricao.desafio.duracaoDias || 90) - 1);

            if (dataDia < inicio || dataDia > fim) {
                return NextResponse.json(
                    { error: 'Essa data está fora do período do desafio.' },
                    { status: 400 }
                );
            }
        }

        // 🎉 Data especial (feriado etc.) sobrescreve o multiplicador normal
        // do dia, se houver uma cadastrada exatamente nessa data.
        const dataEspecial = await prisma.desafioDataEspecial.findUnique({
            where: { desafioId_data: { desafioId: inscricao.desafioId, data: dataDia } },
        });

        let multiplicador: number;
        if (dataEspecial) {
            multiplicador = dataEspecial.pontosPorItem;
        } else {
            const diaSemana = dataDia.getUTCDay(); // 0=domingo .. 6=sábado
            const ehFimDeSemana = diaSemana === 0 || diaSemana === 6;
            multiplicador = ehFimDeSemana
                ? inscricao.desafio.pontosPorItemFimDeSemana
                : inscricao.desafio.pontosPorItem;
        }

        // Busca o check-in já existente (se houver) só pra saber se a Adri já
        // marcou a missão como cumprida — isso NUNCA é sobrescrito por aqui.
        const checkinExistente = await prisma.desafioCheckin.findUnique({
            where: { inscricaoId_data: { inscricaoId, data: dataDia } },
            select: { missao: true },
        });
        const missaoAtual = checkinExistente?.missao || false;

        const pontosBase = calcularPontosBase({ treino, cardio, alimentacao, agua, missao: missaoAtual, fotoAcademiaUrl });
        const pontos = Math.round(pontosBase * multiplicador);

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
                missao: false, // dia novo — a Adri ainda não teve chance de marcar
                fotoAcademiaUrl: fotoAcademiaUrl || null,
                fotoFrenteUrl: fotoFrenteUrl || null,
                fotoLadoUrl: fotoLadoUrl || null,
                fotoCostasUrl: fotoCostasUrl || null,
                pesoKg: pesoKg !== undefined && pesoKg !== null && pesoKg !== '' ? parseFloat(pesoKg) : null,
                pontos,
            },
            update: {
                treino: !!treino,
                cardio: !!cardio,
                alimentacao: !!alimentacao,
                agua: !!agua,
                // 🔒 "missao" propositalmente OMITIDO aqui — preserva o que a
                // Adri já marcou, mesmo que a aluna reenvie o check-in do dia.
                fotoAcademiaUrl: fotoAcademiaUrl || null,
                fotoFrenteUrl: fotoFrenteUrl || null,
                fotoLadoUrl: fotoLadoUrl || null,
                fotoCostasUrl: fotoCostasUrl || null,
                pesoKg: pesoKg !== undefined && pesoKg !== null && pesoKg !== '' ? parseFloat(pesoKg) : null,
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
            take: 100, // cobre uma sequência longa (desafios de até ~100 dias)
        });

        return NextResponse.json({ checkins });
    } catch (error) {
        console.error('[desafios/checkin][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar check-ins' }, { status: 500 });
    }
}