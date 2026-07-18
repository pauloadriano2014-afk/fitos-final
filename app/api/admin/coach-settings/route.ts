// app/api/admin/coach-settings/route.ts
// Salva configurações do coach parceiro: prompt de IA e modo
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0',
    'b7c0c181-41fd-4156-b8fe-963a267759a3',
];

export async function PATCH(req: Request) {
    try {
        const { coachId, aiCheckinPrompt, aiPromptMode } = await req.json();

        if (!coachId) {
            return NextResponse.json({ error: 'coachId obrigatório' }, { status: 400 });
        }

        // Master não precisa dessa rota — mas não bloqueia, só ignora
        const isMaster = MASTER_IDS.includes(coachId);
        if (isMaster) {
            return NextResponse.json({ ok: true, skipped: true });
        }

        // Valida modo
        const mode = aiPromptMode === 'REPLACE' ? 'REPLACE' : 'ADD';

        const updated = await prisma.user.update({
            where: { id: coachId },
            data: {
                aiCheckinPrompt: aiCheckinPrompt?.trim() ?? null,
                aiPromptMode:    mode,
            },
            select: {
                id:              true,
                aiCheckinPrompt: true,
                aiPromptMode:    true,
            },
        });

        return NextResponse.json({ ok: true, coach: updated });

    } catch (error: any) {
        console.error('[coach-settings PATCH]', error.message);
        return NextResponse.json({ error: 'Erro ao salvar configurações.' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const coachId = searchParams.get('coachId');

        if (!coachId) {
            return NextResponse.json({ error: 'coachId obrigatório' }, { status: 400 });
        }

        const coach = await prisma.user.findUnique({
            where: { id: coachId },
            select: {
                id:              true,
                aiCheckinPrompt: true,
                aiPromptMode:    true,
            },
        });

        if (!coach) {
            return NextResponse.json({ error: 'Coach não encontrado' }, { status: 404 });
        }

        return NextResponse.json(coach);

    } catch (error: any) {
        console.error('[coach-settings GET]', error.message);
        return NextResponse.json({ error: 'Erro ao buscar configurações.' }, { status: 500 });
    }
}