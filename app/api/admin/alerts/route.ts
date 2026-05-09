// app/api/admin/alerts/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: "UserId is required" }, { status: 400 });
        }

        // Busca apenas os alertas ativos (que você ainda não marcou como lido)
        const alerts = await prisma.studentAlert.findMany({
            where: {
                userId: userId,
                isRead: false,
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