import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { coachId, name, value, durationInMonths } = body;
        
        if (!coachId || !name || value === undefined) {
            return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
        }

        const newPlan = await prisma.coachPlan.create({
            data: {
                coachId,
                name,
                value: parseFloat(value),
                durationInMonths: parseInt(durationInMonths) || 1
            }
        });

        return NextResponse.json({ success: true, plan: newPlan });
    } catch (error) {
        console.error("Erro ao criar plano:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}