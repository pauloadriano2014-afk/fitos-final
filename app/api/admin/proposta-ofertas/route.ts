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

// GET /api/admin/proposta-ofertas
export async function GET(request: NextRequest) {
    try {
        // 🔒 Feature master-only (gestão de ofertas de proposta).
        const auth = requireMaster(request);
        if ('response' in auth) return auth.response;

        const ofertas = await prisma.propostaOferta.findMany({
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
        const { slug, nome, cards, criadoPorId } = body;

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

        const existente = await prisma.propostaOferta.findUnique({
            where: { slug: slugFinal },
        });
        if (existente) {
            return NextResponse.json(
                { error: 'Já existe uma oferta com esse slug. Escolha outro nome/slug.' },
                { status: 409 }
            );
        }

        const oferta = await prisma.propostaOferta.create({
            data: {
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