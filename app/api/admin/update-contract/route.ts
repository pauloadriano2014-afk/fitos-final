// app/api/admin/update-contract/route.ts — v2
// v2: valida que o coach tem acesso ao aluno antes de atualizar contrato
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MASTER_IDS = [
    '3c82f763-66b4-48da-836e-16817d4f57c0', // Paulo
    'b7c0c181-41fd-4156-b8fe-963a267759a3', // Adri
];

async function checkAccess(userId: string, adminId: string): Promise<boolean> {
    if (MASTER_IDS.includes(adminId)) return true;

    // Aluno offline — valida coachId do OfflineClient
    if (userId.startsWith('offline_')) {
        const client = await prisma.offlineClient.findUnique({
            where:  { id: userId },
            select: { coachId: true },
        });
        return client?.coachId === adminId;
    }

    // Aluno normal — valida coachId ou nutritionistId
    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { coachId: true, nutritionistId: true },
    });
    return user?.coachId === adminId || user?.nutritionistId === adminId;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            userId, adminId, 
            contractType, contractValue, paymentDueDate,
            startDate, financeCategory, isFinanceActive,
        } = body;

        if (!userId) {
            return NextResponse.json({ error: 'ID do aluno é obrigatório.' }, { status: 400 });
        }

        if (adminId) {
            const allowed = await checkAccess(userId, adminId);
            if (!allowed) {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
            }
        }

        const parsedValue = parseFloat(String(contractValue).replace(',', '.')) || 0;
        
        // 🔥 Reforço na validação e conversão de datas para evitar valores nulos
        let parsedPaymentDueDate = null;
        if (paymentDueDate) {
            const dateObj = new Date(paymentDueDate);
            if (!isNaN(dateObj.getTime())) parsedPaymentDueDate = dateObj;
        }

        let parsedStartDate = null;
        if (startDate) {
            const dateObj = new Date(startDate);
            if (!isNaN(dateObj.getTime())) parsedStartDate = dateObj;
        }

        const contractData = {
            contractType:   contractType    || 'Mensal',
            contractValue:  parsedValue,
            paymentDueDate: parsedPaymentDueDate,
            startDate:      parsedStartDate, // Garante que a data inicial vá perfeitamente
            financeCategory:financeCategory || 'Consultoria Online',
            isFinanceActive:isFinanceActive !== undefined ? isFinanceActive : true,
        };

        // Bifurcação offline / online
        if (String(userId).startsWith('offline_')) {
            const updatedOfflineClient = await prisma.offlineClient.update({
                where: { id: userId },
                data:  contractData,
            });
            return NextResponse.json({ success: true, client: updatedOfflineClient });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data:  contractData,
        });
        return NextResponse.json({ success: true, user: updatedUser });

    } catch (error: any) {
        console.error('Erro ao atualizar contrato financeiro:', error);
        return NextResponse.json({ error: error?.message || 'Erro interno.' }, { status: 500 });
    }
}