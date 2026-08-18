import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 🔥 ISSO MATA O CACHE DO NEXT.JS. SEMPRE BUSCARÁ DADOS FRESCOS 🔥
export const dynamic = 'force-dynamic';


export async function GET() {
    try {
        const clients = await prisma.offlineClient.findMany();
        return NextResponse.json(clients);
    } catch (error) {
        console.error("Erro no GET offline:", error);
        return NextResponse.json({ error: "Erro ao buscar offline" }, { status: 500 });
    }
}