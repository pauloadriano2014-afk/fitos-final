// fitos-api-nova/app/api/admin/proposta-ofertas/[id]/route.ts
//
// PATCH  → atualiza nome, cards e/ou status ativa de uma oferta
// DELETE → remove uma oferta
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

// PATCH /api/admin/proposta-ofertas/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 🔒 Feature master-only (gestão de ofertas de proposta).
        const auth = requireMaster(request);
        if ('response' in auth) return auth.response;

        const { id } = params;
        const body = await request.json();
        const { nome, cards, ativa } = body;

        const dataToUpdate: Record<string, any> = {};
        if (nome !== undefined) dataToUpdate.nome = nome;
        if (cards !== undefined) dataToUpdate.cards = cards;
        if (ativa !== undefined) dataToUpdate.ativa = ativa;

        const oferta = await prisma.propostaOferta.update({
            where: { id },
            data: dataToUpdate,
        });

        return NextResponse.json({ oferta });
    } catch (error) {
        console.error('[proposta-ofertas/id][PATCH]', error);
        return NextResponse.json({ error: 'Erro ao atualizar oferta' }, { status: 500 });
    }
}

// DELETE /api/admin/proposta-ofertas/[id]
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 🔒 Feature master-only (gestão de ofertas de proposta).
        const auth = requireMaster(request);
        if ('response' in auth) return auth.response;

        const { id } = params;
        await prisma.propostaOferta.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[proposta-ofertas/id][DELETE]', error);
        return NextResponse.json({ error: 'Erro ao deletar oferta' }, { status: 500 });
    }
}