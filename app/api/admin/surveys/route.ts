import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const surveys = await prisma.satisfactionSurvey.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { name: true, plan: true, phone: true }
                }
            }
        });
        
        return NextResponse.json(surveys, { status: 200 });
    } catch (error) {
        console.error("Erro ao buscar pesquisas:", error);
        return NextResponse.json({ error: 'Erro ao carregar os dados.' }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id } = body;
        
        if (!id) {
            return NextResponse.json({ error: 'ID da pesquisa não informado.' }, { status: 400 });
        }

        await prisma.satisfactionSurvey.update({
            where: { id },
            data: { readByAdmin: true }
        });
        
        return NextResponse.json({ message: 'Pesquisa marcada como lida.' }, { status: 200 });
    } catch (error) {
        console.error("Erro ao atualizar status da pesquisa:", error);
        return NextResponse.json({ error: 'Erro ao atualizar status.' }, { status: 500 });
    }
}