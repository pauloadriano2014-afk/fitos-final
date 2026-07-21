// app/api/finance/withdraw/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Como você está usando o Next.js, substitua essa função por sua validação de token/sessão real
async function getUserIdFromSession(req: NextRequest) {
    // Placeholder para a sua lógica de autenticação atual
    // return "id-do-coach-logado";
    return null; 
}

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromSession(req);
        if (!userId) return NextResponse.json({ balance: 0 }); // Retorna 0 até injetar a auth correta

        // 1. Buscar o walletId (ID da subconta) do Coach no banco de dados
        // 2. Fazer fetch na API do Asaas: GET https://api.asaas.com/v3/finance/balance
        // 3. Retornar o saldo real
        
        return NextResponse.json({ balance: 150.00 }); // Mock visual provisório

    } catch (error) {
        return NextResponse.json({ error: 'Erro ao checar saldo' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { pixKey, value } = await req.json();
        const userId = await getUserIdFromSession(req);

        if (!pixKey || !value) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

        // 1. Buscar o walletId (ID da subconta) do Coach
        // 2. Fazer fetch na API do Asaas: POST https://api.asaas.com/v3/transfers
        // { value, pixAddressKey: pixKey, pixAddressKeyType: "EVP", operationType: "PIX" }

        return NextResponse.json({ ok: true });

    } catch (error) {
        return NextResponse.json({ error: 'Erro ao solicitar saque' }, { status: 500 });
    }
}