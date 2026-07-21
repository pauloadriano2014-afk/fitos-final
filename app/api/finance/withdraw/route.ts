// app/api/finance/withdraw/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';

// Função auxiliar para buscar o ID do coach logado
async function getUserIdFromSession(req: NextRequest) {
    // ⚠️ TODO: Substituir pela sua função real de pegar o ID do token JWT do App
    const coachIdHeader = req.headers.get('x-user-id'); 
    return coachIdHeader || null;
}

export async function GET(req: NextRequest) {
    try {
        const coachId = await getUserIdFromSession(req);
        if (!coachId) {
            return NextResponse.json({ balance: 0, pendingBalance: 0 });
        }

        // 🔥 CORREÇÃO: "as any" adicionado ao objeto inteiro da busca para silenciar o erro
        const coach = await prisma.user.findUnique({
            where: { id: coachId },
            select: { coachAsaasApiKey: true }
        } as any);

        if (!coach || !coach.coachAsaasApiKey) {
            return NextResponse.json({ balance: 0, pendingBalance: 0 }); 
        }

        const apiKey = String(coach.coachAsaasApiKey);

        const balanceRes = await fetch(`${ASAAS_BASE_URL}/finance/balance`, {
            headers: { 'access_token': apiKey }
        });
        const balanceData = await balanceRes.json();

        const statsRes = await fetch(`${ASAAS_BASE_URL}/payments/statistics?status=CONFIRMED`, {
            headers: { 'access_token': apiKey }
        });
        const statsData = await statsRes.json();

        return NextResponse.json({ 
            balance: balanceData.balance || 0, 
            pendingBalance: statsData.value || 0 
        });

    } catch (error: any) {
        console.error('[FinanceWithdraw] Erro ao checar saldo:', error.message);
        return NextResponse.json({ error: 'Erro interno ao verificar saldos.' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { pixKey, value } = await req.json();
        const coachId = await getUserIdFromSession(req);

        if (!coachId) return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
        if (!pixKey || !value || value < 5) return NextResponse.json({ error: 'Dados de saque inválidos.' }, { status: 400 });

        // 🔥 CORREÇÃO: "as any" adicionado aqui também
        const coach = await prisma.user.findUnique({
            where: { id: coachId },
            select: { coachAsaasApiKey: true }
        } as any);

        if (!coach || !coach.coachAsaasApiKey) {
            return NextResponse.json({ error: 'Subconta não configurada. Fale com o suporte.' }, { status: 403 });
        }

        const apiKey = String(coach.coachAsaasApiKey);

        const transferRes = await fetch(`${ASAAS_BASE_URL}/transfers`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'access_token': apiKey
            },
            body: JSON.stringify({
                value: value,
                pixAddressKey: pixKey,
                pixAddressKeyType: 'EVP', 
                operationType: 'PIX',
                description: 'Saque de Mensalidades - ELITE FIT'
            })
        });

        const transferData = await transferRes.json();

        if (transferRes.ok && transferData.id) {
            return NextResponse.json({ ok: true, transferId: transferData.id });
        } else {
            const errorDesc = transferData.errors?.[0]?.description || 'Recusado pelo banco.';
            return NextResponse.json({ error: errorDesc }, { status: 400 });
        }

    } catch (error: any) {
        console.error('[FinanceWithdraw] Erro ao solicitar saque:', error.message);
        return NextResponse.json({ error: 'Erro interno ao processar transferência.' }, { status: 500 });
    }
}