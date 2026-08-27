import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireMaster } from '@/lib/auth';

// 🔥 ISSO MATA O CACHE DO NEXT.JS. SEMPRE BUSCARÁ DADOS FRESCOS 🔥
export const dynamic = 'force-dynamic';


// 🔒 Essa rota não recebe nenhum parâmetro de coach pra filtrar por — ela
// devolvia TODOS os clientes offline de TODOS os coaches pra qualquer um que
// chamasse (achado do audit anterior). Sem um jeito de escopar por coach aqui,
// a única correção segura é restringir ao time master.
export async function GET(req: Request) {
    try {
        const auth = requireMaster(req);
        if ('response' in auth) return auth.response;

        const clients = await prisma.offlineClient.findMany();
        return NextResponse.json(clients);
    } catch (error) {
        console.error("Erro no GET offline:", error);
        return NextResponse.json({ error: "Erro ao buscar offline" }, { status: 500 });
    }
}