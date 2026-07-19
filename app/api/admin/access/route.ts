// app/api/admin/access/route.ts — v2
// v2: POST valida que o coach tem acesso ao aluno antes de alterar permissões VIP
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

// GET: Busca quais conteúdos VIP este aluno tem acesso (sem mudança)
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        if (!userId) return NextResponse.json({ error: 'UserId necessário.' }, { status: 400 });

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

// POST: Liga ou desliga acesso VIP — v2: valida ownership
export async function POST(req: Request) {
    try {
        const { userId, contentId, grant, adminId } = await req.json(); // ← v2: adminId

        if (!userId || !contentId) {
            return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
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