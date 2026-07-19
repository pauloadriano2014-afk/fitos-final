// app/api/admin/update-plan/route.ts — v2
// v2: valida que o coach tem acesso ao aluno antes de alterar o plano
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

export async function POST(req: Request) {
    try {
        const { userId, plan, adminId } = await req.json();

        if (!userId || !plan) {
            return NextResponse.json({ error: 'userId e plan são obrigatórios.' }, { status: 400 });
        }

        // Validação de acesso
        if (adminId) {
            const isMaster = MASTER_IDS.includes(adminId);
            if (!isMaster) {
                const target = await prisma.user.findUnique({
                    where:  { id: userId },
                    select: { coachId: true, nutritionistId: true },
                });
                const isOwner = target?.coachId === adminId || target?.nutritionistId === adminId;
                if (!isOwner) {
                    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
                }
            }
        }

        await prisma.user.update({ where: { id: userId }, data: { plan } });
        return NextResponse.json({ success: true });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}