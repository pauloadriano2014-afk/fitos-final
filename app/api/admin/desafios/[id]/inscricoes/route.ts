// fitos-api-nova/app/api/admin/desafios/[id]/inscricoes/route.ts
//
// GET → lista todas as inscrições de um desafio específico (lista de leads
// separada do CRM/Alunos principal, conforme decidido)
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
            where: { desafioId: id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                nome: true,
                email: true,
                telefone: true,
                dataNascimento: true,
                status: true,
                paymentDate: true,
                isLeadFuturo: true,
                isTeste: true,
                createdAt: true,
                // cpf, asaasCustomerId, asaasPaymentId, pixQrCode, pixCopyPaste
                // não são retornados aqui — não precisam aparecer na listagem
            },
        });
        return NextResponse.json({ inscricoes });
    } catch (error) {
        console.error('[desafios/id/inscricoes][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar inscrições' }, { status: 500 });
    }
}
