// app/api/admin/update-plan/route.ts — v2
// v2: valida que o coach tem acesso ao aluno antes de alterar o plano
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth } from '@/lib/auth';


export async function POST(req: Request) {
    try {
        const { userId, plan } = await req.json();

        if (!userId || !plan) {
            return NextResponse.json({ error: 'userId e plan são obrigatórios.' }, { status: 400 });
        }

        // 🔒 v3: identidade vem do token verificado, não mais de um `adminId`
        // no body — antes, omitir `adminId` pulava a checagem inteira e
        // qualquer coach podia trocar o plano de aluno alheio.
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const adminId = auth.user.id;
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

        await prisma.user.update({ where: { id: userId }, data: { plan } });
        return NextResponse.json({ success: true });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}