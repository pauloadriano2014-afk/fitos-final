import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Confirme se o caminho do seu prisma é esse

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

        return NextResponse.json({ config, plans });
    } catch (error) {
        console.error("Erro ao buscar SaaS meta:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}