// fitos-api-nova/app/api/desafios/route.ts
//
// GET /api/desafios?slug=desafio-90-dias
//
// Rota PÚBLICA — usada pela página de inscrição pra buscar nome, descrição
// e valor de um desafio ativo. NUNCA retorna linkGrupoWhats aqui — o link
// só é revelado depois que o pagamento é confirmado (rota de status).
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');

        if (!slug) {
            return NextResponse.json({ error: 'slug é obrigatório' }, { status: 400 });
        }

        const desafio = await prisma.desafioConfig.findFirst({
            where: { slug, ativo: true },
            select: {
                id: true,
                slug: true,
                nome: true,
                descricao: true,
                logoUrl: true,
                beneficios: true,
                valor: true,
                duracaoDias: true,
                mentorNome: true,
                mentorFotoUrl: true,
                mentorTexto: true,
                galleryPhotos: true,
                galleryTexts: true,
                paraQuemE: true,
                importante: true,
                compromissoTexto: true,
                bonusTexto: true,
                // linkGrupoWhats propositalmente omitido
            },
        });

        if (!desafio) {
            return NextResponse.json({ desafio: null }, { status: 404 });
        }

        return NextResponse.json({ desafio });
    } catch (error) {
        console.error('[desafios][GET public]', error);
        return NextResponse.json({ error: 'Erro ao buscar desafio' }, { status: 500 });
    }
}