// app/api/admin/surveys/route.ts
// 🔒 AGORA COM ISOLAMENTO: coach só vê pesquisas dos alunos dele

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isMasterId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        // 🔒 O `adminId` da query era só decorativo — qualquer cliente podia
        // omiti-lo (ou trocar) pra ver pesquisas de TODOS os coaches. Agora
        // quem decide o filtro é o token de autenticação de verdade.
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        let where: any = undefined;

        if (!isMasterId(auth.user.id)) {
            where = {
                user: {
                    OR: [
                        { coachId: auth.user.id },
                        { nutritionistId: auth.user.id },
                    ],
                },
            };
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
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        const body = await req.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID da pesquisa não informado.' }, { status: 400 });
        }

        if (!isMasterId(auth.user.id)) {
            const survey = await prisma.satisfactionSurvey.findUnique({
                where: { id },
                include: { user: { select: { coachId: true, nutritionistId: true } } },
            });
            const owns = survey?.user?.coachId === auth.user.id || survey?.user?.nutritionistId === auth.user.id;
            if (!survey || !owns) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }
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