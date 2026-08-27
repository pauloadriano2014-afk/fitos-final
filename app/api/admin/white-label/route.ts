// app/api/admin/white-label/route.ts
import { NextResponse } from 'next/server';
// 🔥 Puxa o prisma da sua lib central para não estourar a memória do banco!
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // 🔥 AGORA O BACKEND RECEBE O TAMANHO (brandLogoSize)
        const { coachId, brandColor, brandLogoUrl, brandLogoSize } = body;

        if (!coachId) {
            return NextResponse.json({ error: 'ID do Coach é obrigatório' }, { status: 400 });
        }

        // 🔒 Um coach só pode alterar a PRÓPRIA marca (ou master, qualquer uma).
        const auth = requireAuth(request);
        if ('response' in auth) return auth.response;
        if (!canActAsCoach(auth.user, coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const updatedCoach = await prisma.user.update({
            where: { id: coachId },
            data: {
                brandColor: brandColor || 'verde',
                brandLogoUrl: brandLogoUrl || null,
                brandLogoSize: brandLogoSize || 220 // 🔥 SALVA O TAMANHO NO BANCO
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