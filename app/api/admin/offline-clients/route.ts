// app/api/admin/offline-clients/route.ts — v2
// v2: GET agora filtra por coachId (isolamento multi-tenant)
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, canActAsCoach, isMasterId } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const data = await req.json();

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        if (!isMasterId(auth.user.id) && !canActAsCoach(auth.user, data.coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const newClient = await prisma.offlineClient.upsert({
            where: { id: data.id },
            update: {
                name:           data.name,
                phone:          data.phone,
                plan:           data.plan,
                financeCategory:data.financeCategory,
                contractType:   data.contractType,
                contractValue:  data.contractValue,
                startDate:      data.startDate      ? new Date(data.startDate)      : null,
                paymentDueDate: data.paymentDueDate ? new Date(data.paymentDueDate) : null,
                photoUrl:       data.photoUrl,
                isFinanceActive:data.isFinanceActive,
                assignedCoach:  data.assignedCoach,
                coachId:        data.coachId,
            },
            create: {
                id:             data.id,
                name:           data.name,
                phone:          data.phone,
                plan:           data.plan,
                financeCategory:data.financeCategory,
                contractType:   data.contractType,
                contractValue:  data.contractValue,
                startDate:      data.startDate      ? new Date(data.startDate)      : null,
                paymentDueDate: data.paymentDueDate ? new Date(data.paymentDueDate) : null,
                photoUrl:       data.photoUrl,
                isFinanceActive:data.isFinanceActive,
                assignedCoach:  data.assignedCoach,
                coachId:        data.coachId,
            },
        });

        return NextResponse.json({ success: true, client: newClient });
    } catch (error: any) {
        console.error('Erro ao salvar aluno offline:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const coachId = searchParams.get('coachId');

        // ← v2: sem coachId não retorna nada
        if (!coachId) {
            return NextResponse.json({ error: 'coachId obrigatório.' }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        if (!canActAsCoach(auth.user, coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const isMaster = MASTER_IDS.includes(coachId);

        const where = isMaster
            ? {
                // Master vê os seus e os sem dono
                OR: [
                    { coachId: null },
                    { coachId: { in: MASTER_IDS } },
                ],
              }
            : { coachId }; // Parceiro vê só os dele

        const clients = await prisma.offlineClient.findMany({ where });
        return NextResponse.json(clients);
    } catch (error: any) {
        console.error('Erro ao buscar alunos offline:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { id, coachId } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'ID não fornecido.' }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        // 🔒 valida dono antes de deletar usando o usuário REAL do token — o
        // `coachId` do body não é mais confiável pra essa decisão.
        if (!isMasterId(auth.user.id)) {
            const client = await prisma.offlineClient.findUnique({
                where: { id },
                select: { coachId: true },
            });
            if (client?.coachId !== auth.user.id) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }
        }

        await prisma.offlineClient.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Erro ao excluir aluno offline:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}