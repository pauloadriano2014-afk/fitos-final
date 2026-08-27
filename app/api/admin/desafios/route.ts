// fitos-api-nova/app/api/admin/desafios/route.ts
//
// GET  → lista todos os desafios (usado pela tela de admin)
// POST → cria um novo desafio
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

// GET /api/admin/desafios
export async function GET(request: NextRequest) {
    const auth = requireMaster(request);
    if ('response' in auth) return auth.response;

    try {
        const desafios = await prisma.desafioConfig.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: { select: { inscricoes: true } },
            },
        });
        return NextResponse.json({ desafios });
    } catch (error) {
        console.error('[desafios][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar desafios' }, { status: 500 });
    }
}

// POST /api/admin/desafios
export async function POST(request: NextRequest) {
    const auth = requireMaster(request);
    if ('response' in auth) return auth.response;

    try {
        const body = await request.json();
        const {
            slug, nome, descricao, logoUrl, beneficios, valor, duracaoDias, dataInicio, linkGrupoWhats, coachId,
            mentorNome, mentorFotoUrl, mentorTexto, galleryPhotos, galleryTexts,
            paraQuemE, importante, compromissoTexto, bonusTexto,
            pontosPorItem, pontosPorItemFimDeSemana,
        } = body;

        if (!nome || !valor || !linkGrupoWhats || !coachId) {
            return NextResponse.json(
                { error: 'Campos obrigatórios: nome, valor, linkGrupoWhats e coachId' },
                { status: 400 }
            );
        }

        const slugFinal = slugify(slug || nome);
        if (!slugFinal) {
            return NextResponse.json({ error: 'Slug inválido' }, { status: 400 });
        }

        const existente = await prisma.desafioConfig.findUnique({ where: { slug: slugFinal } });
        if (existente) {
            return NextResponse.json(
                { error: 'Já existe um desafio com esse slug. Escolha outro nome/slug.' },
                { status: 409 }
            );
        }

        const desafio = await prisma.desafioConfig.create({
            data: {
                slug: slugFinal,
                nome,
                descricao: descricao || null,
                logoUrl: logoUrl || null,
                beneficios: Array.isArray(beneficios) ? beneficios.filter(b => b && b.trim()) : [],
                valor: parseFloat(valor),
                duracaoDias: duracaoDias ? parseInt(duracaoDias) : 90,
                dataInicio: dataInicio ? new Date(dataInicio) : null,
                pontosPorItem: pontosPorItem ? parseFloat(pontosPorItem) : 1,
                pontosPorItemFimDeSemana: pontosPorItemFimDeSemana ? parseFloat(pontosPorItemFimDeSemana) : 1,
                linkGrupoWhats,
                mentorNome: mentorNome || null,
                mentorFotoUrl: mentorFotoUrl || null,
                mentorTexto: mentorTexto || null,
                galleryPhotos: Array.isArray(galleryPhotos) ? galleryPhotos : [],
                galleryTexts: Array.isArray(galleryTexts) ? galleryTexts : [],
                paraQuemE: Array.isArray(paraQuemE) ? paraQuemE.filter((p: string) => p && p.trim()) : [],
                importante: importante || null,
                compromissoTexto: compromissoTexto || null,
                bonusTexto: bonusTexto || null,
                coachId,
                ativo: true,
            },
        });

        return NextResponse.json({ desafio }, { status: 201 });
    } catch (error) {
        console.error('[desafios][POST]', error);
        return NextResponse.json({ error: 'Erro ao criar desafio' }, { status: 500 });
    }
}
