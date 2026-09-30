// app/api/admin/alerts/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canAccessStudent } from '@/lib/auth';
import { COACH_REPLY_TYPE } from '@/lib/coachReplies';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: "UserId is required" }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const targetForAuth = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true } });
        if (!canAccessStudent(auth.user, userId, targetForAuth?.coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        // Busca apenas os alertas ativos (que você ainda não marcou como lido)
        const alerts = await prisma.studentAlert.findMany({
            where: {
                userId: userId,
                isRead: false,
                // 💬 as respostas do coach (COACH_REPLY) são do ALUNO (sininho dele), nunca entram no painel de observações do coach
                type: { not: COACH_REPLY_TYPE },
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json(alerts);
    } catch (error: any) {
        console.error("Erro ao buscar alertas da IA:", error);
        return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
    }
}