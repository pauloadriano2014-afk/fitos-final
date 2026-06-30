// app/api/admin/birthdays/route.ts
// Retorna alunos com aniversário nos próximos N dias (padrão: 7)

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic   = 'force-dynamic';
export const revalidate = 0;

const prisma = new PrismaClient();

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const adminId  = searchParams.get('adminId');
        const days     = parseInt(searchParams.get('days') || '7', 10);

        if (!adminId) {
            return NextResponse.json({ error: 'adminId obrigatório.' }, { status: 400 });
        }

        // Busca todos os alunos ativos do coach com birthDate preenchido
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

                // birthDate pode ser string "DD/MM/YYYY" ou ISO
                let day: number, month: number;

                if (u.birthDate.includes('/')) {
                    const parts = u.birthDate.split('/');
                    day   = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10) - 1; // 0-indexed
                } else {
                    const d = new Date(u.birthDate);
                    day   = d.getUTCDate();
                    month = d.getUTCMonth();
                }

                // Próximo aniversário este ano
                let nextBirthday = new Date(today.getFullYear(), month, day);
                nextBirthday.setHours(0, 0, 0, 0);

                // Se já passou este ano, pega o do próximo ano
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
                    daysUntil: diffDays,        // 0 = hoje, 1 = amanhã, etc.
                    day,
                    month: month + 1,
                };
            })
            .filter(Boolean)
            .sort((a, b) => (a!.daysUntil - b!.daysUntil));

        return NextResponse.json(upcoming);

    } catch (error) {
        console.error('Erro /api/admin/birthdays:', error);
        return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
    }
}