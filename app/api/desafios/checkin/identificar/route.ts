// fitos-api-nova/app/api/desafios/checkin/identificar/route.ts
//
// POST /api/desafios/checkin/identificar
// Body: { desafioId, telefone }
//
// Rota PÚBLICA — usada uma única vez por dispositivo (o app depois guarda
// o inscricaoId localmente). Confirma que a pessoa tem uma inscrição PAGA
// nesse desafio antes de liberar o check-in — evita que qualquer um
// preencha check-in sem ter participado de verdade.
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { desafioId, telefone } = body;

        if (!desafioId || !telefone) {
            return NextResponse.json({ error: 'Informe o desafio e o telefone.' }, { status: 400 });
        }

        const telefoneDigits = telefone.replace(/\D/g, '');

        const inscricao = await prisma.desafioInscricao.findFirst({
            where: {
                desafioId,
                telefone: telefoneDigits,
                status: 'PAGO',
            },
            select: { id: true, nome: true },
        });

        if (!inscricao) {
            return NextResponse.json(
                { error: 'Não encontramos uma inscrição paga com esse telefone para este desafio. Confira o número ou fale com o suporte.' },
                { status: 404 }
            );
        }

        return NextResponse.json({ inscricaoId: inscricao.id, nome: inscricao.nome });
    } catch (error) {
        console.error('[desafios/checkin/identificar][POST]', error);
        return NextResponse.json({ error: 'Erro ao identificar participante.' }, { status: 500 });
    }
}
