import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; 

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const coachId = searchParams.get('coachId');
        
        if (!coachId) return NextResponse.json({ error: "coachId obrigatório" }, { status: 400 });

        const config = await prisma.salesPageConfig.findUnique({ where: { coachId } });
        const plans = await prisma.coachPlan.findMany({ 
            where: { coachId, isActive: true },
            orderBy: { value: 'asc' }
        });
        
        // 🔥 BUSCA A LOGO DO COACH NA TABELA USER
        const coachUser = await prisma.user.findUnique({ 
            where: { id: coachId }, 
            select: { brandLogoUrl: true } 
        });

        return NextResponse.json({ 
            config, 
            plans, 
            brandLogoUrl: coachUser?.brandLogoUrl // Envia a logo pro front!
        });
    } catch (error) {
        console.error("Erro ao buscar SaaS meta:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}