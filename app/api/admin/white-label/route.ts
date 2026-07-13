// app/api/admin/white-label/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { coachId, brandColor, brandLogoUrl } = body;

        if (!coachId) {
            return NextResponse.json({ error: 'ID do Coach é obrigatório' }, { status: 400 });
        }

        const updatedCoach = await prisma.user.update({
            where: { id: coachId },
            data: {
                brandColor: brandColor || 'verde',
                brandLogoUrl: brandLogoUrl || null
            }
        });

        // Omitimos a senha por segurança
        const { password, ...safeData } = updatedCoach;

        return NextResponse.json({ success: true, user: safeData });
    } catch (error: any) {
        console.error("Erro ao atualizar White-Label:", error);
        return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
    }
}