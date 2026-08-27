// fitos-api-nova/app/api/admin/desafios/[id]/criar-teste/route.ts
//
// POST /api/admin/desafios/{id}/criar-teste
//
// Cria uma inscrição de TESTE (status PAGO direto, sem passar pela Asaas)
// pra você testar o fluxo de check-in — identificação por telefone, envio
// de fotos, cálculo de pontos — sem afetar o ranking real. Marcada com
// isTeste: true, que a rota de ranking filtra automaticamente.
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

function onlyDigits(v: string): string {
    return (v || '').replace(/\D/g, '');
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = requireMaster(request);
    if ('response' in auth) return auth.response;

    try {
        const { id } = params;
        const body = await request.json();
        const { nome, telefone } = body;

        if (!nome || !telefone) {
            return NextResponse.json({ error: 'Preencha nome e telefone.' }, { status: 400 });
        }

        const desafio = await prisma.desafioConfig.findUnique({ where: { id } });
        if (!desafio) {
            return NextResponse.json({ error: 'Desafio não encontrado.' }, { status: 404 });
        }

        const inscricao = await prisma.desafioInscricao.create({
            data: {
                desafioId: id,
                nome: `[TESTE] ${nome}`,
                dataNascimento: new Date('2000-01-01'),
                email: `teste+${Date.now()}@pauloadrianoteam.com.br`,
                telefone: onlyDigits(telefone),
                cpf: '00000000000',
                status: 'PAGO',
                paymentDate: new Date(),
                isTeste: true,
                isLeadFuturo: false,
            },
        });

        return NextResponse.json({ inscricao }, { status: 201 });
    } catch (error) {
        console.error('[desafios/id/criar-teste][POST]', error);
        return NextResponse.json({ error: 'Erro ao criar inscrição de teste' }, { status: 500 });
    }
}
