// fitos-api-nova/app/api/admin/proposta-ofertas/route.ts
//
// GET  → lista todas as ofertas (usado pela tela de admin e pelo AdminInviteModal)
// POST → cria uma nova oferta
//
// ⚠️ AJUSTE O IMPORT ABAIXO para o caminho real do seu singleton Prisma
// (ex: '@/lib/prisma', '@/app/lib/prisma', '../../../../lib/prisma' etc.)

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

// GET /api/admin/proposta-ofertas?pagina=start
//
// 🔥 `pagina` é opcional só por compatibilidade (chamadas antigas sem o
// parâmetro, ex: AdminInviteModal) — quando omitido, cai no padrão
// "proposta" pra não quebrar quem ainda não manda esse filtro.
export async function GET(request: NextRequest) {
    try {
        // 🔒 Feature master-only (gestão de ofertas de proposta).
        const auth = requireMaster(request);
        if ('response' in auth) return auth.response;

        const { searchParams } = new URL(request.url);
        const pagina = searchParams.get('pagina') || 'proposta';

        const ofertas = await prisma.propostaOferta.findMany({
            where: { pagina },
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ ofertas });
    } catch (error) {
        console.error('[proposta-ofertas][GET]', error);
        return NextResponse.json({ error: 'Erro ao buscar ofertas' }, { status: 500 });
    }
}

// POST /api/admin/proposta-ofertas
export async function POST(request: NextRequest) {
    try {
        // 🔒 Feature master-only (gestão de ofertas de proposta).
        const auth = requireMaster(request);
        if ('response' in auth) return auth.response;

        const body = await request.json();
        const { slug, nome, cards, criadoPorId, pagina } = body;
        const paginaFinal = pagina || 'proposta';

        if (!nome || !Array.isArray(cards) || cards.length === 0) {
            return NextResponse.json(
                { error: 'Campos obrigatórios: nome e ao menos 1 card' },
                { status: 400 }
            );
        }

        const slugFinal = slugify(slug || nome);
        if (!slugFinal) {
            return NextResponse.json({ error: 'Slug inválido' }, { status: 400 });
        }

        // Unicidade é por (pagina, slug) — a mesma "padrao" pode existir em
        // telas diferentes sem conflitar.
        const existente = await prisma.propostaOferta.findUnique({
            where: { pagina_slug: { pagina: paginaFinal, slug: slugFinal } },
        });
        if (existente) {
            return NextResponse.json(
                { error: 'Já existe uma oferta com esse slug nessa tela. Escolha outro nome/slug.' },
                { status: 409 }
            );
        }

        const oferta = await prisma.propostaOferta.create({
            data: {
                pagina: paginaFinal,
                slug: slugFinal,
                nome,
                cards,
                criadoPorId: criadoPorId || null,
                ativa: true,
            },
        });

        return NextResponse.json({ oferta }, { status: 201 });
    } catch (error) {
        console.error('[proposta-ofertas][POST]', error);
        return NextResponse.json({ error: 'Erro ao criar oferta' }, { status: 500 });
    }
}