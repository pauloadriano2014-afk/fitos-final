// app/api/admin/resolve-payment-claim/route.ts — v2
// v2: valida que o coach tem acesso ao aluno antes de resolver o claim
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth } from '@/lib/auth';


export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, action } = body;

        if (!userId || !action) {
            return NextResponse.json({ error: 'userId e action são obrigatórios.' }, { status: 400 });
        }
        if (!['confirm', 'reject'].includes(action)) {
            return NextResponse.json({ error: "action deve ser 'confirm' ou 'reject'." }, { status: 400 });
        }

        // 🔒 v3: a identidade de quem resolve o claim vem do token verificado,
        // não mais de um `adminId` no body — antes, um `adminId` ausente
        // pulava a checagem inteira, e um `adminId` forjado (de um coach
        // master) driblava a validação de dono do aluno.
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const adminId = auth.user.id;

        if (!MASTER_IDS.includes(adminId)) {
            const target = await prisma.user.findUnique({
                where:  { id: userId },
                select: { coachId: true, nutritionistId: true },
            });
            const isOwner = target?.coachId === adminId || target?.nutritionistId === adminId;
            if (!isOwner) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }
        }

        const user = await prisma.user.findUnique({
            where:  { id: userId },
            select: { id: true, paymentClaimStatus: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
        }
        if (user.paymentClaimStatus !== 'PENDING') {
            return NextResponse.json({ error: 'Não há reivindicação pendente.' }, { status: 409 });
        }

        if (action === 'reject') {
            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data:  { paymentClaimStatus: 'REJECTED', paymentClaimedAt: null },
            });
            return NextResponse.json({ success: true, action: 'reject', user: updatedUser });
        }

        // confirm — limpa o claim
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data:  { paymentClaimStatus: null, paymentClaimedAt: null, paymentClaimCycleDueDate: null },
        });
        return NextResponse.json({ success: true, action: 'confirm', user: updatedUser });

    } catch (error: any) {
        console.error('Erro ao resolver claim:', error);
        return NextResponse.json({ error: 'Erro ao processar resolução.' }, { status: 500 });
    }
}