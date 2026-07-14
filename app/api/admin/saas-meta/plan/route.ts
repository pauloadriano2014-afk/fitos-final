import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        // 🔥 INCLUA paymentUrl AQUI:
        const { coachId, planId, name, value, durationInMonths, discountPerc, paymentUrl } = body;
        
        if (!coachId || !name || value === undefined) return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });

        const parsedValue = parseFloat(value);
        const parsedMonths = parseInt(durationInMonths) || 1;
        const parsedDiscount = parseInt(discountPerc) || 0;

        if (planId) {
            const updatedPlan = await prisma.coachPlan.update({
                where: { id: planId },
                data: { name, value: parsedValue, durationInMonths: parsedMonths, discountPerc: parsedDiscount, paymentUrl }
            });
            return NextResponse.json({ success: true, plan: updatedPlan });
        } else {
            const newPlan = await prisma.coachPlan.create({
                data: { coachId, name, value: parsedValue, durationInMonths: parsedMonths, discountPerc: parsedDiscount, paymentUrl }
            });
            return NextResponse.json({ success: true, plan: newPlan });
        }
    } catch (error) { return NextResponse.json({ error: "Erro interno" }, { status: 500 }); }
}
// Mantenha o seu DELETE() intacto embaixo...

// DELETA O PLANO
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const planId = searchParams.get('planId');
        
        if (!planId) return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });

        await prisma.coachPlan.delete({
            where: { id: planId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Erro ao deletar plano:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}