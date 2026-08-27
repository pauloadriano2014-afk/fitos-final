import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, canActAsCoach } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        // 🔥 INCLUA paymentUrl AQUI:
        const { coachId, planId, name, value, durationInMonths, discountPerc, paymentUrl } = body;

        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        const parsedValue = parseFloat(value);
        const parsedMonths = parseInt(durationInMonths) || 1;
        const parsedDiscount = parseInt(discountPerc) || 0;

        if (planId) {
            // 🔒 Editar um plano existente — precisa ser dono do plano (ou master).
            // Antes não checava NADA: qualquer um editando um planId de outro
            // coach conseguia mudar valor/desconto/link de pagamento dele.
            const existingPlan = await prisma.coachPlan.findUnique({ where: { id: planId } });
            if (!existingPlan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
            if (!canActAsCoach(auth.user, (existingPlan as any).coachId)) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }

            const updatedPlan = await prisma.coachPlan.update({
                where: { id: planId },
                data: { name, value: parsedValue, durationInMonths: parsedMonths, discountPerc: parsedDiscount, paymentUrl }
            });
            return NextResponse.json({ success: true, plan: updatedPlan });
        } else {
            if (!coachId || !name || value === undefined) return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
            if (!canActAsCoach(auth.user, coachId)) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }

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

        // 🔒 Só o dono do plano (ou master) pode apagar — antes qualquer um
        // que soubesse o planId apagava o plano de qualquer coach.
        const auth = requireAuth(req);
        if ('response' in auth) return auth.response;

        const existingPlan = await prisma.coachPlan.findUnique({ where: { id: planId } });
        if (!existingPlan) return NextResponse.json({ success: true }); // já não existe
        if (!canActAsCoach(auth.user, (existingPlan as any).coachId)) {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        await prisma.coachPlan.delete({
            where: { id: planId }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Erro ao deletar plano:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}