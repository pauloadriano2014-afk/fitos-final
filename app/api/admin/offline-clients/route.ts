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

        // Upsert: Atualiza se achar o ID, ou cria um novo
        const client = await prisma.offlineClient.upsert({
            where: { id: id }, 
            update: {
                name,
                phone,
                plan,
                financeCategory,
                contractType,
                contractValue: parseFloat(contractValue) || 0,
                startDate: startDate ? new Date(startDate) : null,
                paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
                photoUrl,
                isFinanceActive,
                assignedCoach
            },
            create: {
                id,
                name,
                phone,
                plan,
                financeCategory,
                contractType,
                contractValue: parseFloat(contractValue) || 0,
                startDate: startDate ? new Date(startDate) : null,
                paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
                photoUrl,
                isFinanceActive,
                assignedCoach,
                coachId
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