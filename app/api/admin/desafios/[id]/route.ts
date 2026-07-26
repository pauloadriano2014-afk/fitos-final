// fitos-api-nova/app/api/admin/desafios/[id]/route.ts
//
// PATCH  → atualiza nome, descrição, valor, link do grupo e/ou status ativo
// DELETE → remove um desafio (e suas inscrições, via onDelete: Cascade)
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH /api/admin/desafios/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;
        const body = await request.json();
        const {
            nome, descricao, beneficios, valor, linkGrupoWhats, ativo, coachId,
            mentorNome, mentorFotoUrl, mentorTexto, galleryPhotos, galleryTexts,
        } = body;

        const dataToUpdate: Record<string, any> = {};
        if (nome !== undefined) dataToUpdate.nome = nome;
        if (descricao !== undefined) dataToUpdate.descricao = descricao;
        if (beneficios !== undefined) dataToUpdate.beneficios = Array.isArray(beneficios) ? beneficios.filter((b: string) => b && b.trim()) : [];
        if (valor !== undefined) dataToUpdate.valor = parseFloat(valor);
        if (linkGrupoWhats !== undefined) dataToUpdate.linkGrupoWhats = linkGrupoWhats;
        if (ativo !== undefined) dataToUpdate.ativo = ativo;
        // 🔑 coachId agora é editável também depois de criado — define de
        // qual PaymentGatewayAccount (Paulo ou Adri) o PIX é gerado daqui pra frente.
        if (coachId !== undefined) dataToUpdate.coachId = coachId;
        if (mentorNome !== undefined) dataToUpdate.mentorNome = mentorNome || null;
        if (mentorFotoUrl !== undefined) dataToUpdate.mentorFotoUrl = mentorFotoUrl || null;
        if (mentorTexto !== undefined) dataToUpdate.mentorTexto = mentorTexto || null;
        if (galleryPhotos !== undefined) dataToUpdate.galleryPhotos = Array.isArray(galleryPhotos) ? galleryPhotos : [];
        if (galleryTexts !== undefined) dataToUpdate.galleryTexts = Array.isArray(galleryTexts) ? galleryTexts : [];

        const desafio = await prisma.desafioConfig.update({
            where: { id },
            data: dataToUpdate,
        });

        return NextResponse.json({ desafio });
    } catch (error) {
        console.error('[desafios/id][PATCH]', error);
        return NextResponse.json({ error: 'Erro ao atualizar desafio' }, { status: 500 });
    }
}

// DELETE /api/admin/desafios/[id]
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;
        await prisma.desafioConfig.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[desafios/id][DELETE]', error);
        return NextResponse.json({ error: 'Erro ao deletar desafio' }, { status: 500 });
    }
}