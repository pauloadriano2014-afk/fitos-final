// app/api/admin/offline-clients/route.ts
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

        // Upsert: Atualiza se achar o ID, ou cria um novo se não achar
        const client = await prisma.offlineClient.upsert({
            where: { id: id || '' }, 
            update: {
                name, phone, plan, financeCategory, contractType,
                contractValue: parseFloat(contractValue) || 0,
                startDate: startDate ? new Date(startDate) : null,
                paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
                photoUrl, isFinanceActive, assignedCoach
            },
            create: {
                id, // Usa o ID gerado pelo aplicativo (offline_xxxx)
                name, phone, plan, financeCategory, contractType,
                contractValue: parseFloat(contractValue) || 0,
                startDate: startDate ? new Date(startDate) : null,
                paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
                photoUrl, isFinanceActive, coachId, assignedCoach
            }
        });

        return NextResponse.json({ success: true, client });
    } catch (error: any) {
        console.error("Erro ao salvar OfflineClient:", error);
        return NextResponse.json({ error: "Erro interno ao salvar aluno offline", details: error.message }, { status: 500 });
    }
}