import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function GET() {
    try {
        const clients = await prisma.offlineClient.findMany();
        return NextResponse.json(clients);
    } catch (error) {
        return NextResponse.json({ error: "Erro ao buscar offline" }, { status: 500 });
    }
}