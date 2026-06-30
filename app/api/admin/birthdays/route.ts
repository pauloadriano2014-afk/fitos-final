// app/api/admin/birthdays/route.ts
// Retorna alunos com aniversário nos próximos N dias (padrão: 7)

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic   = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

// Faz parse resiliente de birthDate em vários formatos possíveis:
// "DD/MM/YYYY", "DD/MM", "YYYY-MM-DD" (ISO), ou data ISO completa
function parseBirthDate(raw: string): { day: number; month: number } | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Formato "DD/MM/YYYY" ou "DD/MM"
    if (trimmed.includes('/')) {
        const parts = trimmed.split('/').map(p => p.trim());
        if (parts.length >= 2) {
            const day   = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // 0-indexed
            if (!isNaN(day) && !isNaN(month) && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
                return { day, month };
            }
        }
        return null;
    }

    // Formato ISO "YYYY-MM-DD" ou data completa
    if (trimmed.includes('-') || trimmed.includes('T')) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
            return { day: d.getUTCDate(), month: d.getUTCMonth() };
        }
        return null;
    }

    // Formato "DDMMYYYY" ou "DDMM" sem separadores (ex: "27051987")
    if (/^\d{8}$/.test(trimmed)) {
        const day   = parseInt(trimmed.slice(0, 2), 10);
        const month = parseInt(trimmed.slice(2, 4), 10) - 1;
        if (!isNaN(day) && !isNaN(month) && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            return { day, month };
        }
        return null;
    }
    if (/^\d{4}$/.test(trimmed)) {
        const day   = parseInt(trimmed.slice(0, 2), 10);
        const month = parseInt(trimmed.slice(2, 4), 10) - 1;
        if (!isNaN(day) && !isNaN(month) && day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            return { day, month };
        }
        return null;
    }

    // Tenta como timestamp numérico bruto (alguns bancos salvam assim)
    const asDate = new Date(trimmed);
    if (!isNaN(asDate.getTime())) {
        return { day: asDate.getUTCDate(), month: asDate.getUTCMonth() };
    }

    return null;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const adminId = searchParams.get('adminId');
        const days    = parseInt(searchParams.get('days') || '7', 10);

        if (!adminId) {
            return NextResponse.json({ error: 'adminId obrigatório.' }, { status: 400 });
        }

        const users = await prisma.user.findMany({
            where: {
                coachId:   adminId,
                active:    true,
                birthDate: { not: null },
            },
            select: {
                id:        true,
                name:      true,
                birthDate: true,
                photoUrl:  true,
                phone:     true,
                plan:      true,
            },
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcoming = users
            .map(u => {
                if (!u.birthDate) return null;

                const parsed = parseBirthDate(u.birthDate);
                if (!parsed) return null; // Ignora silenciosamente registros com data inválida/vazia

                const { day, month } = parsed;

                let nextBirthday = new Date(today.getFullYear(), month, day);
                nextBirthday.setHours(0, 0, 0, 0);

                if (nextBirthday < today) {
                    nextBirthday = new Date(today.getFullYear() + 1, month, day);
                }

                const diffMs   = nextBirthday.getTime() - today.getTime();
                const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

                if (diffDays > days) return null;

                return {
                    id:        u.id,
                    name:      u.name,
                    photoUrl:  u.photoUrl,
                    phone:     u.phone,
                    plan:      u.plan,
                    birthDate: u.birthDate,
                    daysUntil: diffDays,
                    day,
                    month: month + 1,
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => a.daysUntil - b.daysUntil);

        return NextResponse.json(upcoming);

    } catch (error) {
        console.error('Erro /api/admin/birthdays:', error);
        return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }
}