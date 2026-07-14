// app/api/admin/surveys/route.ts
// 🔒 AGORA COM ISOLAMENTO: coach só vê pesquisas dos alunos dele

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const adminId = searchParams.get('adminId');

        // 🔒 Define o filtro pelo papel do solicitante
        // - ADMIN (Paulo/Adri): tudo (comportamento original)
        // - COACH: só pesquisas de alunos amarrados a ele
        // - adminId ausente (frontend antigo em cache): mantém comportamento original
        let where: any = undefined;

        if (adminId) {
            const requester = await prisma.user.findUnique({
                where: { id: adminId },
                select: { id: true, role: true, accountStatus: true },
            });

            if (!requester || !['ADMIN', 'COACH'].includes(requester.role)) {
                return NextResponse.json({ error: 'Acesso não autorizado' }, { status: 403 });
            }

            if (requester.role === 'COACH') {
                if (requester.accountStatus !== 'ACTIVE') {
                    return NextResponse.json({ error: 'Conta aguardando aprovação' }, { status: 403 });
                }
                where = {
                    user: {
                        OR: [
                            { coachId: adminId },
                            { nutritionistId: adminId },
                        ],
                    },
                };
            }
        }

        const surveys = await prisma.satisfactionSurvey.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { name: true, plan: true, phone: true }
                }
            }
        });
        
        return NextResponse.json(surveys, { status: 200 });
    } catch (error) {
        console.error("Erro ao buscar pesquisas:", error);
        return NextResponse.json({ error: 'Erro ao carregar os dados.' }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id } = body;
        
        if (!id) {
            return NextResponse.json({ error: 'ID da pesquisa não informado.' }, { status: 400 });
        }

        await prisma.satisfactionSurvey.update({
            where: { id },
            data: { readByAdmin: true }
        });
        
        return NextResponse.json({ message: 'Pesquisa marcada como lida.' }, { status: 200 });
    } catch (error) {
        console.error("Erro ao atualizar status da pesquisa:", error);
        return NextResponse.json({ error: 'Erro ao atualizar status.' }, { status: 500 });
    }
}