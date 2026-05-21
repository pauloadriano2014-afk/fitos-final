import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            id, name, phone, plan, financeCategory, 
            contractType, contractValue, startDate, 
            paymentDueDate, photoUrl, isFinanceActive, 
            coachId, assignedCoach 
        } = body;

        if (!id) {
            return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
        }

        const safeStartDate = startDate ? new Date(startDate) : null;
        const safePaymentDueDate = paymentDueDate ? new Date(paymentDueDate) : null;

        // Upsert: Atualiza se achar o ID, ou cria um novo
        const client = await prisma.offlineClient.upsert({
            where: { id: id }, 
            update: {
                name, phone, plan, financeCategory, contractType,
                contractValue: parseFloat(contractValue) || 0,
                startDate: safeStartDate,
                paymentDueDate: safePaymentDueDate,
                photoUrl, isFinanceActive, assignedCoach
            },
            create: {
                id, name, phone, plan, financeCategory, contractType,
                contractValue: parseFloat(contractValue) || 0,
                startDate: safeStartDate,
                paymentDueDate: safePaymentDueDate,
                photoUrl, isFinanceActive, assignedCoach, coachId
            }
        });

        return NextResponse.json({ success: true, client });
    } catch (error: any) {
        console.error("Erro ao salvar OfflineClient:", error);
        return NextResponse.json({ 
            error: "Erro interno ao salvar aluno offline", 
            details: error.message 
        }, { status: 500 });
    }
}