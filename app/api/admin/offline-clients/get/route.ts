import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// 🔥 ISSO MATA O CACHE DO NEXT.JS. SEMPRE BUSCARÁ DADOS FRESCOS 🔥
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const clients = await prisma.offlineClient.findMany();
        return NextResponse.json(clients);
    } catch (error) {
        console.error("Erro no GET offline:", error);
        return NextResponse.json({ error: "Erro ao buscar offline" }, { status: 500 });
    }
}