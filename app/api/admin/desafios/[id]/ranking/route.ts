// fitos-api-nova/app/api/admin/desafios/[id]/ranking/route.ts
//
// GET /api/admin/desafios/{id}/ranking?semana=YYYY-MM-DD
//
// Rota MASTER-ONLY (Paulo/Adri) — soma os pontos de cada participante paga
// numa semana (segunda a domingo) e devolve ordenado do maior pro menor.
// "semana" é opcional: a data de QUALQUER dia daquela semana (normalmente
// a segunda-feira) — se omitido, usa a semana atual.
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

function inicioDaSemana(referencia: Date): Date {
    const d = new Date(referencia);
    d.setUTCHours(0, 0, 0, 0);
    const diaSemana = d.getUTCDay(); // 0=domingo .. 6=sábado
    const diffSegunda = diaSemana === 0 ? 6 : diaSemana - 1; // dias desde a última segunda
    d.setUTCDate(d.getUTCDate() - diffSegunda);
    return d;
}

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = requireMaster(request);
    if ('response' in auth) return auth.response;

    try {
        const { id } = params;
        const { searchParams } = new URL(request.url);
        const semanaParam = searchParams.get('semana');

        const referencia = semanaParam ? new Date(`${semanaParam}T12:00:00.000Z`) : new Date();
        const inicioSemana = inicioDaSemana(referencia);
        const fimSemana = new Date(inicioSemana);
        fimSemana.setUTCDate(inicioSemana.getUTCDate() + 6);
        fimSemana.setUTCHours(23, 59, 59, 999);

        const inscricoes = await prisma.desafioInscricao.findMany({
            where: { desafioId: id, status: 'PAGO', isTeste: false },
            select: {
                id: true,
                nome: true,
                checkins: {
                    where: { data: { gte: inicioSemana, lte: fimSemana } },
                    select: { pontos: true, data: true },
                },
            },
        });

        const ranking = inscricoes
            .map((insc) => ({
                inscricaoId: insc.id,
                nome: insc.nome,
                pontos: insc.checkins.reduce((soma, c) => soma + c.pontos, 0),
                diasAtivos: insc.checkins.length,
            }))
            .sort((a, b) => b.pontos - a.pontos);

        return NextResponse.json({
            ranking,
            inicioSemana: inicioSemana.toISOString(),
            fimSemana: fimSemana.toISOString(),
        });
    } catch (error) {
        console.error('[desafios/id/ranking][GET]', error);
        return NextResponse.json({ error: 'Erro ao calcular ranking' }, { status: 500 });
    }
}
