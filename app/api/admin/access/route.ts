// app/api/admin/access/route.ts — v2
// v2: POST valida que o coach tem acesso ao aluno antes de alterar permissões VIP
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { MASTER_IDS } from '@/lib/masterIds';
import { requireAuth, canAccessStudent, isMasterId } from '@/lib/auth';


// GET: Busca quais conteúdos VIP este aluno tem acesso
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        if (!userId) return NextResponse.json({ error: 'UserId necessário.' }, { status: 400 });

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;
        const target = await prisma.user.findUnique({ where: { id: userId }, select: { coachId: true, nutritionistId: true } });
        if (!canAccessStudent(auth.user, userId, target?.coachId) && auth.user.id !== target?.nutritionistId) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const accesses = await prisma.contentAccess.findMany({
            where:  { userId },
            select: { contentId: true },
        });
        return NextResponse.json(accesses.map(a => a.contentId));
    } catch (error) {
        console.error('Erro GET Access:', error);
        return NextResponse.json({ error: 'Erro ao buscar acessos.' }, { status: 500 });
    }
}

// POST: Liga ou desliga acesso VIP — validação de ownership pelo usuário REAL do token
export async function POST(req: Request) {
    try {
        const { userId, contentId, grant } = await req.json();

        if (!userId || !contentId) {
            return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
        }

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        // 🔒 a decisão usa auth.user (do token), não o `adminId` do body — que era forjável.
        if (!isMasterId(auth.user.id)) {
            const target = await prisma.user.findUnique({
                where:  { id: userId },
                select: { coachId: true, nutritionistId: true },
            });
            const isOwner = target?.coachId === auth.user.id || target?.nutritionistId === auth.user.id;
            if (!isOwner) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }
        }

        if (grant) {
            await prisma.contentAccess.upsert({
                where:  { userId_contentId: { userId, contentId } },
                update: {},
                create: { userId, contentId },
            });
        } else {
            await prisma.contentAccess.deleteMany({ where: { userId, contentId } });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Erro POST Access:', error);
        return NextResponse.json({ error: 'Erro ao atualizar permissão.' }, { status: 500 });
    }
}