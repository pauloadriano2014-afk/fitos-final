// app/api/admin/resolve-payment-claim/route.ts — v2
// v2: valida que o coach tem acesso ao aluno antes de resolver o claim
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, action, adminId } = body; // ← v2: adminId

        if (!userId || !action) {
            return NextResponse.json({ error: 'userId e action são obrigatórios.' }, { status: 400 });
        }
        if (!['confirm', 'reject'].includes(action)) {
            return NextResponse.json({ error: "action deve ser 'confirm' ou 'reject'." }, { status: 400 });
        }

        // ← v2: validação de acesso
        if (adminId && !MASTER_IDS.includes(adminId)) {
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