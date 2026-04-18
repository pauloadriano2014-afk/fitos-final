// app/api/admin/user/mass-nps/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PATCH(req: Request) {
    try {
        const { studentIds } = await req.json();

        if (!studentIds || !Array.isArray(studentIds)) {
            return NextResponse.json({ error: "Lista de alunos inválida" }, { status: 400 });
        }

        await prisma.user.updateMany({
            where: { id: { in: studentIds } },
            data: { npsRequested: true }
        });

        return NextResponse.json({ message: "Pesquisa enviada para a fila de processamento!" });
    } catch (error) {
        console.error("Erro ao disparar NPS:", error);
        return NextResponse.json({ error: "Erro ao disparar pesquisas" }, { status: 500 });
    }
}