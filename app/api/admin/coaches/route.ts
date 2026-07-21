// app/api/admin/coaches/route.ts
// GET  → lista todos os coaches com contagem de alunos e dados financeiros
// PATCH → { coachId, action: 'BLOCK'|'UNBLOCK'|'SET_PLAN'|'UPDATE_PROFILE', coachPlan?, contractValue?, coachBillingEnd?, name?, email?, cpf?, phone? ... }
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const coaches = await prisma.user.findMany({
            where: { role: 'COACH' } as any,
            select: {
                id:            true,
                name:          true,
                email:         true,
                phone:         true,
                cpf:           true,
                accountStatus: true,
                inviteCode:    true,
                coachPlan:     true,  // ← PERSONAL | NUTRICIONISTA | ELITE
                createdAt:     true,
                coachRequestInfo: true,
                contractValue: true,
                contractType: true,
                paymentDueDate: true,
                coachBillingPlan: true,
                coachBillingStart: true,
                coachBillingEnd: true,
                isFinanceActive: true,
                startDate: true, // Adicionado por segurança
                _count: {
                    select: { students: true }, 
                },
            } as any,
            orderBy: [
                { accountStatus: 'asc' }, 
                { name: 'asc' },
            ],
        });

        return NextResponse.json(coaches);
    } catch (error: any) {
        console.error('[admin/coaches GET]', error.message);
        return NextResponse.json({ error: 'Erro ao listar coaches.' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const { 
            coachId, action, coachPlan, 
            contractValue, coachBillingEnd, paymentDueDate, contractType, isFinanceActive,
            coachBillingStart, startDate, 
            name, email, cpf, phone // Removido o instagram aqui também
        } = await req.json();

        if (!coachId || !action) {
            return NextResponse.json({ error: 'coachId e action são obrigatórios.' }, { status: 400 });
        }

        const coach = await prisma.user.findUnique({ where: { id: coachId } });
        if (!coach || (coach as any).role !== 'COACH') {
            return NextResponse.json({ error: 'Coach não encontrado.' }, { status: 404 });
        }

        if (action === 'BLOCK') {
            await prisma.user.update({
                where: { id: coachId },
                data:  { accountStatus: 'REJECTED' } as any,
            });
            return NextResponse.json({ ok: true, accountStatus: 'REJECTED' });
        }

        if (action === 'UNBLOCK') {
            await prisma.user.update({
                where: { id: coachId },
                data:  { accountStatus: 'ACTIVE' } as any,
            });
            return NextResponse.json({ ok: true, accountStatus: 'ACTIVE' });
        }

        if (action === 'SET_PLAN') {
            const dataToUpdate: any = {};

            if (coachPlan) {
                const valid = ['PERSONAL', 'NUTRICIONISTA', 'ELITE'];
                if (!valid.includes(coachPlan)) {
                    return NextResponse.json({ error: 'coachPlan inválido.' }, { status: 400 });
                }
                dataToUpdate.coachPlan = coachPlan;
            }

            if (contractValue !== undefined) dataToUpdate.contractValue = contractValue;
            if (coachBillingEnd !== undefined) dataToUpdate.coachBillingEnd = coachBillingEnd;
            if (paymentDueDate !== undefined) dataToUpdate.paymentDueDate = paymentDueDate;
            if (contractType !== undefined) dataToUpdate.contractType = contractType;
            if (isFinanceActive !== undefined) dataToUpdate.isFinanceActive = isFinanceActive;
            if (coachBillingStart !== undefined) dataToUpdate.coachBillingStart = coachBillingStart; 
            if (startDate !== undefined) dataToUpdate.startDate = startDate; 

            await prisma.user.update({
                where: { id: coachId },
                data:  dataToUpdate,
            });
            return NextResponse.json({ ok: true, updated: dataToUpdate });
        }

        // 🚀 NOVA AÇÃO: ATUALIZAR PERFIL DO COACH
        if (action === 'UPDATE_PROFILE') {
            const dataToUpdate: any = {};
            
            if (name !== undefined) dataToUpdate.name = name;
            if (email !== undefined) dataToUpdate.email = email;
            if (cpf !== undefined) dataToUpdate.cpf = cpf;
            if (phone !== undefined) dataToUpdate.phone = phone;
            if (contractValue !== undefined) dataToUpdate.contractValue = contractValue;

            await prisma.user.update({
                where: { id: coachId },
                data: dataToUpdate,
            });
            return NextResponse.json({ ok: true, updated: dataToUpdate });
        }

        return NextResponse.json({ error: 'Action inválida.' }, { status: 400 });

    } catch (error: any) {
        console.error('[admin/coaches PATCH]', error.message);
        return NextResponse.json({ error: 'Erro ao atualizar coach.' }, { status: 500 });
    }
}