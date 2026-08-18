// app/api/admin/update-plan/route.ts — v2
// v2: valida que o coach tem acesso ao aluno antes de alterar o plano
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { MASTER_IDS } from '@/lib/masterIds';

const prisma = new PrismaClient();

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